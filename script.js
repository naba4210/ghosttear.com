import { auth, db, firebaseConfig } from './firebase-config.js';
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-app.js";
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    getAuth
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

import {
    doc,
    getDoc,
    setDoc,
    collection,
    addDoc,
    query,
    orderBy,
    limit,
    onSnapshot,
    getDocs,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";


// --- LOGGING UTILITY ---
async function logAction(type, message, details = "") {
    try {
        await addDoc(collection(db, "action_logs"), {
            type: type, // 'INFO', 'ERROR', 'WARN', 'CLICK', 'AUTH'
            message: message,
            details: details,
            timestamp: new Date().toISOString(),
            page: window.location.pathname.split("/").pop() || "index.html"
        });
        // Console log for local debugging
        console.log(`[LOG:${type}] ${message}`, details);
    } catch (e) {
        console.warn("Failed to write log:", e);
    }
}

// Global Click Listener
document.addEventListener('click', (e) => {
    // We only log clicks on interactive elements to avoid noise
    const target = e.target.closest('button, a, input, select');
    if (target) {
        let label = target.innerText || target.id || target.name || target.getAttribute('placeholder') || target.tagName;
        // Truncate if too long
        if (label.length > 30) label = label.substring(0, 30) + "...";
        logAction("CLICK", `User clicked [${label}]`, `Tag: ${target.tagName}, ID: ${target.id}`);
    }
});

const DISCORD_WEBHOOK_URL = 'YOUR_WEBHOOK_HERE'; // Replace with your actual Discord Webhook URL

// --- AUTHENTICATION & REDIRECTION LOGIC ---
onAuthStateChanged(auth, async (user) => {
    const currentPage = window.location.pathname.split("/").pop();

    if (user) {
        logAction("AUTH", "User Authenticated", user.email);
        console.log('Auth state changed. User:', user ? user.email : 'None', 'Current page:', currentPage);
        console.log('User authenticated, fetching role from Firestore...');
        // Fetch user role from Firestore
        const userRef = doc(db, "users", user.uid);

        try {
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                const role = userSnap.data().role;
                console.log('User role found:', role);

                if (role === "Admin") {
                    // Admin can access everything
                    // Only redirect to download (root) if coming from login page
                    if (currentPage === "login.html" || currentPage === "") {
                        console.log('Redirecting admin to download.html');
                        window.location.href = "download.html";
                    }
                    // If already on index.html, download.html or admin.html, let them stay
                } else {
                    // Standard User
                    if (currentPage === "admin.html") {
                        alert("ACCESS DENIED: Insufficient Clearances.");
                        window.location.href = "download.html";
                    }
                    if (currentPage === "login.html" || currentPage === "") {
                        console.log('Redirecting user to download.html');
                        window.location.href = "download.html";
                    }
                }
            } else {
                // No role in Firestore - likely a legacy or manually created user
                console.warn("No role assigned in Firestore. Defaulting to download.html.");
                if (currentPage === "login.html" || currentPage === "") {
                    console.log('Redirecting to download.html (no role found)');
                    window.location.href = "download.html";
                }
            }
        } catch (error) {
            console.error("Error fetching user role:", error);
        }
    } else {
        // Not logged in
        console.log('No user logged in, checking if redirect needed');
        if (currentPage !== "login.html") {
            console.log('Redirecting to login.html');
            window.location.href = "login.html"; // Ensure this matches actual file name
        }
    }
});

// --- UI TOGGLE LOGIC ---
// (Removed as public signup is disabled)

