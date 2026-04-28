import { subscribeToAlerts, logIncident } from './alerts.js';
import { db, auth } from './config.js';
import { doc, updateDoc, addDoc, serverTimestamp, collection, query, where, onSnapshot, getDocs, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { initUI, makeTiltable, TextScrambler, showNotification } from './ui.js';

initUI();

// =============================================
// 0. ADMIN AUTHENTICATION GATE
// =============================================
let isAdminAuthenticated = localStorage.getItem('isAdminAuthenticated') === 'true';
const adminLoginGate = document.getElementById('admin-login-gate');
const adminDashboard = document.getElementById('admin-dashboard');
const adminLoginBtn = document.getElementById('admin-login-btn');
const adminSelect = document.getElementById('login-admin-select');
const adminPinInput = document.getElementById('login-admin-pin');
const adminLogoutBtn = document.getElementById('btn-admin-logout');

// 0. Ensure base auth for Firestore access
(async () => {
  try {
    if (!auth.currentUser) await signInAnonymously(auth);
    console.log("Admin session authenticated anonymously.");
    
    // Check if session exists
    if (isAdminAuthenticated) {
      enterDashboard();
    }
  } catch (err) {
    console.error("Auth initialization failed:", err);
  }
})();

// Populate Admin dropdown from staff_directory
// Note: We sort in memory to avoid requiring a composite index for where + orderBy
const adminListQ = query(collection(db, 'staff_directory'), where('role', '==', 'ADMIN'), limit(50));
onSnapshot(adminListQ, (snap) => {
  if (adminSelect) {
    if (snap.empty) {
      adminSelect.innerHTML = '<option value="">— No Admins Found —</option>';
      showEmergencySetup();
      return;
    }
    
    hideEmergencySetup();
    const staff = snap.docs.map(d => d.data());
    staff.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    
    const options = staff.map(s => {
      const name = s.name;
      return `<option value="${name}">${name}</option>`;
    });
    adminSelect.innerHTML = '<option value="">— Select Admin Name —</option>' + options.join('');
  }
}, (err) => console.error("Admin List Error:", err));

function showEmergencySetup() {
  const container = adminLoginGate.querySelector('.staff-modal');
  let setupBtn = document.getElementById('emergency-admin-setup');
  if (!setupBtn) {
    setupBtn = document.createElement('button');
    setupBtn.id = 'emergency-admin-setup';
    setupBtn.className = 'btn-action';
    setupBtn.style.marginTop = '1rem';
    setupBtn.style.background = 'rgba(0, 255, 136, 0.1)';
    setupBtn.style.borderColor = 'var(--crisis-green)';
    setupBtn.style.color = 'var(--crisis-green)';
    setupBtn.textContent = '⚡ EMERGENCY ADMIN SETUP';
    setupBtn.onclick = createEmergencyAdmin;
    container.appendChild(setupBtn);
  }
}

function hideEmergencySetup() {
  document.getElementById('emergency-admin-setup')?.remove();
}

async function createEmergencyAdmin() {
  const btn = document.getElementById('emergency-admin-setup');
  btn.disabled = true;
  btn.textContent = 'AUTHENTICATING...';
  
  try {
    // Force auth check to satisfy Firestore Rules
    if (!auth.currentUser) await signInAnonymously(auth);
    
    btn.textContent = 'CREATING...';
    await addDoc(collection(db, 'staff_directory'), {
      name: "Admin Alpha",
      role: "ADMIN",
      password: "1234",
      floor: 1,
      dutyStatus: "online",
      active: true,
      createdAt: serverTimestamp()
    });
    showNotification('Emergency Admin "Admin Alpha" created (PIN: 1234).', 'success');
    // Reload to refresh the list
    setTimeout(() => location.reload(), 2000);
  } catch (err) {
    console.error("Setup Error:", err);
    showNotification(`Setup failed: ${err.message}. Please refresh and try once more.`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '⚡ EMERGENCY ADMIN SETUP';
  }
}

function enterDashboard() {
  isAdminAuthenticated = true;
  localStorage.setItem('isAdminAuthenticated', 'true');
  if (adminLoginGate) adminLoginGate.style.display = 'none';
  if (adminDashboard) adminDashboard.style.display = 'block';
}

adminLoginBtn?.addEventListener('click', async () => {
  const selected = adminSelect?.value;
  const pin = adminPinInput?.value.trim();

  if (!selected || !pin) {
    showNotification('Admin identification and PIN required.', 'error');
    return;
  }

  adminLoginBtn.disabled = true;
  adminLoginBtn.textContent = 'AUTHORIZING...';

  try {
    const q = query(collection(db, 'staff_directory'), where('name', '==', selected), where('role', '==', 'ADMIN'));
    const snap = await getDocs(q);

    if (snap.empty) {
      showNotification('Admin record not found.', 'error');
      return;
    }

    const adminDoc = snap.docs[0].data();
    if (adminDoc.password === pin) {
      enterDashboard();
      showNotification(`Command access granted. Welcome, ${selected}.`, 'success');
    } else {
      showNotification('Authorization failed: Incorrect Command PIN.', 'error');
      adminPinInput.value = '';
    }
  } catch (err) {
    console.error("Admin Auth Error:", err);
    showNotification('System error during authorization.', 'error');
  } finally {
    adminLoginBtn.disabled = false;
    adminLoginBtn.textContent = 'AUTHORIZE ACCESS';
  }
});

adminLogoutBtn?.addEventListener('click', () => {
  localStorage.removeItem('isAdminAuthenticated');
  location.reload();
});

const adminFeed = document.getElementById('admin-feed');
const alertSound = document.getElementById('alert-sound');
const statTotal = document.getElementById('stat-total');
const statOpen = document.getElementById('stat-open');
const statResponding = document.getElementById('stat-responding');
const statResolved = document.getElementById('stat-resolved');

let prevAlertCount = 0;

// Subscribe to real-time updates

subscribeToAlerts((alerts) => {
  updateStats(alerts);
  renderAdminAlerts(alerts);
  updateMap(alerts);

  // Play sound if new alerts arrive
  if (alerts.length > prevAlertCount && prevAlertCount !== 0) {
    playAlertSound();
  }
  prevAlertCount = alerts.length;
}, (err) => {
  console.error("Admin Alert Sync Error:", err);
  showNotification("Permission error: Live alerts inaccessible. Please check Firestore rules.", "error");
});

// Initialize 3D Walls (Inject 3rd side to all rooms)
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.map-room').forEach(room => {
    if (!room.querySelector('.wall-left')) {
      const leftWall = document.createElement('div');
      leftWall.className = 'wall-left';
      room.appendChild(leftWall);
    }
  });
});

