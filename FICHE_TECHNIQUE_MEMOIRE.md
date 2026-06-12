# Fiche technique pour la redaction du memoire

## 1. Informations generales du projet

Nom du projet : ZK Voting / VoteCloud

Type de projet : application web de vote electronique securise utilisant la blockchain et les preuves a divulgation nulle de connaissance.

Objectif principal : permettre a une organisation de creer une election, inviter des electeurs, verifier leur eligibilite sans reveler leur identite, enregistrer un seul vote par electeur, puis publier des resultats verifiables.

Problematique possible pour le memoire :
Comment concevoir une plateforme de vote electronique qui garantit a la fois l'anonymat des votants, l'integrite des resultats, la verification de l'eligibilite et la prevention du double vote ?

Solution proposee :
Le systeme combine une application SaaS, une API backend, une base de donnees MongoDB, des smart contracts Solidity, un arbre de Merkle base sur Poseidon, et des zk-SNARKs Groth16 generes avec Circom et SnarkJS.

## 2. Technologies utilisees

Frontend :
- React 18
- React Router
- Axios
- SnarkJS
- CircomlibJS
- Ethers.js
- Lucide React
- React Hot Toast

Backend :
- Node.js
- Express.js
- MongoDB avec Mongoose
- JWT pour l'authentification
- Bcrypt pour le hachage de tokens
- Helmet, CORS, rate limiting
- Winston et Morgan pour les logs
- Stripe pour la partie abonnement SaaS
- Nodemailer pour les emails
- Ethers.js pour l'interaction blockchain

Blockchain :
- Solidity 0.8.24
- Hardhat
- Ethers.js
- Contrats deployables sur reseau local Hardhat, Polygon Amoy ou Polygon

Zero-Knowledge :
- Circom 2.1.6
- SnarkJS 0.7.4
- Groth16
- Poseidon hash
- Arbre de Merkle de profondeur 10

## 3. Fichiers importants a fournir a ChatGPT

Circuit ZK :
- `circuits/voting.circom`

Smart contracts :
- `contracts/ZKVoting.sol`
- `contracts/VoteCloudFactory.sol`
- `contracts/Verifier.sol`
- `contracts/mocks/MockVerifier.sol`

Backend :
- `backend/src/app.js`
- `backend/src/routes/elections.js`
- `backend/src/routes/vote.js`
- `backend/src/routes/voter.js`
- `backend/src/routes/admin.js`
- `backend/src/routes/public.js`
- `backend/src/services/merkleTree.js`
- `backend/src/services/zkProof.js`
- `backend/src/services/blockchain.js`

Frontend :
- `frontend/src/App.jsx`
- `frontend/src/components/OrganizationDashboard.jsx`
- `frontend/src/components/NewElection.jsx`
- `frontend/src/components/ElectionDetail.jsx`
- `frontend/src/components/InviteVotePage.jsx`
- `frontend/src/components/PublicResults.jsx`
- `frontend/src/services/api.js`
- `frontend/src/services/zkProof.js`

Configuration :
- `package.json`
- `backend/package.json`
- `frontend/package.json`
- `.env.example`
- `hardhat.config.js`
- `scripts/deploy.js`

## 4. Architecture generale

Le projet suit une architecture en plusieurs couches :

1. Interface utilisateur React
L'organisation cree et gere les elections depuis un dashboard. Les electeurs utilisent un lien d'invitation pour participer au vote. Le public peut consulter les resultats.

2. API backend Express
Le backend gere l'authentification des organisations, la creation des elections, l'invitation des electeurs, la persistance MongoDB, les journaux d'audit, les emails, les limites de requetes, et le relais des transactions blockchain.

3. Base de donnees MongoDB
MongoDB conserve les donnees applicatives : organisations, elections, electeurs, invitations, statut de vote, logs d'audit, informations de facturation.

4. Couche cryptographique ZK
Le circuit Circom verifie qu'un electeur appartient a l'arbre de Merkle sans reveler son identite. La preuve Groth16 est generee cote navigateur avec SnarkJS.

5. Smart contracts Solidity
Le contrat `ZKVoting.sol` verifie la preuve zk-SNARK, empeche le double vote avec un nullifier hash, stocke les votes, et expose les resultats. Le contrat `VoteCloudFactory.sol` permet de creer un contrat d'election par organisation/election.

## 5. Roles du systeme

Organisation :
- Cree un compte.
- Cree une election.
- Configure les candidats.
- Importe les emails des electeurs.
- Deploie l'election on-chain si necessaire.
- Envoie les invitations.
- Suit la participation.
- Consulte les resultats et les journaux.