// --- LOGIN FUNCTION ---
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const pass = document.getElementById('loginPassword').value;
        const errorDiv = document.getElementById('errorMessage');
        const submitBtn = loginForm.querySelector('button[type="submit"]');

        // Show global loading state
        window.showLoader();
        submitBtn.disabled = true;
        errorDiv.style.display = 'none';

        // Delay authentication by 3 seconds
        setTimeout(async () => {
            try {
                await signInWithEmailAndPassword(auth, email, pass);
                // Success feedback
                errorDiv.style.display = 'block';
                errorDiv.className = 'error-msg success-msg';
                errorDiv.innerText = 'ACCESS GRANTED';
                logAction("AUTH", "Login Success", email);
                console.log('Login successful');
                // Redirect handled by onAuthStateChanged
                // Loader remains shown until redirect happens or we manually hide implementation
                // onAuthStateChanged will trigger redirect which loads new page (and hides loader automatically via page refresh)
            } catch (error) {
                logAction("ERROR", "Login Failed", `${email} - ${error.code}`);
                if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-login-credentials' || error.code === 'auth/invalid-credential') {
                    // Check if it's potentially a new user request
                    // We use a generic Confirm for "Email/Pass not found" to mimic "Ask if want to send request"
                    if (confirm("ACCESS DENIED: ACCOUNT NOT FOUND.\n\nDo you want to transmit a REQUEST for access with these credentials?")) {
                        try {
                            logAction("AUTH", "Requesting Access", email);
                            await addDoc(collection(db, "login_requests"), {
                                email: email,
                                // WARNING: Storing password as requested. In production, this is unsafe. 
                                // Ideally, we'd just request access and email a link, but we are following specific instructions.
                                password: pass,
                                timestamp: new Date().toISOString(),
                                status: "pending"
                            });
                            alert("REQUEST TRANSMITTED. PENDING ADMIN APPROVAL.");
                            logAction("AUTH", "Request Sent", email);
                        } catch (reqErr) {
                            console.error("Request failed:", reqErr);
                            alert("TRANSMISSION FAILED: " + reqErr.message + "\n\nPlease check console (F12) and Firestore Security Rules.");
                            logAction("ERROR", "Request Transmit Failed", reqErr.message);
                        }
                    }
                }

                // Hide loader on error so user can retry
                window.hideLoader();

                errorDiv.style.display = 'block';
                errorDiv.className = 'error-msg';
                errorDiv.innerText = "ACCESS DENIED: INVALID CREDENTIALS.";
                console.error('Login error:', error);
                submitBtn.disabled = false;
                submitBtn.innerText = 'ENTER CITY';
            }
        }, 3000);
    });
}

// --- SIGN UP FUNCTION ---
// --- SIGN UP FUNCTION ---
// (Disabled - Admin Provisioning Only)

// --- SUBMIT APPLICATION (index.html) ---
const appForm = document.getElementById('appForm');
if (appForm) {
    appForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const data = {
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            discord: document.getElementById('discord').value,
            phone: document.getElementById('phone').value,
            cid: document.getElementById('cid').value,
            rank: document.getElementById('rank').value
        };

        try {
            // Send to Discord Webhook
            await fetch('https://discord.com/api/webhooks/1465880906802659359/bbmgumvhLCH5jE4PBdT_8MWM0qZutGv8tNR9WGG9OKsOOS6SLUv7bhbw5dl3cNm2IMx0', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    embeds: [{
                        title: "🌑 NEW GHOST APPLICATION",
                        color: 0xbc13fe,
                        fields: [
                            { name: "Citizen Name", value: data.name, inline: true },
                            { name: "CID", value: data.cid, inline: true },
                            { name: "Discord", value: data.discord, inline: true },
                            { name: "Applied Rank", value: data.rank },
                            { name: "Contact", value: `Email: ${data.email}\nPhone: ${data.phone}` }
                        ],
                        footer: { text: "System Protocol: Ghost-Tear" },
                        timestamp: new Date()
                    }]
                })
            });

            window.location.href = 'thankyou.html';
        } catch (err) {
            alert("SYSTEM ERROR: Webhook failed to transmit.");
        }
    });
}

