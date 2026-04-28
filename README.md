# 🚨 Rapid Crisis Response System

**A Real-Time, AI-Powered Emergency Management Platform built for the GDG Hackathon.**

Rapid Crisis is a full-stack, cinematic emergency response application designed for hotels, hospitals, and large campuses. It bridges the critical communication gap between guests in distress, staff responders, and central administration during emergencies (Fire, Medical, Security, Flood).

![Rapid Crisis Banner](https://img.shields.io/badge/Status-Hackathon_Ready-success?style=for-the-badge)

## 🚀 Key Features

The system is divided into three distinct, real-time synchronized portals:

### 1. Guest SOS Interface (`index.html`)
- **Mobile-First Design:** A sleek, dark-mode interface optimized for high-stress situations.
- **One-Tap SOS:** Instantly trigger an emergency alert with location details (room number) and emergency type.
- **Live Tracking Timeline:** Guests see real-time status updates (Transmitted → AI Assessment → Responding → Resolved) so they know help is on the way.
- **AI Emergency Assistant:** A built-in chat interface to provide immediate first-aid and safety guidance while waiting for staff.

### 2. Staff Alert Feed (`staff.html`)
- **Real-Time Feed:** Incoming alerts pop up instantly via Firestore WebSockets with audio cues.
- **AI Action Protocols:** Google's Gemini 2.0 Flash API instantly generates a tailored 5-step emergency protocol based on the crisis type and location.
- **Action Management:** Staff can "Claim" an alert (changing guest status to Responding) or "Escalate" it if overwhelmed.
- **Proof of Resolution:** Staff submit textual, photo, or video proof of resolution via a premium glassmorphism modal before an alert is closed.

### 3. Admin Command Center (`admin.html`)
- **Live Dashboard:** Text-scramble animated stats showing total, open, and resolved alerts.
- **Full Oversight:** View all active situations, who is responding, and review submitted resolution proofs (with full-screen media previews).
- **Inventory & Staff Management:** Real-time tracking of safety inventory (fire extinguishers, medkits) and staff duty statuses.
- **Incident Logbook:** A permanent, filterable, and exportable (CSV) chronological log of all system events.
- **Broadcast System:** Send immediate, pulsing banner alerts to all staff devices simultaneously.

## 🛠️ Technology Stack

- **Frontend:** Pure HTML5, CSS3, Vanilla JavaScript
- **Styling:** Custom CSS (Glassmorphism, CRT scanlines, 3D parallax tilt, dynamic ambient backgrounds)
- **Backend/Database:** Firebase Firestore (Real-Time NoSQL)
- **AI Engine:** Google Gemini 2.0 Flash API
- **Zero Framework Overhead:** Built entirely without React/Vue for maximum load speed (<500ms) and minimal dependencies.

## ⚙️ Setup & Installation

Since this project uses Vanilla web technologies, setup is incredibly simple:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/shivamshivam137/GDG-Hackathon-Rapid-Crisis.git
   ```
2. **Configure Firebase:**
   - Create a Firebase project and enable Firestore.
   - Update `js/config.js` with your Firebase configuration object.
3. **Configure API Keys:**
   - Ensure you provide valid API keys in your environment for Gemini/Groq depending on your setup.
4. **Run Locally:**
   - For the best experience (and to avoid CORS issues with ES6 modules), use a local development server like VS Code Live Server or Python:
     ```bash
     python -m http.server 8000
     ```

## 🎥 Demo Flow

To fully experience the real-time capabilities:
1. Open `admin.html`, `staff.html`, and `index.html` in three separate windows/devices.
2. Trigger an SOS on `index.html`.
3. Watch it appear instantly on `staff.html` and `admin.html`.
4. Claim it as a staff member and watch the guest's timeline update in real-time.
5. Resolve it with proof and watch the admin dashboard clear the alert.

## 🏆 Hackathon Achievements
- Sub-second real-time synchronization via Firestore `onSnapshot`.
- Bulletproof AI fallback system ensuring the app never breaks even if APIs are rate-limited.
- Premium cinematic UI built completely from scratch without component libraries.

---
*Built for the GDG Hackathon.*
