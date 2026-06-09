# Base de memoire - VoteCloud

## 1. Titre propose

**VoteCloud : conception et realisation d'une plateforme SaaS multi-tenant de vote electronique anonyme basee sur zk-SNARKs, Merkle Trees et blockchain**

## 2. Resume

VoteCloud est une plateforme de vote electronique securise concue sous forme de SaaS multi-tenant. L'objectif est de permettre a plusieurs organisations, comme des universites, associations, entreprises ou institutions, de creer et gerer leurs propres elections en ligne tout en conservant des garanties fortes de confidentialite, d'integrite et de verifiabilite.

Le systeme repose sur trois piliers techniques principaux. Le premier est la blockchain, utilisee pour enregistrer les votes de maniere immuable et auditable. Le deuxieme est l'utilisation de preuves a divulgation nulle de connaissance, plus precisement des zk-SNARKs, permettant a un electeur de prouver qu'il est autorise a voter sans reveler son identite. Le troisieme est l'utilisation d'un Merkle Tree, qui permet de representer efficacement la liste des electeurs autorises et de verifier leur appartenance a cette liste sans publier toutes leurs donnees personnelles.

La version finale vise a transformer un prototype de vote prepare a l'avance en une plateforme complete ou chaque organisation peut creer plusieurs elections, importer ses electeurs, envoyer des invitations, suivre la participation, cloturer le scrutin et publier les resultats. Le tout est encapsule dans une architecture multi-tenant garantissant l'isolation des donnees entre organisations.

## 3. Contexte general

Le vote electronique presente plusieurs avantages : accessibilite, rapidite de depouillement, reduction des couts logistiques et possibilite de participation a distance. Cependant, il introduit aussi des risques importants :

- violation de la confidentialite du vote ;
- usurpation d'identite ;
- double vote ;
- manipulation des resultats ;
- manque de transparence dans le depouillement ;
- difficulte a auditer le systeme.

Les systemes traditionnels reposent souvent sur une autorite centrale. Cette autorite controle l'identification, la collecte des votes et le depouillement. Ce modele est simple, mais il exige une confiance forte dans l'administrateur du systeme.

VoteCloud propose une approche hybride. Le backend SaaS gere l'experience utilisateur, les organisations, les elections et les invitations, tandis que la blockchain assure l'enregistrement verifiable des votes. Les zk-SNARKs permettent de separer l'identite de l'electeur de son vote.

## 4. Problematique

La problematique principale peut etre formulee ainsi :

**Comment concevoir une plateforme de vote electronique multi-tenant permettant a plusieurs organisations de gerer leurs elections tout en garantissant l'anonymat des electeurs, l'unicite du vote, l'integrite des resultats et l'auditabilite du processus ?**

Cette problematique implique plusieurs sous-problemes :

- comment verifier qu'un electeur est autorise a voter sans reveler son identite ?
- comment empecher un electeur de voter plusieurs fois ?
- comment garantir que les resultats ne peuvent pas etre modifies apres coup ?
- comment permettre a plusieurs organisations d'utiliser la meme plateforme sans melanger leurs donnees ?
- comment offrir une experience simple pour les administrateurs et les electeurs ?

## 5. Objectifs du projet

### Objectif principal

L'objectif principal est de concevoir et developper une plateforme SaaS de vote electronique anonyme, verifiable et multi-tenant, utilisant zk-SNARKs, Merkle Trees et blockchain.

### Objectifs specifiques

- permettre a une organisation de creer un compte ;
- permettre a une organisation de creer plusieurs elections ;
- permettre l'import d'electeurs par fichier CSV ;
- generer une liste d'electeurs autorises sous forme de Merkle Tree ;
- permettre a un electeur de prouver son eligibilite avec une preuve zk-SNARK ;
- enregistrer les votes sur un smart contract ;
- empecher le double vote avec un nullifier hash ;
- afficher les resultats de maniere transparente ;
- assurer l'isolation des donnees entre organisations ;
- fournir un dashboard SaaS pour les administrateurs ;
- preparer le projet pour un deploiement cloud.

## 6. Description fonctionnelle du systeme final

### 6.1 Organisation cliente

Une organisation est un client de la plateforme VoteCloud. Elle peut etre une universite, une association, une entreprise ou une institution.

Fonctionnalites disponibles pour une organisation :

- inscription ;
- connexion ;
- gestion de son dashboard ;
- creation d'elections ;
- ajout de candidats ;
- import des electeurs ;
- ouverture et cloture des votes ;
- consultation du taux de participation ;
- consultation et export des resultats ;
- gestion de son abonnement SaaS.

### 6.2 Election

Une election est creee par une organisation. Elle contient :