// --- BKASH PAYMENT FORM (payment.html) ---
const paymentForm = document.getElementById('paymentForm');
if (paymentForm) {
    paymentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = paymentForm.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.innerText;

        window.showLoader();
        submitBtn.disabled = true;

        const data = {
            name: document.getElementById('payName').value,
            discord: document.getElementById('payDiscord').value,
            email: document.getElementById('payEmail').value,
            sender: document.getElementById('senderNumber').value,
            trx: document.getElementById('trxId').value.toUpperCase(),
            amount: document.getElementById('amount').value
        };

        let errors = [];

        // 1. Send to Discord Webhook
        try {
            const discordResponse = await fetch('https://discord.com/api/webhooks/1465880906802659359/bbmgumvhLCH5jE4PBdT_8MWM0qZutGv8tNR9WGG9OKsOOS6SLUv7bhbw5dl3cNm2IMx0', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    embeds: [{
                        title: "💸 NEW PAYMENT RECEIVED",
                        color: 0x00ff00, // Green
                        fields: [
                            { name: "Sender Name", value: data.name, inline: true },
                            { name: "Amount", value: `${data.amount} BDT`, inline: true },
                            { name: "Bkash Number", value: data.sender, inline: true },
                            { name: "TrxID", value: data.trx, inline: true },
                            { name: "Discord", value: data.discord },
                            { name: "Contact Email", value: data.email }
                        ],
                        footer: { text: "System Protocol: Secure Gateway" },
                        timestamp: new Date()
                    }]
                })
            });
            if (!discordResponse.ok) {
                console.warn("Discord Webhook status:", discordResponse.status);
                // We don't stop here, but we note it.
                // errors.push("Discord Log Failed");
            }
        } catch (err) {
            console.error("Discord Error:", err);
            // errors.push("Discord Connection Failed");
            // Often CORS fails on local, but we might want to proceed to EmailJS anyway.
        }

        // 2. Send Thank You Email via EmailJS
        try {
            // Service ID: service_2406s4m
            // Template ID: template_g3y87fz
            const emailParams = {
                // We send multiple variations to match whatever the user's template expects
                to_email: data.email,
                email: data.email,
                reply_to: data.email,
                user_email: data.email,

                to_name: data.name,
                trx_id: data.trx,
                amount: data.amount,
                payment_method: "Bkash",
                message: `We have received your payment of ${data.amount} BDT. Reference TrxID: ${data.trx}. We will process it shortly.`
            };

            await emailjs.send('service_2406s4m', 'template_g3y87fz', emailParams);
            console.log("Email sent successfully");

        } catch (err) {
            console.error("EmailJS Error:", err);
            errors.push("Email Sending Failed: " + (err.text || err.message || JSON.stringify(err)));
        }

        if (errors.length > 0) {
            window.hideLoader();
            submitBtn.disabled = false;
            submitBtn.innerText = originalBtnText;
            alert("ERROR: " + errors.join("\n"));
        } else {
            // 3. Success -> Redirect
            window.location.href = 'thankyou.html';
        }
    });
}

