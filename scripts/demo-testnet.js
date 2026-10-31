// On-chain demo of the AgentPay Escrow flow on HashKey Chain TESTNET (chain 133).
//
// Mirrors scripts/simulate-local.js, but against the DEPLOYED testnet contracts
// (addresses read from deployments/testnet-133.json):
//
//   Scene 1 (happy path): mint -> approve -> createJob -> deliver -> settle.
//   Scene 2 (dispute):    createJob -> deliver -> dispute -> arbiter refunds.
//
// Roles: PosterAgent = the deployer key (DEPLOYER_PRIVATE_KEY).
// WorkerAgent / VerifierAgent (arbiter) = throwaway testnet-only keys stored in
// .env as WORKER_PRIVATE_KEY / ARBITER_PRIVATE_KEY (generated on first run,
// .env is git-ignored). The poster tops them up with a little test HSK for gas.
//
// The script is RESUMABLE: it reads current on-chain job states and only runs
// the steps that haven't happened yet. It is also patient with the public RPC,
// which is a multi-node cluster whose nodes lag each other by a few seconds:
// after each state-changing tx it polls until the new state is visible, and
// gas-estimation failures caused by a lagging node are retried.
// Tx hashes from earlier partial runs can be seeded via
// deployments/testnet-demo-seed.json and are merged into the final record.
//
// Safety rails: refuses to run unless the RPC reports chain ID 133. Testnet
// tokens (HSK test + MockAgentUSD) are valueless by design.
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const ROOT = path.join(__dirname, "..");
const RPC_URL = "https://testnet.hsk.xyz"; // HSKChain Testnet, chain ID 133
const EXPLORER = "https://testnet-explorer.hskchain.net";
const EXPECTED_CHAIN_ID = 133n;

const STATE = { 0: "Funded", 1: "Delivered", 2: "Settled", 3: "Disputed", 4: "Refunded" };

const envPath = path.join(ROOT, ".env");

function readEnvKey(name) {
  if (process.env[name]) return process.env[name];
  if (fs.existsSync(envPath)) {
    const m = fs.readFileSync(envPath, "utf8").match(new RegExp(`${name}=(\\S+)`));
    if (m) return m[1];
  }
  return null;
}

function throwawayKey(name) {
  let key = readEnvKey(name);
  if (!key) {
    key = ethers.Wallet.createRandom().privateKey;
    fs.appendFileSync(envPath, `${name}=${key}\n`);
  }
  return key;
}

const load = (name) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, "artifacts", `${name}.json`), "utf8"));

