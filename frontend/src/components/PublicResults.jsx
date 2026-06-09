import React, { useState, useEffect } from "react";
import { BarChart3, RefreshCw, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { getElectionInfo } from "../services/api";

const COLORS = ["var(--accent)", "#0f766e", "#d97706", "#15803d"];

export default function PublicResults() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await getElectionInfo();
      setData(res);
    } catch {
      toast.error("Could not load results");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function formatTime(ts) {
    if (!ts) return "-";
    return new Date(ts * 1000).toLocaleString();
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
        <div className="spinner" style={{ width: 32, height: 32, color: "var(--accent)" }} />
      </div>
    );
  }

  const totalVotes = data?.totalVotes || 0;
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

      <div className="card">
        <div className="card-title">
          <ShieldCheck size={18} className="icon" /> Privacy Model
        </div>
        <ul style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginTop: "0.75rem", paddingLeft: "1.25rem", lineHeight: 2 }}>
          <li>Eligibility and anonymity are proven with zk + Merkle membership.</li>
          <li>Vote choice is public on-chain to support immediate live tally.</li>
        </ul>
      </div>
    </div>
  );
}

