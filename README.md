# AgentPay Escrow — Agent-to-Agent Payments & Settlement on HashKey Chain

A small, honest prototype of **escrow-based settlement between AI agents**, built for the
**HashKey Chain Horizon Hackathon (India edition)** — *Agent Payments & A2A Settlement* track.

**The idea in one line:** when one agent hires another, the payment shouldn't depend on
trust — the poster locks funds in a smart contract, the worker delivers against an
on-chain deliverable hash, and the contract settles (or refunds) by rules both sides
agreed to up front.

---

## What it does

`AgentEscrow` is a single, dependency-free Solidity contract that runs the full
lifecycle of an agent-to-agent job:

1. **Post & fund** — a poster agent creates a job naming the worker agent, an arbiter
   agent, a settlement token, an amount and a deadline. The payment is pulled into
   escrow in the same transaction. No funds locked, no job.
2. **Deliver** — the worker agent records a `bytes32` deliverable hash on-chain
   (a content hash of the work product), moving the job to `Delivered`.
3. **Settle** — the poster approves and the escrow pays the worker. Done.
4. **Dispute** — either party can dispute a funded/delivered job. Funds freeze and
   the named arbiter agent resolves: release to the worker, or refund the poster.
5. **Safety valve** — if the worker never delivers, the poster reclaims the full
   amount after the deadline.

`MockAgentUSD` (aUSD) is a demo-only ERC-20 with USDT-style 6 decimals used as the
settlement unit so the flow reads like a real stablecoin deployment. Its `mint` is
open **on purpose** — it is valueless test currency. The escrow works with any
standard ERC-20, so on a production deployment the token would simply be a real
stablecoin address.

## Who it's for

- **Agent marketplaces & orchestrators** that need payment rails between agents
  without a trusted middleman holding the money.
- **Freelance/service agents** (our own roadmap at Lux Automations: AI voice,
  chatbot and workflow-automation services) that will increasingly be *hired by
  other agents*, not by humans clicking "pay".
- Any A2A workflow where "pay on delivery, refund on dispute" is the business rule.

## Architecture

```
PosterAgent ──createJob + deposit──▶ AgentEscrow (HashKey Chain)
WorkerAgent ──markDelivered(hash)──▶      │
PosterAgent ──approveAndSettle─────▶      ├──▶ pays WorkerAgent
either party ──raiseDispute───────▶      │
ArbiterAgent ──resolveDispute─────▶      └──▶ pays WorkerAgent OR refunds PosterAgent
```

- **Contracts** (`contracts/`): `AgentEscrow.sol` (the whole protocol, ~200 lines,
  no external dependencies) and `MockAgentUSD.sol` (demo settlement token).
- **Scripts** (`scripts/`): solc-js compiler, a narrated two-agent simulation, a
  guarded testnet deployer, a throwaway-testnet-wallet generator, and a
  resumable on-chain demo (`demo-testnet.js`) that runs both scenes live.
- **Tests** (`test/`): five behavioural tests covering settlement, both dispute
  outcomes, delivery access control, and the deadline refund.

State machine: `Funded → Delivered → Settled`, with `Disputed` branching to
`Settled` or `Refunded`, and `Funded → Refunded` after the deadline.

## Run it

Requirements: Node.js 18+.

```bash
npm install

# 1. Behavioural tests on a local chain (ganache, in-process)
npm test
#    ✔ happy path settles · dispute refunds · dispute releases
#    ✔ only the worker can deliver · deadline refund works   (5/5 passing)

# 2. Narrated two-agent simulation on a local chain
npm run simulate
```

### Deploy to HashKey Chain testnet

```bash
npm run wallet          # creates a THROWAWAY testnet-only key in .env (git-ignored)
# claim test HSK for the printed address from the HashKey testnet faucet (see below)
npm run deploy:testnet  # refuses to run on any chain ID other than 133
```

The deployer writes addresses + tx hashes to `deployments/testnet-133.json`.

### Run the demo flow on testnet

```bash
node scripts/demo-testnet.js   # resumable; reads addresses from deployments/testnet-133.json
```

This runs both demo scenes against the deployed contracts with three throwaway
testnet roles (poster = deployer; worker + arbiter keys are generated into the
git-ignored `.env` on first run and topped up with test HSK by the poster):
Scene 1 settles a 250 aUSD job to the worker; Scene 2 disputes a 100 aUSD job
and the arbiter refunds the poster. Every tx hash is recorded in
`deployments/testnet-demo-133.json`.

## Deployed — HashKey Chain TESTNET (chain ID 133)

> **TESTNET ONLY.** These contracts live on the HashKey Chain **testnet**
> (chain ID 133). They are **not** deployed on mainnet, and the aUSD token is
> valueless demo currency. (Per the hackathon rules, a mainnet deployment is
> only relevant to claiming a prize, if the project places.)

