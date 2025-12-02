// app.js

// 1. Firebase 설정 (네 프로젝트 걸로 바꾸기)
const firebaseConfig = {
    apiKey: "AIzaSyBUMQxVulqUj26Vjnb9u_8yCQCnXxGwaXE",
    authDomain: "chzzk-bot-panel.firebaseapp.com",
    projectId: "chzzk-bot-panel",
    storageBucket: "chzzk-bot-panel.firebasestorage.app",
    messagingSenderId: "592930986266",
    appId: "1:592930986266:web:76ad73e3a54f80508234a3",
    measurementId: "G-66MHP37JTV"
};

// 초기화
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// HTML 요소들
const loginSection = document.getElementById("loginSection");
const appSection = document.getElementById("appSection");
const googleLoginBtn = document.getElementById("googleLoginBtn");
const logoutBtn = document.getElementById("logoutBtn");

const userInfoSpan = document.getElementById("userInfo");

const channelNameInput = document.getElementById("channelName");
const refreshTokenInput = document.getElementById("refreshToken");
const botEnabledCheckbox = document.getElementById("botEnabledCheckbox");

const botStatusBadge = document.getElementById("botStatusBadge");
const botStatusDot = document.getElementById("botStatusDot");
const botStatusText = document.getElementById("botStatusText");

const saveUserBtn = document.getElementById("saveUserBtn");

const newCommandKeyInput = document.getElementById("newCommandKey");
const newCommandValueInput = document.getElementById("newCommandValue");
const addCommandBtn = document.getElementById("addCommandBtn");
const commandsTableBody = document.querySelector("#commandsTable tbody");

let currentUser = null;
let currentCommands = {};

// 2. 로그인 / 로그아웃 버튼
googleLoginBtn.addEventListener("click", async () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
        await auth.signInWithPopup(provider);
    } catch (err) {
        console.error("로그인 에러:", err);
        alert("로그인 실패: " + err.message);
    }
});

logoutBtn.addEventListener("click", async () => {
    await auth.signOut();
});

// 3. Auth 상태 감지
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        currentUser = null;
        loginSection.style.display = "flex";
        appSection.style.display = "none";
        return;
    }

    currentUser = user;
    loginSection.style.display = "none";
    appSection.style.display = "block";

    userInfoSpan.textContent = `${user.displayName} (${user.email})`;

    // 로그인할 때 users/commands 문서 자동 생성
    await ensureUserDocs(user);
    await loadUserSettings(user);
    await loadCommands(user);
});