let latestAlerts = [];

function updateMap(alerts) {
  latestAlerts = alerts;
  const mapRooms = document.querySelectorAll('.map-room');
  const mapStatus = document.getElementById('map-status');
  const mainMap = document.getElementById('main-map');

  if (!mapStatus || !mainMap) return;

  mapRooms.forEach(room => room.classList.remove('active'));

  const activeAlerts = alerts.filter(a => a.status === 'OPEN' || a.status === 'RESPONDING');

  if (activeAlerts.length > 0) {
    activeAlerts.forEach(alert => {
      const roomEl = document.querySelector(`.map-room[data-room="${alert.roomNumber}"]`);
      if (roomEl) {
        roomEl.classList.add('active');
      }
    });

    mapStatus.textContent = `CRITICAL: ${activeAlerts.length} ACTIVE INCIDENT(S)`;
    mapStatus.style.color = 'var(--crisis-red)';
  } else {
    mapStatus.textContent = 'STATUS: NOMINAL';
    mapStatus.style.color = 'var(--crisis-green)';
  }
}

function switchFloor(floorNum) {
  const mainMap = document.getElementById('main-map');
  const floors = document.querySelectorAll('.map-floor');
  const btns = document.querySelectorAll('.floor-btn');
  const label = document.getElementById('active-floor-label');

  // Update classes
  mainMap.className = `map-base view-${floorNum}`;
  floors.forEach(f => f.classList.remove('active'));
  const targetFloor = document.getElementById(`floor-${floorNum}`);
  if (targetFloor) targetFloor.classList.add('active');

  btns.forEach(b => {
    b.classList.toggle('active', b.dataset.floor == floorNum);
  });

  const labels = {
    '1': 'LEVEL 01: GROUND / ER',
    '2': 'LEVEL 02: PRIVATE WARDS',
    '3': 'LEVEL 03: SURGERY / ICU',
    '4': 'LEVEL 04: VIP SUITES'
  };
  label.textContent = labels[floorNum];

  // Refresh map with current floor context
  updateMap(latestAlerts);
}

