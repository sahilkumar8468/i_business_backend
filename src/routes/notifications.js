const express = require("express");
const router = express.Router();
const { db } = require("../firebase");
const { checkAuth } = require("../middleware/auth");

// GET /notifications — Get all notifications for the current admin
router.get("/", checkAuth, async (req, res) => {
  try {
    // 1. Fetch persistent database notifications
    const snap = await db.collection("notifications")
      .where("targetAdminId", "==", req.user.uid)
      .limit(50)
      .get();

    const notifications = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.() || d.data().createdAt
    }));

    // 2. Fetch dynamic overdue installments notifications
    const bizSnap = await db.collection("businesses")
      .where("memberIds", "array-contains", req.user.uid)
      .get();

    const overdueNotifications = [];
    const now = new Date();

    for (const bizDoc of bizSnap.docs) {
      const instSnap = await bizDoc.ref.collection("installments")
        .where("status", "==", "active")
        .get();

      for (const instDoc of instSnap.docs) {
        const instData = instDoc.data();
        const installmentsList = instData.installmentsList || [];
        
        // Find first overdue unpaid installment
        const overdueItem = installmentsList.find(item => {
          if (item.isPaid) return false;
          const dueDate = new Date(item.dueDate?.toDate?.() || item.dueDate);
          return dueDate < now;
        });

        if (overdueItem) {
          const formattedDueDate = new Date(overdueItem.dueDate?.toDate?.() || overdueItem.dueDate).toLocaleDateString();
          overdueNotifications.push({
            id: `overdue-${instDoc.id}-${overdueItem.month}`,
            type: "installment_overdue",
            message: `Installment #${overdueItem.month} (PKR ${overdueItem.amount}) for "${instData.customerName}" is overdue since ${formattedDueDate}!`,
            actorName: "Installment Alert",
            businessId: bizDoc.id,
            businessName: bizDoc.data().name,
            refId: instDoc.id,
            isRead: false,
            createdAt: overdueItem.dueDate?.toDate?.() || overdueItem.dueDate
          });
        }
      }
    }

    const allNotifications = [...overdueNotifications, ...notifications];
    // Sort notifications by date descending
    allNotifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const unreadCount = allNotifications.filter(n => !n.isRead).length;

    res.json({ notifications: allNotifications, unreadCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH /notifications/:id/read — Mark a single notification as read
router.patch("/:id/read", checkAuth, async (req, res) => {
  try {
    const ref = db.collection("notifications").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Notification not found" });
    if (doc.data().targetAdminId !== req.user.uid) {
      return res.status(403).json({ error: "Forbidden" });
    }
    await ref.update({ isRead: true });
    res.json({ message: "Marked as read" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH /notifications/read-all — Mark all notifications as read
router.patch("/read-all", checkAuth, async (req, res) => {
  try {
    const snap = await db.collection("notifications")
      .where("targetAdminId", "==", req.user.uid)
      .where("isRead", "==", false)
      .get();

    if (snap.empty) return res.json({ message: "No unread notifications" });

    const batch = db.batch();
    snap.docs.forEach(d => batch.update(d.ref, { isRead: true }));
    await batch.commit();

    res.json({ message: `${snap.size} notification(s) marked as read` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
