import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { CreditCard, ExternalLink, RefreshCw, ShieldCheck, Zap } from "lucide-react";
import { createCheckoutSession, getBillingPortal, getBillingSummary } from "../services/api";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: "Free",
    detail: "1 election, 50 voters",
  },
  {
    id: "pro",
    name: "Pro",
    price: "29 EUR/mo",
    detail: "10 elections, 1000 voters",
  },
  {
    id: "business",
    name: "Business",
    price: "99 EUR/mo",
    detail: "Unlimited elections and voters",
  },
];

export default function BillingPage() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setSummary(await getBillingSummary());
    } catch (err) {
      toast.error(err.response?.data?.error || "Could not load billing");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function upgrade(plan) {
    if (plan === "starter") return;
    setActionLoading(true);
    try {
      const data = await createCheckoutSession(plan);
      window.location.href = data.url;
    } catch (err) {
      toast.error(err.response?.data?.error || "Stripe checkout is not configured");
    } finally {
      setActionLoading(false);
    }
  }

  async function openPortal() {
    setActionLoading(true);
    try {
      const data = await getBillingPortal();
      window.location.href = data.url;
    } catch (err) {
      toast.error(err.response?.data?.error || "Billing portal is not available");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) return <div className="card">Loading billing...</div>;

  return (
    <div>
      <div className="page-header split-header">
        <div>
          <h1>Billing</h1>
          <p>Manage your ZK Voting subscription, quotas, and billing portal.</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="btn btn-secondary" disabled={actionLoading} onClick={openPortal}>
            <ExternalLink size={14} /> Stripe portal
          </button>
        </div>
      </div>

      <div className="card-grid">
        <section className="card">
          <div className="card-title">
            <CreditCard size={18} className="icon" /> Current plan
          </div>
          <div className="big-stat plan-stat">{planName(summary?.plan)}</div>
          <div className="status-stack">
            <div className="status-row">
              <span>Status</span>
              <strong>{summary?.subscription?.status || "none"}</strong>
            </div>
            <div className="status-row">
              <span>Period end</span>
              <strong>{formatDate(summary?.subscription?.currentPeriodEnd)}</strong>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-title">
            <ShieldCheck size={18} className="icon" /> Usage
          </div>
          <UsageRow label="Elections" used={summary?.usage?.elections || 0} limit={summary?.limits?.elections} />
          <UsageRow label="Voters" used={summary?.usage?.voters || 0} limit={summary?.limits?.voters} />
        </section>
      </div>

      <section className="card">
        <div className="card-title">
          <Zap size={18} className="icon" /> Plans
        </div>
        <div className="plans-grid">
          {PLANS.map((plan) => (
            <div className={`plan-card ${summary?.plan === plan.id ? "selected" : ""}`} key={plan.id}>
              <div>
                <h3>{plan.name}</h3>
                <strong>{plan.price}</strong>
                <p>{plan.detail}</p>
              </div>
              <button
                className={summary?.plan === plan.id ? "btn btn-secondary btn-full" : "btn btn-primary btn-full"}
                disabled={summary?.plan === plan.id || actionLoading || plan.id === "starter"}
                onClick={() => upgrade(plan.id)}
              >
                {summary?.plan === plan.id ? "Current plan" : plan.id === "starter" ? "Default" : "Upgrade"}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function UsageRow({ label, used, limit }) {
  const unlimited = limit === "unlimited";
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(Number(limit), 1)) * 1000) / 10);
  return (
    <div className="usage-row">
      <div className="result-header">
        <span className="result-name">{label}</span>
        <span className="result-votes">{used} / {unlimited ? "unlimited" : limit}</span>
      </div>
      <div className="progress-bar compact">
        <div className="progress-fill" style={{ width: `${unlimited ? 100 : pct}%` }} />
      </div>
    </div>
  );
}

function planName(plan) {
  return PLANS.find((item) => item.id === plan)?.name || "Starter";
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
}