let is3D = true;

function setViewMode(use3D) {
  is3D = use3D;
  const mainMap = document.getElementById('main-map');
  const btn2d = document.getElementById('toggle-2d');
  const btn3d = document.getElementById('toggle-3d');
  
  if (!mainMap || !btn2d || !btn3d) return;

  mainMap.classList.toggle('mode-2d', !is3D);
  btn2d.classList.toggle('active', !is3D);
  btn3d.classList.toggle('active', is3D);
  
  if (!is3D) {
    mainMap.style.transform = 'rotateX(0deg) rotateZ(0deg)';
  } else {
    mainMap.style.transform = 'rotateX(50deg) rotateZ(-30deg)';
  }
}

// Holographic Tooltip Logic
const tooltip = document.getElementById('map-tooltip');
const tooltipRoom = document.getElementById('tooltip-room-id');
const tooltipStatus = document.getElementById('tooltip-status');

document.querySelectorAll('.map-room').forEach(room => {
  room.addEventListener('mouseenter', () => {
    const roomId = room.dataset.room;
    const isActive = room.classList.contains('active');
    
    tooltipRoom.textContent = roomId;
    tooltipStatus.textContent = isActive ? '⚠ CRITICAL ALERT' : '● SECURE';
    tooltipStatus.className = isActive ? 'status-critical' : 'status-nominal';
    
    tooltip.classList.add('visible');
  });

  room.addEventListener('mouseleave', () => {
    tooltip.classList.remove('visible');
  });
});

// Floor Selection Event Listeners
document.querySelectorAll('.floor-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    switchFloor(btn.dataset.floor);
  });
});

// Toggle Listeners
document.getElementById('toggle-2d')?.addEventListener('click', () => setViewMode(false));
document.getElementById('toggle-3d')?.addEventListener('click', () => setViewMode(true));

// Interactive Map Rotation (Enhanced Mouse Track)
const mapSection = document.querySelector('.map-section');
const mainMap = document.getElementById('main-map');

if (mapSection && mainMap) {
  mapSection.addEventListener('mousemove', (e) => {
    if (!is3D) return; // LOCK PARALLAX IN 2D MODE

    const rect = mapSection.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;

    // Parallax values
    const rotX = 50 + (y * 20); 
    const rotZ = -30 + (x * 20);

    mainMap.style.transform = `rotateX(${rotX}deg) rotateZ(${rotZ}deg)`;
  });

  // Reset tilt when mouse leaves
  mapSection.addEventListener('mouseleave', () => {
    if (!is3D) return;
    mainMap.style.transform = `rotateX(50deg) rotateZ(-30deg)`;
  });
}

function playAlertSound() {
  if (alertSound) {
    alertSound.currentTime = 0;
    alertSound.play().catch(e => console.log("Audio play blocked by browser."));
  }
}

function updateStatWithScramble(el, newValue) {
  const valueStr = String(newValue);
  if (el.innerText !== valueStr) {
    el.innerText = valueStr;
  }
}