const fmt = (v) => `${ethers.formatUnits(v, 6)} aUSD`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const network = await provider.getNetwork();
  if (network.chainId !== EXPECTED_CHAIN_ID) {
    console.error(
      `Refusing to run: RPC reports chain ID ${network.chainId}, expected 133 (HashKey testnet).`
    );
    process.exit(1);
  }

  const record = JSON.parse(
    fs.readFileSync(path.join(ROOT, "deployments", "testnet-133.json"), "utf8")
  );
  const tokenAddr = record.contracts.MockAgentUSD.address;
  const escrowAddr = record.contracts.AgentEscrow.address;

  const poster = new ethers.Wallet(readEnvKey("DEPLOYER_PRIVATE_KEY"), provider);
  const worker = new ethers.Wallet(throwawayKey("WORKER_PRIVATE_KEY"), provider);
  const arbiter = new ethers.Wallet(throwawayKey("ARBITER_PRIVATE_KEY"), provider);

  console.log("=== AgentPay Escrow — on-chain demo (HashKey Chain TESTNET, chain 133) ===");
  console.log(`PosterAgent   : ${poster.address}`);
  console.log(`WorkerAgent   : ${worker.address}`);
  console.log(`VerifierAgent : ${arbiter.address} (arbiter)`);
  console.log(`MockAgentUSD  : ${tokenAddr}`);
  console.log(`AgentEscrow   : ${escrowAddr}\n`);

  const token = new ethers.Contract(tokenAddr, load("MockAgentUSD").abi, poster);
  const escrow = new ethers.Contract(escrowAddr, load("AgentEscrow").abi, poster);
  const escrowIface = new ethers.Interface(load("AgentEscrow").abi);

  // Seed tx hashes from earlier partial runs, if present.
  const txs = {};
  const seedPath = path.join(ROOT, "deployments", "testnet-demo-seed.json");
  if (fs.existsSync(seedPath)) {
    Object.assign(txs, JSON.parse(fs.readFileSync(seedPath, "utf8")).txs || {});
  }

  const send = async (key, label, txFactory) => {
    // Retry gas-estimation failures: a lagging RPC node can make a perfectly
    // valid dependent call look like it would revert.
    let lastErr;
    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        const t = await txFactory();
        const r = await t.wait();
        if (r.status !== 1) throw new Error(`${label} reverted on-chain (tx ${r.hash})`);
        txs[key] = r.hash;
        console.log(`${label} (tx ${r.hash})`);
        return r;
      } catch (e) {
        lastErr = e;
        if (e.code !== "CALL_EXCEPTION" || attempt === 6) throw e;
        console.log(`  (RPC view lagging — retrying "${label}", attempt ${attempt + 1})`);
        await sleep(5000);
      }
    }
    throw lastErr;
  };

  // Poll until the RPC view shows the job in the expected state.
  const waitForState = async (jobId, expected, tries = 24) => {
    for (let i = 0; i < tries; i++) {
      const s = Number((await escrow.getJob(jobId)).state);
      if (s === expected) return;
      await sleep(3000);
    }
    throw new Error(`Job ${jobId} did not reach state ${STATE[expected]} in time`);
  };

  // Poll until a freshly created job is visible with the right worker.
  const waitForJob = async (jobId, tries = 24) => {
    for (let i = 0; i < tries; i++) {
      const j = await escrow.getJob(jobId);
      if (j.worker === worker.address) return;
      await sleep(3000);
    }
    throw new Error(`Job ${jobId} did not become visible in time`);
  };

  const jobIdFromReceipt = (receipt) => {
    for (const log of receipt.logs) {
      try {
        const parsed = escrowIface.parseLog(log);
        if (parsed && parsed.name === "JobCreated") return Number(parsed.args.jobId);
      } catch { /* not an escrow log */ }
    }
    throw new Error("JobCreated event not found in receipt");
  };

  // Top up worker + arbiter with test HSK for gas, if needed.
  for (const [label, key, w] of [["Worker", "fundWorker", worker], ["Arbiter", "fundArbiter", arbiter]]) {
    const bal = await provider.getBalance(w.address);
    if (bal < ethers.parseEther("0.003")) {
      await send(key, `Funded ${label}Agent with 0.01 test HSK`,
        () => poster.sendTransaction({ to: w.address, value: ethers.parseEther("0.01") }));
    }
  }

  // PosterAgent funds its wallet with demo test tokens (open mint, no value).
  if ((await token.balanceOf(poster.address)) < ethers.parseUnits("100", 6)) {
    await send("mint", "Mint 1000 aUSD to PosterAgent",
      () => token.mint(poster.address, ethers.parseUnits("1000", 6)));
  }

  const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 3600; // +7 days

  // Find the demo jobs: scan existing jobs for ours (poster + our worker).
  const count = Number(await escrow.jobCount());
  let job1 = null, job2 = null;
  for (let id = 1; id <= count; id++) {
    const j = await escrow.getJob(id);
    if (j.poster === poster.address && j.worker === worker.address) {
      if (!job1) job1 = id; else if (!job2) job2 = id;
    }
  }

  // ---------- Scene 1: happy path (250 aUSD) ----------
  console.log('\n--- Scene 1: "Write a product explainer" — 250 aUSD ---');
  if (!job1) {
    if (!txs.s1Approve) {
      await send("s1Approve", "PosterAgent : approved escrow to pull 250 aUSD",
        () => token.approve(escrowAddr, ethers.parseUnits("250", 6)));
    }
    const r = await send("s1CreateJob", "PosterAgent : job created, 250 aUSD locked in escrow",
      () => escrow.createJob(worker.address, arbiter.address, tokenAddr,
        ethers.parseUnits("250", 6), deadline));
    job1 = jobIdFromReceipt(r);
    await waitForJob(job1);
  }
  console.log(`Scene 1 job id: ${job1}`);
  let s1 = Number((await escrow.getJob(job1)).state);
  if (s1 === 0) {
    const deliverable = ethers.keccak256(
      ethers.toUtf8Bytes("explainer-v1.md — full text of the deliverable"));
    await send("s1Deliver", "WorkerAgent : delivered, hash recorded on-chain",
      () => escrow.connect(worker).markDelivered(job1, deliverable));
    await waitForState(job1, 1);
    s1 = 1;
  }
  if (s1 === 1) {
    await send("s1Settle", "PosterAgent : approved delivery — escrow settles",
      () => escrow.approveAndSettle(job1));
    await waitForState(job1, 2);
  }
  console.log(`Result      : WorkerAgent balance = ${fmt(await token.balanceOf(worker.address))}`);

  // ---------- Scene 2: dispute path (100 aUSD) ----------
  console.log('\n--- Scene 2: "Summarise a dataset" — 100 aUSD, disputed ---');
  if (!job2) {
    await send("s2Approve", "PosterAgent : approved escrow to pull 100 aUSD",
      () => token.approve(escrowAddr, ethers.parseUnits("100", 6)));
    const r = await send("s2CreateJob", "PosterAgent : job created, 100 aUSD locked in escrow",
      () => escrow.createJob(worker.address, arbiter.address, tokenAddr,
        ethers.parseUnits("100", 6), deadline));
    job2 = jobIdFromReceipt(r);
    await waitForJob(job2);
  }
  console.log(`Scene 2 job id: ${job2}`);
  let s2 = Number((await escrow.getJob(job2)).state);
  if (s2 === 0) {
    const badDeliverable = ethers.keccak256(ethers.toUtf8Bytes("summary-v1.txt — wrong dataset"));
    await send("s2Deliver", "WorkerAgent : delivered (but it summarised the wrong dataset)",
      () => escrow.connect(worker).markDelivered(job2, badDeliverable));
    await waitForState(job2, 1);
    s2 = 1;
  }
  if (s2 === 1) {
    await send("s2Dispute", "PosterAgent : raised a dispute — funds frozen for the arbiter",
      () => escrow.raiseDispute(job2));
    await waitForState(job2, 3);
    s2 = 3;
  }
  if (s2 === 3) {
    await send("s2Resolve", "VerifierAgent: ruled for the poster — escrow refunds",
      () => escrow.connect(arbiter).resolveDispute(job2, false));
    await waitForState(job2, 4);
  }

  const posterBal = await token.balanceOf(poster.address);
  const workerBal = await token.balanceOf(worker.address);
  console.log(`Result      : PosterAgent balance = ${fmt(posterBal)}, WorkerAgent balance = ${fmt(workerBal)}`);

  const j1 = await escrow.getJob(job1);
  const j2 = await escrow.getJob(job2);
  console.log(`\nOn-chain job states: #${job1} = ${STATE[Number(j1.state)]}, #${job2} = ${STATE[Number(j2.state)]}`);

  const out = {
    network: "HashKey Chain Testnet",
    chainId: 133,
    explorer: EXPLORER,
    contracts: { MockAgentUSD: tokenAddr, AgentEscrow: escrowAddr },
    roles: { poster: poster.address, worker: worker.address, arbiter: arbiter.address },
    jobs: { scene1: job1, scene2: job2 },
    txs: Object.fromEntries(
      Object.entries(txs).map(([k, v]) => [k, v && { hash: v, explorer: `${EXPLORER}/tx/${v}` }])
    ),
    finalBalances: { poster: fmt(posterBal), worker: fmt(workerBal) },
    jobStates: { scene1: STATE[Number(j1.state)], scene2: STATE[Number(j2.state)] },
    ranAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(ROOT, "deployments", "testnet-demo-133.json"),
    JSON.stringify(out, null, 2)
  );
  console.log("\nDemo complete on testnet. Record written to deployments/testnet-demo-133.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
