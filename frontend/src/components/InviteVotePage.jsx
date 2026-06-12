import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { CheckCircle2, Cpu, Key, Send, ShieldCheck, Vote } from "lucide-react";
import { castInviteVote, claimVoteInvite, getVoteInvite } from "../services/api";
import { computeCommitment, generateVoteProof } from "../services/zkProof";

/**
 * Page ouverte par le lien d'invitation.
 * Le flow complet reste cote navigateur jusqu'a la soumission finale:
 * creation secret/nullifier -> commitment -> preuve ZK -> envoi proof/publicSignals.
 */
export default function InviteVotePage() {
  const { electionId, token } = useParams();
  const [loading, setLoading] = useState(true);
  const [credentialLoading, setCredentialLoading] = useState(false);
  const [proofLoading, setProofLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [invite, setInvite] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [claim, setClaim] = useState(null);
  const [commitment, setCommitment] = useState("");
  const [generatedProof, setGeneratedProof] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await getVoteInvite(electionId, token);
        setInvite(data);
      } catch (err) {
        toast.error(err.response?.data?.error || "Invalid invitation");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [electionId, token]);

  const election = invite?.election;
  const canVote = election?.status === "voting_open" || election?.status === "scheduled";

  async function generateCredentials() {
    if (!canVote) return toast.error("This election is not open for voting yet");

    setCredentialLoading(true);
    try {
      setStatusText("Generating private voting credentials...");
      // Secrets jetables generes localement. Ils ne sont jamais affiches ni
      // envoyes au backend; seul le commitment derive est transmis.
      const nextCredentials = createCredentials();
      const nextCommitment = await computeCommitment(nextCredentials.secret, nextCredentials.nullifier);

      setCredentials(nextCredentials);
      setCommitment(String(nextCommitment));
      setGeneratedProof(null);

      setStatusText("Adding your commitment to the Merkle tree...");
      // Claim = ajout du commitment a l'arbre Merkle et recuperation du chemin
      // Merkle necessaire a la preuve.
      const claimData = await claimVoteInvite(electionId, token, nextCommitment);
      setClaim(claimData);
      toast.success("Private credentials ready");
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || "Credential generation failed");
    } finally {
      setStatusText("");
      setCredentialLoading(false);
    }
  }

  async function generateProofForVote() {
    if (selectedCandidate === null) return toast.error("Select a candidate");
    if (!credentials || !claim) return toast.error("Generate private credentials first");

    setProofLoading(true);
    try {
      setStatusText("Building Merkle path and generating ZK proof...");
      // La preuve ZK montre que l'electeur est dans l'arbre sans reveler son
      // secret, son nullifier brut ni sa position complete.
      const generatedProof = await generateVoteProof({
        secret: credentials.secret,
        nullifier: credentials.nullifier,
        voteChoice: selectedCandidate,
        pathElements: claim.pathElements,
        pathIndices: claim.pathIndices,
        merkleRoot: claim.merkleRoot,
      });

      setGeneratedProof(generatedProof);
      toast.success("ZK proof generated");
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || "Proof generation failed");
    } finally {
      setStatusText("");
      setProofLoading(false);
    }
  }

  async function submitVote() {
    if (!generatedProof) return toast.error("Generate the ZK proof first");
    if (!canVote) return toast.error("This election is not open for voting yet");

    setSubmitting(true);
    try {
      setStatusText("Submitting secure vote...");
      // Le backend relaie proof + publicSignals au smart contract.
      // Le contrat verifie la preuve et bloque le double vote via nullifierHash.
      const data = await castInviteVote(
        electionId,
        token,
        generatedProof.proof,
        generatedProof.publicSignals,
        generatedProof.nullifierHash,
        generatedProof.voteChoice
      );

      setResult({
        ...data,
        nullifierHash: generatedProof.nullifierHash,
        voteChoice: generatedProof.voteChoice,
      });
      toast.success("Vote submitted");
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || "Vote submission failed");
    } finally {
      setStatusText("");
      setSubmitting(false);
    }
  }

  function chooseCandidate(index) {
    setSelectedCandidate(index);
    setGeneratedProof(null);
  }

  if (loading) return <div className="card">Loading invitation...</div>;
  if (!invite) return <div className="card">Invitation not available.</div>;

  if (result) {
    return (
      <div className="vote-shell">
        <section className="card">
          <div className="card-title">
            <CheckCircle2 size={18} className="icon" /> Vote submitted
          </div>
          <p className="muted-text">Your vote was submitted and your receipt is ready.</p>
          <div className="status-stack detail-status">
            <div className="status-row">
              <span>Receipt code</span>
              <strong>{result.receiptCode || "-"}</strong>
            </div>
            <div className="status-row">
              <span>Vote reference</span>
              <strong>{shorten(result.txHash)}</strong>
            </div>
            <div className="status-row">
              <span>Candidate index</span>
              <strong>{result.voteChoice}</strong>
            </div>
          </div>
          <div className="alert alert-info detail-action">
            Save your receipt code. You can use it on the results page to confirm the recorded candidate.
          </div>
          <a className="btn btn-primary btn-full detail-action" href={`/results/${electionId}`} target="_blank" rel="noreferrer">
            View and verify election results
          </a>
        </section>
      </div>
    );
  }

  return (
    <div className="vote-shell">
      <section className="card">
        <div className="card-title">
          <ShieldCheck size={18} className="icon" /> {election.title}
        </div>
        <p className="muted-text">{election.description || "Private ZK Voting election"}</p>
        <div className="status-stack detail-status">
          <div className="status-row">
            <span>Voter</span>
            <strong>{invite.voter.email}</strong>
          </div>
          <div className="status-row">
            <span>Status</span>
            <strong>{election.status}</strong>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-title">
          <Vote size={18} className="icon" /> Choose candidate
        </div>
        {!canVote && <div className="alert alert-warning">This election is not open for voting yet.</div>}
        <div className="candidates-grid">
          {(election.candidates || []).map((candidate, index) => (
            <button
              type="button"
              key={`${candidate.name}-${index}`}
              className={`candidate-card vote-candidate ${selectedCandidate === index ? "selected" : ""}`}
              onClick={() => chooseCandidate(index)}
            >
              <div className="candidate-avatar">{candidate.name?.[0] || index + 1}</div>
              <div className="candidate-name">{candidate.name}</div>
              <div className="candidate-index">Candidate #{index}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-title">
          <Cpu size={18} className="icon" /> Proof and submission
        </div>

        <div className="vote-timeline">
          <VoteStep
            icon={<Key size={18} />}
            title="Private credentials"
            state={credentialLoading ? "loading" : claim ? "done" : "pending"}
            detail={claim ? `Commitment ${shorten(commitment)}` : "Local secret, nullifier, and Merkle commitment"}
          />
          <VoteStep
            icon={<Cpu size={18} />}
            title="ZK proof"
            state={proofLoading ? "loading" : generatedProof ? "done" : "pending"}
            detail={generatedProof ? `Nullifier ${shorten(generatedProof.nullifierHash)}` : "Merkle path proves voter eligibility"}
          />
          <VoteStep
            icon={<Send size={18} />}
            title="Submit vote"
            state={submitting ? "loading" : "pending"}
            detail="Proof, public signals, and candidate index"
          />
        </div>

        {statusText && (
          <div className="alert alert-info proof-status">
            <div className="spinner" /> {statusText}
          </div>
        )}

        {claim && (
          <div className="status-stack proof-details">
            <div className="status-row">
              <span>Merkle root</span>
              <strong>{shorten(claim.merkleRoot)}</strong>
            </div>
            <div className="status-row">
              <span>Merkle leaf</span>
              <strong>#{claim.leafIndex}</strong>
            </div>
            <div className="status-row">
              <span>Commitment</span>
              <strong>{shorten(commitment)}</strong>
            </div>
          </div>
        )}

        {generatedProof && (
          <div className="alert alert-success proof-ready">
            <CheckCircle2 size={18} /> ZK proof generated locally for candidate #{generatedProof.voteChoice}.
          </div>
        )}

        <div className="action-grid proof-actions">
          <button className="btn btn-secondary" disabled={credentialLoading || submitting || !canVote || !!claim} onClick={generateCredentials}>
            {credentialLoading ? (
              <>
                <div className="spinner" /> Generating...
              </>
            ) : (
              <>
                <Key size={16} /> Generate private credentials
              </>
            )}
          </button>
          <button
            className="btn btn-secondary"
            disabled={!claim || !credentials || proofLoading || submitting || selectedCandidate === null}
            onClick={generateProofForVote}
          >
            {proofLoading ? (
              <>
                <div className="spinner" /> Generating...
              </>
            ) : (
              <>
                <Cpu size={16} /> Generate ZK proof
              </>
            )}
          </button>
          <button className="btn btn-primary" disabled={!generatedProof || submitting} onClick={submitVote}>
            {submitting ? (
            <>
              <div className="spinner" /> {statusText || "Submitting..."}
            </>
          ) : (
            <>
              <Send size={16} /> Submit vote
            </>
          )}
          </button>
        </div>
      </section>
    </div>
  );
}

function VoteStep({ icon, title, state, detail }) {
  return (
    <div className={`vote-step ${state}`}>
      <div className="vote-step-icon">{state === "done" ? <CheckCircle2 size={18} /> : icon}</div>
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
    </div>
  );
}

function createCredentials() {
  return {
    secret: randomFieldElement(),
    nullifier: randomFieldElement(),
  };
}

function randomFieldElement() {
  const bytes = new Uint8Array(31);
  window.crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return BigInt(`0x${hex}`).toString();
}

function shorten(value) {
  if (!value) return "";
  return `${String(value).slice(0, 10)}...${String(value).slice(-8)}`;
}
