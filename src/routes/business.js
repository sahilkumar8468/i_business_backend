const express = require("express");
const router = express.Router();
const { db, admin } = require("../firebase");
const { checkAuth, checkRole } = require("../middleware/auth");

// 11. Join a business using ID
router.post("/join", checkAuth, async (req, res) => {
  const { businessId } = req.body;
  const userId = req.user.uid;

  if (!businessId) {
    return res.status(400).json({ error: "Business ID is required to join" });
  }

  try {
    const businessRef = db.collection("businesses").doc(businessId);
    const businessDoc = await businessRef.get();

    if (!businessDoc.exists) {
      return res.status(404).json({ error: "Business not found. Please check the ID." });
    }

    const business = businessDoc.data();

    // Check if already a member
    if (business.memberIds && business.memberIds.includes(userId)) {
      return res.status(400).json({ error: "You are already a partner in this business" });
    }

    // Add to memberIds array
    await businessRef.update({
      memberIds: admin.firestore.FieldValue.arrayUnion(userId)
    });

    // Add to members sub-collection
    await businessRef.collection("members").doc(userId).set({
      userId,
      name: req.user.displayName || "New Partner",
      percentage: 0,
      role: "viewer",
      joinedAt: new Date(),
    });

    res.json({ message: "Successfully joined the business! Data is now synced." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 1. Create a new business
router.post("/", checkAuth, async (req, res) => {
  const { name, config, partners, startDate, endDate } = req.body;
  const userId = req.user.uid;

  if (!name) {
    return res.status(400).json({ error: "Business name is required" });
  }

  try {
    const businessRef = db.collection("businesses").doc();
    
    // Calculate total ownership percentage
    let totalPercentage = 0;
    const partnersList = partners || [];
    
    // Replace 'current' placeholder with actual userId
    const currentPartnerIndex = partnersList.findIndex(p => p.userId === 'current');
    if (currentPartnerIndex !== -1) {
      partnersList[currentPartnerIndex].userId = userId;
    }
    
    // Add creator as default partner if list is empty
    if (partnersList.length === 0) {
      partnersList.push({
        userId,
        name: "You",
        percentage: 100,
        role: "owner",
        investment: 0 // Default investment
      });
    }
    
    // Validate total percentage doesn't exceed 100
    totalPercentage = partnersList.reduce((sum, p) => sum + Number(p.percentage || 0), 0);
    if (totalPercentage > 100) {
      return res.status(400).json({ error: "Total ownership percentage cannot exceed 100%" });
    }
    
    // Set business document
    await businessRef.set({
      name,
      ownerId: userId,
      config: config || {}, // Dynamic fields definition
      partners: partnersList,
      memberIds: partnersList.map(p => p.userId),
      totalOwnership: totalPercentage,
      createdAt: new Date(),
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null
    });

    // Add all partners to members sub-collection
    for (const partner of partnersList) {
      await businessRef.collection("members").doc(partner.userId).set({
        userId: partner.userId,
        name: partner.name,
        percentage: partner.percentage,
        role: partner.role || "partner",
        investment: partner.investment || 0,
        joinedAt: new Date(),
      });
    }

    res.status(201).json({ id: businessRef.id, message: "Business created successfully" });
  } catch (error) {
    console.error("POST /businesses Error:", error);
    res.status(500).json({ error: error.message });
  }
});


// 2. Add a member to a business (Only Owner/Admin)
router.post("/:businessId/members", checkAuth, checkRole(["owner", "admin"]), async (req, res) => {
  const { businessId } = req.params;
  const { targetUserId, role } = req.body;

  if (!targetUserId || !role) {
    return res.status(400).json({ error: "targetUserId and role are required" });
  }

  try {
    await db
      .collection("businesses")
      .doc(businessId)
      .collection("members")
      .doc(targetUserId)
      .set({
        userId: targetUserId,
        role,
        addedBy: req.user.uid,
        joinedAt: new Date(),
      });

    res.json({ message: `Member added as ${role}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Get all businesses user is a member of (or ALL for Super Admin)
router.get("/", checkAuth, async (req, res) => {
  try {
    let snapshot;
    if (req.user.isSuperAdmin) {
      snapshot = await db.collection("businesses").get();
    } else {
      snapshot = await db.collection("businesses").where("memberIds", "array-contains", req.user.uid).get();
    }
    
    const businesses = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: formatDate(data.createdAt),
        updatedAt: formatDate(data.updatedAt),
        startDate: formatDate(data.startDate),
        endDate: formatDate(data.endDate)
      };
    });

    res.json(businesses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper to safely format dates
const formatDate = (dateObj) => {
  if (!dateObj) return null;
  if (dateObj.toDate) return dateObj.toDate().toISOString();
  if (dateObj._seconds) return new Date(dateObj._seconds * 1000).toISOString();
  if (typeof dateObj === 'string' || typeof dateObj === 'number') return new Date(dateObj).toISOString();
  return dateObj;
};

// 4. Get a single business
router.get("/:businessId", checkAuth, checkRole(["owner", "admin", "partner", "viewer", "employee"]), async (req, res) => {
  const { businessId } = req.params;
  try {
    const doc = await db.collection("businesses").doc(businessId).get();
    if (!doc.exists) return res.status(404).json({ error: "Business not found" });
    
    // Also get the member's role to send to frontend
    const memberDoc = await db.collection("businesses").doc(businessId).collection("members").doc(req.user.uid).get();
    let userRole = "partner";
    if (memberDoc.exists) {
      userRole = memberDoc.data().role;
    } else if (doc.data().ownerId === req.user.uid) {
      userRole = "owner";
    }

    const data = doc.data();
    data.createdAt = formatDate(data.createdAt);
    data.updatedAt = formatDate(data.updatedAt);
    data.startDate = formatDate(data.startDate);
    data.endDate = formatDate(data.endDate);

    res.json({ id: doc.id, ...data, currentUserRole: userRole });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Update business configuration (Dynamic Fields)
router.patch("/:businessId/config", checkAuth, checkRole(["owner", "admin"]), async (req, res) => {
  const { businessId } = req.params;
  const { config } = req.body;

  try {
    await db.collection("businesses").doc(businessId).update({
      config,
      updatedAt: new Date()
    });
    res.json({ message: "Configuration updated successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Add a business entry
router.post("/:businessId/entries", checkAuth, checkRole(["owner", "admin", "editor", "employee"]), async (req, res) => {
  const { businessId } = req.params;
  const entryData = req.body;

  try {
    const entryRef = db.collection("businesses").doc(businessId).collection("entries").doc();
    await entryRef.set({
      ...entryData,
      createdBy: req.user.uid,
      createdByName: req.user.displayName || req.user.email || "Employee",
      createdAt: new Date()
    });
    res.status(201).json({ id: entryRef.id, message: "Entry added successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Get business entries (with filtering)
router.get("/:businessId/entries", checkAuth, checkRole(["owner", "admin", "viewer", "employee"]), async (req, res) => {
  const { businessId } = req.params;
  console.log(`[DEBUG] Fetching entries for business: ${businessId} by user: ${req.user.uid} with role: ${req.businessRole}`);
  const { startDate, endDate, searchField, searchQuery } = req.query;

  try {
    let query = db.collection("businesses").doc(businessId).collection("entries").orderBy("createdAt", "desc");

    if (startDate) query = query.where("createdAt", ">=", new Date(startDate));
    if (endDate) query = query.where("createdAt", "<=", new Date(endDate));

    const snapshot = await query.get();
    let entries = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: formatDate(data.createdAt)
      };
    });

    // Dynamic Search (In-memory for simplicity with Firestore)
    if (searchField && searchQuery) {
      entries = entries.filter(entry => 
        String(entry[searchField] || "").toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 8. Calculate profit for a business (with ownership percentage)
router.get("/:businessId/profit", checkAuth, checkRole(["owner", "admin", "viewer", "employee"]), async (req, res) => {
  const { businessId } = req.params;
  console.log(`[DEBUG] Calculating profit for business: ${businessId} by user: ${req.user.uid}`);
  const { userId } = req.query; // Optional: calculate profit for specific user

  try {
    // Get business details
    const businessDoc = await db.collection("businesses").doc(businessId).get();
    if (!businessDoc.exists) return res.status(404).json({ error: "Business not found" });
    
    const business = businessDoc.data();
    const config = business.config || {};
    const fields = config.fields || [];
    
    // Get all entries
    const entriesSnapshot = await db.collection("businesses").doc(businessId).collection("entries").get();
    const entries = entriesSnapshot.docs.map(doc => doc.data());
    
    // Calculate total income and expenses
    let totalIncome = 0;
    let totalExpense = 0;
    
    entries.forEach(entry => {
      fields.forEach(field => {
        if (field.accountingType === 'income') {
          totalIncome += Number(entry[field.key]) || 0;
        } else if (field.accountingType === 'expense') {
          totalExpense += Number(entry[field.key]) || 0;
        }
      });
    });
    
    const totalProfit = totalIncome - totalExpense;
    
    // Get user's ownership percentage if userId provided
    let userProfit = totalProfit;
    let userPercentage = 100;
    
    if (userId) {
      const partner = business.partners?.find(p => p.userId === userId);
      if (partner) {
        userPercentage = partner.percentage;
        userProfit = totalProfit * (userPercentage / 100);
      }
    }
    
    res.json({
      totalIncome,
      totalExpense,
      totalProfit,
      userPercentage,
      userProfit,
      totalEntries: entries.length,
      partners: business.partners || []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 9. Get all partners for a business
router.get("/:businessId/partners", checkAuth, checkRole(["owner", "admin", "viewer"]), async (req, res) => {
  const { businessId } = req.params;

  try {
    const businessDoc = await db.collection("businesses").doc(businessId).get();
    if (!businessDoc.exists) return res.status(404).json({ error: "Business not found" });
    
    const business = businessDoc.data();
    res.json(business.partners || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 10. Add/Update partner for a business
router.post("/:businessId/partners", checkAuth, checkRole(["owner", "admin"]), async (req, res) => {
  const { businessId } = req.params;
  const { partners } = req.body;

  if (!partners || !Array.isArray(partners)) {
    return res.status(400).json({ error: "Partners array is required" });
  }

  // Admin role validation logic
  if (req.businessRole === "admin" && !req.user.isSuperAdmin) {
    const hasRestrictedRoles = partners.some(p => p.role === "owner" || p.role === "employee");
    if (hasRestrictedRoles) {
      return res.status(403).json({ error: "Admins cannot create or assign owner or employee roles" });
    }
  }

  try {
    // Validate total percentage
    const totalPercentage = partners.reduce((sum, p) => sum + Number(p.percentage || 0), 0);
    if (totalPercentage > 100) {
      return res.status(400).json({ error: "Total ownership percentage cannot exceed 100%" });
    }
    
    // Update business document
    await db.collection("businesses").doc(businessId).update({
      partners,
      memberIds: partners.map(p => p.userId),
      totalOwnership: totalPercentage,
      updatedAt: new Date()
    });
    
    // Update members sub-collection
    for (const partner of partners) {
      await db.collection("businesses").doc(businessId).collection("members").doc(partner.userId).set({
        userId: partner.userId,
        name: partner.name,
        percentage: partner.percentage,
        role: partner.role || "partner",
        investment: partner.investment || 0,
        joinedAt: new Date(),
      }, { merge: true });
    }
    
    res.json({ message: "Partners updated successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 12. Update Business
router.patch("/:businessId", checkAuth, checkRole(["owner", "admin"]), async (req, res) => {
  const { businessId } = req.params;
  const { name, startDate, endDate } = req.body;

  try {
    const updateData = {
      updatedAt: new Date(),
      updatedBy: req.user.uid,
      updatedByName: req.user.displayName || req.user.email || "System User"
    };

    if (name) updateData.name = name;
    if (startDate) updateData.startDate = new Date(startDate);
    if (endDate) updateData.endDate = endDate ? new Date(endDate) : null;

    await db.collection("businesses").doc(businessId).update(updateData);
    res.json({ message: "Business updated successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 13. Delete Business
router.delete("/:businessId", checkAuth, checkRole(["owner"]), async (req, res) => {
  const { businessId } = req.params;

  try {
    await db.collection("businesses").doc(businessId).delete();
    res.json({ message: "Business deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 14. Update Entry
router.patch("/:businessId/entries/:entryId", checkAuth, checkRole(["owner", "admin", "employee"]), async (req, res) => {
  const { businessId, entryId } = req.params;
  const updateData = { ...req.body };

  try {
    updateData.updatedAt = new Date();
    updateData.updatedBy = req.user.uid;
    updateData.updatedByName = req.user.displayName || req.user.email || "System User";

    if (updateData.date) updateData.date = new Date(updateData.date);

    await db.collection("businesses").doc(businessId).collection("entries").doc(entryId).update(updateData);
    res.json({ message: "Entry updated successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 15. Delete Entry
router.delete("/:businessId/entries/:entryId", checkAuth, checkRole(["owner", "admin"]), async (req, res) => {
  const { businessId, entryId } = req.params;

  try {
    await db.collection("businesses").doc(businessId).collection("entries").doc(entryId).delete();
    res.json({ message: "Entry deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