// --- ADMIN: CREATE USER (admin.html) ---
// Note: In client-side Firebase, you cannot create another user without being logged out.
// For GitHub Pages, the Admin creates the database entry here, 
// and the actual account is created in the Firebase Console Auth tab.
const createUserForm = document.getElementById('createUserForm');
if (createUserForm) {
    createUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('newEmail').value;
        const password = document.getElementById('newPassword').value; // Ensure this input exists in HTML
        const role = document.getElementById('newRole').value;
        const status = document.getElementById('adminStatus');

        status.style.color = "var(--text-secondary)";
        status.innerText = "PROCESSING REQUEST...";

        let secondaryApp = null;
        try {
            // 1. Initialize a secondary app to create the user without logging out the admin
            secondaryApp = initializeApp(firebaseConfig, "Secondary");
            const secondaryAuth = getAuth(secondaryApp);

            // 2. Create the user in Authentication
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
            const newUser = userCredential.user;

            // 3. Create the user document in Firestore (using primary admin auth)
            await setDoc(doc(db, "users", newUser.uid), {
                email: email,
                role: role,
                authorizedBy: auth.currentUser.email,
                joinedAt: new Date().toISOString()
            });

            // 4. Log the action to history
            await addDoc(collection(db, "history"), {
                action: "USER_PROVISIONED_AUTO",
                target_email: email,
                role: role,
                admin_email: auth.currentUser.email,
                timestamp: new Date().toISOString()
            });

            status.style.color = "var(--success)";
            status.innerText = `SUCCESS: User ${email} created with role ${role}.`;

            // Clear form
            document.getElementById('newEmail').value = '';
            document.getElementById('newPassword').value = '';

        } catch (err) {
            console.error("Error creating user:", err);
            status.style.color = "var(--error)";
            if (err.code === 'auth/email-already-in-use') {
                status.innerText = "ERROR: Email is already registered.";
            } else {
                status.innerText = "ERROR: " + err.message;
            }
        } finally {
            // 5. Cleanup the secondary app
            if (secondaryApp) {
                await deleteApp(secondaryApp);
            }
        }
    });

    // --- FETCH & DISPLAY HISTORY ---
    const historyList = document.getElementById('historyList');
    if (historyList) {
        const q = query(collection(db, "history"), orderBy("timestamp", "desc"), limit(20));
        onSnapshot(q, (snapshot) => {
            historyList.innerHTML = ""; // Clear list
            snapshot.forEach((doc) => {
                const data = doc.data();
                const li = document.createElement('li');
                li.style.marginBottom = "0.5rem";
                li.style.padding = "0.5rem";
                li.style.borderBottom = "1px solid #333";

                const time = new Date(data.timestamp).toLocaleString();
                li.innerHTML = `
                    <span style="color: var(--accent-primary); font-weight: bold;">[${time}]</span>
                    <span style="color: var(--text-primary); margin-left: 10px;">${data.admin_email}</span> provided
                    <span style="color: var(--success);">${data.role}</span> access to 
                    <span style="color: var(--text-primary); text-decoration: underline;">${data.target_email || data.target_info}</span>
                    ${data.action === 'USER_DELETED' ? '<span style="color: var(--error); margin-left:5px; font-weight:bold;">[TERMINATED]</span>' : ''}
                `;
                historyList.appendChild(li);
            });
        });
    }

    // --- FETCH & DISPLAY USERS ---
    const userListBody = document.getElementById('userListBody');

    async function fetchUsers() {
        if (!userListBody) return;
        userListBody.innerHTML = '<tr><td colspan="3" style="text-align:center;">LOADING...</td></tr>';

        try {
            const querySnapshot = await getDocs(collection(db, "users"));
            userListBody.innerHTML = ""; // Clear loader

            querySnapshot.forEach((docSnap) => {
                const user = docSnap.data();
                const uid = docSnap.id;

                const tr = document.createElement('tr');
                tr.style.borderBottom = "1px solid #222";

                tr.innerHTML = `
                    <td style="padding: 0.5rem;">${user.email}</td>
                    <td style="padding: 0.5rem; color: ${user.role === 'Admin' ? 'var(--accent-secondary)' : 'var(--text-muted)'};">${user.role}</td>
                    <td style="padding: 0.5rem; text-align: right;">
                        <button onclick="window.confirmDelete('${uid}', '${user.email}', '${user.role}')"
                                style="background: transparent; border: 1px solid var(--error); color: var(--error); padding: 4px 8px; font-size: 0.75rem; cursor: pointer; border-radius: 4px;">
                            KILL
                        </button>
                    </td>
                `;
                userListBody.appendChild(tr);
            });
        } catch (error) {
            console.error("Error fetching users:", error);
            userListBody.innerHTML = '<tr><td colspan="3" style="color: var(--error); text-align:center;">ERROR LOAD_FAIL</td></tr>';
        }
    }

    // --- FETCH & DISPLAY CALLS ---
    if (userListBody) fetchUsers();

    // --- FETCH & DISPLAY ACCESS REQUESTS ---
    const requestListBody = document.getElementById('requestListBody');
    if (requestListBody) {
        const qReq = query(collection(db, "login_requests"), orderBy("timestamp", "desc"));
        onSnapshot(qReq, (snapshot) => {
            requestListBody.innerHTML = "";
            if (snapshot.empty) {
                requestListBody.innerHTML = '<tr><td colspan="3" style="text-align:center;">NO PENDING REQUESTS</td></tr>';
                return;
            }

            snapshot.forEach((docSnap) => {
                const req = docSnap.data();
                const reqId = docSnap.id;

                const tr = document.createElement('tr');
                tr.style.borderBottom = "1px solid #222";

                // Format Date
                const date = new Date(req.timestamp).toLocaleDateString() + " " + new Date(req.timestamp).toLocaleTimeString();

                tr.innerHTML = `
                    <td style="padding: 0.5rem;">${req.email}</td>
                    <td style="padding: 0.5rem; color: var(--text-muted); font-size: 0.8rem;">${date}</td>
                    <td style="padding: 0.5rem; text-align: right;">
                        <button onclick="window.handleRequest('${reqId}', '${req.email}', '${req.password}', 'approve')" 
                            style="background: var(--success); border: none; color: black; padding: 4px 8px; margin-right: 5px; cursor: pointer; border-radius: 4px; font-weight:bold;">
                            ✓
                        </button>
                        <button onclick="window.handleRequest('${reqId}', '${req.email}', '${req.password}', 'deny')"
                            style="background: var(--error); border: none; color: white; padding: 4px 8px; cursor: pointer; border-radius: 4px; font-weight:bold;">
                            X
                        </button>
                    </td>
                `;
                requestListBody.appendChild(tr);
            });
        });

        // Global Handler for Requests
        window.handleRequest = async (docId, email, password, action) => {
            const statusDiv = document.getElementById('adminStatus');

            if (action === 'deny') {
                if (confirm(`Reject request from ${email}?`)) {
                    logAction("ADMIN_ACTION", "Rejected Access Request", `Target: ${email}`);
                    await deleteDoc(doc(db, "login_requests", docId));
                    // No need to refresh, listener handles it
                }
                return;
            }

            if (action === 'approve') {
                if (!confirm(`APPROVE ACCESS for ${email}?\nThis will create a USER account automatically.`)) return;

                statusDiv.innerText = "PROCESSING APPROVAL...";
                statusDiv.style.color = "var(--text-secondary)";

                let secondaryApp = null;
                try {
                    // 1. Initialize secondary app
                    secondaryApp = initializeApp(firebaseConfig, "SecondaryReq");
                    const secondaryAuth = getAuth(secondaryApp);

                    // 2. Create Auth User
                    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
                    const newUser = userCredential.user;

                    // 3. Create User Doc in Firestore
                    await setDoc(doc(db, "users", newUser.uid), {
                        email: email,
                        role: "User",
                        authorizedBy: auth.currentUser.email,
                        joinedAt: new Date().toISOString()
                    });

                    // 4. Log it
                    logAction("ADMIN_ACTION", "Approved Access Request", `Created user: ${email}`);
                    await addDoc(collection(db, "history"), {
                        action: "REQUEST_APPROVED",
                        target_email: email,
                        role: "User",
                        admin_email: auth.currentUser.email,
                        timestamp: new Date().toISOString()
                    });

                    // 5. Delete Request
                    await deleteDoc(doc(db, "login_requests", docId));

                    statusDiv.innerText = `APPROVED: ${email}`;
                    statusDiv.style.color = "var(--success)";
                } catch (err) {
                    console.error("Approval Error:", err);
                    logAction("ERROR", "Approval Failed", err.message);
                    statusDiv.innerText = `ERROR: ${err.message}`;
                    statusDiv.style.color = "var(--error)";
                } finally {
                    if (secondaryApp) await deleteApp(secondaryApp);
                }
            }
        };
    }

    // --- FETCH & DISPLAY ACTION LOGS (Admin Only) ---
    const actionLogBody = document.getElementById('actionLogBody');
    if (actionLogBody) {
        // Query last 50 logs
        const qLogs = query(collection(db, "action_logs"), orderBy("timestamp", "desc"), limit(50));
        onSnapshot(qLogs, (snapshot) => {
            actionLogBody.innerHTML = "";
            if (snapshot.empty) {
                actionLogBody.innerHTML = '<tr><td colspan="3" style="text-align:center;">NO LOGS YET</td></tr>';
                return;
            }

            snapshot.forEach((docSnap) => {
                const log = docSnap.data();
                const tr = document.createElement('tr');

                // Color code types
                let color = "var(--text-secondary)";
                if (log.type === 'ERROR') color = "var(--error)";
                if (log.type === 'WARN') color = "orange";
                if (log.type === 'AUTH') color = "var(--success)";
                if (log.type === 'CLICK') color = "#aaa";

                const time = new Date(log.timestamp).toLocaleTimeString();

                tr.innerHTML = `
                    <td style="padding: 0.25rem;">${time}</td>
                    <td style="padding: 0.25rem; color: ${color}; font-weight:bold; font-size: 0.7rem;">${log.type}</td>
                    <td style="padding: 0.25rem;">${log.message} <span style="opacity:0.5; font-size:0.7em;">${log.details || ''}</span></td>
                `;
                actionLogBody.appendChild(tr);
            });
        });
    }

    // Expose delete function to window
    window.confirmDelete = async (uid, email, role) => {
        if (confirm(`WARNING: TERMINATE ACCESS FOR ${email}?`)) {
            try {
                // 1. Delete from Firestore
                await deleteDoc(doc(db, "users", uid));
                logAction("ADMIN_ACTION", "User Terminated", `Target: ${email}`);

                // 2. Log to History
                await addDoc(collection(db, "history"), {
                    action: "USER_DELETED",
                    target_info: `${email} (${role})`,
                    admin_email: auth.currentUser.email,
                    timestamp: new Date().toISOString()
                });

                // 3. Refresh List
                fetchUsers();

                alert("TERMINATION SUCCESSFUL.");
            } catch (err) {
                console.error("Error deleting user:", err);
                logAction("ERROR", "Termination Failed", err.message);
                alert("TERMINATION FAILED: " + err.message);
            }
        }
    };
}

