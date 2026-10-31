// Two-agent simulation of the AgentPay Escrow flow on a LOCAL chain (ganache).
//
//   PosterAgent  — an AI agent that buys work
//   WorkerAgent  — an AI agent that does work
//   VerifierAgent— an AI agent named as dispute arbiter
//
// Scene 1 (happy path): job posted -> funded -> delivered -> settled.
// Scene 2 (dispute):    job posted -> funded -> delivered -> disputed ->
//                       arbiter refunds the poster.
// Nothing here touches a real network. Run scripts/deploy.js for testnet.
const fs = require("fs");
const path = require("path");
const ganache = require("ganache");
const { ethers } = require("ethers");

const ROOT = path.join(__dirname, "..");
const load = (name) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, "artifacts", `${name}.json`), "utf8"));

const fmt = (v) => `${ethers.formatUnits(v, 6)} aUSD`;

async function main() {
  const provider = new ethers.BrowserProvider(
    ganache.provider({ logging: { quiet: true } })
  );
  const poster = await provider.getSigner(0); // PosterAgent
  const worker = await provider.getSigner(1); // WorkerAgent
  const arbiter = await provider.getSigner(2); // VerifierAgent

  console.log("=== AgentPay Escrow — two-agent simulation (local chain) ===");
  console.log(`PosterAgent   : ${await poster.getAddress()}`);
  console.log(`WorkerAgent   : ${await worker.getAddress()}`);
  console.log(`VerifierAgent : ${await arbiter.getAddress()} (arbiter)\n`);

  const usd = new ethers.ContractFactory(
    load("MockAgentUSD").abi,
    load("MockAgentUSD").bytecode,
    poster
  );
  const token = await usd.deploy();
  await token.waitForDeployment();

  const escrowF = new ethers.ContractFactory(
    load("AgentEscrow").abi,
    load("AgentEscrow").bytecode,
    poster
  );
  const escrow = await escrowF.deploy();
  await escrow.waitForDeployment();
  console.log(`MockAgentUSD deployed: ${await token.getAddress()}`);
  console.log(`AgentEscrow  deployed: ${await escrow.getAddress()}\n`);

  // PosterAgent funds its wallet with demo test tokens (open mint, no value).
  await (await token.mint(await poster.getAddress(), ethers.parseUnits("1000", 6))).wait();

  // ---------- Scene 1: happy path ----------
  console.log('--- Scene 1: "Write a product explainer" — 250 aUSD ---');
  await (await token.approve(await escrow.getAddress(), ethers.parseUnits("250", 6))).wait();
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  const tx1 = await escrow.createJob(
    await worker.getAddress(),
    await arbiter.getAddress(),
    await token.getAddress(),
    ethers.parseUnits("250", 6),
    deadline
  );
  await tx1.wait();
  console.log("PosterAgent : job #1 created, 250 aUSD locked in escrow");

  const deliverable = ethers.keccak256(
    ethers.toUtf8Bytes("explainer-v1.md — full text of the deliverable")
  );
  await (await escrow.connect(worker).markDelivered(1, deliverable)).wait();
  console.log(`WorkerAgent : delivered, hash recorded on-chain (${deliverable.slice(0, 18)}…)`);

  await (await escrow.approveAndSettle(1)).wait();
  console.log("PosterAgent : approved delivery — escrow settles");
  console.log(
    `Result      : WorkerAgent balance = ${fmt(await token.balanceOf(await worker.getAddress()))}\n`
  );

  // ---------- Scene 2: dispute path ----------
  console.log('--- Scene 2: "Summarise a dataset" — 100 aUSD, disputed ---');
  await (await token.approve(await escrow.getAddress(), ethers.parseUnits("100", 6))).wait();
  const tx2 = await escrow.createJob(
    await worker.getAddress(),
    await arbiter.getAddress(),
    await token.getAddress(),
    ethers.parseUnits("100", 6),
    deadline
  );
  await tx2.wait();
  console.log("PosterAgent : job #2 created, 100 aUSD locked in escrow");

  const badDeliverable = ethers.keccak256(ethers.toUtf8Bytes("summary-v1.txt — wrong dataset"));
  await (await escrow.connect(worker).markDelivered(2, badDeliverable)).wait();
  console.log("WorkerAgent : delivered (but it summarised the wrong dataset)");

  await (await escrow.raiseDispute(2)).wait();
  console.log("PosterAgent : raised a dispute — funds frozen for the arbiter");

  await (await escrow.connect(arbiter).resolveDispute(2, false)).wait();
  console.log("VerifierAgent: ruled for the poster — escrow refunds");
  console.log(
    `Result      : PosterAgent balance = ${fmt(await token.balanceOf(await poster.getAddress()))}, ` +
      `WorkerAgent balance = ${fmt(await token.balanceOf(await worker.getAddress()))}`
  );
  console.log("\nSimulation complete: settlement + dispute refund both verified locally.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