- un titre ;
- une description ;
- une date de debut ;
- une date de fin ;
- une liste de candidats ;
- une liste d'electeurs autorises ;
- un Merkle root ;
- une adresse de smart contract ;
- un statut.

Les statuts proposes sont :

- `draft` : brouillon ;
- `scheduled` : planifiee ;
- `voting_open` : vote ouvert ;
- `closed` : vote cloture ;
- `archived` : election archivee.

### 6.3 Electeur

Un electeur recoit une invitation unique pour participer a une election. Le systeme final doit privilegier une generation locale des secrets dans le navigateur afin que le backend ne puisse pas relier directement l'identite de l'electeur a son vote.

L'electeur peut :

- ouvrir son lien de vote ;
- choisir un candidat ;
- generer une preuve zk-SNARK ;
- soumettre son vote ;
- recevoir un hash de transaction ;
- verifier que son vote a bien ete enregistre.

## 7. Architecture generale

L'architecture cible est composee de plusieurs couches :

```text
Frontend React
    |
    | HTTPS / API REST
    v
Backend Node.js / Express
    |
    | MongoDB
    v
Base de donnees SaaS

Backend Node.js
    |
    | ethers.js
    v
Smart contracts blockchain

Frontend React
    |
    | snarkjs
    v
Generation preuve zk-SNARK cote client
```

### 7.1 Frontend

Le frontend est developpe avec React. Il contient :

- pages d'inscription et connexion ;
- dashboard organisation ;
- creation d'election ;
- detail d'election ;
- page de vote ;
- page de resultats ;
- mode clair / sombre.

### 7.2 Backend

Le backend est developpe avec Node.js et Express. Il assure :

- authentification JWT ;
- gestion des organisations ;
- gestion des elections ;
- isolation multi-tenant ;
- gestion des electeurs ;
- interaction avec la blockchain ;
- audit logs ;
- envoi d'emails ;
- verification des quotas SaaS.

### 7.3 Base de donnees

MongoDB stocke les donnees applicatives :

- organisations ;
- elections ;
- electeurs ;
- logs d'audit ;
- informations d'abonnement ;
- etat de synchronisation blockchain.

Les votes eux-memes sont enregistres sur la blockchain.

### 7.4 Blockchain

La blockchain est utilisee pour :

- deployer les contrats d'election ;
- stocker le Merkle root ;
- verifier les preuves zk-SNARK ;
- enregistrer les votes ;
- stocker les nullifier hashes ;
- fournir un historique auditable.

## 8. Architecture smart contracts

### 8.1 ZKVoting.sol

Le contrat `ZKVoting` represente une election. Il contient :

- l'adresse de l'administrateur ;
- la liste des candidats ;
- le Merkle root des electeurs autorises ;
- l'etat du vote ;
- le tally des votes ;
- les nullifier hashes deja utilises ;
- la fonction `castVote()`.

La fonction `castVote()` recoit :

- une preuve zk-SNARK ;
- les signaux publics ;
- le nullifier hash ;
- le choix du candidat.

Le contrat verifie :

- que le vote est ouvert ;
- que le candidat existe ;
- que le nullifier n'a pas deja ete utilise ;
- que la preuve zk-SNARK est valide.

Si toutes les conditions sont verifiees, le vote est comptabilise.

### 8.2 VoteCloudFactory.sol

Le contrat `VoteCloudFactory` permet de deployer plusieurs elections. Chaque organisation peut creer ses propres contrats `ZKVoting`.

Fonction principale :

```solidity
createElection(string electionName, string[] candidates, uint256 durationSecs)
```

La factory maintient :

- un identifiant unique pour chaque election ;
- un mapping entre organisation et ses elections ;
- un mapping entre identifiant et contrat d'election ;
- un event `ElectionCreated`.

Cette approche permet :

- d'avoir une election separee par contrat ;
- de faciliter l'audit ;
- de separer les donnees entre organisations ;
- de reduire la complexite d'un contrat unique multi-election.

## 9. Technologie zk-SNARK

### 9.1 Principe

Une preuve a divulgation nulle de connaissance permet a une personne de prouver qu'elle connait une information sans reveler cette information.

Dans VoteCloud, l'electeur prouve :

- qu'il possede un secret et un nullifier ;
- que son identity commitment appartient au Merkle Tree ;
- qu'il est donc autorise a voter.

Il ne revele pas :

- son secret ;
- son nullifier ;
- son identite personnelle ;
- sa position exacte dans la liste des electeurs.

### 9.2 Identity commitment

Chaque electeur est represente par un commitment :

```text
identityCommitment = Poseidon(secret, nullifier)
```

Ce commitment est ajoute au Merkle Tree de l'election.

### 9.3 Nullifier hash

Le nullifier hash permet d'empecher le double vote :

```text
nullifierHash = Poseidon(nullifier)
```

