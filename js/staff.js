import { subscribeToAlerts, claimAlert, resolveAlert, escalateAlert } from './alerts.js';
import { generateEmergencyProtocol } from './gemini.js';
import { db, auth } from './config.js';
import { doc, updateDoc, collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { initUI, makeTiltable, showNotification } from './ui.js';

initUI();

// =============================================
// 0. STAFF LOGIN SYSTEM
// =============================================
let loggedInStaffName = localStorage.getItem('staffName') || null;
const loginGate = document.getElementById('staff-login-gate');
const staffDashboard = document.getElementById('staff-dashboard');
const loginSelect = document.getElementById('login-staff-select');
const loginBtn = document.getElementById('login-submit-btn');
const staffNameBadge = document.getElementById('dropdown-staff-name');
const userProfileTrigger = document.getElementById('user-profile-trigger');
const userDropdownMenu = document.getElementById('user-dropdown-menu');

// Populate staff dropdown from Firestore
const staffQ = query(collection(db, 'staff_directory'), orderBy('name', 'asc'));
onSnapshot(staffQ, (snap) => {
  const staff = snap.docs.map(d => d.data());
  if (loginSelect) {
    loginSelect.innerHTML = '<option value="">— Tap to select your name —</option>' +
      staff.map(s => `<option value="${s.name}">${s.name} (${s.role || 'Staff'})</option>`).join('');
  }
});

function enterDashboard(name) {
  loggedInStaffName = name;
  localStorage.setItem('staffName', name);
  if (loginGate) loginGate.style.display = 'none';
  if (staffDashboard) staffDashboard.style.display = '';
  if (staffNameBadge) staffNameBadge.textContent = name;
}

// Toggle Profile Dropdown
userProfileTrigger?.addEventListener('click', (e) => {
  e.stopPropagation();
  userDropdownMenu?.classList.toggle('active');
});

// Close dropdown when clicking outside
document.addEventListener('click', () => {
  userDropdownMenu?.classList.remove('active');
});

// Check if already logged in
if (loggedInStaffName) {
  enterDashboard(loggedInStaffName);
}

// Login button
loginBtn?.addEventListener('click', async () => {
  const selected = loginSelect?.value;
  const pin = document.getElementById('login-pin-input')?.value.trim();

  if (!selected) {
    showNotification('Please select your name.', 'error');
    return;
  }
  if (!pin) {
    showNotification('Please enter your PIN.', 'error');
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = 'VERIFYING...';

  try {
    // Query Firestore for matching staff
    const staffQuery = query(collection(db, 'staff_directory'), where('name', '==', selected));
    const snap = await getDocs(staffQuery);

    if (snap.empty) {
      showNotification('Staff member not found.', 'error');
      return;
    }

    const staffDoc = snap.docs[0].data();
    
    if (staffDoc.password !== pin) {
      showNotification('Incorrect PIN. Try again.', 'error');
      document.getElementById('login-pin-input').value = '';
      document.getElementById('login-pin-input').focus();
      return;
    }

    // PIN matched — login successful
    enterDashboard(selected);
    showNotification(`Welcome, ${selected}!`, 'success');
  } catch (err) {
    console.error('Login error:', err);
    showNotification('Login failed. Please try again.', 'error');
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'ENTER DASHBOARD →';
  }
});

// Logout button
document.getElementById('btn-logout')?.addEventListener('click', () => {
  localStorage.removeItem('staffName');
  loggedInStaffName = null;
  location.reload();
});

// =============================================
// 1. INVENTORY REQUEST SYSTEM (High-Priority)
// =============================================
export function initInventorySystem() {
  const invModal = document.getElementById('inventory-modal');
  const invItemSelect = document.getElementById('inv-input-item');

  // 1. Global Delegate Listener (Most Reliable)
  document.addEventListener('click', (e) => {
    if (e.target.closest('#btn-request-inventory')) {
      console.log("Refill button clicked via delegation");
      if (invModal) invModal.style.display = 'flex';
    }
    
    if (e.target.closest('#inv-modal-cancel')) {
      if (invModal) invModal.style.display = 'none';
    }

    if (e.target === invModal) {
      invModal.style.display = 'none';
    }
  });

  // 2. Dynamic Dropdown Sync
  const q = query(collection(db, 'inventory'), orderBy('itemName', 'asc'));
  onSnapshot(q, (snap) => {
    if (!invItemSelect) return;
    const items = snap.docs.map(d => d.data().itemName);
    const uniqueItems = [...new Set(items)].filter(Boolean);
    invItemSelect.innerHTML = '<option value="">Select Item...</option>' + 
      uniqueItems.map(name => `<option value="${name}">${name}</option>`).join('');
  }, (err) => console.error("Inventory Sync Error:", err));

  // 3. Submit Handler
  document.getElementById('inv-modal-submit')?.addEventListener('click', async () => {
    const btn = document.getElementById('inv-modal-submit');
    const floor = document.getElementById('inv-input-floor').value;
    const item = document.getElementById('inv-input-item').value;
    const qty = parseInt(document.getElementById('inv-input-request').value);

    if (!item || !qty || isNaN(qty)) {
      showNotification("Please select an item and enter a valid quantity.", "error");
      return;
    }

    btn.disabled = true;
    btn.textContent = 'SENDING...';

    try {
      if (!auth.currentUser) await signInAnonymously(auth);
      await addDoc(collection(db, 'refill_requests'), {
        floor: parseInt(floor),
        itemName: item,
        requestedQty: qty,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      showNotification(`Refill request for ${item} sent to Admin.`, "success");
      if (invModal) invModal.style.display = 'none';
      document.getElementById('inv-input-request').value = '';
    } catch (error) {
      console.error("Refill error:", error);
      showNotification("Failed to send refill request.", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = 'SUBMIT REQUEST';
    }
  });
}
initInventorySystem();

const alertFeed = document.getElementById('alert-feed');
const alertSound = document.getElementById('alert-sound');
let prevAlertCount = 0;
let currentFilter = 'ALL';
let allAlerts = [];

// Staff Stats Elements
const staffStatPending = document.getElementById('staff-stat-pending');
const staffStatResponding = document.getElementById('staff-stat-responding');
const staffStatResolved = document.getElementById('staff-stat-resolved');
const staffStatTotal = document.getElementById('staff-stat-total');

// Filter Navigation
document.querySelectorAll('.staff-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.staff-filter-btn').forEach(b => {
      b.style.background = 'transparent';
      b.style.color = 'var(--text-dim)';
      b.style.borderColor = 'transparent';
    });
    btn.style.background = 'rgba(255,255,255,0.08)';
    btn.style.color = '#fff';
    btn.style.borderColor = 'rgba(255,255,255,0.15)';

    currentFilter = btn.dataset.filter;
    renderAlerts(allAlerts);
  });
});

function getFilteredAlerts(alerts) {
  if (currentFilter === 'ALL') return alerts;
  if (currentFilter === 'PENDING') return alerts.filter(a => a.status === 'OPEN' || a.status === 'ESCALATED');
  if (currentFilter === 'RESPONDING') return alerts.filter(a => a.status === 'RESPONDING' || a.status === 'ADMIN_RESPONDING');
  if (currentFilter === 'RESOLVED') return alerts.filter(a => a.status === 'RESOLVED');
  return alerts;
}

function updateStaffStats(alerts) {
  const pending = alerts.filter(a => a.status === 'OPEN' || a.status === 'ESCALATED').length;
  const responding = alerts.filter(a => a.status === 'RESPONDING' || a.status === 'ADMIN_RESPONDING').length;
  const resolved = alerts.filter(a => a.status === 'RESOLVED').length;

  if (staffStatPending) staffStatPending.textContent = pending;
  if (staffStatResponding) staffStatResponding.textContent = responding;
  if (staffStatResolved) staffStatResolved.textContent = resolved;
  if (staffStatTotal) staffStatTotal.textContent = alerts.length;
}
// Emergency Popup System
const emergencyPopup = document.getElementById('emergency-popup');
const popupType = document.getElementById('popup-type');
const popupRoom = document.getElementById('popup-room');
const popupDesc = document.getElementById('popup-desc');
const popupTime = document.getElementById('popup-time');
let seenAlertIds = new Set();
let popupAlertId = null;

function showEmergencyPopup(alert) {
  popupAlertId = alert.id;
  popupType.textContent = alert.emergencyType;
  popupRoom.textContent = `ROOM ${alert.roomNumber}`;
  popupDesc.textContent = alert.description || '';
  popupTime.textContent = alert.createdAt ? `Reported at ${new Date(alert.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Just now';
  
  emergencyPopup.style.display = 'flex';
  document.body.classList.add('dashboard-blurred');
}

function hideEmergencyPopup() {
  emergencyPopup.style.display = 'none';
  document.body.classList.remove('dashboard-blurred');
  popupAlertId = null;
}

// Popup button handlers
document.getElementById('popup-respond')?.addEventListener('click', async () => {
  if (popupAlertId) {
    await claimAlert(popupAlertId, loggedInStaffName || 'Staff');
    showNotification('You are now responding to this emergency.', 'success');
  }
  hideEmergencyPopup();
});

document.getElementById('popup-escalate')?.addEventListener('click', async () => {
  if (popupAlertId) {
    await escalateAlert(popupAlertId);
    showNotification('Emergency escalated to Admin.', 'info');
  }
  hideEmergencyPopup();
});

document.getElementById('popup-dismiss')?.addEventListener('click', () => {
  hideEmergencyPopup();
});

// Subscribe to real-time updates
subscribeToAlerts((alerts) => {
  allAlerts = alerts;
  updateStaffStats(alerts);
  renderAlerts(alerts);
  
  // Detect new OPEN alerts that haven't been seen yet
  const newOpenAlerts = alerts.filter(a => a.status === 'OPEN' && !seenAlertIds.has(a.id));
  
  if (newOpenAlerts.length > 0 && prevAlertCount !== 0) {
    // Show popup for the most recent new alert
    showEmergencyPopup(newOpenAlerts[0]);
    playAlertSound();
  }
  
  // Track all seen alert IDs
  alerts.forEach(a => seenAlertIds.add(a.id));
  prevAlertCount = alerts.length;
});

function renderAlerts(alerts) {
  const filtered = getFilteredAlerts(alerts);

  if (filtered.length === 0) {
    const msg = currentFilter === 'ALL' ? 'No active alerts. All clear.' 
      : `No ${currentFilter.toLowerCase()} alerts.`;
    alertFeed.innerHTML = `<div class="font-mono" style="color: var(--text-muted); grid-column: 1/-1; text-align: center; padding: 4rem;">${msg}</div>`;
    return;
  }

  alertFeed.innerHTML = '';
  
  filtered.forEach(alert => {
    const card = document.createElement('div');
    card.className = `alert-card glass type-${alert.emergencyType}`;
    
    let suggestion = alert.geminiSuggestion;
    if (!suggestion && alert.status !== 'RESOLVED' && alert.status !== 'ESCALATED') {
      suggestion = "✦ AI is analyzing protocol...";
      triggerGeminiSuggestion(alert);
    }

    card.innerHTML = `
      <div class="card-header">
        <div class="room-badge">ROOM ${alert.roomNumber}</div>
        <div class="status-badge status-${alert.status}">${alert.status}</div>
      </div>
      <div class="card-body">
        <p class="font-mono">${alert.emergencyType} reported • ${formatTime(alert.createdAt)}</p>
        ${alert.description ? `<p style="font-size: 0.8rem; color: #fff; margin-top: 0.5rem; border-left: 2px solid var(--crisis-blue); padding-left: 0.5rem;">${alert.description}</p>` : ''}
        ${alert.responderName ? `<p style="font-size: 0.7rem; color: var(--crisis-blue)">→ ${alert.responderName} is responding</p>` : ''}
        ${alert.proofType === 'text' && alert.proofText ? `<div class="proof-evidence" style="margin-top: 0.5rem;">📝 ${alert.proofText}</div>` : ''}
        ${alert.proofType === 'image' && alert.proofFileName ? `<div class="proof-evidence" style="margin-top: 0.5rem;">📷 ${alert.proofFileName}</div>` : ''}
        
        <div class="gemini-panel" style="margin-top: 1rem;">
          <div class="gemini-header">
            <span>✦ Gemini AI Protocol</span>
          </div>
          <div class="gemini-content">${suggestion ? suggestion.split('\n').map(l => l.trim()).filter(l => l).join('<br>') : 'Protocol archived.'}</div>
        </div>
      </div>
      <div class="card-actions" style="flex-wrap: wrap;">
        ${alert.status === 'OPEN' ? `
          <button class="btn-action btn-respond" data-id="${alert.id}">I'M RESPONDING</button>
          <button class="btn-action btn-escalate" data-id="${alert.id}" style="background: rgba(255, 0, 255, 0.15); border-color: rgba(255, 0, 255, 0.3); color: #ff8aff;">I CAN'T</button>
        ` : ''}
        ${alert.status === 'RESPONDING' ? `
          <button class="btn-action btn-resolve" data-id="${alert.id}">MARK RESOLVED</button>
          <button class="btn-action btn-escalate" data-id="${alert.id}" style="background: rgba(255, 0, 255, 0.15); border-color: rgba(255, 0, 255, 0.3); color: #ff8aff;">I CAN'T</button>
        ` : ''}
        ${alert.status === 'ESCALATED' ? `
          <div style="font-size: 0.7rem; color: #ff8aff; width: 100%; text-align: center; padding: 0.5rem;">⏳ ESCALATED — Waiting for Admin...</div>
        ` : ''}
        ${alert.status === 'ADMIN_RESPONDING' ? `
          <div style="font-size: 0.7rem; color: #fbbf24; width: 100%; text-align: center; padding: 0.5rem; font-weight: bold;">🛡️ ADMIN IS HANDLING THIS EMERGENCY</div>
        ` : ''}
        ${alert.status === 'RESOLVED' ? `
          <div style="font-size: 0.7rem; color: var(--crisis-green); width: 100%; text-align: center; padding: 0.5rem;">${alert.adminResolvedBy ? '🛡️ Resolved by ADMIN' : '✓ RESOLVED'}</div>
        ` : ''}
      </div>
    `;

    // Attach Event Listeners
    const respondBtn = card.querySelector('.btn-respond');
    if (respondBtn) {
      respondBtn.addEventListener('click', () => claimAlert(alert.id, loggedInStaffName || 'Staff'));
    }

    const resolveBtn = card.querySelector('.btn-resolve');
    if (resolveBtn) {
      resolveBtn.addEventListener('click', () => showProofModal(alert.id));
    }

    const escalateBtn = card.querySelector('.btn-escalate');
    if (escalateBtn) {
      escalateBtn.addEventListener('click', () => escalateAlert(alert.id));
    }

    makeTiltable(card);
    alertFeed.appendChild(card);
  });
}

// === PROOF MODAL SYSTEM ===
let currentAlertId = null;
let selectedProofType = 'text';
let selectedFile = null;

const proofModal = document.getElementById('proof-modal');
const proofTypeBtns = document.querySelectorAll('.proof-type-btn');
const proofAreaText = document.getElementById('proof-area-text');
const proofAreaImage = document.getElementById('proof-area-image');
const proofTextInput = document.getElementById('proof-text');
const proofImageInput = document.getElementById('proof-image');
const imageLabel = document.getElementById('image-label');
const imagePreviewName = document.getElementById('image-preview-name');

function showProofModal(alertId) {
  currentAlertId = alertId;
  selectedProofType = 'text';
  selectedFile = null;
  proofTextInput.value = '';
  proofImageInput.value = '';
  imageLabel.classList.remove('has-file');
  imageLabel.querySelector('span').textContent = '📷 Tap to capture or select image';
  imagePreviewName.style.display = 'none';

  proofTypeBtns.forEach(b => b.classList.remove('active'));
  proofTypeBtns[0].classList.add('active');
  proofAreaText.style.display = '';
  proofAreaImage.style.display = 'none';

  proofModal.style.display = 'flex';
}

// Tab switching
proofTypeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    proofTypeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedProofType = btn.dataset.type;

    proofAreaText.style.display = selectedProofType === 'text' ? '' : 'none';
    proofAreaImage.style.display = selectedProofType === 'image' ? '' : 'none';
  });
});

// File input handlers
proofImageInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    selectedFile = file;
    imageLabel.classList.add('has-file');
    imageLabel.querySelector('span').textContent = '✅ Image captured';
    imagePreviewName.textContent = `📷 ${file.name}`;
    imagePreviewName.style.display = '';
  }
});

// Submit
document.getElementById('proof-submit-btn').addEventListener('click', async () => {
  const btn = document.getElementById('proof-submit-btn');
  const originalText = btn.textContent;
  btn.disabled = true;

  try {
    // 1. Ensure Auth
    btn.textContent = 'SAVING...';
    if (!auth.currentUser) {
      await signInAnonymously(auth);
    }

    if (selectedProofType === 'text') {
      const text = proofTextInput.value.trim();
      if (!text) { proofTextInput.style.borderColor = 'var(--crisis-red)'; btn.disabled = false; btn.textContent = originalText; return; }
      await resolveAlert(currentAlertId, { type: 'text', text });
    } 
    else if (selectedProofType === 'image' && selectedFile) {
      btn.textContent = 'COMPRESSING...';
      // Use higher compression to fit in Firestore 1MB limit
      const compressedDataUrl = await compressImage(selectedFile, 800, 0.5);
      
      btn.textContent = 'SAVING...';
      await resolveAlert(currentAlertId, { type: 'image', fileName: selectedFile.name, dataUrl: compressedDataUrl });
    } 
    else {
      btn.disabled = false;
      btn.textContent = originalText;
      return;
    }

    proofModal.style.display = 'none';
    showNotification("Evidence submitted. Crisis resolved.", "success");
  } catch (error) {
    console.error("Resolution failed:", error);
    showNotification(`Resolution error: ${error.message}`, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
});

// Cancel
document.getElementById('proof-cancel-btn').addEventListener('click', () => {
  proofModal.style.display = 'none';
});

// Close modal on overlay click
proofModal.addEventListener('click', (e) => {
  if (e.target === proofModal) proofModal.style.display = 'none';
});

// Image compression utility
function compressImage(file, maxWidth, quality) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ratio = Math.min(maxWidth / img.width, 1);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function formatTime(timestamp) {
  if (!timestamp) return 'Just now';
  const date = timestamp.toDate();
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function playAlertSound() {
  if (alertSound) {
    alertSound.currentTime = 0;
    alertSound.play().catch(e => console.log("Audio play blocked by browser."));
  }
}

const pendingTriggers = new Set();
async function triggerGeminiSuggestion(alert) {
  if (pendingTriggers.has(alert.id)) return;
  pendingTriggers.add(alert.id);

  const delay = [...pendingTriggers].indexOf(alert.id) * 2000;
  await new Promise(resolve => setTimeout(resolve, delay));

  const protocol = await generateEmergencyProtocol(alert.emergencyType, alert.roomNumber, alert.description);

  if (protocol.includes("Rate limit reached")) {
    pendingTriggers.delete(alert.id);
    return;
  }

  try {
    const alertRef = doc(db, 'alerts', alert.id);
    await updateDoc(alertRef, {
      geminiSuggestion: protocol
    });
  } catch (error) {
    console.error("Error saving Gemini protocol:", error);
  } finally {
    pendingTriggers.delete(alert.id);
  }
}