// 4. users / commands 문서 자동 생성
async function ensureUserDocs(user) {
    const uid = user.uid;

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
        await userRef.set({
            displayName: user.displayName || "",
            email: user.email || "",
            chzzkRefreshToken: null,
            chzzkChannelName: "",
            botEnabled: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log("🔥 users 문서 생성:", uid);
    }

    const cmdRef = db.collection("commands").doc(uid);
    const cmdSnap = await cmdRef.get();

    if (!cmdSnap.exists) {
        await cmdRef.set({
            commands: {}
        });
        console.log("🔥 commands 문서 생성:", uid);
    }
}

// 5. 사용자 설정 불러오기
async function loadUserSettings(user) {
    const uid = user.uid;
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();

    const data = userSnap.data() || {};

    channelNameInput.value = data.chzzkChannelName || "";
    refreshTokenInput.value = data.chzzkRefreshToken || "";
    botEnabledCheckbox.checked = !!data.botEnabled;

    updateBotStatusBadge();
}

// 6. 사용자 설정 저장
saveUserBtn.addEventListener("click", async () => {
    if (!currentUser) return;

    const uid = currentUser.uid;
    const userRef = db.collection("users").doc(uid);

    const payload = {
        chzzkChannelName: channelNameInput.value.trim(),
        chzzkRefreshToken: refreshTokenInput.value.trim() || null,
        botEnabled: botEnabledCheckbox.checked,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        await userRef.set(payload, { merge: true });
        updateBotStatusBadge();
        alert("저장 완료");
    } catch (err) {
        console.error("user 설정 저장 에러:", err);
        alert("저장 실패: " + err.message);
    }
});

function updateBotStatusBadge() {
    const on = botEnabledCheckbox.checked;
    botStatusDot.classList.toggle("on", on);
    botStatusText.textContent = on ? "ON" : "OFF";
}

// 7. 명령어 로드
async function loadCommands(user) {
    const uid = user.uid;
    const cmdRef = db.collection("commands").doc(uid);
    const cmdSnap = await cmdRef.get();
    const data = cmdSnap.data() || {};

    currentCommands = data.commands || {};
    renderCommandsTable();
}

function renderCommandsTable() {
    commandsTableBody.innerHTML = "";

    const keys = Object.keys(currentCommands);
    if (keys.length === 0) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 3;
        td.className = "muted";
        td.textContent = "등록된 명령어가 없습니다.";
        tr.appendChild(td);
        commandsTableBody.appendChild(tr);
        return;
    }

    keys.forEach((key) => {
        const value = currentCommands[key];
        const tr = document.createElement("tr");

        const tdKey = document.createElement("td");
        tdKey.textContent = key;

        const tdVal = document.createElement("td");
        tdVal.textContent = value;

        const tdActions = document.createElement("td");
        const del = document.createElement("span");
        del.textContent = "삭제";
        del.className = "danger";
        del.style.cursor = "pointer";
        del.addEventListener("click", () => deleteCommand(key));
        tdActions.appendChild(del);

        tr.appendChild(tdKey);
        tr.appendChild(tdVal);
        tr.appendChild(tdActions);

        commandsTableBody.appendChild(tr);
    });
}

// 8. 명령어 추가/수정
addCommandBtn.addEventListener("click", async () => {
    if (!currentUser) return;

    const key = newCommandKeyInput.value.trim();
    const value = newCommandValueInput.value.trim();

    if (!key || !value) {
        alert("명령어와 내용을 모두 입력해 주세요.");
        return;
    }

    const uid = currentUser.uid;
    const cmdRef = db.collection("commands").doc(uid);

    try {
        const newCommands = { ...currentCommands, [key]: value };
        await cmdRef.set({ commands: newCommands }, { merge: true });
        currentCommands = newCommands;
        renderCommandsTable();
        newCommandKeyInput.value = "";
        newCommandValueInput.value = "";
    } catch (err) {
        console.error("명령어 저장 에러:", err);
        alert("명령어 저장 실패: " + err.message);
    }
});

// 9. 명령어 삭제
async function deleteCommand(key) {
    if (!currentUser) return;

    const uid = currentUser.uid;
    const cmdRef = db.collection("commands").doc(uid);

    const copy = { ...currentCommands };
    delete copy[key];

    try {
        await cmdRef.set({ commands: copy }, { merge: true });
        currentCommands = copy;
        renderCommandsTable();
    } catch (err) {
        console.error("명령어 삭제 에러:", err);
        alert("명령어 삭제 실패: " + err.message);
    }
}

// 치지직 계정 연동 버튼
chzzkConnectBtn.onclick = () => {
    if (!currentUser) {
        alert("먼저 로그인 해 주세요.");
        return;
    }

    // ▶ 실제 발급받은 CLIENT_ID
    const clientId = "9189723d-104c-45f9-bd34-d04d74800308";

    // ▶ 실제 Netlify 함수 주소 (치지직 개발자센터 리디렉션 URL과 100% 같게)
    const redirectUri = encodeURIComponent("https://chzzk-site.netlify.app/.netlify/functions/chzzk-oauth-callback");

    const state = currentUser.uid; // 콜백에서 uid로 사용

    const url =
        "https://chzzk.naver.com/account-interlock" +
        "?response_type=code" +
        `&clientId=${clientId}` +
        `&redirectUri=${redirectUri}` +
        `&state=${state}`;

    window.location.href = url;
};
