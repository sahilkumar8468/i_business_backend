const admin = require("firebase-admin");
const serviceAccount = require("../serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function test() {
  console.log("Starting simple test...");
  try {
    const doc = await db.collection("test").add({ hello: "world" });
    console.log("✅ Success! Doc ID:", doc.id);
  } catch (e) {
    console.log("❌ Error:", e.message);
  }
  process.exit();
}

test();



