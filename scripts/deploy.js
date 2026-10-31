// Deploys MockAgentUSD + AgentEscrow to the HashKey Chain TESTNET (chain ID 133).
//
// Safety rails, by design:
//   * Refuses to run unless the RPC reports chain ID 133 (testnet). Mainnet is 177
//     and this script will not touch it.
//   * Uses ONLY a throwaway testnet key from DEPLOYER_PRIVATE_KEY (env or .env).
//     Generate one with: npm run wallet
//   * If the deployer has no test HSK for gas, it prints faucet instructions and
//     exits non-zero. It never pretends a deployment happened.
//
// Faucet: claim test HSK for the deployer address first — HashKey Chain testnet
// faucet (see README "Testnet details"), then re-run.
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const ROOT = path.join(__dirname, "..");
const RPC_URL = "https://testnet.hsk.xyz"; // HSKChain Testnet, chain ID 133
const EXPLORER = "https://testnet-explorer.hskchain.net";
const EXPECTED_CHAIN_ID = 133n;

function loadKey() {
  if (process.env.DEPLOYER_PRIVATE_KEY) return process.env.DEPLOYER_PRIVATE_KEY;
  const envPath = path.join(ROOT, ".env");
  if (fs.existsSync(envPath)) {
    const m = fs.readFileSync(envPath, "utf8").match(/DEPLOYER_PRIVATE_KEY=(\S+)/);
    if (m) return m[1];
  }
  return null;
}

const load = (name) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, "artifacts", `${name}.json`), "utf8"));

async function main() {
  const key = loadKey();
  if (!key) {
    console.error("No DEPLOYER_PRIVATE_KEY found. Run: npm run wallet");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const network = await provider.getNetwork();
  if (network.chainId !== EXPECTED_CHAIN_ID) {
    console.error(
      `Refusing to deploy: RPC reports chain ID ${network.chainId}, expected 133 (HashKey testnet).`
    );
    process.exit(1);
  }

  const wallet = new ethers.Wallet(key, provider);
  const balance = await provider.getBalance(wallet.address);
  console.log(`Deployer (testnet only): ${wallet.address}`);
  console.log(`Balance: ${ethers.formatEther(balance)} HSK (test)`);
  if (balance === 0n) {
    console.error(
      "\nDeployer has no test HSK for gas. Claim testnet HSK from the HashKey Chain" +
        "\ntestnet faucet for the address above, then re-run: npm run deploy:testnet"
    );
    process.exit(2);
  }

  const usd = new ethers.ContractFactory(
    load("MockAgentUSD").abi,
    load("MockAgentUSD").bytecode,
    wallet
  );
  const token = await usd.deploy();
  const tokenReceipt = await token.deploymentTransaction().wait();
  console.log(`MockAgentUSD: ${await token.getAddress()} (tx ${tokenReceipt.hash})`);

  const escrowF = new ethers.ContractFactory(
    load("AgentEscrow").abi,
    load("AgentEscrow").bytecode,
    wallet
  );
  const escrow = await escrowF.deploy();
  const escrowReceipt = await escrow.deploymentTransaction().wait();
  console.log(`AgentEscrow : ${await escrow.getAddress()} (tx ${escrowReceipt.hash})`);

  const outDir = path.join(ROOT, "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const record = {
    network: "HashKey Chain Testnet",
    chainId: 133,
    rpc: RPC_URL,
    explorer: EXPLORER,
    deployer: wallet.address,
    contracts: {
      MockAgentUSD: {
        address: await token.getAddress(),
        tx: tokenReceipt.hash,
        explorer: `${EXPLORER}/address/${await token.getAddress()}`,
      },
      AgentEscrow: {
        address: await escrow.getAddress(),
        tx: escrowReceipt.hash,
        explorer: `${EXPLORER}/address/${await escrow.getAddress()}`,
      },
    },
    deployedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(outDir, "testnet-133.json"),
    JSON.stringify(record, null, 2)
  );
  console.log("\nRecord written to deployments/testnet-133.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
