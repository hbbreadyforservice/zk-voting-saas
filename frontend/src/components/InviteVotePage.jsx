import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { CheckCircle2, ShieldCheck, Vote } from "lucide-react";
import { castInviteVote, claimVoteInvite, getVoteInvite } from "../services/api";
import { computeCommitment, generateVoteProof } from "../services/zkProof";

export default function InviteVotePage() {
  const { electionId, token } = useParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [invite, setInvite] = useState(null);
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

  async function submitSecureVote() {
    if (selectedCandidate === null) return toast.error("Select a candidate");
    if (!canVote) return toast.error("This election is not open for voting yet");

    setSubmitting(true);
    try {
      setStatusText("Generating private voting credentials...");
      const credentials = createCredentials();
      const commitment = await computeCommitment(credentials.secret, credentials.nullifier);

      setStatusText("Preparing your private voting session...");
      const claim = await claimVoteInvite(electionId, token, commitment);

      setStatusText("Generating a private proof in this browser...");
      const generatedProof = await generateVoteProof({
        secret: credentials.secret,
        nullifier: credentials.nullifier,
        voteChoice: selectedCandidate,
        pathElements: claim.pathElements,
        pathIndices: claim.pathIndices,
        merkleRoot: claim.merkleRoot,
      });

      setStatusText("Submitting secure vote...");
      const data = await castInviteVote(
        electionId,
        token,
        generatedProof.proof,
        generatedProof.publicSignals,
        generatedProof.nullifierHash,
        generatedProof.voteChoice
      );

      setResult(data);
      toast.success("Vote submitted");
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || "Vote submission failed");
    } finally {
      setStatusText("");
      setSubmitting(false);
    }
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
              onClick={() => setSelectedCandidate(index)}
            >
              <div className="candidate-avatar">{candidate.name?.[0] || index + 1}</div>
              <div className="candidate-name">{candidate.name}</div>
              <div className="candidate-index">Candidate #{index}</div>
            </button>
          ))}
        </div>
        <div className="alert alert-info detail-action">
          ZK Voting prepares your private proof in this browser. Your private voting credentials are never shown or shared.
        </div>
        <button className="btn btn-primary btn-lg btn-full" disabled={submitting || selectedCandidate === null} onClick={submitSecureVote}>
          {submitting ? (
            <>
              <div className="spinner" /> {statusText || "Submitting..."}
            </>
          ) : (
            <>
              <Vote size={18} /> Submit secure vote
            </>
          )}
        </button>
      </section>
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
