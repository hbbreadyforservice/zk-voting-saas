import React from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  Building2,
  CheckCircle2,
  CreditCard,
  LifeBuoy,
  Plus,
  ShieldCheck,
  Users,
  Vote,
} from "lucide-react";

const elections = [
  {
    name: "Student Council Election",
    organization: "Abou Bekr Belkaid University",
    status: "Open",
    voters: 1240,
    participation: 68,
  },
  {
    name: "Faculty Board Vote",
    organization: "Science Department",
    status: "Scheduled",
    voters: 320,
    participation: 0,
  },
  {
    name: "Association Committee",
    organization: "Digital Innovation Club",
    status: "Closed",
    voters: 180,
    participation: 82,
  },
];

const plans = [
  { name: "Basic", price: "20,000 DZD/mo", detail: "Small teams and clubs" },
  { name: "Professional", price: "50,000 DZD/mo", detail: "Universities and associations" },
  { name: "Enterprise", price: "Custom", detail: "Large institutions" },
];

export default function SaasDashboard() {
  return (
    <div>
      <div className="saas-hero">
        <div>
          <span className="hero-kicker">SaaS Platform</span>
          <h1>ZKVote Cloud for secure online elections</h1>
          <p>
            A subscription-based platform where organizations can create elections,
            manage voters, run secure voting sessions, and publish verifiable results.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-primary" to="/admin">
              <Plus size={16} /> Create Election
            </Link>
            <Link className="btn btn-secondary" to="/voter">
              <Vote size={16} /> Open Voter Portal
            </Link>
          </div>
        </div>
        <div className="saas-summary">
          <div className="summary-row">
            <span>Current plan</span>
            <strong>Professional</strong>
          </div>
          <div className="summary-row">
            <span>Monthly price</span>
            <strong>50,000 DZD</strong>
          </div>
          <div className="summary-row">
            <span>Included voters</span>
            <strong>2,000</strong>
          </div>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <Building2 size={18} className="icon" />
          <span>Organizations</span>
          <strong>6</strong>
        </div>
        <div className="metric-card">
          <Vote size={18} className="icon" />
          <span>Elections</span>
          <strong>18</strong>
        </div>
        <div className="metric-card">
          <Users size={18} className="icon" />
          <span>Registered voters</span>
          <strong>4,860</strong>
        </div>
        <div className="metric-card">
          <ShieldCheck size={18} className="icon" />
          <span>Verified votes</span>
          <strong>3,214</strong>
        </div>
      </div>

      <div className="saas-layout">
        <section className="card">
          <div className="card-title">
            <BarChart3 size={18} className="icon" /> Election Workspace
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Election</th>
                  <th>Organization</th>
                  <th>Status</th>
                  <th>Voters</th>
                  <th>Participation</th>
                </tr>
              </thead>
              <tbody>
                {elections.map((election) => (
                  <tr key={election.name}>
                    <td>{election.name}</td>
                    <td>{election.organization}</td>
                    <td>
                      <span
                        className={`badge ${
                          election.status === "Open"
                            ? "badge-success"
                            : election.status === "Closed"
                              ? "badge-danger"
                              : "badge-warning"
                        }`}
                      >
                        {election.status}
                      </span>
                    </td>
                    <td>{election.voters}</td>
                    <td>{election.participation}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="card">
          <div className="card-title">
            <CreditCard size={18} className="icon" /> Subscription Plans
          </div>
          <div className="plan-list">
            {plans.map((plan) => (
              <div className="plan-item" key={plan.name}>
                <div>
                  <strong>{plan.name}</strong>
                  <span>{plan.detail}</span>
                </div>
                <b>{plan.price}</b>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <div className="card-grid">
        <div className="card">
          <div className="card-title">
            <CheckCircle2 size={18} className="icon" /> SaaS Features
          </div>
          <ul className="clean-list">
            <li>Organization accounts and dashboards</li>
            <li>Multiple elections under one subscription</li>
            <li>Voter lists, election history, and result reports</li>
            <li>Support and maintenance for institutions</li>
          </ul>
        </div>
        <div className="card">
          <div className="card-title">
            <LifeBuoy size={18} className="icon" /> Customer Support
          </div>
          <ul className="clean-list">
            <li>Setup assistance before each election</li>
            <li>Training for organization administrators</li>
            <li>Email support and documentation</li>
            <li>Optional custom branding and reports</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

