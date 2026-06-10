const nodemailer = require("nodemailer");
const { logger } = require("../middleware/logger");

let transporter = null;

function getEmailConfig() {
  return {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM || "ZK Voting <no-reply@zk-voting.local>",
    appUrl: process.env.FRONTEND_URL || "http://localhost:3000",
  };
}

function isEmailConfigured() {
  const config = getEmailConfig();
  return Boolean(config.host && config.user && config.pass);
}

function getTransporter() {
  if (transporter) return transporter;

  const config = getEmailConfig();
  if (!isEmailConfigured()) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  return transporter;
}

async function sendMail({ to, subject, html, text }) {
  const config = getEmailConfig();
  const tx = getTransporter();

  if (!tx) {
    logger.warn(`Email not configured. Dev email skipped: to=${to}, subject=${subject}`);
    return {
      sent: false,
      provider: "dev-log",
      to,
      subject,
    };
  }

  const info = await tx.sendMail({
    from: config.from,
    to,
    subject,
    html,
    text,
  });

  logger.info(`Email sent: to=${to}, subject=${subject}, messageId=${info.messageId}`);
  return {
    sent: true,
    provider: config.host,
    messageId: info.messageId,
  };
}

async function sendInvitationEmail({ to, election, organization, voteUrl }) {
  const subject = `Invitation to vote: ${election.title}`;
  return sendMail({
    to,
    subject,
    html: invitationTemplate({ election, organization, voteUrl }),
    text: [
      `You are invited to vote in ${election.title}.`,
      `Vote here: ${voteUrl}`,
      `Start: ${formatDate(election.startDate)}`,
      `End: ${formatDate(election.endDate)}`,
    ].join("\n"),
  });
}

async function sendVoteConfirmationEmail({ to, election, txHash, voteDate }) {
  const subject = `Vote confirmed: ${election.title}`;
  return sendMail({
    to,
    subject,
    html: confirmationTemplate({ election, txHash, voteDate }),
    text: [
      `Your vote for ${election.title} has been submitted.`,
      `Transaction hash: ${txHash}`,
      `Date: ${formatDate(voteDate)}`,
    ].join("\n"),
  });
}

async function sendReminderEmail({ to, election, voteUrl }) {
  const subject = `Reminder: ${election.title} closes soon`;
  return sendMail({
    to,
    subject,
    html: reminderTemplate({ election, voteUrl }),
    text: [
      `Reminder: ${election.title} closes soon.`,
      `Vote here: ${voteUrl}`,
      `End: ${formatDate(election.endDate)}`,
    ].join("\n"),
  });
}

function invitationTemplate({ election, organization, voteUrl }) {
  return layout({
    title: "You are invited to vote",
    preheader: `${organization?.name || "An organization"} invited you to participate in ${election.title}.`,
    body: `
      <p>${escapeHtml(organization?.name || "An organization")} invited you to participate in a secure ZK Voting election.</p>
      <div class="panel">
        <strong>${escapeHtml(election.title)}</strong>
        <p>${escapeHtml(election.description || "Secure online election")}</p>
        <p><b>Start:</b> ${escapeHtml(formatDate(election.startDate))}</p>
        <p><b>End:</b> ${escapeHtml(formatDate(election.endDate))}</p>
      </div>
      <p>Your browser will generate your private voting secret locally. ZK Voting will only receive a cryptographic commitment.</p>
      <a class="button" href="${escapeAttr(voteUrl)}">Vote now</a>
    `,
  });
}

function confirmationTemplate({ election, txHash, voteDate }) {
  return layout({
    title: "Your vote was submitted",
    preheader: `Your vote for ${election.title} has been recorded on-chain.`,
    body: `
      <p>Your anonymous vote for <strong>${escapeHtml(election.title)}</strong> was submitted successfully.</p>
      <div class="panel">
        <p><b>Transaction hash:</b></p>
        <code>${escapeHtml(txHash)}</code>
        <p><b>Date:</b> ${escapeHtml(formatDate(voteDate))}</p>
      </div>
      <p>Keep this transaction hash as your proof of submission.</p>
    `,
  });
}

function reminderTemplate({ election, voteUrl }) {
  return layout({
    title: "Voting closes soon",
    preheader: `${election.title} closes soon. Submit your vote before the deadline.`,
    body: `
      <p>This is a reminder that <strong>${escapeHtml(election.title)}</strong> is closing soon.</p>
      <div class="panel">
        <p><b>Deadline:</b> ${escapeHtml(formatDate(election.endDate))}</p>
      </div>
      <a class="button" href="${escapeAttr(voteUrl)}">Vote now</a>
    `,
  });
}

function layout({ title, preheader, body }) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { margin: 0; background: #f5f7fb; color: #111827; font-family: Arial, sans-serif; }
      .wrap { max-width: 640px; margin: 0 auto; padding: 28px 16px; }
      .card { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 28px; }
      .brand { color: #0f766e; font-weight: 700; letter-spacing: .02em; margin-bottom: 18px; }
      h1 { font-size: 24px; line-height: 1.2; margin: 0 0 12px; }
      p { line-height: 1.6; color: #475569; }
      .panel { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 18px 0; }
      .button { display: inline-block; background: #0f766e; color: #ffffff !important; text-decoration: none; padding: 12px 18px; border-radius: 8px; font-weight: 700; }
      code { display: block; word-break: break-all; background: #111827; color: #e5e7eb; border-radius: 6px; padding: 10px; }
      .footer { color: #94a3b8; font-size: 12px; margin-top: 18px; }
      .preheader { display: none; opacity: 0; max-height: 0; overflow: hidden; }
    </style>
  </head>
  <body>
    <span class="preheader">${escapeHtml(preheader || "")}</span>
    <div class="wrap">
      <div class="card">
        <div class="brand">ZK Voting</div>
        <h1>${escapeHtml(title)}</h1>
        ${body}
      </div>
      <div class="footer">ZK Voting secure election platform</div>
    </div>
  </body>
</html>`;
}

function formatDate(value) {
  if (!value) return "Not specified";
  return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

module.exports = {
  isEmailConfigured,
  sendInvitationEmail,
  sendVoteConfirmationEmail,
  sendReminderEmail,
};