function updateStats(alerts) {
  updateStatWithScramble(statTotal, alerts.length);
  updateStatWithScramble(statOpen, alerts.filter(a => a.status === 'OPEN' || a.status === 'ESCALATED').length);
  updateStatWithScramble(statResponding, alerts.filter(a => a.status === 'RESPONDING').length);
  updateStatWithScramble(statResolved, alerts.filter(a => a.status === 'RESOLVED').length);
}

async function renderAdminAlerts(alerts) {
  adminFeed.innerHTML = '';

  for (const alert of alerts) {
    const card = document.createElement('div');
    card.className = `alert-card glass type-${alert.emergencyType}`;

    let proofHtml = '';
    if (alert.proofType === 'text' && alert.proofText) {
      proofHtml = `<div class="proof-evidence">📝 ${alert.proofText}</div>`;
    } else if (alert.proofType === 'image' && alert.proofFileName) {
      proofHtml = `<div class="proof-evidence">📷 <span class="proof-evidence-link" data-url="${alert.proofDataUrl || ''}" data-type="image">${alert.proofFileName}</span></div>`;
    } else if (alert.proof) {
      proofHtml = `<div class="proof-evidence">📝 ${alert.proof}</div>`;
    }

    const protocolHtml = alert.geminiSuggestion ? `
      <div class="gemini-panel monitoring" style="margin-top: 1rem; padding: 0; border-color: rgba(64, 196, 255, 0.2); background: rgba(0, 0, 0, 0.2); overflow: hidden;">
        <div class="gemini-header" style="background: rgba(64, 196, 255, 0.15); color: var(--crisis-blue); padding: 0.6rem 1rem; margin-bottom: 0; border-bottom: 1px solid rgba(64, 196, 255, 0.1);">
          <span style="font-size: 0.65rem; letter-spacing: 2px; font-weight: bold;">✦ ACTIVE GEMINI PROTOCOL</span>
        </div>
        <div class="gemini-content" style="font-size: 0.75rem; color: var(--text-dim); opacity: 0.9; padding: 1rem; line-height: 1.6; text-align: left;">
          ${alert.geminiSuggestion.split('\n').map(line => line.trim()).filter(line => line).join('<br>')}
        </div>
      </div>
    ` : '';

    card.innerHTML = `
      <div class="card-header">
        <div class="room-badge">ROOM ${alert.roomNumber}</div>
        <div class="status-badge status-${alert.status}">${alert.status === 'ADMIN_RESPONDING' ? '🛡️ ADMIN RESPONDING' : alert.status}</div>
      </div>
      <div class="card-body">
        <p class="font-mono" style="margin-bottom: 0.5rem;">${alert.emergencyType} • ${formatTime(alert.createdAt)}</p>
        ${alert.description ? `<p style="font-size: 0.8rem; color: #fff; margin-bottom: 0.75rem; border-left: 2px solid var(--crisis-red); padding-left: 0.5rem;">${alert.description}</p>` : ''}
        ${alert.responderName ? `<p style="font-size: 0.7rem; color: var(--crisis-blue); margin-bottom: 0.5rem;">→ Responder: ${alert.responderName}</p>` : ''}
        ${alert.adminAction ? `<p style="font-size: 0.7rem; color: #fbbf24; margin-bottom: 0.5rem; font-weight: bold;">🛡️ Admin took over this emergency</p>` : ''}
        ${alert.adminResolvedBy ? `<p style="font-size: 0.7rem; color: var(--crisis-green); margin-bottom: 0.5rem; font-weight: bold;">✓ Resolved by: ${alert.adminResolvedBy}</p>` : ''}
        ${proofHtml}
        ${protocolHtml}
      </div>
      <div class="card-actions" style="flex-wrap: wrap;">
        ${alert.status === 'ESCALATED' ? `
          <button class="btn-action btn-admin-action" data-id="${alert.id}" style="background: rgba(251, 191, 36, 0.15); border-color: rgba(251, 191, 36, 0.4); color: #fbbf24; flex: 2;">🛡️ ADMIN: TAKE ACTION</button>
        ` : ''}
        ${alert.status === 'ADMIN_RESPONDING' ? `
          <button class="btn-action btn-admin-resolve" data-id="${alert.id}" style="background: rgba(0, 255, 136, 0.15); border-color: rgba(0, 255, 136, 0.4); color: var(--crisis-green); flex: 2;">✓ ADMIN: MARK RESOLVED</button>
        ` : ''}
      </div>
    `;

    // Attach click handler for image/video proof links
    const proofLink = card.querySelector('.proof-evidence-link');
    if (proofLink) {
      proofLink.addEventListener('click', () => {
        const dataUrl = proofLink.dataset.url;
        const mediaType = proofLink.dataset.type;
        showMediaPreview(dataUrl, mediaType, proofLink.textContent);
      });
    }

    // Admin Action: Take over escalated alert
    const adminActionBtn = card.querySelector('.btn-admin-action');
    if (adminActionBtn) {
      adminActionBtn.addEventListener('click', async () => {
        const alertId = adminActionBtn.dataset.id;
        adminActionBtn.disabled = true;
        adminActionBtn.textContent = 'TAKING OVER...';
        try {
          await updateDoc(doc(db, 'alerts', alertId), {
            status: 'ADMIN_RESPONDING',
            adminAction: true,
            adminRespondedAt: serverTimestamp()
          });
          showNotification('Admin has taken over this emergency.', 'success');
          logIncident('status', `ADMIN took over escalated Alert ${alertId}`);
        } catch (err) {
          console.error('Admin action failed:', err);
          showNotification('Failed to take action.', 'error');
        }
      });
    }

    // Admin Action: Resolve
    const adminResolveBtn = card.querySelector('.btn-admin-resolve');
    if (adminResolveBtn) {
      adminResolveBtn.addEventListener('click', async () => {
        const alertId = adminResolveBtn.dataset.id;
        adminResolveBtn.disabled = true;
        adminResolveBtn.textContent = 'RESOLVING...';
        try {
          await updateDoc(doc(db, 'alerts', alertId), {
            status: 'RESOLVED',
            resolvedAt: serverTimestamp(),
            adminResolvedBy: 'ADMIN'
          });
          showNotification('Alert resolved by Admin.', 'success');
          logIncident('proof', `Alert ${alertId} RESOLVED directly by ADMIN`);
        } catch (err) {
          console.error('Admin resolve failed:', err);
          showNotification('Failed to resolve.', 'error');
        }
      });
    }

    makeTiltable(card);
    adminFeed.appendChild(card);
  }
}

