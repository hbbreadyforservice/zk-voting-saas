// src/App.jsx
import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate, useNavigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import {
  Building2,
  LogOut,
  Moon,
  Plus,
  CreditCard,
  ShieldCheck,
  Sun,
} from "lucide-react";
import AdminDashboard from "./components/AdminDashboard";
import PublicResults from "./components/PublicResults";
import OrganizationDashboard from "./components/OrganizationDashboard";
import NewElection from "./components/NewElection";
import ElectionDetail from "./components/ElectionDetail";
import InviteVotePage from "./components/InviteVotePage";
import BillingPage from "./components/BillingPage";
import { LoginPage, RegisterPage } from "./components/AuthPages";
import { clearAuthSession, getStoredOrganization } from "./services/api";
import "./App.css";

function NavBar({ organization, onLogout, theme, onToggleTheme }) {
  const loc = useLocation();
  const links = organization
    ? [
        { to: "/dashboard", label: "Dashboard", icon: <Building2 size={16} /> },
        { to: "/dashboard/elections/new", label: "New", icon: <Plus size={16} /> },
        { to: "/dashboard/billing", label: "Billing", icon: <CreditCard size={16} /> },
      ]
    : [
        { to: "/login", label: "Login", icon: <Building2 size={16} /> },
        { to: "/register", label: "Register", icon: <Plus size={16} /> },
      ];

  return (
    <nav className="navbar">
      <Link to={organization ? "/dashboard" : "/login"} className="navbar-brand">
        <ShieldCheck size={24} className="brand-icon" />
        <div>
          <div className="brand-text">
            Vote<span className="brand-accent">Cloud</span>
          </div>
          <div className="brand-subtitle">secure election workspace</div>
        </div>
      </Link>
      <div className="navbar-links">
        {links.map(({ to, label, icon }) => (
          <Link key={to} to={to} className={`nav-link ${loc.pathname === to ? "active" : ""}`}>
            {icon} {label}
          </Link>
        ))}
        <button className="nav-link nav-button" onClick={onToggleTheme} title="Toggle theme">
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        {organization && (
          <button className="nav-link nav-button" onClick={onLogout}>
            <LogOut size={16} /> Logout
          </button>
        )}
      </div>
    </nav>
  );
}

function HeroStrip({ organization }) {
  const loc = useLocation();
  if (
    ["/login", "/register"].includes(loc.pathname) ||
    loc.pathname.startsWith("/vote/") ||
    loc.pathname.startsWith("/results")
  ) {
    return null;
  }

  const heroByPath = {
    "/dashboard": {
      kicker: "Organization Workspace",
      title: organization ? `${organization.name} elections` : "Manage secure elections.",
      description: "Create elections, invite voters, monitor participation, and publish verifiable results from one workspace.",
      points: ["Private voting", "Invite links", "Live participation"],
    },
    "/dashboard/elections/new": {
      kicker: "Election Builder",
      title: "Create a new election and import eligible voters.",
      description: "Define candidates, dates, and voter lists. VoteCloud prepares secure invitation links for each voter.",
      points: ["Candidate setup", "CSV import", "Secure invitations"],
    },
    "/dashboard/billing": {
      kicker: "Billing",
      title: "Manage plan limits and subscription access.",
      description: "Track election and voter usage, upgrade your plan, and manage invoices through Stripe.",
      points: ["Starter", "Pro", "Business"],
    },
    "/voter": {
      kicker: "Voter Mode",
      title: "Cast one anonymous vote with a proof-backed flow.",
      description: "Generate the zero-knowledge proof in-browser and submit one verifiable vote.",
      points: ["Private credentials", "ZK proof", "One-person-one-vote"],
    },
    "/results": {
      kicker: "Public Mode",
      title: "Show current status and transparent election results.",
      description: "Display open/closed state, total votes, and verifiable tallies.",
      points: ["Public transparency", "Verifiable tally", "Audit trail"],
    },
  };

  const hero = heroByPath[loc.pathname] || {
    kicker: "Election Detail",
    title: "Operate and audit one election.",
    description: "Open voting, send invitations, track participation, and review recorded results.",
    points: ["Invitations", "Voting status", "Receipt verification"],
  };

  return (
    <section className="hero-strip">
      <div>
        <p className="hero-kicker">{hero.kicker}</p>
        <h1>{hero.title}</h1>
        <p>{hero.description}</p>
      </div>
      <div className="hero-points">
        {hero.points.map((point) => (
          <span key={point} className="hero-pill">
            {point}
          </span>
        ))}
      </div>
    </section>
  );
}

function ProtectedRoute({ organization, children }) {
  if (!organization || !localStorage.getItem("orgAccessToken")) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function AppShell() {
  const navigate = useNavigate();
  const loc = useLocation();
  const [organization, setOrganization] = useState(() => getStoredOrganization());
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  const isVoterInvite = loc.pathname.startsWith("/vote/");
  const isPublicResults = loc.pathname.startsWith("/results");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  function logout() {
    clearAuthSession();
    setOrganization(null);
    navigate("/login");
  }

  return (
    <div className="app">
      {!isVoterInvite && !isPublicResults && (
        <NavBar
          organization={organization}
          onLogout={logout}
          theme={theme}
          onToggleTheme={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
        />
      )}
      <main className="main-content">
        <HeroStrip organization={organization} />

        <Routes>
          <Route path="/" element={<Navigate to={organization ? "/dashboard" : "/login"} replace />} />
          <Route path="/register" element={<RegisterPage onAuth={setOrganization} />} />
          <Route path="/login" element={<LoginPage onAuth={setOrganization} />} />
          <Route path="/vote/:electionId/:token" element={<InviteVotePage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute organization={organization}>
                <OrganizationDashboard organization={organization} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/elections/new"
            element={
              <ProtectedRoute organization={organization}>
                <NewElection />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/billing"
            element={
              <ProtectedRoute organization={organization}>
                <BillingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/elections/:id"
            element={
              <ProtectedRoute organization={organization}>
                <ElectionDetail />
              </ProtectedRoute>
            }
          />
          <Route path="/voter" element={<Navigate to="/dashboard" replace />} />
          <Route path="/results" element={<PublicResults />} />
          <Route path="/results/:electionId" element={<PublicResults />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute organization={organization}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to={organization ? "/dashboard" : "/login"} replace />} />
        </Routes>
      </main>
      {!isVoterInvite && !isPublicResults && (
        <footer className="footer">
          <span>VoteCloud secure election workspace</span>
          <span>Private voter flow with verifiable receipts</span>
        </footer>
      )}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
      <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
    </BrowserRouter>
  );
}
