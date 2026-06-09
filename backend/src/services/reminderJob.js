const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Election = require("../models/Election");
const Voter = require("../models/Voter");
const AuditLog = require("../models/AuditLog");
const { logger } = require("../middleware/logger");
const { sendReminderEmail } = require("./email");

let timer = null;

function getVoterInviteSecret() {
  return process.env.VOTER_INVITE_SECRET || process.env.JWT_SECRET || "dev-voter-invite-secret-change-me";
}

function startReminderJob() {
  if (process.env.REMINDER_JOB_ENABLED === "false") {
    logger.info("Reminder job disabled by REMINDER_JOB_ENABLED=false");
    return;
  }

  if (timer) return;

  const intervalMs = Number(process.env.REMINDER_JOB_INTERVAL_MS || 60 * 60 * 1000);
  timer = setInterval(() => {
    sendClosingReminders().catch((err) => logger.error("Reminder job failed", err));
  }, intervalMs);

  sendClosingReminders().catch((err) => logger.error("Reminder job failed", err));
  logger.info(`Reminder job started, interval=${intervalMs}ms`);
}

async function sendClosingReminders() {
  const now = new Date();
  const in24h = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const elections = await Election.find({
    status: "voting_open",
    endDate: { $gte: now, $lte: in24h },
  });

  for (const election of elections) {
    const voters = await Voter.find({
      orgId: election.orgId,
      electionId: election._id,
      voted: false,
      inviteStatus: { $in: ["sent", "claimed"] },
    });

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    let sentCount = 0;

    for (const voter of voters) {
      const token = jwt.sign(
        {
          type: "voter_invite",
          orgId: election.orgId.toString(),
          electionId: election._id.toString(),
          voterId: voter._id.toString(),
          email: voter.email,
        },
        getVoterInviteSecret(),
        { expiresIn: process.env.VOTER_INVITE_TTL || "14d" }
      );

      voter.inviteTokenHash = await bcrypt.hash(token, 10);
      await voter.save();

      const voteUrl = `${frontendUrl}/vote/${election._id}/${token}`;
      const result = await sendReminderEmail({ to: voter.email, election, voteUrl }).catch((err) => ({
        sent: false,
        error: err.message,
      }));

      if (result.sent) sentCount += 1;
    }

    if (voters.length > 0) {
      await AuditLog.create({
        orgId: election.orgId,
        electionId: election._id,
        actorType: "system",
        action: "voter.reminders_sent",
        metadata: { attempted: voters.length, sent: sentCount },
      }).catch(() => null);
    }
  }
}

module.exports = {
  startReminderJob,
  sendClosingReminders,
};