| Contract | Address | Deploy tx |
|---|---|---|
| MockAgentUSD | [`0xE9d22B7AeD2dA5F93eA4407dCBfC52984cc64BEe`](https://testnet-explorer.hskchain.net/address/0xE9d22B7AeD2dA5F93eA4407dCBfC52984cc64BEe) | [`0x4407ca39…38d37c`](https://testnet-explorer.hskchain.net/tx/0x4407ca394da6d47385ff8d8ef2dbe596fad35fde6134af196e297bc32138d37c) |
| AgentEscrow | [`0x07fCDDa0450390f30b2524847550Ff10C709BEFE`](https://testnet-explorer.hskchain.net/address/0x07fCDDa0450390f30b2524847550Ff10C709BEFE) | [`0x35ab8d25…bab4f468`](https://testnet-explorer.hskchain.net/tx/0x35ab8d253a090513e384c621c2ceb0bc6ff9a0ea1175b443188f3109bab4f468) |

**On-chain demo (2026-10-30, testnet):** Job #1 ("product explainer", 250 aUSD)
ran create → deliver → settle and ended **Settled** (worker paid 250 aUSD —
[settle tx](https://testnet-explorer.hskchain.net/tx/0x9213d9338393cb8a42ef3d0a4fe3acef949f4defc97d028a25d2198709d22041)).
Job #2 ("summarise a dataset", 100 aUSD) ran create → deliver → dispute →
arbiter resolution and ended **Refunded** (poster refunded in full —
[resolve tx](https://testnet-explorer.hskchain.net/tx/0xc9bfdfc3dadd20b54dec8f5768a2cf1664693c8a1f3ff216b4a3225bef7af03b)).
Full step-by-step tx list: `deployments/testnet-demo-133.json`.

## Testnet details (researched 2026-10-30)

| Item | Value | Source |
|---|---|---|
| Network | HSKChain Testnet (HashKey Chain L2, parent: Sepolia) | ethereum-lists registry |
| Chain ID | **133** (`0x85`) — confirmed live via `eth_chainId` | RPC + registry |
| RPC | `https://testnet.hsk.xyz` | chainid.network registry |
| Native token | HSK (test) | registry |
| Explorer | `https://testnet-explorer.hskchain.net` (Blockscout) | registry |
| EVM-compatible | Yes — standard Solidity/ethers deployment, confirmed by GetBlock + Chainlink docs | getblock.io, docs.chain.link |
| Faucet | Deployer funded via the official HashKey testnet faucet on 2026-10-30 (funding tx in the Status section below); thirdweb's universal EVM faucet also covers this chain | faucet + on-chain record |
| Mainnet (NOT used) | Chain ID 177, RPC `https://mainnet.hsk.xyz` | registry |

Sources:
- Registry data: https://chainid.network/chains.json (chainId 133 entry)
- Chainlink HashKey testnet config: https://docs.chain.link/ccip/directory/testnet/chain/ethereum-testnet-sepolia-hashkey-1
- Hackathon (tracks, deadline, prizes): Eventbrite listing for "HashKey Chain Horizon Hackathon · India", linking registration at https://dorahacks.io/hackathon/hskchainindia/detail

## Status — read this before believing anything (honesty box)

- ✅ **Contracts compile** (solc 0.8.x, optimizer on).
- ✅ **All 5 behavioural tests pass** on a local EVM (ganache).
- ✅ **Two-agent simulation runs end-to-end locally**, including a dispute refund.
- ✅ **Deploy script verified against the real testnet RPC** (chain ID 133 confirmed;
  script stops cleanly when the deployer is unfunded).
- ✅ **Deployed on HashKey Chain TESTNET (chain ID 133) on 2026-10-30** — see the
  "Deployed" section above. Deployer `0xbd98F5e308ff0AfFe7714ca254c0b71229064a09`
  was funded from the official testnet faucet (funding tx
  `0xa899ef2b02c3d095bc69737c2dacc46f3c453d8486b128660b7f0fd76dfdcd86`; 0.1 test
  HSK on hand at deploy time). Both contract deployments are recorded in
  `deployments/testnet-133.json`.
- ✅ **Full demo flow executed on testnet** — settlement AND dispute-refund paths
  both completed on-chain (jobs #1 and #2), recorded in
  `deployments/testnet-demo-133.json`. One operational note: the public RPC is a
  multi-node cluster whose nodes lag each other by seconds, which twice made a
  valid dependent call look like it would revert; the demo script polls for
  state visibility and retries estimation, and all steps ultimately landed.
- 🚫 **Mainnet: NOT deployed** (chain ID 177 untouched; the deploy script refuses
  any chain other than 133). Mainnet would only matter for claiming a prize if
  the project places, per the hackathon rules.
- ⚠️ **Prototype, not production.** Unaudited, no partial payments, no milestone
  splits, single arbiter per job, ERC-20 settlement only (no native-HSK jobs).
  These are deliberate scope cuts for a hackathon demo, listed so judges see them.

## Why HashKey Chain / track fit

The *Agent Payments & A2A Settlement* track asks for practical payment
infrastructure for the agent economy. AgentPay Escrow is exactly that primitive:
programmable, escrowed, dispute-aware settlement that any agent framework can call
with three transactions (create, deliver, settle). HashKey Chain's finance focus,
low fees and EVM tooling make it a natural home; the contract deploys unchanged on
any EVM chain, and the demo settles in a stablecoin-shaped unit because A2A
commerce will price in stable units, not volatile gas tokens.

## Roadmap (post-hackathon)

Milestone-based partial releases · multi-arbiter / staked-arbiter resolution ·
native HSK + multi-token jobs · agent identity/reputation hooks (deliverable-hash
history as a portable track record) · an SDK wrapper so agent frameworks
(LangChain-style tools, MCP servers) can escrow a job in one call.

## License

MIT. Built by Lux Automations (Edmonton, Canada) for the HashKey Chain Horizon
Hackathon, October–November 2026.
