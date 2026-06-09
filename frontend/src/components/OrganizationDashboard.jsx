import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { BarChart3, CalendarClock, Plus, RefreshCw, Users, Vote } from "lucide-react";
import { listElections } from "../services/api";

const STATUS_LABELS = {
  draft: "Pending",
  scheduled: "Scheduled",
  voting_open: "Open",
  closed: "Closed",
  archived: "Archived",
};

export default function OrganizationDashboard({ organization }) {
  const [elections, setElections] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await listElections();
      setElections(data.elections || []);
    } catch (err) {
      toast.error(err.response?.data?.error || "Could not load elections");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const totalVoters = elections.reduce((sum, election) => sum + (election.voterCount || 0), 0);
    const totalVotes = elections.reduce((sum, election) => sum + (election.votesCast || 0), 0);
    const open = elections.filter((election) => election.status === "voting_open").length;
    return { totalVoters, totalVotes, open };
  }, [elections]);

  return (
    <div>
      <div className="page-header split-header">
        <div>
          <h1>{organization?.name || "Organization dashboard"}</h1>
          <p>Manage elections, participation, and blockchain deployment from one workspace.</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={14} /> Refresh
          </button>
          <Link className="btn btn-primary" to="/dashboard/elections/new">
            <Plus size={16} /> New Election
          </Link>
        </div>
      </div>

      <div className="metric-grid">
        <Metric icon={<Vote size={18} />} label="Elections" value={elections.length} />
        <Metric icon={<CalendarClock size={18} />} label="Open now" value={stats.open} />
        <Metric icon={<Users size={18} />} label="Imported voters" value={stats.totalVoters} />
        <Metric icon={<BarChart3 size={18} />} label="Votes cast" value={stats.totalVotes} />
      </div>

      <section className="card">
        <div className="card-title">
          <Vote size={18} className="icon" /> Elections
        </div>
        {loading ? (
          <div className="empty-state">Loading elections...</div>
        ) : elections.length === 0 ? (
          <div className="empty-state">
            <p>No elections yet.</p>
            <Link className="btn btn-primary" to="/dashboard/elections/new">
              <Plus size={16} /> Create first election
            </Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Election</th>
                  <th>Status</th>
                  <th>Participation</th>
                  <th>Voters</th>
                  <th>Contract</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {elections.map((election) => (
                  <tr key={election._id}>
                    <td>
                      <strong>{election.title}</strong>
                      <div className="muted-small">{formatDateRange(election)}</div>
                    </td>
                    <td>
                      <StatusBadge status={election.status} />
                    </td>
                    <td>
                      <div className="participation-cell">
                        <span>{participation(election)}%</span>
                        <div className="progress-bar compact">
                          <div className="progress-fill" style={{ width: `${participation(election)}%` }} />
                        </div>
                      </div>
                    </td>
                    <td>{election.voterCount || 0}</td>
                    <td>{election.contractAddress ? shorten(election.contractAddress) : "Not deployed"}</td>
                    <td>
                      <Link className="btn btn-secondary" to={`/dashboard/elections/${election._id}`}>
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ icon, label, value }) {
  return (
    <div className="metric-card">
      <span className="icon">{icon}</span>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function StatusBadge({ status }) {
  const cls = status === "voting_open" ? "badge-success" : status === "closed" ? "badge-danger" : "badge-warning";
  return <span className={`badge ${cls}`}>{STATUS_LABELS[status] || status}</span>;
}

export function participation(election) {
  if (!election.voterCount) return 0;
  return Math.min(100, Math.round(((election.votesCast || 0) / election.voterCount) * 1000) / 10);
}

function formatDateRange(election) {
  if (!election.startDate && !election.endDate) return "No dates set";
  const start = election.startDate ? new Date(election.startDate).toLocaleDateString() : "No start";
  const end = election.endDate ? new Date(election.endDate).toLocaleDateString() : "No end";
  return `${start} to ${end}`;
}

function shorten(value) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
