const jwt = require("jsonwebtoken");
const Organization = require("../models/Organization");

const ACCESS_TOKEN_TTL = process.env.JWT_ACCESS_TTL || "15m";
const REFRESH_TOKEN_TTL = process.env.JWT_REFRESH_TTL || "7d";

function getJwtSecret() {
  return process.env.JWT_SECRET || "dev-access-secret-change-me";
}

function getRefreshSecret() {
  return process.env.JWT_REFRESH_SECRET || "dev-refresh-secret-change-me";
}

function signAccessToken(organization) {
  return jwt.sign(
    {
      sub: organization._id.toString(),
      email: organization.email,
      plan: organization.plan,
      type: "organization",
    },
    getJwtSecret(),
    { expiresIn: ACCESS_TOKEN_TTL }
  );
}

function signRefreshToken(organization) {
  return jwt.sign(
    {
      sub: organization._id.toString(),
      type: "organization_refresh",
    },
    getRefreshSecret(),
    { expiresIn: REFRESH_TOKEN_TTL }
  );
}

async function authenticateOrg(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({ error: "Bearer access token required" });
    }

    const payload = jwt.verify(token, getJwtSecret());
    if (payload.type !== "organization") {
      return res.status(401).json({ error: "Invalid access token type" });
    }

    const organization = await Organization.findById(payload.sub).select("-passwordHash -refreshTokenHash");
    if (!organization) {
      return res.status(401).json({ error: "Organization no longer exists" });
    }

    req.organization = organization;
    req.orgId = organization._id;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Access token expired" });
    }
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Invalid access token" });
    }
    next(err);
  }
}

module.exports = {
  authenticateOrg,
  signAccessToken,
  signRefreshToken,
  getRefreshSecret,
};
