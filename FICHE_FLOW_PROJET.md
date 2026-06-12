# Fiche flow projet - ZK Voting SaaS

Cette fiche resume le fonctionnement du projet et indique ou regarder dans le
code pour comprendre les parties importantes.

## 1. Idee generale

ZK Voting SaaS permet a une organisation de creer une election, d'inviter des
electeurs, puis de recevoir des votes anonymes et verifiables.

Le principe central est:

1. L'organisation cree une election et importe les emails des electeurs.
2. Chaque electeur recoit un lien d'invitation.
3. Le navigateur de l'electeur genere un `secret` et un `nullifier`.
4. Le navigateur calcule un `commitment = Poseidon(secret, nullifier)`.
5. Le backend ajoute ce commitment dans un arbre de Merkle.
6. Le navigateur genere une preuve zk-SNARK.
7. Le backend relaie la preuve au smart contract.
8. Le smart contract verifie la preuve, bloque le double vote et incremente le resultat.

## 2. Flow organisation

### Creation d'une election

- UI: `frontend/src/components/NewElection.jsx`
- API: `backend/src/routes/elections.js`
- Modele MongoDB: `backend/src/models/Election.js`
- Deploiement blockchain: `backend/src/services/blockchain.js`
- Factory Solidity: `contracts/VoteCloudFactory.sol`

Etapes:

1. L'organisation saisit le titre, les candidats, les dates et un CSV d'emails.
2. Le frontend appelle `createElection()`.
3. Le backend nettoie les candidats et les emails.
4. MongoDB stocke l'election et les electeurs pre-enregistres.
5. Si `deployOnChain` est actif, le backend appelle la factory Solidity.
6. L'adresse du contrat `ZKVoting` est sauvegardee dans l'election.

### Pilotage d'une election

- UI: `frontend/src/components/ElectionDetail.jsx`
- API: `backend/src/routes/admin.js`
- Blockchain: `backend/src/services/blockchain.js`
- Smart contract: `contracts/ZKVoting.sol`

Actions importantes:

- `Deploy contract`: deploie un contrat `ZKVoting`.
- `Open voting`: appelle `startVotingOnChain()`.
- `Close voting`: appelle `endVotingOnChain()`.
- `Generate invitations`: cree les liens d'invitation JWT pour les electeurs.

## 3. Flow electeur

### Ouverture du lien d'invitation

- UI: `frontend/src/components/InviteVotePage.jsx`
- API: `backend/src/routes/vote.js`

Etapes:

1. Le frontend charge `/vote/:electionId/:token`.
2. Le backend verifie le JWT et le hash stocke en base.
3. Le frontend affiche les candidats.

### Claim de l'invitation

- UI: `frontend/src/components/InviteVotePage.jsx`
- Crypto frontend: `frontend/src/services/zkProof.js`
- API: `backend/src/routes/vote.js`
- Arbre Merkle: `backend/src/services/merkleTree.js`

Etapes:

1. Le navigateur genere `secret` et `nullifier`.
2. Il calcule `commitment = Poseidon(secret, nullifier)`.
3. Il envoie seulement le commitment au backend.
4. Le backend insere le commitment dans l'arbre Merkle de l'election.
5. Le backend retourne `pathElements`, `pathIndices` et `merkleRoot`.
6. Si un contrat existe, la nouvelle racine Merkle est publiee on-chain.

Important: le backend ne recoit jamais le `secret` ni le `nullifier` brut.

### Generation de la preuve ZK

- Circuit: `circuits/voting.circom`
- Artefacts: `frontend/public/zkfiles/` et `backend/src/zkfiles/`
- Frontend: `frontend/src/services/zkProof.js`
- Backend verification: `backend/src/services/zkProof.js`

La preuve demontre:

- l'electeur connait `secret` et `nullifier`;
- `Poseidon(secret, nullifier)` est dans l'arbre Merkle;
- `Poseidon(nullifier)` correspond au `nullifierHash` public;
- le choix du candidat est bien lie a la preuve.

Signaux publics:

- `merkleRoot`
- `nullifierHash`
- `voteChoice`

Entrees privees:

- `secret`
- `nullifier`
- `pathElements`
- `pathIndices`

### Soumission du vote

- UI: `frontend/src/components/InviteVotePage.jsx`
- API: `backend/src/routes/vote.js`
- Blockchain relay: `backend/src/services/blockchain.js`
- Contrat: `contracts/ZKVoting.sol`

Etapes:

1. Le frontend envoie `proof`, `publicSignals`, `nullifierHash`, `voteChoice`.
2. Le backend verifie les signaux publics et la racine Merkle.
3. Le backend verifie la preuve off-chain pour eviter une transaction inutile.
4. Le backend convertit la preuve avec `proofToCalldata()`.
5. Le backend appelle `ZKVoting.castVote()`.
6. Le contrat verifie la preuve on-chain.
7. Le contrat marque `nullifierHash` comme utilise.
8. Le contrat incremente `voteTally[voteChoice]`.

## 4. Emplacements les plus importants

| Partie | Fichier | Role |
|---|---|---|
| Point d'entree backend | `backend/src/app.js` | Configure Express, CORS, MongoDB, routes, rate limits |
| Auth organisation | `backend/src/routes/auth.js` | Login/register organisation, tokens JWT |
| Creation election | `backend/src/routes/elections.js` | CRUD election, import emails, deploiement on-chain |
| Actions admin | `backend/src/routes/admin.js` | Ouvrir/fermer vote, invitations, resultats |
| Vote invite | `backend/src/routes/vote.js` | Claim invitation, validation preuve, soumission vote |
| Arbre Merkle | `backend/src/services/merkleTree.js` | Commitments, racines, chemins Merkle |
| Preuves ZK backend | `backend/src/services/zkProof.js` | Verification off-chain, conversion calldata |
| Blockchain backend | `backend/src/services/blockchain.js` | Appels ethers.js vers les contrats |
| Circuit ZK | `circuits/voting.circom` | Contraintes Merkle + nullifier + voteChoice |
| Contrat principal | `contracts/ZKVoting.sol` | Verifie la preuve, bloque double vote, tally |
| Factory | `contracts/VoteCloudFactory.sol` | Deploie un contrat par election |
| Router React | `frontend/src/App.jsx` | Routes login, dashboard, vote, resultats |
| Creation UI | `frontend/src/components/NewElection.jsx` | Formulaire election + CSV electeurs |
| Detail UI | `frontend/src/components/ElectionDetail.jsx` | Actions admin d'une election |
| Vote UI | `frontend/src/components/InviteVotePage.jsx` | Flow electeur invite |
| ZK frontend | `frontend/src/services/zkProof.js` | Commitment, nullifierHash, generation preuve |
| API frontend | `frontend/src/services/api.js` | Fonctions d'appel au backend |

## 5. Resume securite

- Confidentialite: le vote n'est pas lie a l'email, car le contrat ne voit que
  la preuve et le `nullifierHash`.
- Eligibilite: le circuit prouve que le commitment de l'electeur est dans
  l'arbre Merkle.
- Anti double-vote: `nullifierHash` est marque comme utilise dans le contrat.
- Integrite: le tally est stocke dans le smart contract.
- Gas abstraction: le backend relaie les transactions, donc l'electeur n'a pas
  besoin de wallet ni d'ETH.

## 6. Commandes utiles

Depuis la racine du projet:

```bash
npm install
npm run compile:circuit:production
npm run compile:contracts
npm run deploy:local
npm run backend
npm run frontend
```

Pour les tests smart contracts:

```bash
npm test
```