Quand un vote est accepte, le smart contract marque ce nullifier hash comme utilise. Si le meme electeur tente de voter une deuxieme fois, le contrat rejette la transaction.

### 9.4 Circuit Circom

Le circuit verifie :

- le calcul du commitment ;
- l'appartenance du commitment au Merkle Tree ;
- le calcul du nullifier hash ;
- la coherence des signaux publics.

Les signaux publics sont :

- `merkleRoot` ;
- `nullifierHash` ;
- `voteChoice`.

Les donnees privees sont :

- `secret` ;
- `nullifier` ;
- `pathElements` ;
- `pathIndices`.

## 10. Merkle Tree

Le Merkle Tree est utilise pour representer la liste des electeurs autorises.

Avantages :

- verification efficace ;
- pas besoin de stocker toute la liste sur la blockchain ;
- seule la racine du Merkle Tree est stockee on-chain ;
- chaque electeur peut fournir une preuve d'appartenance.

Processus :

1. chaque electeur genere ou recoit un identity commitment ;
2. les commitments sont inseres dans le Merkle Tree ;
3. la racine du Merkle Tree est calculee ;
4. la racine est envoyee au smart contract ;
5. lors du vote, l'electeur fournit une preuve d'appartenance.

## 11. Multi-tenancy

La multi-tenancy signifie que plusieurs organisations utilisent la meme application, mais que leurs donnees restent separees.

Dans VoteCloud :

- chaque organisation possede un `orgId` ;
- chaque election appartient a une organisation ;
- chaque electeur est lie a une organisation et a une election ;
- chaque route protegee verifie le JWT de l'organisation ;
- les requetes MongoDB filtrent par `orgId`.

Exemple :

```text
Organization A
    Election A1
    Election A2

Organization B
    Election B1
    Election B2
```

L'organisation A ne peut pas acceder aux elections de l'organisation B.

## 12. Authentification

L'authentification repose sur JWT.

Routes principales :

- `POST /api/auth/register` ;
- `POST /api/auth/login` ;
- `POST /api/auth/refresh`.

Le mot de passe est stocke sous forme de hash avec bcrypt.

Le backend retourne :

- un access token ;
- un refresh token.

Le middleware `authenticateOrg` verifie le token et ajoute l'organisation authentifiee dans la requete.

## 13. SaaS et abonnements

VoteCloud peut proposer plusieurs plans :

| Plan | Prix | Limites |
|---|---:|---|
| Starter | Gratuit | 1 election, 50 electeurs |
| Pro | 29 euros / mois | 10 elections, 1000 electeurs |
| Business | 99 euros / mois | Illimite |

Stripe peut etre utilise pour :

- creer les sessions Checkout ;
- gerer les abonnements ;
- recevoir les webhooks ;
- mettre a jour le plan de l'organisation ;
- bloquer les actions si les quotas sont depasses.

## 14. Emails et invitations

Le systeme d'invitation permet d'envoyer un lien unique a chaque electeur.

Le flux recommande pour proteger l'anonymat :

1. l'organisation importe les emails des electeurs ;
2. le backend genere un token d'invitation ;
3. l'electeur ouvre le lien ;
4. le navigateur genere localement `secret` et `nullifier` ;
5. le navigateur calcule le commitment ;
6. le backend ajoute seulement le commitment au Merkle Tree ;
7. le secret et le nullifier ne quittent pas le navigateur.

Cela evite que le backend puisse relier un email a un nullifier hash on-chain.

## 15. Securite

### 15.1 Proprietes de securite visees

| Propriete | Mecanisme |
|---|---|
| Confidentialite | zk-SNARK, non-divulgation du secret |
| Eligibilite | preuve d'appartenance au Merkle Tree |
| Unicite du vote | nullifier hash |
| Integrite | smart contract blockchain |
| Auditabilite | events blockchain + audit logs backend |
| Isolation SaaS | orgId + JWT + filtrage MongoDB |

### 15.2 Mesures backend

- Helmet pour les headers HTTP ;
- rate limiting ;
- validation des inputs ;
- mots de passe hashes avec bcrypt ;
- JWT avec expiration ;
- CORS strict ;
- logs d'audit ;
- secrets stockes en variables d'environnement.

### 15.3 Mesures frontend

- generation des preuves cote client ;
- ne pas envoyer les secrets au backend ;
- stocker les tokens avec prudence ;
- mode clair / sombre ;
- interface de verification du vote.

### 15.4 Mesures smart contract

- access control sur les fonctions admin ;
- verification du candidat ;
- verification du nullifier ;
- verification de la preuve ;
- events pour les actions importantes.

## 16. Flux principal d'utilisation

### 16.1 Creation d'une election

