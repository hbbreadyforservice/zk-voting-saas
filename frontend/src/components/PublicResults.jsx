import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { BarChart3, RefreshCw, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { getElectionInfo, getPublicElectionResults, verifyVoteReceipt } from "../services/api";

const COLORS = ["var(--accent)", "#0f766e", "#d97706", "#15803d"];

export default function PublicResults() {
  const { electionId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [receiptCode, setReceiptCode] = useState("");
  const [verification, setVerification] = useState(null);
  const [verifying, setVerifying] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = electionId ? await getPublicElectionResults(electionId) : await getElectionInfo();
      setData(res);
    } catch {
      toast.error("Could not load results");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [electionId]);

  function formatTime(ts) {
    if (!ts) return "-";
    return new Date(ts * 1000).toLocaleString();
  }

  async function verifyReceipt() {
    if (!electionId) return toast.error("Open a specific election results link to verify a receipt");
    if (!receiptCode.trim()) return toast.error("Enter your receipt code");

    setVerifying(true);
    setVerification(null);
    try {
      const res = await verifyVoteReceipt(electionId, receiptCode);
      setVerification(res);
      toast.success("Vote receipt verified");
    } catch (err) {
      toast.error(err.response?.data?.error || "Receipt could not be verified");
    } finally {
      setVerifying(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
        <div className="spinner" style={{ width: 32, height: 32, color: "var(--accent)" }} />
      </div>
    );
  }

  const totalVotes = data?.totalVotes || 0;
  const registeredVoters = data?.registeredVoters || 0;
  const turnout = registeredVoters > 0 ? Math.round((totalVotes / registeredVoters) * 1000) / 10 : 0;
  const winner = data?.results?.reduce((a, b) => (a.votes >= b.votes ? a : b), { votes: -1 });

  return (
    <div>
      <div className="page-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1>Election Results</h1>
            <p>{data?.electionName}</p>
          </div>
          <button className="btn btn-secondary" onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      <div className="card-grid">
        <div className="card" style={{ padding: "1rem", marginBottom: 0 }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>Status</div>
          <span className={`badge ${data?.isOpen ? "badge-success" : "badge-danger"}`}>
            {data?.isOpen ? "Voting Open" : "Voting Closed"}
          </span>
        </div>
        <div className="card" style={{ padding: "1rem", marginBottom: 0 }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>Total Votes</div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{totalVotes}</div>
        </div>
        {data?.registeredVoters !== undefined && (
          <div className="card" style={{ padding: "1rem", marginBottom: 0 }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
              Registered Voters
            </div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{data.registeredVoters}</div>
          </div>
        )}
        {data?.registeredVoters !== undefined && (
          <div className="card" style={{ padding: "1rem", marginBottom: 0 }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>Turnout</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{turnout}%</div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title" style={{ justifyContent: "space-between" }}>
          <span>
            <BarChart3 size={18} className="icon" /> Live Tally
          </span>
          <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Closed {formatTime(data?.endTime)}</span>
        </div>

        {!data?.results?.length ? (
          <p style={{ color: "var(--text-muted)" }}>No results available yet.</p>
        ) : (
          data.results.map((candidate, index) => {
            const pct = totalVotes > 0 ? (candidate.votes / totalVotes) * 100 : 0;
            const isLeading = candidate.votes === winner?.votes && candidate.votes > 0;
            return (
              <div key={index} className="result-item">
                <div className="result-header">
                  <span className="result-name" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {candidate.name}
                    {isLeading && (
                      <span className="badge badge-warning" style={{ fontSize: "0.65rem" }}>
                        Leading
                      </span>
                    )}
                  </span>
                  <span className="result-votes">
                    {candidate.votes} votes - {pct.toFixed(1)}%
                  </span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${pct}%`, background: COLORS[index % COLORS.length] }} />
                </div>
              </div>
            );
          })
        )}
      </div>

      {electionId && (
        <div className="card">
          <div className="card-title">
            <ShieldCheck size={18} className="icon" /> Verify your vote
          </div>
          <p className="muted-text" style={{ marginBottom: "1rem" }}>
            Enter the receipt code shown after voting to confirm the candidate recorded for your vote.
          </p>
          <div className="form-row">
            <input
              className="form-input"
              value={receiptCode}
              onChange={(event) => setReceiptCode(event.target.value)}
              placeholder="ABCD-1234-EFGH-5678"
            />
            <button className="btn btn-primary" disabled={verifying} onClick={verifyReceipt}>
              {verifying ? "Verifying..." : "Verify receipt"}
            </button>
          </div>
          {verification && (
            <div className="receipt-verified detail-status">
              <div className="alert alert-success">
                Receipt verified. This code matches a recorded vote for this election.
              </div>
              <div className="status-stack">
              <div className="status-row">
                <span>Election</span>
                <strong>{verification.electionName}</strong>
              </div>
              <div className="status-row">
                <span>Recorded vote</span>
                <strong>
                  {verification.candidate?.name} #{verification.candidate?.index}
                </strong>
              </div>
              <div className="status-row">
                <span>Vote reference</span>
                <strong>{verification.txHash}</strong>
              </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-title">
          <ShieldCheck size={18} className="icon" /> Privacy Model
        </div>
        <ul
          style={{
            fontSize: "0.875rem",
            color: "var(--text-muted)",
            marginTop: "0.75rem",
            paddingLeft: "1.25rem",
            lineHeight: 2,
          }}
        >
          <li>Voters use private invitation links, and each accepted vote receives a receipt code.</li>
          <li>Public results show aggregate tallies. Receipt lookup reveals only the vote linked to that private code.</li>
        </ul>
      </div>
    </div>
  );
}
