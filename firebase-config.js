import { initializeApp } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC3cfo734hSUgb-BOlCLJog4bXmvsZN94M",
  authDomain: "ghost-tear.firebaseapp.com",
  projectId: "ghost-tear",
  storageBucket: "ghost-tear.firebasestorage.app",
  messagingSenderId: "548978973496",
  appId: "1:548978973496:web:cfd2ed15acc38752947fcd",
  measurementId: "G-1RX5DML2EW"
};

export { firebaseConfig };

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;