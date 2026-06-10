import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, Plus, Trash2, Upload, Vote } from "lucide-react";
import { createElection } from "../services/api";
import contractsConfig from "../config/contracts.json";

export default function NewElection() {
  const navigate = useNavigate();
  const canDeployOnChain = Boolean(contractsConfig?.factoryAddress);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    startDate: "",
    endDate: "",
    candidates: [{ name: "" }, { name: "" }],
    voterEmails: [],
    deployOnChain: false,
  });

  const uniqueVoters = useMemo(() => Array.from(new Set(form.voterEmails)), [form.voterEmails]);

  function setCandidate(index, value) {
    const candidates = [...form.candidates];
    candidates[index] = { name: value };
    setForm({ ...form, candidates });
  }

  function addCandidate() {
    setForm({ ...form, candidates: [...form.candidates, { name: "" }] });
  }

  function removeCandidate(index) {
    if (form.candidates.length <= 2) return;
    setForm({ ...form, candidates: form.candidates.filter((_, i) => i !== index) });
  }

  async function readCsv(file) {
    const text = await file.text();
    const emails = text
      .split(/\r?\n|,|;/)
      .map((value) => value.trim().toLowerCase())
      .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));

    setForm({ ...form, voterEmails: emails });
    toast.success(`${Array.from(new Set(emails)).length} voter emails imported`);
  }

  async function submit(e) {
    e.preventDefault();
    const candidates = form.candidates.map((c) => c.name.trim()).filter(Boolean);
    if (candidates.length < 2) return toast.error("Add at least two candidates");

    setLoading(true);
    try {
      const data = await createElection({
        title: form.title,
        description: form.description,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        candidates,
        voterEmails: uniqueVoters,
        deployOnChain: form.deployOnChain,
      });
      toast.success("Election created");
      navigate(`/dashboard/elections/${data.election._id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || "Could not create election");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="page-header split-header">
        <div>
          <h1>Create election</h1>
          <p>Set up candidates, voting dates, and the list of eligible voters.</p>
        </div>
        <Link className="btn btn-secondary" to="/dashboard">
          <ArrowLeft size={14} /> Back
        </Link>
      </div>

      <form onSubmit={submit} className="dashboard-form">
        <section className="card">
          <div className="card-title">
            <Vote size={18} className="icon" /> Election details
          </div>
          <div className="form-group">
            <label className="form-label">Title</label>
            <input
              className="form-input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-input"
              rows={4}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Start date</label>
              <input
                className="form-input"
                type="datetime-local"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">End date</label>
              <input
                className="form-input"
                type="datetime-local"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-title">Candidates</div>
          {form.candidates.map((candidate, index) => (
            <div className="candidate-input-row" key={index}>
              <input
                className="form-input"
                placeholder={`Candidate ${index + 1}`}
                value={candidate.name}
                onChange={(e) => setCandidate(index, e.target.value)}
                required={index < 2}
              />
              <button type="button" className="btn btn-secondary icon-btn" onClick={() => removeCandidate(index)}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-secondary" onClick={addCandidate}>
            <Plus size={16} /> Add candidate
          </button>
        </section>

        <section className="card">
          <div className="card-title">
            <Upload size={18} className="icon" /> Voter CSV
          </div>
          <p className="muted-text">
            Import a CSV containing voter emails. Each voter receives a private invitation link for this election.
          </p>
          <input
            className="form-input"
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={(e) => e.target.files?.[0] && readCsv(e.target.files[0])}
          />
          <div className="status-stack csv-summary">
            <div className="status-row">
              <span>Imported voters</span>
              <strong>{uniqueVoters.length}</strong>
            </div>
          </div>
          {canDeployOnChain && (
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={form.deployOnChain}
                onChange={(e) => setForm({ ...form, deployOnChain: e.target.checked })}
              />
              <span>Deploy election contract immediately</span>
            </label>
          )}
        </section>

        <button className="btn btn-primary btn-lg btn-full" disabled={loading}>
          {loading ? "Creating..." : "Create election"}
        </button>
      </form>
    </div>
  );
}