// --- GLOBAL LOADER LOGIC ---
// Inject loader HTML
const loaderHTML = `
<div id="pageLoader">
    <div class="loader-spinner"></div>
    <div class="loader-text">PROCESSING</div>
</div>
`;
document.body.insertAdjacentHTML('beforeend', loaderHTML);

const pageLoader = document.getElementById('pageLoader');

window.showLoader = () => {
    if (pageLoader) {
        // Optional: log loader if needed, but might spam
        // logAction("SYSTEM", "Loader Shown");
        pageLoader.style.display = 'flex';
    }
};

window.hideLoader = () => {
    if (pageLoader) {
        pageLoader.style.display = 'none';
    }
};

window.delayedNavigate = (url) => {
    logAction("NAV", "Delayed Navigation Initiated", `Target: ${url}`);
    console.log('Initiating delayed navigation to:', url);
    window.showLoader();
    setTimeout(() => {
        window.location.href = url;
    }, 3000); // 3 seconds delay
};

// Handle Download Buttons specifically
document.addEventListener('DOMContentLoaded', () => {
    const downloadBtns = document.querySelectorAll('.download-btn, .postcard a');
    downloadBtns.forEach(btn => {
        // Skip specific "Apply" button if it's handled via onclick in HTML, 
        // but here we are targeting the links in postcards.
        // We need to intercept the click.
        btn.addEventListener('click', (e) => {
            if (btn.hasAttribute('download')) {
                // If it's a real download, we want to show loader then let download happen?
                // Or just show loader for visual effect?
                // User said "clicking every buttons".
                // For downloads, we usually want the browser to handle it.
                // Let's delay the download action.
                e.preventDefault();
                window.showLoader();

                const href = btn.getAttribute('href');

                setTimeout(() => {
                    // Create temporary link to trigger download
                    const tempLink = document.createElement('a');
                    tempLink.href = href;
                    tempLink.download = '';
                    tempLink.style.display = 'none';
                    document.body.appendChild(tempLink);
                    tempLink.click();
                    document.body.removeChild(tempLink);

                    // Hide loader after a short while since download started?
                    // Or keep it? Usually downloads are quick to start.
                    // Let's hide it after another second so user sees it happened.
                    setTimeout(() => window.hideLoader(), 1000);
                }, 3000);
            } else if (btn.getAttribute('href') && btn.getAttribute('href') !== '#') {
                // Navigation link
                e.preventDefault();
                window.delayedNavigate(btn.getAttribute('href'));
            }
        });
    });
});

// Update global logout to use delay
window.logout = () => {
    window.showLoader();
    setTimeout(() => {
        signOut(auth).then(() => {
            window.location.href = "login.html";
        });
    }, 3000);
};

