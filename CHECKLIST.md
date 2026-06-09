# VoteCloud Production Checklist

Priority levels:

- Critical: block launch until verified.
- Important: should be completed before public launch.
- Optional: improves maturity, operations, or trust.

## Smart Contracts

| Priority | Item | How to verify |
| --- | --- | --- |
| Critical | Deploy the real `Verifier.sol`, never `MockVerifier.sol`, on Amoy/mainnet. | Confirm `contracts/Verifier.sol` exists, run `npm run deploy:amoy`, and check `backend/src/config/contracts.json` has `production: true`. |
| Critical | Factory address is the only factory used by backend and frontend. | Compare `factoryAddress` in `backend/src/config/contracts.json` and `frontend/src/config/contracts.json`. They must match the Polygonscan address. |
| Critical | Each organization-created election is owned/administered by the organization wallet. | Create an election through `VoteCloudFactory.createElection()`, then call `admin()` on the ZKVoting address and compare it with the creator address. |
| Critical | `castVote()` has anti-reentrancy protection. | Inspect `contracts/ZKVoting.sol`; `castVote` must include `nonReentrant`. Run `npm test`. |
| Critical | All admin functions require admin access. | Review `updateMerkleRoot`, `startVoting`, `endVoting`, `addAdmin`, `removeAdmin`, `transferAdmin`; run Hardhat tests for unauthorized callers. |
| Critical | Nullifier reuse is impossible. | Run the duplicate vote Hardhat test; second vote with same nullifier must revert. |
| Important | Contracts are verified on Polygonscan. | Open the Verifier and Factory explorer links printed by `npm run deploy:amoy` or `npm run deploy:polygon`; source code must be verified. |
| Important | All important actions emit events. | Confirm events for election creation, root update, voting start/end, vote cast, admin changes. Check event logs in Polygonscan. |
| Important | Gas budget is acceptable for real election volume. | Run representative votes on Amoy, record gas used for `castVote`, and estimate cost on Polygon mainnet. |
| Optional | External smart contract audit. | Give auditors commit hash, deployed addresses, tests, ceremony artifacts, and deployment logs. |

## ZK Ceremony

| Priority | Item | How to verify |
| --- | --- | --- |
| Critical | Official Hermez Powers of Tau file is used. | Run `npm run compile:circuit:production`; verify the script checks `powersOfTau28_hez_final_15.ptau` BLAKE2b hash. |
| Critical | Final `.zkey` is from a real Phase 2 ceremony before production. | Store p0tion ceremony transcript, participant list/aliases, contribution hashes, and final beacon details. |
| Critical | `Verifier.sol` matches the final `.zkey`. | Run `npm run verify:ceremony`; regenerate `Verifier.sol` from the final zkey and compare hash with the deployed source. |
| Critical | Frontend and backend use the same `wasm`, `zkey`, and verification key generation. | Compare hashes in `circuits/build/ceremony-metadata.json`, `backend/src/zkfiles`, and `frontend/public/zkfiles`. |
| Important | Circuit constraints match the intended voting rules. | Run `npx snarkjs r1cs info circuits/build/voting.r1cs` and document public signals: Merkle root, nullifier hash, vote choice. |
| Important | Ceremony files are archived immutably. | Store final `.zkey`, metadata, transcript, and hashes in at least two locations. |
| Optional | Public ceremony announcement. | Publish the ceremony process and final hashes in project documentation. |

## Backend Security

