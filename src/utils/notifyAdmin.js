const { db } = require("../firebase");

/**
 * Creates a notification for the admin who created the acting user.
 * Falls back to notifying all super_admins if no creator is found.
 *
 * @param {object} opts
 * @param {string} opts.actorUid       - UID of the user who performed the action
 * @param {string} opts.actorName      - Display name of the actor
 * @param {string} opts.type           - e.g. 'entry_added', 'transaction_added', 'purchase_added', 'sale_added', 'bank_transaction'
 * @param {string} opts.message        - Human-readable notification message
 * @param {string} [opts.businessId]   - Related business ID (optional)
 * @param {string} [opts.businessName] - Related business name (optional)
 * @param {string} [opts.refId]        - Related document ID (e.g., entryId)
 */
const notifyAdmin = async ({ actorUid, actorName, type, message, businessId, businessName, refId }) => {
  try {
    // 1. Look up the actor's Firestore profile to get their 'createdBy' admin
    const actorDoc = await db.collection("users").doc(actorUid).get();
    
    let targetAdminIds = [];

    if (actorDoc.exists && actorDoc.data().createdBy) {
      targetAdminIds = [actorDoc.data().createdBy];
    } else {
      // Fallback: notify all super_admins / top-level admins
      const adminsSnap = await db.collection("users")
        .where("role", "in", ["admin", "super_admin"])
        .get();
      targetAdminIds = adminsSnap.docs.map(d => d.id);
    }

    // 2. Create notification for each target admin
    const batch = db.batch();
    const now = new Date();

    for (const adminId of targetAdminIds) {
      if (adminId === actorUid) continue; // Don't notify yourself
      const notifRef = db.collection("notifications").doc();
      batch.set(notifRef, {
        type,
        message,
        actorUid,
        actorName: actorName || "A user",
        targetAdminId: adminId,
        businessId: businessId || null,
        businessName: businessName || null,
        refId: refId || null,
        isRead: false,
        createdAt: now
      });
    }

    await batch.commit();
  } catch (err) {
    // Notifications are non-critical — log but don't throw
    console.error("[notifyAdmin] Failed to create notification:", err.message);
  }
};

module.exports = { notifyAdmin };
