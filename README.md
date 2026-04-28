# 🛡️ Rapid Crisis Response System (RCRS)

**Rapid Crisis Response System** is a production-ready, high-fidelity emergency management platform designed for hospital environments. It provides real-time tactical awareness, AI-powered emergency protocols, and seamless coordination between floor staff and the central command center.

---

## 🚀 Key Features

### 1. SOS Incident Management
- **One-Tap Alert**: Specialized SOS triggers for Fire, Medical, Security, and Flood emergencies.
- **Real-time Tracking**: A live timeline for the victim, showing the progression from AI assessment to Admin resolution.
- **Mandatory Proof**: Integrated "Proof of Action" system (Text/Image) to ensure incidents are physically resolved before closure.

### 2. Admin Command Center
- **3D Tactical Map**: An interactive, multi-floor holographic map with real-time room highlighting and 3D/2D perspective switching.
- **Live Incident Feed**: High-density monitoring of all active alerts with direct "Admin Intervention" capabilities.
- **Inventory Refill System**: Automated logistics management for critical medical supplies (Oxygen, Syringes, etc.) with floor-aware stock tracking.
- **Analytics Dashboard**: Performance metrics including average response times and incident frequency by hour/type.

### 3. AI Crisis Protocol (Gemini Powered)
- **Immediate Guidance**: Generates concise, 5-step emergency protocols instantly when an SOS is triggered.
- **Persistent Assistant**: A floating AI chat interface available on all pages for general safety guidance and evacuation procedures.

### 4. Cinematic Experience
- **Glassmorphic UI**: High-end dark mode interface with real-time blur, saturation, and holographic overlays.
- **Interactive VFX**: Spotlight cursor tracking, 3D parallax tilt effects, and animated ambient backgrounds.

---

## 🛠️ Technology Stack

- **Frontend**: Vanilla HTML5, Modern CSS3 (Grid/Flex/Variables), JavaScript (ES6+).
- **Real-time Engine**: [Firebase](https://firebase.google.com/) (Firestore & Anonymous Auth).
- **AI Integration**: [Google Gemini API](https://ai.google.dev/) (via Groq Cloud for high-performance inference).
- **Typography**: Space Grotesk & Inter (Google Fonts).

---

## 📂 Project Structure

```text
├── index.html          # SOS Trigger & Victim Tracking Page
├── staff.html          # Staff Portal (Incident Handling & Inventory)
├── admin.html          # Admin Command Center Dashboard
├── css/
│   ├── style.css       # Global design system & theme
│   ├── sos.css         # SOS page specific styles
│   ├── dashboard.css   # Shared dashboard layouts
│   ├── map.css         # 3D Tactical Map styles
│   ├── ai-chat.css     # AI Assistant interface
│   └── admin-panels.js # Modular admin component styles
├── js/
│   ├── config.js       # Firebase & API configurations
│   ├── sos.js          # SOS transmission & tracking logic
│   ├── staff.js        # Staff-side incident & refill logic
│   ├── admin.js        # Main command center controller
│   ├── admin-panels.js # Analytics & inventory management
│   ├── gemini.js       # AI protocol generation engine
│   ├── ai-chat.js      # Persistent assistant logic
│   └── ui.js           # UI interactions (Spotlight, Tilt, Notifications)
└── assets/             # Graphical assets and sounds
```

---

## ⚙️ Setup & Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   ```

2. **Configure Environment**:
   Update `js/config.js` with your specific Firebase credentials and API keys:
   - Firebase Project Config
   - Groq/Gemini API Key

3. **Run Locally**:
   Simply open `index.html` via a local development server (e.g., VS Code Live Server).

---

## 🔒 Security & Privacy
- **Authentication**: Uses `signInAnonymously` to ensure data access is restricted to the application context while maintaining a seamless user experience.
- **Admin Access**: Protected via a secondary PIN-based authentication layer (Restricted Clearance Level 5).
- **Data Integrity**: Real-time snapshots ensure that all users are seeing identical, up-to-the-second crisis data.

---

**Developed for high-pressure emergency environments.**
*Rapid Crisis Response System — Tactical awareness when seconds matter.*