Electeur :
- Recoit un lien d'invitation.
- Genere localement un secret et un nullifier.
- Calcule un commitment.
- Reclame son invitation.
- Recupere une preuve de Merkle.
- Genere une preuve zk-SNARK dans le navigateur.
- Soumet son vote.
- Recoit un recu.

Public :
- Consulte l'etat d'une election.
- Consulte les resultats publics.
- Peut verifier les informations de vote publiees.

Administrateur blockchain :
- Deploie les contrats.
- Configure les adresses du verifier et de la factory.
- Peut mettre a jour la racine de Merkle avant l'ouverture du vote.
- Peut ouvrir ou fermer une election.

## 6. Fonctionnement cryptographique

Chaque electeur possede deux valeurs privees :
- `secret`
- `nullifier`

Le commitment d'identite est calcule ainsi :
`identityCommitment = Poseidon(secret, nullifier)`

Ce commitment est ajoute dans un arbre de Merkle. La racine de cet arbre represente l'ensemble des electeurs autorises.

Le nullifier hash est calcule ainsi :
`nullifierHash = Poseidon(nullifier)`

Le nullifier hash est public et stocke dans le smart contract apres le vote. Il permet d'empecher un deuxieme vote sans reveler l'identite de l'electeur.

Le circuit `voting.circom` prouve :
- que l'electeur connait `secret` et `nullifier`
- que `Poseidon(secret, nullifier)` appartient a l'arbre de Merkle
- que la racine de Merkle correspond a la racine publique
- que le `nullifierHash` est bien derive du `nullifier`
- que le choix de vote est lie a la preuve

Les signaux publics du circuit sont :
- `merkleRoot`
- `nullifierHash`
- `voteChoice`

Les entrees privees du circuit sont :
- `secret`
- `nullifier`
- `pathElements`
- `pathIndices`

## 7. Fonctionnement des smart contracts

### ZKVoting.sol

Le contrat `ZKVoting` represente une election.

Fonctions principales :
- `updateMerkleRoot(uint256 _newRoot)` : met a jour la racine de Merkle avant l'ouverture du vote.
- `startVoting(uint256 _durationSecs)` : ouvre le vote pour une duree donnee.
- `endVoting()` : ferme le vote.
- `castVote(...)` : verifie la preuve Groth16, verifie que le nullifier n'a pas deja ete utilise, puis ajoute le vote au compteur du candidat.
- `getResults()` : retourne les candidats et leurs scores.
- `isNullifierSpent(uint256 nullifierHash)` : verifie si un nullifier a deja vote.
- `getElectionInfo()` : retourne les informations publiques de l'election.

Mecanismes de securite :
- controle d'acces par administrateurs
- verification du verifier Groth16
- verification du candidat choisi
- prevention du double vote via `nullifierSpent`
- protection contre la reentrance via `nonReentrant`
- evenements pour audit

### VoteCloudFactory.sol

Le contrat `VoteCloudFactory` sert a deployer une nouvelle instance de `ZKVoting` pour chaque election.

Fonctions principales :
- `createElection(...)` : cree un contrat d'election.
- `getElection(uint256 electionId)` : recupere les informations d'une election.
- `getOrganizationElections(address organization)` : liste les elections d'une organisation.

## 8. Parcours fonctionnel principal

1. Une organisation se connecte ou cree un compte.
2. Elle cree une election avec un titre, des dates et des candidats.
3. Elle importe une liste d'emails d'electeurs.
4. Le backend cree les invitations.
5. L'election peut etre deployee sur la blockchain via la factory.
6. Chaque electeur recoit un lien unique d'invitation.
7. L'electeur ouvre le lien, genere ses identifiants cryptographiques dans le navigateur, puis envoie son commitment au backend.
8. Le backend ajoute ce commitment dans l'arbre de Merkle de l'election.
9. La racine de Merkle est mise a jour dans la base de donnees et potentiellement sur le contrat.
10. L'electeur choisit un candidat.
11. Le frontend genere une preuve zk-SNARK avec SnarkJS.
12. Le backend verifie la preuve off-chain, transforme la preuve en calldata, puis relaie la transaction vers le contrat.
13. Le contrat verifie la preuve on-chain et enregistre le vote.
14. Le nullifier hash est marque comme utilise.
15. Les resultats sont consultables via l'interface publique.

## 9. Proprietes de securite

Anonymat :
Le vote n'est pas lie directement a l'identite de l'electeur. Le contrat ne recoit pas l'email ni le secret de l'electeur.

