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


const DISCORD_WEBHOOK_URL = 'YOUR_WEBHOOK_HERE'; // Replace with your actual Discord Webhook URL

// --- AUTHENTICATION & REDIRECTION LOGIC ---
onAuthStateChanged(auth, async (user) => {
    const currentPage = window.location.pathname.split("/").pop();
    console.log('Auth state changed. User:', user ? user.email : 'None', 'Current page:', currentPage);

    if (user) {
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
                console.log('Login successful');
                // Redirect handled by onAuthStateChanged
                // Loader remains shown until redirect happens or we manually hide implementation
                // onAuthStateChanged will trigger redirect which loads new page (and hides loader automatically via page refresh)
            } catch (error) {
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

    // Call fetchUsers explicitly or set up a real-time listener if preferred.
    // For now, let's call it once on load.
    if (userListBody) fetchUsers();

    // Expose delete function to window
    window.confirmDelete = async (uid, email, role) => {
        if (confirm(`WARNING: TERMINATE ACCESS FOR ${email}?`)) {
            try {
                // 1. Delete from Firestore
                await deleteDoc(doc(db, "users", uid));

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
        pageLoader.style.display = 'flex';
    }
};

window.hideLoader = () => {
    if (pageLoader) {
        pageLoader.style.display = 'none';
    }
};

window.delayedNavigate = (url) => {
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

