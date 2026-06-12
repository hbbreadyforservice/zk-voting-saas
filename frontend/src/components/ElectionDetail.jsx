import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  BarChart3,
  Copy,
  ExternalLink,
  Mail,
  Play,
  RefreshCw,
  ShieldCheck,
  Square,
  Trash2,
  Upload,
} from "lucide-react";
import { archiveElection, deployElection, endVoting, getElection, sendInvitations, startVoting } from "../services/api";
import contractsConfig from "../config/contracts.json";
import { participation, StatusBadge } from "./OrganizationDashboard";

/**
 * Tableau de pilotage d'une election.
 * Depuis cet ecran, l'organisation deploie le contrat, ouvre/ferme le vote
 * et genere les liens d'invitation envoyes aux electeurs.
 */
export default function ElectionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [election, setElection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [invitationLinks, setInvitationLinks] = useState([]);
  const [invitationSummary, setInvitationSummary] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const data = await getElection(id);
      setElection(data.election);
    } catch (err) {
      toast.error(err.response?.data?.error || "Could not load election");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  async function runAction(action, success) {
    // Toutes les actions sensibles passent par l'API backend authentifiee.
    // Le frontend ne signe jamais directement de transaction admin.
    setActionLoading(true);
    try {
      await action();
      toast.success(success);
      await load();
    } catch (err) {
      const detail =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        "Action failed";
      toast.error(detail);
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return <div className="card">Loading election...</div>;
  }

  if (!election) {
    return <div className="card">Election not found.</div>;
  }

  const pct = participation(election);
  const explorer =
    election.chainId === "11155111" && election.contractAddress
      ? `https://sepolia.etherscan.io/address/${election.contractAddress}`
      : null;
  const canDeployOnChain = Boolean(contractsConfig?.factoryAddress);

  return (
    <div>
      <div className="page-header split-header">
        <div>
          <Link className="inline-back" to="/dashboard">
            <ArrowLeft size={14} /> Dashboard
          </Link>
          <h1>{election.title}</h1>
          <p>{election.description || "No description"}</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
          <StatusBadge status={election.status} />
        </div>
      </div>

      <div className="card-grid">
        <section className="card">
          <div className="card-title">
            <BarChart3 size={18} className="icon" /> Participation
          </div>
          <div className="big-stat">{pct}%</div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="status-stack detail-status">
            <div className="status-row">
              <span>Voters</span>
              <strong>{election.voterCount || 0}</strong>
            </div>
            <div className="status-row">
              <span>Votes cast</span>
              <strong>{election.votesCast || 0}</strong>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-title">
            <ShieldCheck size={18} className="icon" /> Blockchain
          </div>
          <div className="status-stack">
            <div className="status-row">
              <span>Contract</span>
              <strong>{election.contractAddress ? shorten(election.contractAddress) : "Managed"}</strong>
            </div>
            <div className="status-row">
              <span>Factory election ID</span>
              <strong>{election.factoryElectionId || "-"}</strong>
            </div>
            <div className="status-row">
              <span>Merkle root</span>
              <strong>{election.merkleRoot ? shorten(election.merkleRoot) : "Pending"}</strong>
            </div>
          </div>
          {explorer && (
            <a className="btn btn-secondary btn-full detail-action" href={explorer} target="_blank" rel="noreferrer">
              Open explorer
            </a>
          )}
        </section>
      </div>

      <section className="card">
        <div className="card-title">Election actions</div>
        <div className="action-grid">
          {canDeployOnChain && (
            <button
              className="btn btn-secondary"
              disabled={actionLoading || !!election.contractAddress}
              onClick={() => runAction(() => deployElection(election._id), "Election deployed")}
            >
              <Upload size={16} /> Deploy contract
            </button>
          )}
          <button
            className="btn btn-primary"
            disabled={actionLoading || election.status === "voting_open"}
            onClick={() => runAction(() => startVoting(168, election._id), "Voting opened")}
          >
            <Play size={16} /> Open voting
          </button>
          <button
            className="btn btn-secondary"
            disabled={actionLoading || election.status !== "voting_open"}
            onClick={() => runAction(() => endVoting(election._id), "Voting closed")}
          >
            <Square size={16} /> Close voting
          </button>
          <button
            className="btn btn-secondary"
            disabled={actionLoading}
            onClick={() =>
              runAction(async () => {
                if (!localStorage.getItem("orgAccessToken")) {
                  localStorage.removeItem("organization");
                  localStorage.removeItem("orgRefreshToken");
                  toast.error("Session expired. Please log in again.");
                  navigate("/login");
                  return;
                }
                const data = await sendInvitations(election._id);
                // En dev, les liens sont affiches pour test. En production,
                // email.js peut les envoyer directement aux electeurs.
                setInvitationLinks(data.invitationLinks || []);
                setInvitationSummary({
                  count: data.count || 0,
                  emailsSent: data.emailsSent || 0,
                  note: data.note,
                });
              }, "Invitation links generated")
            }
          >
            <Mail size={16} /> Generate invitations
          </button>
          <button
            className="btn btn-danger"
            disabled={actionLoading}
            onClick={() => {
              if (!window.confirm("Remove this election from the active dashboard?")) return;
              runAction(async () => {
                await archiveElection(election._id);
                navigate("/dashboard");
              }, "Election removed");
            }}
          >
            <Trash2 size={16} /> Remove election
          </button>
        </div>
        {invitationLinks.length > 0 && (
          <div className="invitation-list">
            <div className="alert alert-info">
              {invitationSummary?.emailsSent
                ? `${invitationSummary.emailsSent} emails sent.`
                : "Email is not configured, so use these test links manually."}
            </div>
            <div className="header-actions" style={{ justifyContent: "flex-start", marginBottom: "0.75rem" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => copyText(invitationLinks.map((invite) => `${invite.email},${invite.url}`).join("\n"))}
              >
                <Copy size={14} /> Copy all links
              </button>
              <a className="btn btn-primary" href={invitationLinks[0].url} target="_blank" rel="noreferrer">
                <ExternalLink size={14} /> Open first invite
              </a>
            </div>
            <div className="status-stack">
              {invitationLinks.slice(0, 10).map((invite) => (
                <div className="status-row" key={invite.email}>
                  <span>{invite.email}</span>
                  <button type="button" className="btn btn-secondary" onClick={() => copyText(invite.url)}>
                    <Copy size={14} /> Copy
                  </button>
                </div>
              ))}
              {invitationLinks.length > 10 && (
                <div className="status-row">
                  <span>More links</span>
                  <strong>{invitationLinks.length - 10} hidden. Use Copy all links.</strong>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-title">Candidates and results</div>
        {election.candidates?.map((candidate, index) => (
          <div className="result-item" key={`${candidate.name}-${index}`}>
            <div className="result-header">
              <span className="result-name">{candidate.name}</span>
              <span className="result-votes">Candidate #{index}</span>
            </div>
            <div className="progress-bar compact">
              <div className="progress-fill" style={{ width: "0%" }} />
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function shorten(value) {
  if (!value) return "";
  return `${String(value).slice(0, 8)}...${String(value).slice(-6)}`;
}

async function copyText(value) {
  await navigator.clipboard.writeText(value);
  toast.success("Copied");
}
