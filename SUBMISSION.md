# DoraHacks Submission Checklist — HashKey Chain Horizon Hackathon

**Event:** HashKey Chain Horizon Hackathon (India edition)
**Page:** https://dorahacks.io/hackathon/hskchainindia/detail
**Track:** Agent Payments & A2A Settlement (prize pool 10,000 USDT total; 5,000 USDT per track)
**Deadline:** **Nov 1, 2026, 21:30 IST / 09:00 MST** — registration & submission
**Project:** AgentPay Escrow — agent-to-agent escrow & settlement on HashKey Chain
**Team:** Lux Automations (registration handled separately)

---

## Submission content — ready to paste

- [x] **Project name:** AgentPay Escrow
- [x] **Tagline:** Trust-minimised escrow for the agent economy — one agent hires
      another, the contract holds the money, delivery settles it, disputes refund it.
- [x] **Description:** (use README.md sections "What it does", "Who it's for",
      "Architecture", and "Why HashKey Chain / track fit" — written and final)
- [x] **Track selected:** Agent Payments & A2A Settlement
- [x] **Tech stack:** Solidity 0.8, ethers.js v6, HashKey Chain testnet (EVM, chain ID 133)

## Code

- [x] Smart contracts written and compiling (`contracts/AgentEscrow.sol`, `contracts/MockAgentUSD.sol`)
- [x] Behavioural tests — **5/5 passing locally** (`npm test`)
- [x] Narrated two-agent simulation runs locally (`npm run simulate`) — output can be
      quoted/screenshot for the submission
- [ ] **GitHub repo link — MISSING.** The code lives in the Lux workspace
      (`files/bounties/hashkey-agent-payments/`). Needs: push to a public GitHub repo
      under Vance's GitHub account and paste the URL into DoraHacks.
      (Exclude `node_modules/`, `.env`, `artifacts/` — `.gitignore` already set.)

## On-chain (testnet)

- [x] Testnet researched and verified live (chain ID 133, RPC `https://testnet.hsk.xyz`,
      `eth_chainId` confirmed 2026-10-30)
- [x] Throwaway testnet-only deployer generated: `0xbd98F5e308ff0AfFe7714ca254c0b71229064a09`
      (key in project `.env`, git-ignored; holds no real funds, ever)
- [x] Deploy script written and guard-tested (`npm run deploy:testnet`; refuses any
      chain ID ≠ 133, refuses to fake success on an unfunded deployer)
- [x] **Faucet claim — DONE (2026-10-30).** Deployer funded from the official
      HashKey testnet faucet — funding tx
      `0xa899ef2b02c3d095bc69737c2dacc46f3c453d8486b128660b7f0fd76dfdcd86`
      (0.1 test HSK on hand at deploy time).
- [x] **Deploy — DONE (2026-10-30, TESTNET chain 133).** `npm run deploy:testnet`
      succeeded; record in `deployments/testnet-133.json`:
      - MockAgentUSD: `0xE9d22B7AeD2dA5F93eA4407dCBfC52984cc64BEe`
        — https://testnet-explorer.hskchain.net/address/0xE9d22B7AeD2dA5F93eA4407dCBfC52984cc64BEe
        — deploy tx `0x4407ca394da6d47385ff8d8ef2dbe596fad35fde6134af196e297bc32138d37c`
      - AgentEscrow: `0x07fCDDa0450390f30b2524847550Ff10C709BEFE`
        — https://testnet-explorer.hskchain.net/address/0x07fCDDa0450390f30b2524847550Ff10C709BEFE
        — deploy tx `0x35ab8d253a090513e384c621c2ceb0bc6ff9a0ea1175b443188f3109bab4f468`
      - Mainnet: NOT deployed (only relevant to prize claiming, if we place).
- [x] **Demo flow executed ON-CHAIN (testnet, 2026-10-30)** via
      `scripts/demo-testnet.js`; full record in `deployments/testnet-demo-133.json`:
      - Job #1 — 250 aUSD happy path: create
        `0xc5a9f3580b23a3b91da9a1412db752d69697ec1cff433978ebfe510cd4a42b28` →
        deliver `0xa62411b486bd41b35c4dd80877606188b53f16ffb0389df99ffb6777eb91208d` →
        settle `0x9213d9338393cb8a42ef3d0a4fe3acef949f4defc97d028a25d2198709d22041`
        (final state: Settled, worker paid 250 aUSD)
      - Job #2 — 100 aUSD dispute path: create
        `0x43024531e7cf1baff539ec3177da4ed5a10890725d0d839c8eef7a325cd37d97` →
        deliver `0x88e477d21807c381b2d82aebf06f39ac2735d2508b18ad5c8969e8be74fa4592` →
        dispute `0x439b59da4a82f92b41fbeab1b0305f5908425b5769be13648ed084d41c55761e` →
        arbiter refund `0xc9bfdfc3dadd20b54dec8f5768a2cf1664693c8a1f3ff216b4a3225bef7af03b`
        (final state: Refunded, poster made whole)
- [ ] Paste the two testnet contract addresses + explorer links into the DoraHacks
      submission (values above — ready to paste)

## Media

- [ ] **Demo video — MISSING.** Suggested 90-second cut: problem (agents can't trust
      each other with money) → simulation run on screen (both scenes) → testnet
      explorer shot of the deployed escrow → closing line. Record after testnet
      deploy so the explorer shot is real.
- [ ] **Logo / thumbnail — MISSING.** Simple option: lamp mark + "AgentPay Escrow"
      wordmark on navy (Lux brand colours) — 10-minute job in the usual design pass.
- [x] Screenshots available: terminal output of `npm test` and `npm run simulate`
      (both green as of 2026-10-30)

## Final submission steps (in DoraHacks, by the registering account)

- [ ] Fill the BUIDL form with the paste-ready content above
- [ ] Attach GitHub repo URL + demo video URL
- [ ] Add testnet contract addresses + tx hashes from `deployments/testnet-133.json`
- [ ] Select the Agent Payments & A2A Settlement track
- [ ] Submit **before Nov 1, 2026 09:00 MST** (21:30 IST) — aim for the evening of
      Oct 31 Edmonton time to leave buffer

## Honest readiness call (updated 2026-10-30, after testnet deploy)

**Deployed and demo-verified on testnet.** The on-chain gap is closed: both
contracts are live on HashKey Chain testnet (chain 133) and the full demo —
settlement plus dispute-refund — has executed on-chain with tx hashes recorded
above. Two gaps remain:
1. Public GitHub repo push (~15 minutes; needs the GitHub account).
2. Demo video (~1 hour to record/edit a tight cut) — can now use the real
   testnet explorer pages for the deployed escrow + demo jobs.

Mainnet remains untouched on purpose: per the hackathon rules it only matters
for claiming a prize if the project places.