// Media Preview Dialog
function showMediaPreview(dataUrl, mediaType, fileName) {
  const dialog = document.getElementById('media-preview');
  const content = document.getElementById('media-preview-content');

  if (mediaType === 'image' && dataUrl) {
    content.innerHTML = `<img src="${dataUrl}" style="width: 100%; border-radius: var(--radius-sm);" alt="Proof Image">`;
  } else if (mediaType === 'video' && dataUrl) {
    content.innerHTML = `
      <video controls autoplay style="width: 100%; border-radius: var(--radius-sm); background: #000;">
        <source src="${dataUrl}" type="video/mp4">
        Your browser does not support the video tag.
      </video>
      <div style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-muted); margin-top: 1rem; text-align: center;">
        File: ${fileName}
      </div>
    `;
  } else {
    content.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--text-dim); font-family: var(--font-mono);">No preview available or file loading...</div>`;
  }

  dialog.style.display = 'flex';
}

// Close preview dialog
document.getElementById('close-preview-btn').addEventListener('click', () => {
  document.getElementById('media-preview').style.display = 'none';
});

document.getElementById('media-preview').addEventListener('click', (e) => {
  if (e.target.id === 'media-preview') e.target.style.display = 'none';
});

function formatTime(timestamp) {
  if (!timestamp) return 'Just now';
  const date = timestamp.toDate();
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
