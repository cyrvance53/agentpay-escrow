// Behavioural tests for AgentEscrow, run against a local ganache chain.
// Covers: happy-path settlement, dispute -> refund, dispute -> release,
// deadline refund, and access control on delivery.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const ganache = require("ganache");
const { ethers } = require("ethers");

const ROOT = path.join(__dirname, "..");
const load = (name) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, "artifacts", `${name}.json`), "utf8"));

let rawProvider, provider, poster, worker, arbiter, token, escrow;
const AUSD = (n) => ethers.parseUnits(String(n), 6);

async function setup() {
  rawProvider = ganache.provider({ logging: { quiet: true } });
  provider = new ethers.BrowserProvider(rawProvider);
  poster = await provider.getSigner(0);
  worker = await provider.getSigner(1);
  arbiter = await provider.getSigner(2);

  token = await new ethers.ContractFactory(
    load("MockAgentUSD").abi, load("MockAgentUSD").bytecode, poster
  ).deploy();
  await token.waitForDeployment();

  escrow = await new ethers.ContractFactory(
    load("AgentEscrow").abi, load("AgentEscrow").bytecode, poster
  ).deploy();
  await escrow.waitForDeployment();

  await (await token.mint(await poster.getAddress(), AUSD(1000))).wait();
}

async function createFundedJob(amount) {
  await (await token.approve(await escrow.getAddress(), AUSD(amount))).wait();
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  const tx = await escrow.createJob(
    await worker.getAddress(), await arbiter.getAddress(),
    await token.getAddress(), AUSD(amount), deadline
  );
  await tx.wait();
  return Number(await escrow.jobCount());
}

test.before(setup);

test("happy path: funded job settles to the worker on approval", async () => {
  const id = await createFundedJob(250);
  const hash = ethers.keccak256(ethers.toUtf8Bytes("deliverable"));
  await (await escrow.connect(worker).markDelivered(id, hash)).wait();
  await (await escrow.approveAndSettle(id)).wait();
  assert.equal(await token.balanceOf(await worker.getAddress()), AUSD(250));
  const job = await escrow.getJob(id);
  assert.equal(job.state, 2n); // Settled
});

test("dispute: arbiter can refund the poster", async () => {
  const before_ = await token.balanceOf(await poster.getAddress());
  const id = await createFundedJob(100);
  const hash = ethers.keccak256(ethers.toUtf8Bytes("bad deliverable"));
  await (await escrow.connect(worker).markDelivered(id, hash)).wait();
  await (await escrow.raiseDispute(id)).wait();
  await (await escrow.connect(arbiter).resolveDispute(id, false)).wait();
  assert.equal(await token.balanceOf(await poster.getAddress()), before_);
  const job = await escrow.getJob(id);
  assert.equal(job.state, 4n); // Refunded
});

test("dispute: arbiter can release to the worker", async () => {
  const workerBefore = await token.balanceOf(await worker.getAddress());
  const id = await createFundedJob(50);
  const hash = ethers.keccak256(ethers.toUtf8Bytes("good deliverable"));
  await (await escrow.connect(worker).markDelivered(id, hash)).wait();
  await (await escrow.connect(worker).raiseDispute(id)).wait();
  await (await escrow.connect(arbiter).resolveDispute(id, true)).wait();
  assert.equal(
    await token.balanceOf(await worker.getAddress()),
    workerBefore + AUSD(50)
  );
});

test("only the worker can mark a job delivered", async () => {
  const id = await createFundedJob(10);
  const hash = ethers.keccak256(ethers.toUtf8Bytes("x"));
  // The call must revert (ganache does not always surface the reason string
  // through ethers, so accept either the reason or a CALL_EXCEPTION).
  await assert.rejects(escrow.markDelivered(id, hash), /CALL_EXCEPTION|only the worker/);
});

test("poster can reclaim funds after the deadline if undelivered", async () => {
  const before_ = await token.balanceOf(await poster.getAddress());
  const id = await createFundedJob(25);
  // Jump the local chain past the deadline.
  await rawProvider.request({ method: "evm_increaseTime", params: [3601] });
  await rawProvider.request({ method: "evm_mine", params: [] });
  await (await escrow.refundAfterDeadline(id)).wait();
  assert.equal(await token.balanceOf(await poster.getAddress()), before_);
});
