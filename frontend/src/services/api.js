/**
 * services/api.js
 */

import axios from "axios";

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || "http://localhost:3001/api",
  timeout: 120000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("orgAccessToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isAuthRoute = originalRequest?.url?.startsWith("/auth/");
    const refreshToken = localStorage.getItem("orgRefreshToken");

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthRoute && refreshToken) {
      originalRequest._retry = true;

      try {
        if (!refreshPromise) {
          refreshPromise = refreshOrganizationSession(refreshToken)
            .then((data) => {
              saveAuthSession(data);
              return data.accessToken;
            })
            .finally(() => {
              refreshPromise = null;
            });
        }

        const accessToken = await refreshPromise;
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch {
        clearAuthSession();
      }
    }

    if (error.response?.status === 401) {
      clearAuthSession();
      if (!window.location.pathname.startsWith("/login") && !window.location.pathname.startsWith("/vote/")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export function saveAuthSession(data) {
  localStorage.setItem("orgAccessToken", data.accessToken);
  localStorage.setItem("orgRefreshToken", data.refreshToken);
  localStorage.setItem("organization", JSON.stringify(data.organization));
}

export function clearAuthSession() {
  localStorage.removeItem("orgAccessToken");
  localStorage.removeItem("orgRefreshToken");
  localStorage.removeItem("organization");
}

export function getStoredOrganization() {
  try {
    return JSON.parse(localStorage.getItem("organization") || "null");
  } catch {
    return null;
  }
}

export const registerOrganization = (name, email, password) =>
  api.post("/auth/register", { name, email, password }).then((r) => r.data);

export const loginOrganization = (email, password) =>
  api.post("/auth/login", { email, password }).then((r) => r.data);

export const refreshOrganizationSession = (refreshToken) =>
  api.post("/auth/refresh", { refreshToken }).then((r) => r.data);

export const listElections = () => api.get("/elections").then((r) => r.data);
export const createElection = (payload) => api.post("/elections", payload).then((r) => r.data);
export const getElection = (id) => api.get(`/elections/${id}`).then((r) => r.data);
export const updateElection = (id, payload) => api.patch(`/elections/${id}`, payload).then((r) => r.data);
export const deployElection = (id) => api.post(`/elections/${id}/deploy`).then((r) => r.data);
export const archiveElection = (id) => api.post(`/elections/${id}/archive`).then((r) => r.data);
export const sendInvitations = (electionId) =>
  api.post(`/admin/send-invitations/${electionId}`).then((r) => r.data);

export const getVoteInvite = (electionId, token) =>
  api.get(`/vote/${electionId}/${encodeURIComponent(token)}`).then((r) => r.data);
export const claimVoteInvite = (electionId, token, commitment) =>
  api.post(`/vote/${electionId}/${encodeURIComponent(token)}/claim`, { commitment }).then((r) => r.data);
export const castInviteVote = (electionId, token, proof, publicSignals, nullifierHash, voteChoice) =>
  api
    .post(`/vote/${electionId}/${encodeURIComponent(token)}/cast`, {
      proof,
      publicSignals,
      nullifierHash,
      voteChoice,
    })
    .then((r) => r.data);

export const getBillingSummary = () => api.get("/billing/summary").then((r) => r.data);
export const createCheckoutSession = (plan) =>
  api.post("/billing/create-checkout", { plan }).then((r) => r.data);
export const getBillingPortal = () => api.get("/billing/portal").then((r) => r.data);

export const getElectionInfo = () => api.get("/public/election-info").then((r) => r.data);
export const getPublicElectionResults = (electionId) =>
  api.get(`/public/elections/${electionId}/results`).then((r) => r.data);
export const verifyVoteReceipt = (electionId, receiptCode) =>
  api.post(`/public/elections/${electionId}/receipt`, { receiptCode }).then((r) => r.data);
export const getResults = () => api.get("/public/results").then((r) => r.data);
export const getMerkleRoot = () => api.get("/public/merkle-root").then((r) => r.data);
export const getLOCALVoters = () => api.get("/public/LOCAL-voters").then((r) => r.data);
export const getLOCALVoterCredentials = (email, secret) =>
  api
    .get("/public/LOCAL-voter-credentials", { params: { email, secret } })
    .then((r) => r.data);

export const registerVoter = (email, electionId) => api.post("/voter/register", { email, electionId }).then((r) => r.data);

export const submitVote = (proof, publicSignals, nullifierHash, voteChoice) =>
  api.post("/voter/vote", { proof, publicSignals, nullifierHash, voteChoice }).then((r) => r.data);

export const checkVoteStatus = (nullifierHash) => api.get(`/voter/status/${nullifierHash}`).then((r) => r.data);


export const updateMerkleRoot = () => api.post("/admin/update-root").then((r) => r.data);
export const startVoting = (durationHours, electionId) =>
  api.post("/admin/start-voting", { durationHours, electionId }).then((r) => r.data);
export const endVoting = (electionId) => api.post("/admin/end-voting", { electionId }).then((r) => r.data);
export const addAdmin = (address) => api.post("/admin/add-admin", { address }).then((r) => r.data);
export const removeAdmin = (address) => api.post("/admin/remove-admin", { address }).then((r) => r.data);
export const getVoterList = () => api.get("/admin/voters").then((r) => r.data);
export const getAdminResults = () => api.get("/admin/results").then((r) => r.data);

export default api;