Eligibilite :
Seuls les electeurs dont le commitment appartient a l'arbre de Merkle peuvent produire une preuve valide.

Unicite du vote :
Le nullifier hash est stocke sur la blockchain. Si le meme electeur tente de voter une deuxieme fois, le contrat rejette le vote.

Integrite :
Les votes valides sont enregistres sur la blockchain, ce qui rend les resultats auditables et difficiles a falsifier.

Confidentialite partielle :
L'identite du votant est masquee, mais le choix de vote est public afin de permettre un comptage en direct. Pour cacher les resultats jusqu'a la fin, il faudrait ajouter un protocole commit-reveal ou un chiffrement homomorphe.

Protection backend :
L'API utilise Helmet, CORS, JWT, rate limiting, validation des entrees et logs d'audit.

## 10. Limites actuelles a mentionner dans le memoire

- La profondeur de l'arbre de Merkle est 10, donc environ 1024 electeurs maximum par arbre.
- Le vote choisi est public dans les signaux publics du circuit.
- La preuve est generee cote navigateur, mais certains controles de verification existent aussi cote backend.
- Le projet contient un mode local qui peut ignorer certaines verifications ZK pour faciliter les demonstrations.
- Le trusted setup Groth16 doit etre realise correctement pour une utilisation en production.
- La partie email, Stripe et deploiement blockchain depend de variables d'environnement.
- Une analyse de securite complete necessiterait des audits supplementaires des smart contracts et du backend.

## 11. Captures d'ecran a utiliser dans le memoire

Captures conseillees :
- page de connexion ou inscription organisation
- dashboard organisation
- creation d'une election
- detail d'une election
- import ou gestion des electeurs
- lien ou page d'invitation electeur
- etape de generation de preuve ZK
- confirmation de vote
- page de resultats publics
- terminal montrant le deploiement des contrats
- terminal montrant les tests Hardhat ou le demarrage backend/frontend

Pour chaque capture, demander a ChatGPT de fournir :
- un titre court
- une description technique
- le role de la capture dans le workflow
- un commentaire a inserer dans le memoire

## 12. Plan de memoire recommande

1. Introduction generale
2. Contexte et problematique du vote electronique
3. Objectifs du projet
4. Etat de l'art : blockchain, smart contracts, zk-SNARKs, Merkle trees
5. Analyse des besoins
6. Conception generale du systeme
7. Architecture technique
8. Modelisation UML ou diagrammes
9. Implementation frontend
10. Implementation backend
11. Implementation blockchain
12. Implementation du circuit zero-knowledge
13. Securite et confidentialite
14. Tests et validation
15. Demonstration du fonctionnement
16. Limites et perspectives
17. Conclusion

## 13. Diagrammes a demander a ChatGPT

Diagrammes utiles :
- diagramme d'architecture globale
- diagramme de cas d'utilisation
- diagramme de sequence pour le vote
- diagramme de sequence pour la creation d'election
- diagramme de composants
- diagramme de deploiement
- schema du circuit ZK
- schema de l'arbre de Merkle
- schema du flux entre frontend, backend, MongoDB et blockchain

## 14. Consignes importantes pour ChatGPT

Lors de la redaction du memoire :
- ne pas inventer des fonctionnalites absentes du code
- distinguer clairement ce qui est implemente de ce qui est une perspective
- expliquer les concepts cryptographiques simplement
- adapter le niveau au contexte universitaire
- utiliser les fichiers fournis comme source principale
- citer les noms exacts des fichiers et fonctions importantes
- integrer les captures d'ecran dans les sections correspondantes
- signaler les limites du projet de facon professionnelle
- eviter de presenter le mode local comme une securite de production
- expliquer que le choix de vote est public dans cette version

## 15. Resume court du projet

ZK Voting est une plateforme SaaS de vote electronique securise. Elle permet a des organisations de creer des elections, d'inviter des electeurs et de publier des resultats verifiables. Le systeme utilise des smart contracts Solidity pour garantir l'integrite des votes, un circuit Circom avec zk-SNARK Groth16 pour prouver l'eligibilite d'un electeur sans reveler son identite, et un arbre de Merkle Poseidon pour representer la liste des electeurs autorises. L'application est composee d'un frontend React, d'un backend Express, d'une base MongoDB et d'une couche blockchain compatible Hardhat/Polygon.

## 16. Prompts rapides a utiliser avec ChatGPT

Voir aussi les prompts fournis separement par l'assistant dans la conversation.
