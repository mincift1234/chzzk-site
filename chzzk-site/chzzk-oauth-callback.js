const fetch = require("node-fetch");
const admin = require("firebase-admin");

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            project_id: process.env.FIREBASE_PROJECT_ID,
            client_email: process.env.FIREBASE_CLIENT_EMAIL,
            private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
        })
    });
}
const db = admin.firestore();

exports.handler = async (event) => {
    const { code, state } = event.queryStringParameters || {};
    const uid = state; // 우리가 state에 uid를 넣을 것

    if (!code || !uid) {
        return { statusCode: 400, body: "missing code/state" };
    }

    try {
        const res = await fetch("https://openapi.chzzk.naver.com/auth/v1/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                grantType: "authorization_code",
                clientId: process.env.CHZZK_CLIENT_ID,
                clientSecret: process.env.CHZZK_CLIENT_SECRET,
                code,
                state: uid,
                redirectUri: process.env.CHZZK_REDIRECT_URI
            })
        });

        const data = await res.json();

        if (!res.ok || !data.content || !data.content.refreshToken) {
            console.error("토큰 교환 실패:", data);
            return { statusCode: 500, body: "token exchange failed" };
        }

        const refreshToken = data.content.refreshToken;

        await db.collection("users").doc(uid).set(
            {
                chzzkRefreshToken: refreshToken,
                botEnabled: true,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            },
            { merge: true }
        );

        return {
            statusCode: 302,
            headers: {
                Location: process.env.APP_BASE_URL + "/?chzzk_linked=1"
            },
            body: ""
        };
    } catch (e) {
        console.error("콜백 에러:", e);
        return { statusCode: 500, body: "internal error" };
    }
};
