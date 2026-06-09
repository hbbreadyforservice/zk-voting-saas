const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");

const Organization = require("../models/Organization");
const AuditLog = require("../models/AuditLog");
const {
  signAccessToken,
  signRefreshToken,
  getRefreshSecret,
} = require("../middleware/auth");

const PASSWORD_MIN = 8;

function authResponse(organization, refreshToken) {
  return {
    organization: {
      id: organization._id,
      name: organization.name,
      email: organization.email,
      plan: organization.plan,
      stripeCustomerId: organization.stripeCustomerId,
    },
    accessToken: signAccessToken(organization),
    refreshToken,
  };
}

router.post(
  "/register",
  [
    body("name").trim().isLength({ min: 2, max: 160 }),
    body("email").isEmail().normalizeEmail(),
    body("password").isLength({ min: PASSWORD_MIN, max: 128 }),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { name, email, password } = req.body;
      const existing = await Organization.findOne({ email });
      if (existing) return res.status(409).json({ error: "Organization already exists" });

      const passwordHash = await bcrypt.hash(password, 12);
      const organization = await Organization.create({
        name,
        email,
        passwordHash,
        plan: "starter",
      });

      const refreshToken = signRefreshToken(organization);
      organization.refreshTokenHash = await bcrypt.hash(refreshToken, 12);
      await organization.save();

      await AuditLog.create({
        orgId: organization._id,
        action: "organization.registered",
        actorType: "organization",
        actorId: organization._id.toString(),
      }).catch(() => null);

      res.status(201).json(authResponse(organization, refreshToken));
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/login",
  [body("email").isEmail().normalizeEmail(), body("password").notEmpty()],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { email, password } = req.body;
      const organization = await Organization.findOne({ email });
      if (!organization) return res.status(401).json({ error: "Invalid email or password" });

      const ok = await bcrypt.compare(password, organization.passwordHash);
      if (!ok) return res.status(401).json({ error: "Invalid email or password" });

      const refreshToken = signRefreshToken(organization);
      organization.refreshTokenHash = await bcrypt.hash(refreshToken, 12);
      await organization.save();

      await AuditLog.create({
        orgId: organization._id,
        action: "organization.login",
        actorType: "organization",
        actorId: organization._id.toString(),
      }).catch(() => null);

      res.json(authResponse(organization, refreshToken));
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/refresh",
  [body("refreshToken").isString().notEmpty()],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { refreshToken } = req.body;
      const payload = jwt.verify(refreshToken, getRefreshSecret());
      if (payload.type !== "organization_refresh") {
        return res.status(401).json({ error: "Invalid refresh token type" });
      }

      const organization = await Organization.findById(payload.sub);
      if (!organization || !organization.refreshTokenHash) {
        return res.status(401).json({ error: "Invalid refresh token" });
      }

      const ok = await bcrypt.compare(refreshToken, organization.refreshTokenHash);
      if (!ok) return res.status(401).json({ error: "Invalid refresh token" });

      const nextRefreshToken = signRefreshToken(organization);
      organization.refreshTokenHash = await bcrypt.hash(nextRefreshToken, 12);
      await organization.save();

      res.json(authResponse(organization, nextRefreshToken));
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({ error: "Refresh token expired" });
      }
      if (err.name === "JsonWebTokenError") {
        return res.status(401).json({ error: "Invalid refresh token" });
      }
      next(err);
    }
  }
);

module.exports = router;
