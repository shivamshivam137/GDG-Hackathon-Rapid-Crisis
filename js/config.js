import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBkeusuJDwQrnAq4z68K9qq_j6JLWyMy5c",
  authDomain: "rapid-protocol-gdg.firebaseapp.com",
  projectId: "rapid-protocol-gdg",
  storageBucket: "rapid-protocol-gdg.firebasestorage.app",
  messagingSenderId: "448147335426",
  appId: "1:448147335426:web:08d812f051894b2d007a1b",
  measurementId: "G-3GJ7NN5005"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const analytics = getAnalytics(app);

export { app, db, auth, analytics };
