// Compiles the contracts with solc-js into artifacts/<Name>.json
// (no Hardhat, no network access needed — solc is a local npm dependency).
const fs = require("fs");
const path = require("path");
const solc = require("solc");

const ROOT = path.join(__dirname, "..");
const CONTRACTS = ["MockAgentUSD.sol", "AgentEscrow.sol"];

function main() {
  const sources = {};
  for (const file of CONTRACTS) {
    sources[file] = {
      content: fs.readFileSync(path.join(ROOT, "contracts", file), "utf8"),
    };
  }

  const input = {
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors || []).filter((e) => e.severity === "error");
  if (errors.length) {
    for (const e of errors) console.error(e.formattedMessage);
    process.exit(1);
  }

  const outDir = path.join(ROOT, "artifacts");
  fs.mkdirSync(outDir, { recursive: true });
  for (const file of CONTRACTS) {
    for (const [name, contract] of Object.entries(output.contracts[file])) {
      if (!contract.evm.bytecode.object) continue; // skip pure interfaces
      fs.writeFileSync(
        path.join(outDir, `${name}.json`),
        JSON.stringify(
          { abi: contract.abi, bytecode: "0x" + contract.evm.bytecode.object },
          null,
          2
        )
      );
      console.log(`compiled ${name} (${contract.evm.bytecode.object.length / 2} bytes)`);
    }
  }
}

main();
