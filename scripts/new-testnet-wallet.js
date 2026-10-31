// Generates a THROWAWAY key for HashKey Chain TESTNET ONLY and stores it in .env
// (git-ignored). This key must never hold real funds and must never be used on
// any mainnet. It exists so the demo can be deployed to testnet without touching
// anyone's real wallet.
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const ROOT = path.join(__dirname, "..");
const envPath = path.join(ROOT, ".env");

if (fs.existsSync(envPath) && /DEPLOYER_PRIVATE_KEY=/.test(fs.readFileSync(envPath, "utf8"))) {
  console.error(".env already contains a DEPLOYER_PRIVATE_KEY — refusing to overwrite.");
  process.exit(1);
}

const wallet = ethers.Wallet.createRandom();
fs.appendFileSync(envPath, `DEPLOYER_PRIVATE_KEY=${wallet.privateKey}\n`);
console.log("Throwaway TESTNET-ONLY wallet created and saved to .env");
console.log(`Address: ${wallet.address}`);
console.log(
  "\nNext: claim test HSK for this address from the HashKey Chain testnet faucet," +
    "\nthen run: npm run deploy:testnet"
);
