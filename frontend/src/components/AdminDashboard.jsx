import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { BarChart3, Play, RefreshCw, Users, Shield, Clock, Square, UserPlus, UserMinus } from "lucide-react";
import { startVoting, endVoting, addAdmin, removeAdmin, getAdminResults } from "../services/api";

export default function AdminDashboard() {
  const [authed] = useState(true);
  const [duration, setDuration] = useState(168);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [adminAddress, setAdminAddress] = useState("");

  async function loadData() {
    try {
      const data = await getAdminResults();
      setResults(data);
    } catch (err) {
      toast.error("Failed to load data: " + (err.response?.data?.error || err.message));
    }
  }

  useEffect(() => {
    if (authed) loadData();
  }, [authed]);

  async function handleStartVoting() {
    if (!duration || duration < 1) return toast.error("Set a valid duration");
    setLoading(true);
    try {
      await startVoting(Number(duration));
      toast.success(`Voting started for ${duration} hours`);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || "Could not start voting");
    } finally {
      setLoading(false);
    }
  }

  async function handleEndVoting() {
    setLoading(true);
    try {
      await endVoting();
      toast.success("Voting ended");
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || "Could not end voting");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddAdmin() {
    if (!adminAddress) return toast.error("Enter an admin address");
    setLoading(true);
    try {
      await addAdmin(adminAddress);
      toast.success("Admin added on-chain");
      setAdminAddress("");
    } catch (err) {
      toast.error(err.response?.data?.error || "Could not add admin");
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveAdmin() {
    if (!adminAddress) return toast.error("Enter an admin address");
    setLoading(true);
    try {
      await removeAdmin(adminAddress);
      toast.success("Admin removed on-chain");
      setAdminAddress("");
    } catch (err) {
      toast.error(err.response?.data?.error || "Could not remove admin");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1>Admin Dashboard</h1>
            {results && (
              <p>
                {results.electionName} {" "}
                <span className={`badge ${results.isOpen ? "badge-success" : "badge-danger"}`}>
                  {results.isOpen ? "Open" : "Closed"}
                </span>
              </p>
            )}
          </div>
          <button className="btn btn-secondary" onClick={loadData}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      <div className="card-grid">
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-title">
            <Play size={18} className="icon" /> Election Controls
          </div>
          <div className="form-group">
            <label className="form-label">Voting Duration (hours)</label>
            <input
              className="form-input"
              type="number"
              min={1}
              max={720}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              style={{ maxWidth: 220 }}
            />
          </div>
          <div className="alert alert-warning" style={{ marginBottom: "1rem" }}>
            <Clock size={16} style={{ flexShrink: 0 }} />
            <span>Votes are counted immediately on-chain as they are cast.</span>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button className="btn btn-primary" disabled={loading || results?.isOpen} onClick={handleStartVoting}>
              <Play size={16} /> Start Voting
            </button>
            <button className="btn btn-secondary" disabled={loading || !results?.isOpen} onClick={handleEndVoting}>
              <Square size={16} /> End Voting
            </button>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-title">
            <Users size={18} className="icon" /> Quick Status
          </div>
          <div className="status-stack">
            <div className="status-row">
              <span>Total Votes</span>
              <strong>{results?.totalVotes ?? 0}</strong>
            </div>
            <div className="status-row">
              <span>Candidates</span>
              <strong>{results?.numCandidates ?? 0}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <Shield size={18} className="icon" /> Governance (On-chain Admins)
        </div>
        <div className="form-group">
          <label className="form-label">Admin Address</label>
          <input
            className="form-input"
            placeholder="0x..."
            value={adminAddress}
            onChange={(e) => setAdminAddress(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button className="btn btn-primary" disabled={loading} onClick={handleAddAdmin}>
            <UserPlus size={16} /> Add Admin
          </button>
          <button className="btn btn-secondary" disabled={loading} onClick={handleRemoveAdmin}>
            <UserMinus size={16} /> Remove Admin
          </button>
        </div>
      </div>

      {results && (
        <div className="card">
          <div className="card-title" style={{ justifyContent: "space-between" }}>
            <span>
              <BarChart3 size={18} className="icon" /> Live Tally
            </span>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 400 }}>
              {results.totalVotes} total votes
            </span>
          </div>
          {results.results?.map((candidate, index) => {
            const denom = results.totalVotes || 0;
            const pct = denom > 0 ? (candidate.votes / denom) * 100 : 0;
            return (
              <div key={index} className="result-item">
                <div className="result-header">
                  <span className="result-name">{candidate.name}</span>
                  <span className="result-votes">
                    {candidate.votes} votes ({pct.toFixed(1)}%)
                  </span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

