# ZK Voting Project Tree

Generated from the final demo project structure.

Excluded generated/heavy folders for readability: `.git`, `node_modules`, `build`, `cache`, `artifacts`, `logs`.

```text
zk-voting-saas/
|-- backend
|   |-- src
|   |   |-- config
|   |   |   |-- abi
|   |   |   |   |-- Verifier.json
|   |   |   |   |-- VoteCloudFactory.json
|   |   |   |   +-- ZKVoting.json
|   |   |   |-- merkle-trees
|   |   |   |   |-- 6a27589949bef578c83fd4c4.json
|   |   |   |   |-- 6a2758d3af64d83409551962.json
|   |   |   |   +-- 6a2759a2f9c5ce4a3fa42a29.json
|   |   |   |-- contracts.json
|   |   |   |-- live-tally.json
|   |   |   +-- voter-credentials.json
|   |   |-- middleware
|   |   |   |-- auth.js
|   |   |   |-- errorHandler.js
|   |   |   |-- logger.js
|   |   |   +-- quota.js
|   |   |-- models
|   |   |   |-- AuditLog.js
|   |   |   |-- Election.js
|   |   |   |-- Organization.js
|   |   |   +-- Voter.js
|   |   |-- routes
|   |   |   |-- admin.js
|   |   |   |-- auth.js
|   |   |   |-- billing.js
|   |   |   |-- billingWebhook.js
|   |   |   |-- elections.js
|   |   |   |-- public.js
|   |   |   |-- vote.js
|   |   |   +-- voter.js
|   |   |-- services
|   |   |   |-- blockchain.js
|   |   |   |-- blockchainIndexer.js
|   |   |   |-- email.js
|   |   |   |-- merkleTree.js
|   |   |   |-- reminderJob.js
|   |   |   |-- stripe.js
|   |   |   +-- zkProof.js
|   |   |-- zkfiles
|   |   |   |-- ceremony-metadata.json
|   |   |   |-- verification_key.json
|   |   |   |-- voting.wasm
|   |   |   +-- voting_final.zkey
|   |   +-- app.js
|   |-- .env
|   |-- Dockerfile
|   +-- package.json
|-- circuits
|   |-- ptau
|   |   +-- powersOfTau28_hez_final_15.ptau
|   |-- setup.sh
|   |-- setup-production.ps1
|   |-- setup-production.sh
|   |-- verify-ceremony.ps1
|   |-- verify-ceremony.sh
|   +-- voting.circom
|-- contracts
|   |-- mocks
|   |   +-- MockVerifier.sol
|   |-- Verifier.sol
|   |-- VoteCloudFactory.sol
|   +-- ZKVoting.sol
|-- frontend
|   |-- public
|   |   |-- zkfiles
|   |   |   |-- ceremony-metadata.json
|   |   |   |-- verification_key.json
|   |   |   |-- voting.wasm
|   |   |   +-- voting_final.zkey
|   |   +-- index.html
|   |-- src
|   |   |-- components
|   |   |   |-- AdminDashboard.jsx
|   |   |   |-- AuthPages.jsx
|   |   |   |-- BillingPage.jsx
|   |   |   |-- ElectionDetail.jsx
|   |   |   |-- InviteVotePage.jsx
|   |   |   |-- NewElection.jsx
|   |   |   |-- OrganizationDashboard.jsx
|   |   |   |-- PublicResults.jsx
|   |   |   |-- SaasDashboard.jsx
|   |   |   +-- VoterDashboard.jsx
|   |   |-- config
|   |   |   |-- abi
|   |   |   |   |-- Verifier.json
|   |   |   |   |-- VoteCloudFactory.json
|   |   |   |   +-- ZKVoting.json
|   |   |   +-- contracts.json
|   |   |-- services
|   |   |   |-- api.js
|   |   |   +-- zkProof.js
|   |   |-- App.css
|   |   |-- App.jsx
|   |   +-- index.js
|   |-- .env
|   |-- .env.development.local
|   |-- craco.config.js
|   |-- package.json
|   +-- vercel.json
|-- ptau
|   +-- powersOfTau28_hez_final_15.ptau
|-- scripts
|   |-- deploy.js
|   |-- deploy-polygon.js
|   |-- register-voter.js
|   +-- start-voting.js
|-- test
|   |-- VoteCloudFactory.test.js
|   +-- ZKVoting.test.js
|-- .dockerignore
|-- .env
|-- .env.amoy.example
|-- .env.example
|-- .env.production
|-- .env.production.example
|-- .gitattributes
|-- .gitignore
|-- CEREMONY.md
|-- CHECKLIST.md
|-- DEPLOY.md
|-- docker-compose.yml
|-- hardhat.config.js
|-- MEMOIRE_VOTECLOUD_BASE.md
|-- package.json
|-- package-lock.json
|-- railway.toml
|-- README.md
|-- sample-voters.csv
|-- single-voter.csv
|-- start-local.bat
|-- start-local.extra.bat
+-- sumarry.odt
```
