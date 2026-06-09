

Detailed system documentation:

- [docs/SYSTEM_DOCUMENTATION.md](/C:/Users/HABIB/Downloads/zk-voting/docs/SYSTEM_DOCUMENTATION.md)
- [docs/PROJECT_OVERVIEW_AND_DIAGRAMS.md](/C:/Users/HABIB/Downloads/zk-voting/docs/PROJECT_OVERVIEW_AND_DIAGRAMS.md)

A production-grade, end-to-end anonymous voting system using:
- **Ethereum (Solidity)** â€” tamper-proof vote storage
- **Groth16 zk-SNARKs (circom + snarkjs)** â€” anonymous proof of eligibility
- **Poseidon Merkle Trees** â€” ZK-friendly voter registry
- **React frontend** â€” client-side proof generation (secrets never leave the browser)
- **Node.js/Express backend** â€” off-chain services + blockchain relay

---

## Security Properties

| Property | Mechanism |
|---|---|
| **Privacy** | Votes are anonymous. Only a zk proof is submitted, not the voter's identity |
| **Integrity** | Votes recorded on Ethereum â€” immutable and publicly auditable |
| **Eligibility** | Merkle membership proof enforced by the zk circuit |
| **One-person-one-vote** | Nullifier hash stored on-chain; reuse is impossible |
| **Replay protection** | `nullifierHash = Poseidon(nullifier, voteChoice)` â€” vote is cryptographically bound to the candidate |
| **Gas abstraction** | Backend relays transactions  voters don't need ETH |


## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js |  18 | https://nodejs.org |
| Rust | stable | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| circom |2.1.6 | `cargo install --git https://github.com/iden3/circom` |
| MongoDB |  6 (optional) | https://www.mongodb.com/try/download/community |

---

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/your-org/zk-voting.git
cd zk-voting

# Install root deps (hardhat, snarkjs, circomlibjs)
npm install

# Install backend deps
cd backend && npm install && cd ..

# Install frontend deps
cd frontend && npm install && cd ..
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env â€” at minimum change ADMIN_TOKEN
```

### 3. Compile the Circuit & Run Trusted Setup

```bash
cd circuits
chmod +x setup.sh
./setup.sh
cd ..
```

For a production-oriented setup using the Hermez Powers of Tau file instead of
the local development ceremony, run:

```bash
cd circuits
chmod +x setup-production.sh verify-ceremony.sh
./setup-production.sh
./verify-ceremony.sh
cd ..
```

On Windows PowerShell:

```powershell
npm run compile:circuit:production
npm run verify:ceremony
```

Read [CEREMONY.md](./CEREMONY.md) before any real production launch.

This will:
1. Compile `voting.circom` â†’ R1CS + WASM
2. Run the Powers of Tau ceremony (local dev ceremony â€” use a real MPC ceremony for production)
3. Generate `voting_final.zkey` + `verification_key.json`
4. Export the verifier contract from the completed proving setup
5. Copy artifacts to `backend/src/zkfiles/` and `frontend/public/zkfiles/`

### 4. Compile and Deploy Contracts

```bash
# Start local Hardhat node
npx hardhat node

# In a new terminal, deploy contracts
npx hardhat run scripts/deploy.js --network localhost
```

### 5. Register Test Voters

```bash
npx hardhat run scripts/register-voter.js --network localhost
```

This generates identity commitments for 5 test voters and updates the on-chain Merkle root.

### 6. Start the Backend

```bash
cd backend
npm start
# API running at http://localhost:3001
```

### 7. Start the Frontend

```bash
cd frontend
npm start
# App running at http://localhost:3000
```

## Production Checklist

- [ ] Replace the local Powers of Tau ceremony with a real MPC ceremony (e.g., [Hermez](https://github.com/hermeznetwork/phase2ceremony) or [p0tion](https://github.com/privacy-scaling-explorations/p0tion))
- [ ] Remove the `/api/voter/generate-proof` endpoint (proof must only run client-side)
- [ ] Use `HTTPS` everywhere
- [ ] Replace the admin token with JWT + 2FA
- [ ] Audit the smart contract (e.g., with Slither, Mythril)
- [ ] Increase `TREE_DEPTH` for large elections (20 = 1M voters)
- [ ] Use a cold wallet for admin functions
- [ ] Consider a commit-reveal scheme to hide vote tallies until the election closes

---

## Key Cryptographic References

- [Poseidon hash](https://eprint.iacr.org/2019/458.pdf)
- [circom documentation](https://docs.circom.io)
- [snarkjs documentation](https://github.com/iden3/snarkjs)
- [Tornado Cash (reference for Merkle+nullifier pattern)](https://tornado.cash/audits/TornadoCash_circuit_audit_by_ABDK.pdf)


