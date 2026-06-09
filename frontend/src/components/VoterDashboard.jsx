import React, { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import {
  ShieldCheck,
  Key,
  Vote,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  Lock,
  Cpu,
  Send,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  getElectionInfo,
  getLOCALVoters,
  getLOCALVoterCredentials,
  submitVote,
} from "../services/api";
import { generateVoteProof } from "../services/zkProof";
import contractsConfig from "../config/contracts.json";

const STEPS = ["Credentials", "Choose Candidate", "Generate Proof", "Cast Vote"];

const AVATAR_COLORS = [
  "linear-gradient(135deg,#4f6ef7,#7c3aed)",
  "linear-gradient(135deg,#06b6d4,#0284c7)",
  "linear-gradient(135deg,#f59e0b,#d97706)",
  "linear-gradient(135deg,#22c55e,#16a34a)",
];

export default function VoterDashboard() {
  const [step, setStep] = useState(0);
  const [election, setElection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [proofLoading, setProofLoading] = useState(false);
  const [LOCALVoters, setLOCALVoters] = useState([]);

  const [email, setEmail] = useState("");
  const [secret, setSecret] = useState("");
  const [nullifier, setNullifier] = useState("");
  const [leafIndex, setLeafIndex] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [merkleRoot, setMerkleRoot] = useState("");
  const [pathElements, setPathElements] = useState([]);
  const [pathIndices, setPathIndices] = useState([]);

  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [generatedProof, setGeneratedProof] = useState(null);
  const [result, setResult] = useState(null);

  const loadElection = useCallback(async () => {
    const electionData = await getElectionInfo();
    setElection(electionData);
  }, []);

  useEffect(() => {
    Promise.all([loadElection(), getLOCALVoters().catch(() => ({ voters: [] }))])
      .then(([, LOCALData]) => setLOCALVoters(LOCALData.voters || []))
      .catch(() => toast.error("Could not load election info"))
      .finally(() => setLoading(false));
  }, [loadElection]);

  function loadLOCALVoter(voter) {
    setEmail(voter.email || "");
    setLeafIndex(String(voter.leafIndex));
    setSecret(voter.secret);
    setNullifier(voter.nullifier);
    setMerkleRoot(voter.merkleRoot);
    setPathElements(voter.pathElements || []);
    setPathIndices(voter.pathIndices || []);
    toast.success(`Loaded LOCAL voter ${voter.email}`);
  }

  const handleCredentialsSubmit = useCallback(async () => {
    if (!email || !secret) return toast.error("Email and secret are required");

    let nextNullifier = nullifier;
    let nextLeafIndex = leafIndex;
    let nextMerkleRoot = merkleRoot;
    let nextPathElements = pathElements;
    let nextPathIndices = pathIndices;

    const missingAdvanced =
      !nextNullifier || !nextLeafIndex || !nextMerkleRoot || !nextPathElements?.length || !nextPathIndices?.length;

    if (missingAdvanced) {
      try {
        const creds = await getLOCALVoterCredentials(email, secret);
        nextLeafIndex = String(creds.leafIndex);
        nextNullifier = String(creds.nullifier);
        nextMerkleRoot = String(creds.merkleRoot);
        nextPathElements = creds.pathElements || [];
        nextPathIndices = creds.pathIndices || [];

        setLeafIndex(nextLeafIndex);
        setNullifier(nextNullifier);
        setMerkleRoot(nextMerkleRoot);
        setPathElements(nextPathElements);
        setPathIndices(nextPathIndices);
      } catch (err) {
        return toast.error(
          err?.response?.data?.error ||
            "Could not auto-load credentials. Use a LOCAL prefill button or fill advanced fields."
        );
      }
    }

    let parsedPath = [];
    let parsedIndices = [];

    try {
      parsedPath = Array.isArray(nextPathElements) ? nextPathElements : JSON.parse(nextPathElements || "[]");
      parsedIndices = Array.isArray(nextPathIndices) ? nextPathIndices : JSON.parse(nextPathIndices || "[]");
    } catch {
      return toast.error("Invalid Merkle path format");
    }

    if (!parsedPath.length) return toast.error("Merkle path elements required");

    setPathElements(parsedPath);
    setPathIndices(parsedIndices);
    setNullifier(nextNullifier);
    setLeafIndex(String(nextLeafIndex));
    setMerkleRoot(String(nextMerkleRoot));
    setStep(1);
  }, [email, secret, nullifier, leafIndex, merkleRoot, pathElements, pathIndices]);

  const handleGenerateProof = useCallback(async () => {
    if (selectedCandidate === null) return toast.error("Please select a candidate");

    setProofLoading(true);
    const toastId = toast.loading("Generating zk proof in browser...", { duration: 60000 });

    try {
      const proof = await generateVoteProof({
        secret,
        nullifier,
        voteChoice: selectedCandidate,
        pathElements: Array.isArray(pathElements) ? pathElements : JSON.parse(pathElements),
        pathIndices: Array.isArray(pathIndices) ? pathIndices : JSON.parse(pathIndices),
        merkleRoot,
      });

      setGeneratedProof(proof);
      toast.dismiss(toastId);
      toast.success("Proof generated. Ready to cast vote.");
      setStep(3);
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(`Proof generation failed: ${err.message}`);
    } finally {
      setProofLoading(false);
    }
  }, [secret, nullifier, selectedCandidate, pathElements, pathIndices, merkleRoot]);

  const handleSubmitVote = useCallback(async () => {
    if (!generatedProof) return;

    setSubmitting(true);
    const toastId = toast.loading("Submitting vote...");

    try {
      const { proof, publicSignals, nullifierHash, voteChoice } = generatedProof;
      const res = await submitVote(proof, publicSignals, nullifierHash, voteChoice);

      toast.dismiss(toastId);
      toast.success("Vote submitted.");

      setResult({ ...res, nullifierHash, voteChoice });
      setEmail("");
      setSecret("");
      setNullifier("");
      await loadElection();
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(err.response?.data?.error || "Vote submission failed");
    } finally {
      setSubmitting(false);
    }
  }, [generatedProof, loadElection]);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
        <div className="spinner" style={{ width: 32, height: 32, color: "var(--accent)" }} />
      </div>
    );
  }

  if (result) {
    const explorer =
      contractsConfig?.chainId === "11155111"
        ? `https://sepolia.etherscan.io/tx/${result.txHash}`
        : undefined;

    return (
      <div style={{ maxWidth: 620, margin: "0 auto", paddingTop: "2rem" }}>
        <div className="card">
          <div className="card-title">
            <CheckCircle2 size={18} className="icon" /> Vote Submitted
          </div>
          <p style={{ color: "var(--text-muted)", marginBottom: "1rem" }}>
            Your vote is recorded and counted on-chain immediately.
          </p>
          <div className="status-stack">
            <div className="status-row">
              <span>Vote Tx</span>
              {explorer ? (
                <a href={explorer} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                  {result.txHash?.slice(0, 16)}...
                </a>
              ) : (
                <strong>{result.txHash?.slice(0, 20)}...</strong>
              )}
            </div>
            <div className="status-row">
              <span>Nullifier Hash</span>
              <strong>{result.nullifierHash?.slice(0, 18)}...</strong>
            </div>
            <div className="status-row">
              <span>Candidate Index</span>
              <strong>{result.voteChoice}</strong>
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
            <button className="btn btn-secondary" onClick={() => window.location.reload()}>
              New Vote Session
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Cast Your Vote</h1>
        {election && (
          <p>
            {election.electionName} {" "}
            {election.isOpen ? (
              <span className="badge badge-success">Open</span>
            ) : (
              <span className="badge badge-danger">Closed</span>
            )}
          </p>
        )}
      </div>

      {election && !election.isOpen && (
        <div className="alert alert-warning">
          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
          <span>Voting is currently closed.</span>
        </div>
      )}

      <div className="steps">
        {STEPS.map((label, i) => (
          <div key={i} className={`step ${i === step ? "active" : i < step ? "completed" : ""}`}>
            <div className="step-number">{i < step ? "âœ“" : i + 1}</div>
            <div>{label}</div>
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="card">
          <div className="card-title">
            <Key size={18} className="icon" /> Enter Voter Credentials
          </div>

          <div className="alert alert-info">
            <Lock size={16} style={{ flexShrink: 0 }} />
            <span>Secret and nullifier stay client-side.</span>
          </div>

          {LOCALVoters.length > 0 && (
            <div className="alert alert-warning" style={{ display: "block" }}>
              <div style={{ marginBottom: "0.75rem" }}>LOCAL mode quick prefill:</div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {LOCALVoters.map((voter) => (
                  <button key={voter.email} type="button" className="btn btn-secondary" onClick={() => loadLOCALVoter(voter)}>
                    Load {voter.email}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              placeholder="voter@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              Secret {" "}
              <button
                onClick={() => setShowSecret(!showSecret)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
              >
                {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </label>
            <input
              className="form-input"
              type={showSecret ? "text" : "password"}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginBottom: "0.75rem" }}
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            Advanced manual fields
          </button>

          {showAdvanced && (
            <>
              <div className="form-group">
                <label className="form-label">Leaf Index</label>
                <input className="form-input" type="number" value={leafIndex} onChange={(e) => setLeafIndex(e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label">Nullifier</label>
                <input
                  className="form-input"
                  type={showSecret ? "text" : "password"}
                  value={nullifier}
                  onChange={(e) => setNullifier(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Merkle Root</label>
                <input className="form-input" value={merkleRoot} onChange={(e) => setMerkleRoot(e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label">Merkle Path Elements (JSON array)</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={typeof pathElements === "string" ? pathElements : JSON.stringify(pathElements)}
                  onChange={(e) => setPathElements(e.target.value)}
                  style={{ resize: "vertical", fontFamily: "monospace", fontSize: "0.78rem" }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Merkle Path Indices (JSON array)</label>
                <textarea
                  className="form-input"
                  rows={2}
                  value={typeof pathIndices === "string" ? pathIndices : JSON.stringify(pathIndices)}
                  onChange={(e) => setPathIndices(e.target.value)}
                  style={{ resize: "vertical", fontFamily: "monospace", fontSize: "0.78rem" }}
                />
              </div>
            </>
          )}

          <button className="btn btn-primary btn-lg btn-full" onClick={handleCredentialsSubmit}>
            <ShieldCheck size={18} /> Continue
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="card">
          <div className="card-title">
            <Vote size={18} className="icon" /> Select Candidate
          </div>

          <div className="candidates-grid">
            {(election?.results || []).map((candidate, i) => (
              <div
                key={i}
                className={`candidate-card ${selectedCandidate === i ? "selected" : ""}`}
                onClick={() => setSelectedCandidate(i)}
              >
                <div className="candidate-avatar" style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
                  {candidate.name?.[0] || i + 1}
                </div>
                <div className="candidate-name">{candidate.name}</div>
                <div className="candidate-index">Candidate #{i}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
            <button className="btn btn-secondary" onClick={() => setStep(0)}>
              Back
            </button>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={selectedCandidate === null} onClick={() => setStep(2)}>
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <div className="card-title">
            <Cpu size={18} className="icon" /> Generate Zero-Knowledge Proof
          </div>

          <div className="alert alert-info">
            <Lock size={16} style={{ flexShrink: 0 }} />
            <span>
              Proof generation is local. The transaction includes your selected candidate index for live tally.
            </span>
          </div>

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button className="btn btn-secondary" onClick={() => setStep(1)}>
              Back
            </button>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={proofLoading} onClick={handleGenerateProof}>
              {proofLoading ? (
                <>
                  <div className="spinner" /> Generating...
                </>
              ) : (
                <>
                  <Cpu size={16} /> Generate Proof
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {step === 3 && generatedProof && (
        <div className="card">
          <div className="card-title">
            <Send size={18} className="icon" /> Cast Vote
          </div>

          <div className="alert alert-success">
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            <span>Proof generated and ready for submission.</span>
          </div>

          <div className="credential-label">Nullifier Hash</div>
          <div className="credential-box" style={{ fontSize: "0.72rem" }}>
            {generatedProof.nullifierHash}
          </div>

          <div className="credential-label" style={{ marginTop: "0.8rem" }}>Candidate Index</div>
          <div className="credential-box" style={{ fontSize: "0.72rem" }}>
            {generatedProof.voteChoice}
          </div>

          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
            <button className="btn btn-secondary" onClick={() => setStep(2)}>
              Back
            </button>
            <button className="btn btn-primary btn-lg" style={{ flex: 1 }} disabled={submitting} onClick={handleSubmitVote}>
              {submitting ? (
                <>
                  <div className="spinner" /> Submitting...
                </>
              ) : (
                <>
                  <Vote size={18} /> Submit Vote
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

