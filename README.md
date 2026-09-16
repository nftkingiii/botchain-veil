# Veil

Veil is a grant-lifecycle exposure workbench for BOT Chain Testnet. It helps an operator inspect which links become public across grant terms, funding attestations, and resolution records, then writes those evidence states to the deployed Veil contract.

Veil is not an escrow, payment rail, identity mixer, anonymity system, work verifier, or oracle. The deployed contract records a terms hash, declared amount and deadline; its operator can mark the record funded and attach a resolution hash. `markFunded` does not transfer tokens, and `resolve` does not prove the referenced work happened. That distinction is shown next to the actions.

## Contract and network

- BOT Chain Testnet, chain ID `968` (`0x3c8`)
- Native token: BOT
- RPC: `https://rpc.bohr.life`
- Explorer: `https://scan.bohr.life`
- Contract: [`0xc89fB278716B1B09869e3A466b964578F76b07E`](https://scan.bohr.life/address/0xc89fb278716b1b09869e3a466b964578f76b07e8)
- Deployment transaction: [`0x0ca14946ae0fc321485f8358022e495765c3d75ab5a269756981b5a15740ef1d`](https://scan.bohr.life/tx/0x0ca14946ae0fc321485f8358022e495765c3d75ab5a269756981b5a15740ef1d)
- Contract source: [`evm/src/VeilGrantProof.sol`](evm/src/VeilGrantProof.sol)

The canonical deployment note is [BOTCHAIN_TESTNET.md](BOTCHAIN_TESTNET.md). Public reads are available without a wallet. Writes require the deployed contract's configured operator; a wallet connection alone does not grant write permission.

## Run locally

Requirements: Node 22 and pnpm 11.11.0.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm dev
```

Copy `.env.example` to `.env.local` only if you need to override public network settings. The example contains public configuration, no credentials. Vite reads these `VITE_` variables at build time:

| Variable | Purpose |
|---|---|
| `VITE_BOTCHAIN_RPC_URL` | Public JSON-RPC endpoint |
| `VITE_BOTCHAIN_CHAIN_ID` | Expected chain ID; currently 968 |
| `VITE_VEIL_CONTRACT_ADDRESS` | Deployed Veil proof contract |
| `VITE_BOTCHAIN_EXPLORER_URL` | Public explorer base URL |
| `REVISION` | Optional release revision exposed by `/revision` |

## Railway

Railway uses the checked-in `railway.json`: install with `pnpm install --frozen-lockfile`, build with `pnpm build`, and start with `pnpm start`. The server binds `0.0.0.0:$PORT` (fallback `4322`), serves SPA deep links, and exposes `/healthz` and `/revision`. Set the four `VITE_` variables above as Railway build variables; `REVISION` can be set to the deployed commit ID.

## Data and privacy boundaries

- Chain records and events are public. Operator transaction identity, timestamps, terms hash, declared amount, deadline, and lifecycle status can be correlated.
- The contract does not store recipient addresses or the original grant text. It does not promise unlinkability or anonymity.
- Full grant title and deliverable are stored in browser `localStorage`, namespaced by chain, contract and connected account. They are not encrypted and are not synced. Clearing browser storage removes those descriptions, not the public records.
- Hashes are not confidentiality by themselves; predictable inputs can be guessed. Do not enter personal or confidential text.
- Resolution references are hashed before recording. Avoid personal or secret references; the resulting event is public.
- No oracle, prover, funding rail, external delivery verifier, or public evidence availability service is integrated. A hash anchors an assertion, not its truth.

Veil's specific job is to examine disclosure and timing linkage across grant stages. It is not an invoice-eligibility checker.

## Contract checks

```sh
forge fmt --check
forge build
forge test
```

The web client simulates `createGrant`, `markFunded`, and `resolve` against the configured chain before presenting the request to the wallet. It waits for a transaction receipt and reports rejection, revert, and confirmation states. It never initiates a write on page load.
