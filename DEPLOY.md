# VoteCloud Production Deployment

This guide deploys VoteCloud with a production ZK verifier, Polygon contracts, a Node.js backend, MongoDB, Redis, and a Vercel frontend.

## 1. Prerequisites

Install:

```bash
node --version
npm --version
docker --version
```

Create accounts/keys for:

- Polygon RPC provider: Alchemy, Infura, QuickNode, or another reliable provider.
- Polygonscan API key for contract verification.
- Stripe live products/prices for Pro and Business.
- SMTP provider such as Resend or SendGrid.
- MongoDB production database. Docker Compose can run MongoDB; Railway production should use a managed MongoDB service or a persistent volume.

Important: Mumbai is no longer the right Polygon testnet for new deployments. Use Polygon Amoy (`chainId 80002`) for testnet and Polygon mainnet (`chainId 137`) for production.

## 2. Generate Production ZK Artifacts

Run the production circuit setup before deploying real contracts:

```powershell
npm install
npm run compile:circuit:production
npm run verify:ceremony
```

For a final real launch, replace the local Phase 2 contribution with a public multi-party ceremony as described in `CEREMONY.md`. Do not launch production with the mock verifier.

The setup generates:

- `contracts/Verifier.sol`
- `backend/src/zkfiles/voting.wasm`
- `backend/src/zkfiles/voting_final.zkey`
- `frontend/public/zkfiles/voting.wasm`
- `frontend/public/zkfiles/voting_final.zkey`

## 3. Configure Environment

Copy the template:

```powershell
Copy-Item .env.production.example .env.production
```

Fill at minimum:

- `FRONTEND_URL`
- `REACT_APP_API_URL`
- `MONGO_URI`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `VOTER_INVITE_SECRET`
- `RPC_URL`
- `POLYGON_AMOY_RPC_URL` or `POLYGON_MAINNET_RPC_URL`
- `PRIVATE_KEY`
- `ADMIN_PRIVATE_KEY`
- `POLYGONSCAN_API_KEY`
- `SMTP_*`
- `STRIPE_*`

Use different wallets for deployment and daily backend operation when possible. Keep both funded with enough native gas token.

## 4. Deploy Contracts To Amoy

Use Amoy first:

```powershell
npm run compile:contracts
npm run deploy:amoy
```

The script deploys:

- `Verifier.sol`
- `VoteCloudFactory.sol`

It writes contract config and ABIs into:

- `backend/src/config/contracts.json`
- `backend/src/config/abi/*.json`
- `frontend/src/config/contracts.json`
- `frontend/src/config/abi/*.json`

The script also attempts Polygonscan verification when `POLYGONSCAN_API_KEY` is set.

## 5. Smoke Test Amoy

Start backend and frontend locally against Amoy:

```powershell
cd backend
npm start
```

In another terminal:

```powershell
cd frontend
npm start
```

Check:

- Register an organization.
- Create an election.
- Deploy it through the factory.
- Import voters and send invitations.
- Claim a voter link in the browser.
- Generate proof client-side and cast a vote.
- Verify the transaction on Amoy Polygonscan.

## 6. Deploy Contracts To Polygon Mainnet

Only after Amoy validation and security review:

```powershell
npm run deploy:polygon
```

Commit or package the generated contract config/ABI files with the exact release artifact you deploy. The backend and frontend must use the same factory address.

## 7. Docker Compose Backend

For a single-server deployment:

```powershell
docker compose --env-file .env.production up --build -d
```

Check health:

```powershell
Invoke-WebRequest http://localhost:3001/health
```

The compose file runs:

- backend API on port `3001`
- MongoDB on port `27017`
- Redis on port `6379`
- a persistent volume for Merkle tree files

Production note: the current Merkle tree implementation writes tree snapshots to the filesystem. Docker Compose uses a volume for this. On platforms with ephemeral disks, move Merkle tree persistence to MongoDB/S3 or configure persistent storage before real paid production.

## 8. Railway Backend

Railway uses `railway.toml` and `backend/Dockerfile`.

Steps:

1. Create a new Railway project from the repository.
2. Add a MongoDB service or set `MONGO_URI` to a managed MongoDB URI.
3. Add a Redis service if you plan to use Redis-backed jobs later; `REDIS_URL` is included for deployment readiness.
4. Add all backend environment variables from `.env.production.example` except `REACT_APP_API_URL`.
5. Set the public backend domain, for example `https://api.votecloud.example`.
6. Set `FRONTEND_URL` to the final Vercel frontend URL.
7. Deploy and verify `/health` returns `{ "status": "ok" }`.

## 9. Vercel Frontend

Deploy the `frontend` folder as the Vercel project root.

Set environment variables:

```text
REACT_APP_API_URL=https://api.votecloud.example/api
```

The `frontend/vercel.json` file enables SPA routing and adds CSP/security headers. After deploy, test direct navigation to:

- `/login`
- `/register`
- `/dashboard`
- `/dashboard/billing`
- `/vote/:electionId/:voterToken`

## 10. Stripe Setup

Create two recurring monthly prices:

- Pro: 29 EUR/month
- Business: 99 EUR/month

Set:

- `STRIPE_PRO_PRICE_ID`
- `STRIPE_BUSINESS_PRICE_ID`
- `STRIPE_SECRET_KEY`

Create a webhook endpoint:

```text
https://api.votecloud.example/api/billing/webhook
```

Subscribe to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET`.

## 11. Email Setup

For Resend SMTP:

```text
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=resend
SMTP_PASS=re_xxxxx
EMAIL_FROM=VoteCloud <noreply@votecloud.example>
```

Verify the sending domain before sending real invitations. Test invitation, confirmation, and reminder emails on Amoy first.

## 12. Production Checklist

Before mainnet launch, complete `CHECKLIST.md` when it exists. At minimum verify:

- Multi-party Phase 2 ceremony evidence is stored.
- `contracts/Verifier.sol` matches the final `.zkey`.
- Contracts are verified on Polygonscan.
- Backend CORS only allows the production frontend.
- JWT/email/Stripe secrets are long random values.
- MongoDB backups are enabled.
- Legal pages, privacy policy, and GDPR process exist.
- A rollback plan exists for backend/frontend releases.
