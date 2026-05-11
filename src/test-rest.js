const https = require('https');

async function testRest() {
    console.log("Testing Firestore via REST API...");
    const project_id = "i-business-445a4";
    const url = `https://firestore.googleapis.com/v1/projects/${project_id}/databases/(default)/documents/test`;
    
    https.get(url, (res) => {
        console.log("Response Status:", res.statusCode);
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            console.log("Response Data:", data);
            if (res.statusCode === 404) {
                console.log("\n💡 CONFIRMED: The database really does not exist. Please finish the 'Create Database' wizard in the console.");
            }
        });
    }).on("error", (err) => {
        console.log("Error: " + err.message);
    });
}

testRest();