```text
Organisation -> Dashboard -> Nouvelle election
Organisation saisit titre, dates, candidats
Backend cree l'election en base
Factory deploie un contrat ZKVoting
Adresse du contrat stockee dans MongoDB
```

### 16.2 Import des electeurs

```text
Admin importe CSV
Backend cree les enregistrements electeurs
Invitations envoyees
Electeurs generent leurs commitments
Merkle Tree calcule
Merkle root envoye au contrat
```

### 16.3 Vote

```text
Electeur ouvre son lien
Electeur choisit un candidat
Frontend genere la preuve zk-SNARK
Backend relaie la transaction
Smart contract verifie la preuve
Vote comptabilise
Electeur recoit txHash
```

### 16.4 Verification

L'electeur peut verifier :

- que sa transaction existe ;
- que son nullifier hash est marque comme utilise ;
- que le vote total a augmente ;
- que les resultats sont coherents avec les events blockchain.

## 17. Technologies utilisees

| Couche | Technologie |
|---|---|
| Frontend | React, React Router, Axios |
| Backend | Node.js, Express |
| Base de donnees | MongoDB, Mongoose |
| Blockchain | Solidity, Hardhat, ethers.js |
| ZK | Circom, snarkjs, Groth16 |
| Hash ZK-friendly | Poseidon |
| Auth | JWT, bcrypt |
| Paiement | Stripe |
| Emails | Nodemailer, Resend ou SendGrid |
| Deploiement | Docker, Railway, Vercel |

## 18. Methodologie de developpement

Le projet est developpe progressivement :

1. stabilisation du prototype ;
2. ajout de la factory smart contract ;
3. ajout du backend multi-tenant ;
4. ajout du dashboard organisation ;
5. securisation du flux votant ;
6. ajout des emails ;
7. ajout de Stripe ;
8. deploiement cloud ;
9. hardening securite ;
10. tests finaux.

Cette approche reduit les risques car chaque couche est testee avant de passer a la suivante.

## 19. Tests prevus

### Tests smart contracts

- creation d'election via factory ;
- mapping organisation vers elections ;
- verification de l'admin de chaque election ;
- rejet du double vote ;
- rejet des preuves invalides ;
- rejet des candidats invalides.

### Tests backend

- inscription organisation ;
- login ;
- refresh token ;
- isolation multi-tenant ;
- creation election ;
- quotas SaaS ;
- import electeurs ;
- audit logs.

### Tests frontend

- inscription ;
- connexion ;
- creation election ;
- import CSV ;
- generation preuve ;
- vote ;
- changement theme clair/sombre.

### Tests end-to-end

Scenario complet :

```text
Creer organisation
Creer election
Ajouter candidats
Importer electeurs
Ouvrir vote
Voter avec preuve zk
Verifier txHash
Cloturer
Afficher resultats
```

## 20. Limites du projet

Certaines limites doivent etre mentionnees dans le memoire :

- le vote choice est public on-chain dans la version live tally ;
- une vraie ceremonie MPC est necessaire pour la production ;
- un audit externe des smart contracts est recommande ;
- le backend SaaS reste une partie de confiance pour l'orchestration ;
- le cout gas depend du reseau blockchain ;
- la gestion des secrets cote utilisateur doit etre soigneusement concue.

## 21. Ameliorations futures

- chiffrement homomorphe ou commit-reveal pour cacher les resultats jusqu'a la cloture ;
- support de plusieurs tours d'election ;
- support de plusieurs administrateurs par organisation ;
- application mobile ;
- integration DID ou wallet identity ;
- tableau de bord analytique avance ;
- export PDF certifie ;
- indexer blockchain dedie ;
- audit public des snapshots d'election.

## 22. Conclusion proposee

VoteCloud montre comment les technologies blockchain et zero-knowledge peuvent etre combinees avec une architecture SaaS moderne pour creer une plateforme de vote electronique plus transparente, plus verifiable et plus respectueuse de la confidentialite. Le projet ne se limite pas a enregistrer des votes en ligne : il introduit un modele ou l'eligibilite est prouvee cryptographiquement, ou le double vote est empeche par un nullifier, et ou l'integrite des resultats peut etre verifiee sur la blockchain.

La transformation du prototype initial en plateforme multi-tenant permet de rendre le systeme exploitable par plusieurs organisations. Chaque organisation peut creer ses propres elections, gerer ses electeurs et consulter ses resultats sans acceder aux donnees des autres clients. Cette evolution rapproche le projet d'un produit reel, utilisable dans des contextes institutionnels ou associatifs.

Enfin, le projet met en evidence les compromis entre confidentialite, auditabilite, ergonomie et complexite technique. Il constitue une base solide pour explorer les applications pratiques des zk-SNARKs dans les systemes democratiques numeriques.

