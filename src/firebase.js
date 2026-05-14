const admin = require("firebase-admin");
require("fs").appendFileSync("debug.log", "Firebase.js module loaded\n");
let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    console.log("Firebase: Loading service account from environment variable.");
  } catch (e) {
    console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT env var:", e);
  }
} else {
  try {
    serviceAccount = require("../serviceAccountKey.json");
    console.log("Firebase: Loading service account from serviceAccountKey.json.");
  } catch (e) {
    console.warn("serviceAccountKey.json not found, using environment variables if available.");
  }
}

if (!serviceAccount) {
  console.warn("No service account configuration found. Firebase may not initialize correctly.");
} else {
  console.log("Firebase: Initializing for project:", serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID
});


const db = admin.firestore();
const auth = admin.auth();

module.exports = { db, auth, admin };
