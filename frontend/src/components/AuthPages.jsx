import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Building2, LogIn, UserPlus } from "lucide-react";
import {
  loginOrganization,
  registerOrganization,
  saveAuthSession,
} from "../services/api";

export function RegisterPage({ onAuth }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await registerOrganization(form.name, form.email, form.password);
      saveAuthSession(data);
      onAuth?.(data.organization);
      toast.success("Organization created");
      navigate("/dashboard");
    } catch (err) {
      toast.error(err.response?.data?.error || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      icon={<UserPlus size={18} className="icon" />}
      title="Create organization"
      subtitle="Create a secure workspace for elections, voters, and results."
    >
      <form onSubmit={submit}>
        <Field label="Organization name" value={form.name} onChange={(name) => setForm({ ...form, name })} />
        <Field label="Email" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
        <Field
          label="Password"
          type="password"
          value={form.password}
          onChange={(password) => setForm({ ...form, password })}
        />
        <button className="btn btn-primary btn-full" disabled={loading}>
          <UserPlus size={16} /> {loading ? "Creating..." : "Create account"}
        </button>
      </form>
      <p className="auth-link">
        Already registered? <Link to="/login">Log in</Link>
      </p>
    </AuthShell>
  );
}

export function LoginPage({ onAuth }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await loginOrganization(form.email, form.password);
      saveAuthSession(data);
      onAuth?.(data.organization);
      toast.success("Logged in");
      navigate("/dashboard");
    } catch (err) {
      toast.error(err.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      icon={<LogIn size={18} className="icon" />}
      title="Log in"
      subtitle="Access your organization's election workspace."
    >
      <form onSubmit={submit}>
        <Field label="Email" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
        <Field
          label="Password"
          type="password"
          value={form.password}
          onChange={(password) => setForm({ ...form, password })}
        />
        <button className="btn btn-primary btn-full" disabled={loading}>
          <LogIn size={16} /> {loading ? "Logging in..." : "Log in"}
        </button>
      </form>
      <p className="auth-link">
        Need an account? <Link to="/register">Create one</Link>
      </p>
    </AuthShell>
  );
}

function AuthShell({ icon, title, subtitle, children }) {
  return (
    <div className="auth-layout">
      <section className="auth-panel">
        <div className="card-title">
          {icon} {title}
        </div>
        <p className="auth-subtitle">{subtitle}</p>
        {children}
      </section>
      <aside className="auth-side">
        <Building2 size={26} className="icon" />
        <h2>VoteCloud</h2>
        <p>Run private online elections with invite-only voting, live participation, and verifiable voter receipts.</p>
      </aside>
    </div>
  );
}

function Field({ label, type = "text", value, onChange }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input className="form-input" type={type} value={value} onChange={(e) => onChange(e.target.value)} required />
    </div>
  );
}
