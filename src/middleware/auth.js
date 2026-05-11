const { auth, db } = require("../firebase");
const jwt = require("jsonwebtoken");

const checkAuth = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  
  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    // 1. Try to verify as Firebase Token
    try {
      const decodedToken = await auth.verifyIdToken(token);
      req.user = decodedToken;
      // Check if this Firebase user is the Super Admin by email
      if (req.user.email === process.env.SUPER_ADMIN_USER) {
        req.user.isSuperAdmin = true;
      }
      return next();
    } catch (firebaseErr) {
      // 2. If Firebase fails, try to verify as Super Admin JWT
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.role === "super_admin") {
        req.user = decoded;
        req.user.isSuperAdmin = true;
        return next();
      }
      throw new Error("Invalid token");
    }
  } catch (error) {
    res.status(401).json({ error: "Unauthorized: " + error.message });
  }
};

/**
 * Middleware to check if user has a specific role in a business
 */
const checkRole = (allowedRoles) => {
  return async (req, res, next) => {
    // SUPER ADMIN bypasses all role checks
    if (req.user && req.user.isSuperAdmin) {
      return next();
    }

    const { businessId } = req.params;
    const userId = req.user.uid;

    if (!businessId) {
      return res.status(400).json({ error: "businessId is required" });
    }

    try {
      const memberDoc = await db
        .collection("businesses")
        .doc(businessId)
        .collection("members")
        .doc(userId)
        .get();

      if (!memberDoc.exists) {
        return res.status(403).json({ error: "You are not a member of this business" });
      }

      const { role } = memberDoc.data();
      if (!allowedRoles.includes(role)) {
        return res.status(403).json({ error: `Requires one of these roles: ${allowedRoles.join(", ")}` });
      }

      req.businessRole = role;
      next();
    } catch (error) {
      res.status(500).json({ error: "Role check failed: " + error.message });
    }
  };
};

module.exports = { checkAuth, checkRole };

