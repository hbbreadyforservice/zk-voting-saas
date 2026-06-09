const Election = require("../models/Election");

const PLAN_LIMITS = {
  starter: {
    label: "Starter",
    elections: 1,
    voters: 50,
  },
  pro: {
    label: "Pro",
    elections: 10,
    voters: 1000,
  },
  business: {
    label: "Business",
    elections: Infinity,
    voters: Infinity,
  },
};

function getPlanLimits(plan = "starter") {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.starter;
}

async function getUsage(orgId) {
  const elections = await Election.find({ orgId, status: { $ne: "archived" } }, { voterCount: 1 });
  return {
    elections: elections.length,
    voters: elections.reduce((sum, election) => sum + (election.voterCount || 0), 0),
  };
}

async function checkElectionCreationQuota(req, res, next) {
  try {
    const limits = getPlanLimits(req.organization?.plan);
    const usage = await getUsage(req.orgId);
    const newVoters = Array.isArray(req.body?.voterEmails) ? new Set(req.body.voterEmails).size : 0;

    if (usage.elections + 1 > limits.elections) {
      return res.status(402).json({
        error: "Election quota exceeded",
        plan: req.organization.plan,
        usage,
        limits: serializeLimits(limits),
      });
    }

    if (usage.voters + newVoters > limits.voters) {
      return res.status(402).json({
        error: "Voter quota exceeded",
        plan: req.organization.plan,
        usage,
        limits: serializeLimits(limits),
      });
    }

    req.planLimits = limits;
    req.planUsage = usage;
    next();
  } catch (err) {
    next(err);
  }
}

function serializeLimits(limits) {
  return {
    ...limits,
    elections: Number.isFinite(limits.elections) ? limits.elections : "unlimited",
    voters: Number.isFinite(limits.voters) ? limits.voters : "unlimited",
  };
}

module.exports = {
  PLAN_LIMITS,
  getPlanLimits,
  getUsage,
  checkElectionCreationQuota,
  serializeLimits,
};