| Priority | Item | How to verify |
| --- | --- | --- |
| Critical | Proof generation is client-side only. | Search `rg "generate-proof" backend/src frontend/src`; there must be no backend route. Browser code must use `frontend/src/services/zkProof.js`. |
| Critical | Organization routes require JWT authentication. | Call `/api/elections` without token; expect 401. Call with a valid org token; expect tenant-scoped results. |
| Critical | Election ownership is enforced on admin/voter routes. | Login as org A and try to access org B election ID; expect 404/403 and no data leak. |
| Critical | Secrets never leave the browser in invite voting. | Inspect `/api/vote/:electionId/:token/claim`; backend receives only commitment, not secret/nullifier. |
| Critical | Production CORS allows only the production frontend. | Set `FRONTEND_URL=https://votecloud.example`; test API requests from another origin and expect CORS rejection. |
| Critical | Rate limiting is enabled. | Verify `express-rate-limit` on `/api/`, `/api/voter/vote`, and invitation vote cast endpoint; test repeated requests. |
| Critical | Helmet security headers are enabled. | Request `/health` and inspect headers such as `X-Content-Type-Options` and related Helmet defaults. |
| Important | All user inputs are validated. | Review `express-validator` usage in auth, elections, billing, vote, voter, and admin routes. Add tests for invalid email, dates, candidates, and proof values. |
| Important | JWT secrets are strong and unique. | Generate random 32+ byte values for `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `VOTER_INVITE_SECRET`; confirm none are default values. |
| Important | Passwords are hashed with bcrypt. | Register a test org and inspect MongoDB; `passwordHash` must not contain the raw password. |
| Important | Logs do not expose voter secrets or invite tokens. | Review `logs/backend-votecloud.log` and production logger config; tokens/secrets must not appear. |
| Important | Stripe webhook uses raw body and signature verification. | Send a webhook with Stripe CLI; valid signature succeeds, invalid signature fails. |
| Optional | Add automated API security tests. | Add supertest/Jest tests for auth, tenant isolation, quota, invitation claim, and vote cast validation. |

## Infrastructure

| Priority | Item | How to verify |
| --- | --- | --- |
| Critical | MongoDB production persistence and backups are configured. | Confirm managed MongoDB backup policy or Docker volume snapshots; perform a restore test. |
| Critical | Merkle tree persistence is durable. | If using Docker Compose, confirm `votecloud-merkle` volume exists. On Railway/ephemeral platforms, move tree snapshots to persistent storage before paid production. |
| Critical | Environment variables are set in production. | Compare Railway/Vercel variables with `.env.production.example`; no placeholder values may remain. |
| Critical | HTTPS is enabled for frontend and backend. | Open production URLs and verify TLS certificates and redirects from HTTP to HTTPS. |
| Critical | Backend health check passes. | Call `GET /health`; expect `{ "status": "ok" }`. Configure Railway healthcheck to use it. |
| Important | Docker build is reproducible. | Install Docker Desktop and run `docker compose --env-file .env.production up --build`. |
| Important | Frontend SPA routing works on direct links. | Open `/login`, `/dashboard`, `/dashboard/billing`, and `/vote/:electionId/:token` directly on Vercel. |
| Important | Contract config is tied to release artifacts. | For each release, archive `contracts.json`, ABI files, deploy logs, commit hash, and deployed addresses. |
| Important | Monitoring and alerts exist. | Configure alerts for backend 5xx, MongoDB failures, webhook failures, and blockchain RPC errors. |
| Optional | Blue/green or staged deployment. | Deploy a staging environment connected to Amoy before promoting to production. |

## Stripe Payments

| Priority | Item | How to verify |
| --- | --- | --- |
| Critical | Live Stripe products and prices exist. | In Stripe dashboard, confirm Pro is 29 EUR/month and Business is 99 EUR/month. |
| Critical | Checkout uses the correct price IDs. | Set `STRIPE_PRO_PRICE_ID` and `STRIPE_BUSINESS_PRICE_ID`; click upgrade and verify Stripe Checkout shows the expected plan/price. |
| Critical | Webhook endpoint is configured. | Stripe endpoint must be `https://api.votecloud.example/api/billing/webhook` with `STRIPE_WEBHOOK_SECRET`. |
| Critical | Subscription changes update organization plan. | Complete test checkout, cancel subscription, and simulate payment failure; inspect MongoDB organization fields. |
| Important | Starter quota is enforced. | On Starter, create 1 election successfully, then confirm the second election is blocked with 402. |
| Important | Pro and Business quotas are enforced. | Set org plan manually or through Stripe event and test election/voter limits. |
| Optional | Customer portal works. | Open `/dashboard/billing`, click manage billing, and verify redirect to Stripe portal. |

## Emails

| Priority | Item | How to verify |
| --- | --- | --- |
| Critical | Sending domain is verified. | In Resend/SendGrid, verify SPF, DKIM, and domain status before sending real voter emails. |
| Critical | Invitation links are unique and signed. | Generate invitations; each voter must receive a different `/vote/:electionId/:voterToken` link. Token hash must be stored, not raw token. |
| Critical | Confirmation email includes transaction hash. | Cast a vote and verify the voter receives txHash and vote timestamp. |
| Important | Reminder job sends only to non-voters. | Create voters with mixed `voted` statuses and run reminder window; only non-voters should receive reminders. |
| Important | Email templates render correctly. | Send test messages to Gmail/Outlook/mobile and check layout, dates, button, and sender identity. |
| Important | Bounce/complaint handling is planned. | Configure provider webhooks or operational process for bounced addresses. |
| Optional | Deliverability monitoring. | Track open/click/bounce rates if provider supports it, without weakening voter privacy. |

## Legal / GDPR

| Priority | Item | How to verify |
| --- | --- | --- |
| Critical | Privacy policy exists. | Publish a privacy policy explaining organization data, voter email handling, blockchain immutability, and retention. |
| Critical | Terms of service exist. | Publish terms covering permitted use, organization responsibilities, payment terms, and limitations. |
| Critical | GDPR lawful basis is documented. | For each data type, document lawful basis: organization account, voter email, billing data, audit logs. |
| Critical | Data retention policy is defined. | Define how long elections, voter emails, audit logs, and billing records are retained. |
| Critical | Data deletion/export process exists. | Test exporting and deleting organization data where legally possible; explain immutable blockchain data limits. |
| Important | DPA/subprocessor list exists. | List MongoDB host, Railway, Vercel, Stripe, email provider, RPC provider, and analytics if used. |
| Important | Incident response process exists. | Document who responds, severity levels, notification timelines, and evidence preservation. |
| Important | Cookie/analytics compliance is handled. | If analytics or tracking is added, implement consent where required. |
| Optional | Accessibility review. | Check keyboard navigation, color contrast, form labels, and screen reader basics. |