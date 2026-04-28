/**
 * admin-panels.js — Logic for the 5 new Admin Panel sections.
 * Depends on Firebase already initialized in config.js.
 */
import { db } from './config.js';
import { logIncident } from './alerts.js';
import { showNotification } from './ui.js';
import {
  collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, where, getDocs, Timestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// =============================================
// 1. TAB NAVIGATION
// =============================================
export function initTabs() {
  const tabs = document.querySelectorAll('.admin-tab');
  const sections = document.querySelectorAll('.admin-panel-section');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.target;
      tabs.forEach(t => t.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(target)?.classList.add('active');
    });
  });
}

// =============================================
// 2. ALL-FLOOR INVENTORY OVERVIEW
// =============================================
export function initInventory() {
  const tableBody = document.getElementById('inventory-table-body');
  const refillGrid = document.getElementById('refill-requests-grid');
  if (!tableBody || !refillGrid) return;

  let currentInventory = []; 

  // Listen to inventory collection
  const invQ = query(collection(db, 'inventory'), orderBy('floor', 'asc'));
  onSnapshot(invQ, (snap) => {
    currentInventory = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderInventoryTable(currentInventory, tableBody);
  });

  // Listen to refill_requests collection
  const refillQ = query(collection(db, 'refill_requests'), orderBy('createdAt', 'desc'));
  onSnapshot(refillQ, (snap) => {
    const requests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderRefillRequests(requests, refillGrid, currentInventory);
  });

  // Modal Listeners
  document.getElementById('btn-add-inventory')?.addEventListener('click', () => {
    document.getElementById('inventory-item-modal').style.display = 'flex';
  });

  document.getElementById('inv-item-cancel')?.addEventListener('click', () => {
    document.getElementById('inventory-item-modal').style.display = 'none';
  });

  document.getElementById('inv-item-save')?.addEventListener('click', saveInventoryItem);
}

async function saveInventoryItem() {
  const modal = document.getElementById('inventory-item-modal');
  const btn = document.getElementById('inv-item-save');
  
  const itemName = document.getElementById('inv-item-name').value.trim();
  const floor = parseInt(document.getElementById('inv-item-floor').value);
  const quantity = parseInt(document.getElementById('inv-item-qty').value);
  const threshold = parseInt(document.getElementById('inv-item-threshold').value);

  if (!itemName || isNaN(quantity) || isNaN(threshold)) {
    showNotification("Please fill in all fields correctly.", "error");
    return;
  }

  btn.disabled = true;
  btn.textContent = "SAVING...";

  try {
    await addDoc(collection(db, 'inventory'), {
      itemName,
      floor,
      quantity,
      threshold,
      updatedAt: serverTimestamp()
    });

    showNotification(`${itemName} added to Floor ${floor}.`, "success");
    modal.style.display = 'none';
    
    // Clear inputs
    document.getElementById('inv-item-name').value = '';
    document.getElementById('inv-item-qty').value = '50';
    document.getElementById('inv-item-threshold').value = '10';
  } catch (error) {
    console.error("Save error:", error);
    showNotification("Failed to save item.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "SAVE ITEM";
  }
}

function renderInventoryTable(items, tbody) {
  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-muted); padding: 2rem;">No inventory data. Add items via Firestore or staff panel.</td></tr>`;
    return;
  }
  tbody.innerHTML = items.map(item => {
    const level = getStockLevel(item.quantity, item.threshold || 10);
    return `<tr class="stock-${level}">
      <td>${item.itemName || '—'}</td>
      <td>Floor ${item.floor || '?'}</td>
      <td>${item.quantity ?? '—'}</td>
      <td>${item.threshold ?? 10}</td>
      <td><span class="refill-status-badge refill-${level === 'critical' ? 'rejected' : level === 'low' ? 'pending' : 'approved'}">${level.toUpperCase()}</span></td>
    </tr>`;
  }).join('');
}

function getStockLevel(qty, threshold) {
  if (qty <= threshold * 0.3) return 'critical';
  if (qty <= threshold) return 'low';
  return 'healthy';
}

function renderRefillRequests(requests, grid, inventory) {
  if (requests.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; color: var(--text-muted); font-family: var(--font-mono); font-size: 0.75rem; padding: 2rem;">No pending refill requests.</div>`;
    return;
  }
  grid.innerHTML = requests.map(r => {
    // Find current quantity from inventory state
    const invItem = inventory.find(i => 
      i.itemName?.toLowerCase() === r.itemName?.toLowerCase() && 
      parseInt(i.floor) === parseInt(r.floor)
    );
    const actualQty = invItem ? invItem.quantity : '?';

    const statusClass = r.status === 'approved' ? 'refill-approved' : r.status === 'rejected' ? 'refill-rejected' : 'refill-pending';
    const actionsHtml = r.status === 'pending' ? `
      <div class="refill-actions">
        <button class="btn-approve" onclick="window._approveRefill('${r.id}', '${r.itemName}', ${r.floor}, ${r.requestedQty})">✓ APPROVE</button>
        <button class="btn-reject" onclick="window._rejectRefill('${r.id}')">✗ REJECT</button>
      </div>` : `<span class="refill-status-badge ${statusClass}">${r.status?.toUpperCase()}</span>`;

    return `<div class="refill-card">
      <div class="refill-item">${r.itemName || '—'}</div>
      <div class="refill-meta">
        Floor: ${r.floor || '?'}<br>
        Current Qty: <span style="color:${invItem ? 'var(--crisis-blue)' : 'inherit'}">${actualQty}</span><br>
        Requested Qty: ${r.requestedQty ?? '?'}<br>
        ${r.createdAt ? formatTimestamp(r.createdAt) : ''}
      </div>
      ${actionsHtml}
    </div>`;
  }).join('');
}

// Global handlers for refill actions
window._approveRefill = async (id, itemName, floor, requestedQty) => {
  try {
    // 1. Update request status
    await updateDoc(doc(db, 'refill_requests', id), { status: 'approved', decidedAt: serverTimestamp() });
    
    // 2. Find and Subtract from inventory
    const invRef = collection(db, 'inventory');
    const q = query(invRef, where('floor', '==', parseInt(floor))); // Search by floor first for speed
    const snap = await getDocs(q);
    
    // Find the item case-insensitively in the floor's inventory
    const invDoc = snap.docs.find(d => 
      d.data().itemName?.toLowerCase().trim() === itemName?.toLowerCase().trim()
    );
    
    if (invDoc) {
      const currentQty = invDoc.data().quantity || 0;
      const newQty = currentQty - (requestedQty || 0);
      
      await updateDoc(doc(db, 'inventory', invDoc.id), { 
        quantity: Math.max(0, newQty),
        updatedAt: serverTimestamp() 
      });
      showNotification(`Deducted ${requestedQty} units of ${itemName} from Floor ${floor}.`, "success");
    } else {
      // Fallback: search whole building if floor match failed
      const qGlobal = query(invRef, where('itemName', '==', itemName));
      const snapGlobal = await getDocs(qGlobal);
      if (!snapGlobal.empty) {
        const d = snapGlobal.docs[0];
        const newQty = (d.data().quantity || 0) - (requestedQty || 0);
        await updateDoc(doc(db, 'inventory', d.id), { quantity: Math.max(0, newQty) });
        showNotification(`Floor mismatch: Item found on another floor and deducted.`, "info");
      } else {
        showNotification(`Could not find "${itemName}" in inventory to deduct.`, "error");
      }
    }

    logIncident('refill', `Refill request ${id} APPROVED and processed`);
  } catch (error) {
    console.error("Approve failed:", error);
    showNotification("Failed to process approval.", "error");
  }
};
window._rejectRefill = async (id) => {
  await updateDoc(doc(db, 'refill_requests', id), { status: 'rejected', decidedAt: serverTimestamp() });
  logIncident('refill', `Refill request ${id} REJECTED by Admin`);
};

// =============================================
// 3. STAFF DIRECTORY & DUTY MONITOR
// =============================================
export function initStaffDirectory() {
  const tbody = document.getElementById('staff-table-body');
  if (!tbody) return;

  const q = query(collection(db, 'staff_directory'), orderBy('name', 'asc'));
  onSnapshot(q, (snap) => {
    const staff = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderStaffTable(staff, tbody);
  });

  // Modal listeners
  document.getElementById('btn-add-staff')?.addEventListener('click', () => showStaffModal());
  document.getElementById('staff-modal-cancel')?.addEventListener('click', () => hideStaffModal());
  document.getElementById('staff-modal-save')?.addEventListener('click', () => saveStaffMember());
  document.getElementById('staff-modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'staff-modal-overlay') hideStaffModal();
  });
}

function renderStaffTable(staff, tbody) {
  if (staff.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-muted); padding: 2rem;">No staff registered. Click "+ Add Staff" to begin.</td></tr>`;
    return;
  }
  tbody.innerHTML = staff.map(s => {
    const dutyClass = s.dutyStatus === 'online' ? 'duty-online' : 'duty-offline';
    const statusDot = s.dutyStatus === 'online' ? '●' : '○';
    return `<tr>
      <td style="color:#fff; font-weight:600;">${s.name || '—'}</td>
      <td>${s.role || 'STAFF'}</td>
      <td>Floor ${s.floor ?? '—'}</td>
      <td class="${dutyClass}">${statusDot} ${(s.dutyStatus || 'offline').toUpperCase()}</td>
      <td>
        <button class="staff-action-btn" onclick="window._editStaff('${s.id}')" title="Edit">✎</button>
        <button class="staff-action-btn" onclick="window._resetPw('${s.id}','${s.name}')" title="Reset Password">🔑</button>
        <button class="staff-action-btn deactivate" onclick="window._toggleStaff('${s.id}','${s.active !== false}')" title="Toggle Active">${s.active !== false ? '🚫' : '✅'}</button>
      </td>
    </tr>`;
  }).join('');
}

function showStaffModal(editData = null) {
  const overlay = document.getElementById('staff-modal-overlay');
  document.getElementById('staff-modal-title').textContent = editData ? 'EDIT STAFF' : 'ADD NEW STAFF';
  document.getElementById('staff-input-name').value = editData?.name || '';
  document.getElementById('staff-input-role').value = editData?.role || 'STAFF';
  document.getElementById('staff-input-floor').value = editData?.floor || '1';
  document.getElementById('staff-input-password').value = '';
  overlay.dataset.editId = editData?.id || '';
  overlay.style.display = 'flex';
}

function hideStaffModal() {
  document.getElementById('staff-modal-overlay').style.display = 'none';
}

async function saveStaffMember() {
  const saveBtn = document.getElementById('staff-modal-save');
  const overlay = document.getElementById('staff-modal-overlay');
  const editId = overlay.dataset.editId;
  
  const nameInput = document.getElementById('staff-input-name');
  const name = nameInput.value.trim();
  const pwInput = document.getElementById('staff-input-password');
  const pw = pwInput.value.trim();
  
  if (!name) {
    showNotification("Full name is required.", "error");
    return;
  }

  if (!pw) {
    showNotification("Login PIN is required for staff authentication.", "error");
    pwInput.focus();
    return;
  }

  // Disable button and show loading state
  const originalText = saveBtn.textContent;
  saveBtn.disabled = true;
  saveBtn.textContent = "SAVING...";

  try {
    console.log(editId ? "Updating staff..." : "Adding new staff...");
    const data = {
      name: name,
      password: pw,
      role: document.getElementById('staff-input-role').value,
      floor: parseInt(document.getElementById('staff-input-floor').value) || 1,
      active: true,
      dutyStatus: 'offline',
      updatedAt: serverTimestamp()
    };

    if (editId) {
      await updateDoc(doc(db, 'staff_directory', editId), data);
      await logIncident('auth', `Staff "${data.name}" profile updated by Admin`);
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, 'staff_directory'), data);
      await logIncident('auth', `New staff "${data.name}" added by Admin (Floor ${data.floor})`);
    }

    console.log("Staff saved successfully!");
    showNotification(`Staff "${name}" successfully saved.`, "success");
    hideStaffModal();
  } catch (error) {
    console.error("Error saving staff:", error);
    showNotification(`Save failed: ${error.message}`, "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = originalText;
  }
}

// Global action handlers
window._editStaff = async (id) => {
  const snap = await getDocs(query(collection(db, 'staff_directory')));
  const staff = snap.docs.find(d => d.id === id);
  if (staff) showStaffModal({ id, ...staff.data() });
};
window._resetPw = async (id, name) => {
  const newPw = prompt(`Enter new Login PIN for ${name}:`);
  if (newPw) {
    await updateDoc(doc(db, 'staff_directory', id), { password: newPw, updatedAt: serverTimestamp() });
    logIncident('auth', `Login PIN reset for "${name}" by Admin`);
  }
};
window._toggleStaff = async (id, isActive) => {
  const newActive = isActive === 'true' ? false : true;
  await updateDoc(doc(db, 'staff_directory', id), { active: newActive, updatedAt: serverTimestamp() });
  logIncident('auth', `Staff ${id} ${newActive ? 'activated' : 'deactivated'} by Admin`);
};

// =============================================
// 4. INCIDENT LOGBOOK
// =============================================
let allLogs = [];

export function initLogbook() {
  const container = document.getElementById('logbook-timeline');
  if (!container) return;

  const q = query(collection(db, 'incident_log'), orderBy('timestamp', 'desc'));
  onSnapshot(q, (snap) => {
    allLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    applyLogFilters();
  });

  // Filter listeners
  document.getElementById('log-filter-floor')?.addEventListener('change', applyLogFilters);
  document.getElementById('log-filter-type')?.addEventListener('change', applyLogFilters);
  document.getElementById('log-filter-date-start')?.addEventListener('change', applyLogFilters);
  document.getElementById('log-filter-date-end')?.addEventListener('change', applyLogFilters);
  document.getElementById('btn-export-csv')?.addEventListener('click', exportCSV);
}

function applyLogFilters() {
  const floor = document.getElementById('log-filter-floor')?.value || 'all';
  const type = document.getElementById('log-filter-type')?.value || 'all';
  const dateStart = document.getElementById('log-filter-date-start')?.value;
  const dateEnd = document.getElementById('log-filter-date-end')?.value;

  let filtered = [...allLogs];

  if (floor !== 'all') filtered = filtered.filter(l => String(l.floor) === floor);
  if (type !== 'all') filtered = filtered.filter(l => l.type === type);
  if (dateStart) {
    const start = new Date(dateStart);
    filtered = filtered.filter(l => l.timestamp?.toDate?.() >= start);
  }
  if (dateEnd) {
    const end = new Date(dateEnd);
    end.setHours(23, 59, 59);
    filtered = filtered.filter(l => l.timestamp?.toDate?.() <= end);
  }

  renderLogbook(filtered);
}

function renderLogbook(logs) {
  const container = document.getElementById('logbook-timeline');
  if (logs.length === 0) {
    container.innerHTML = `<div class="logbook-empty">No log entries matching filters.</div>`;
    return;
  }
  container.innerHTML = logs.map(l => {
    const badgeMap = { sos: 'SOS', status: 'STATUS', proof: 'PROOF', refill: 'REFILL', auth: 'AUTH' };
    const badge = badgeMap[l.type] || 'EVENT';
    return `<div class="logbook-entry type-${l.type || 'status'}">
      <span class="log-time">${l.timestamp ? formatTimestamp(l.timestamp) : '—'}</span>
      <span class="log-badge log-badge-${l.type || 'status'}">${badge}</span>
      ${l.message || '—'}
      ${l.floor ? ` <span style="color:var(--text-muted)">· Floor ${l.floor}</span>` : ''}
    </div>`;
  }).join('');
}

function exportCSV() {
  if (allLogs.length === 0) {
    showNotification('No log data to export.', 'error');
    return;
  }
  const headers = ['Timestamp', 'Type', 'Floor', 'Message'];
  const rows = allLogs.map(l => [
    l.timestamp ? formatTimestamp(l.timestamp) : '',
    l.type || '',
    l.floor || '',
    `"${(l.message || '').replace(/"/g, '""')}"`
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `incident_log_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showNotification('Incident log exported successfully.', 'success');
}

/** Utility: write to incident_log (now imported from alerts.js) */

// =============================================
// 5. ANALYTICS DASHBOARD
// =============================================
export function initAnalytics() {
  const container = document.getElementById('analytics-container');
  if (!container) return;

  // We compute analytics from the alerts collection
  const q = query(collection(db, 'alerts'), orderBy('createdAt', 'desc'));
  onSnapshot(q, (snap) => {
    const alerts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAnalytics(alerts, container);
  });
}

function renderAnalytics(alerts, container) {
  if (alerts.length === 0) {
    container.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:var(--text-muted); font-family:var(--font-mono); padding:3rem;">Insufficient data for analytics. Trigger some alerts first.</div>`;
    return;
  }

  // 1. Average response time by type
  const typeGroups = {};
  alerts.forEach(a => {
    if (!typeGroups[a.emergencyType]) typeGroups[a.emergencyType] = [];
    if (a.createdAt && a.resolvedAt) {
      const created = a.createdAt.toDate?.() || new Date(a.createdAt);
      const resolved = a.resolvedAt.toDate?.() || new Date(a.resolvedAt);
      typeGroups[a.emergencyType].push((resolved - created) / 1000);
    }
  });

  const avgTimes = Object.entries(typeGroups).map(([type, times]) => ({
    type,
    avg: times.length > 0 ? (times.reduce((a, b) => a + b, 0) / times.length) : null,
    count: times.length
  }));

  // 2. Most frequent types by floor
  const floorTypes = {};
  alerts.forEach(a => {
    const floor = a.floor || extractFloor(a.roomNumber);
    const key = `Floor ${floor}`;
    if (!floorTypes[key]) floorTypes[key] = {};
    floorTypes[key][a.emergencyType] = (floorTypes[key][a.emergencyType] || 0) + 1;
  });

  // 3. Busiest hours
  const hourCounts = new Array(24).fill(0);
  alerts.forEach(a => {
    if (a.createdAt?.toDate) hourCounts[a.createdAt.toDate().getHours()]++;
  });
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

  // 4. Escalation rate
  const escalated = alerts.filter(a => a.status === 'ESCALATED').length;
  const escRate = alerts.length > 0 ? ((escalated / alerts.length) * 100).toFixed(1) : 0;

  // 5. Floor-wise resolution
  const floorResolution = {};
  alerts.forEach(a => {
    const floor = a.floor || extractFloor(a.roomNumber);
    if (!floorResolution[floor]) floorResolution[floor] = { total: 0, resolved: 0 };
    floorResolution[floor].total++;
    if (a.status === 'RESOLVED') floorResolution[floor].resolved++;
  });

  // Type colors
  const typeColors = { FIRE: 'red', MEDICAL: 'blue', SECURITY: 'yellow', FLOOD: 'cyan', OTHER: 'green' };

  // Build HTML
  const globalAvg = avgTimes.filter(a => a.avg !== null);
  const overallAvg = globalAvg.length > 0 ? (globalAvg.reduce((s, a) => s + a.avg, 0) / globalAvg.length) : 0;

  container.innerHTML = `
    <!-- Avg Response Time -->
    <div class="analytics-card">
      <div class="card-title">Avg Response Time</div>
      <div class="big-stat">${overallAvg > 0 ? formatSeconds(overallAvg) : '—'}</div>
      <div class="stat-sub">across ${globalAvg.reduce((s, a) => s + a.count, 0)} resolved alerts</div>
      <div style="margin-top:1rem;">
        ${avgTimes.map(a => `<div class="bar-row">
          <span class="bar-label">${a.type}</span>
          <div class="bar-track"><div class="bar-fill ${typeColors[a.type] || 'blue'}" style="--target-width:${a.avg ? Math.min((a.avg / Math.max(overallAvg * 2, 1)) * 100, 100) : 0}%"></div></div>
          <span class="bar-value">${a.avg ? formatSeconds(a.avg) : '—'}</span>
        </div>`).join('')}
      </div>
    </div>

    <!-- Most Frequent Types -->
    <div class="analytics-card">
      <div class="card-title">Frequency by Type</div>
      <div class="big-stat">${alerts.length}</div>
      <div class="stat-sub">total incidents recorded</div>
      <div style="margin-top:1rem;">
        ${Object.entries(typeGroups).map(([type]) => {
          const count = alerts.filter(a => a.emergencyType === type).length;
          return `<div class="bar-row">
            <span class="bar-label">${type}</span>
            <div class="bar-track"><div class="bar-fill ${typeColors[type] || 'blue'}" style="--target-width:${(count / alerts.length) * 100}%"></div></div>
            <span class="bar-value">${count}</span>
          </div>`;
        }).join('')}
      </div>
    </div>

    <!-- Peak Hours -->
    <div class="analytics-card">
      <div class="card-title">Busiest Hour</div>
      <div class="big-stat">${String(peakHour).padStart(2, '0')}:00</div>
      <div class="stat-sub">${hourCounts[peakHour]} alerts at peak</div>
      <div style="margin-top:1rem;">
        ${[...Array(24)].map((_, h) => {
          const maxH = Math.max(...hourCounts, 1);
          return hourCounts[h] > 0 ? `<div class="bar-row">
            <span class="bar-label">${String(h).padStart(2, '0')}:00</span>
            <div class="bar-track"><div class="bar-fill blue" style="--target-width:${(hourCounts[h] / maxH) * 100}%"></div></div>
            <span class="bar-value">${hourCounts[h]}</span>
          </div>` : '';
        }).join('')}
      </div>
    </div>

    <!-- Escalation Rate -->
    <div class="analytics-card">
      <div class="card-title">Escalation Rate</div>
      <div class="big-stat" style="color:${escalated > 0 ? '#ff8aff' : 'var(--crisis-green)'}">${escRate}%</div>
      <div class="stat-sub">${escalated} of ${alerts.length} alerts escalated</div>
    </div>

    <!-- Floor Resolution -->
    <div class="analytics-card">
      <div class="card-title">Floor-Wise Resolution</div>
      <div style="margin-top:0.5rem;">
        ${Object.entries(floorResolution).map(([floor, data]) => {
          const pct = data.total > 0 ? ((data.resolved / data.total) * 100).toFixed(0) : 0;
          return `<div class="bar-row">
            <span class="bar-label">Floor ${floor}</span>
            <div class="bar-track"><div class="bar-fill green" style="--target-width:${pct}%"></div></div>
            <span class="bar-value">${pct}%</span>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

function extractFloor(roomNumber) {
  if (!roomNumber) return '?';
  const num = parseInt(roomNumber);
  if (isNaN(num)) return '?';
  return Math.floor(num / 100) || '1';
}

function formatSeconds(s) {
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

// =============================================
// 6. BROADCAST ALERT SYSTEM
// =============================================
export function initBroadcast() {
  const sendBtn = document.getElementById('btn-send-broadcast');
  const dismissBtn = document.getElementById('btn-dismiss-broadcasts');
  const historyContainer = document.getElementById('broadcast-history-list');
  if (!sendBtn) return;

  sendBtn.addEventListener('click', sendBroadcast);
  dismissBtn?.addEventListener('click', dismissAllBroadcasts);

  // Listen to broadcasts
  const q = query(collection(db, 'broadcasts'), orderBy('createdAt', 'desc'));
  onSnapshot(q, (snap) => {
    const broadcasts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderBroadcastHistory(broadcasts, historyContainer);
  });
}

async function sendBroadcast() {
  const textarea = document.getElementById('broadcast-message');
  const msg = textarea?.value.trim();
  if (!msg) return;

  await addDoc(collection(db, 'broadcasts'), {
    message: msg,
    active: true,
    createdAt: serverTimestamp()
  });
  logIncident('refill', `Broadcast sent: "${msg.substring(0, 60)}..."`);
  textarea.value = '';
}

async function dismissAllBroadcasts() {
  const snap = await getDocs(query(collection(db, 'broadcasts'), where('active', '==', true)));
  const promises = snap.docs.map(d => updateDoc(doc(db, 'broadcasts', d.id), { active: false, dismissedAt: serverTimestamp() }));
  await Promise.all(promises);
}

function renderBroadcastHistory(broadcasts, container) {
  if (!container) return;
  if (broadcasts.length === 0) {
    container.innerHTML = `<div style="text-align:center; color:var(--text-muted); font-family:var(--font-mono); font-size:0.75rem; padding:2rem;">No broadcasts sent yet.</div>`;
    return;
  }
  container.innerHTML = broadcasts.map(b => {
    const cls = b.active ? 'bc-active' : 'bc-dismissed';
    return `<div class="broadcast-entry ${cls}">
      <div class="bc-time">${b.createdAt ? formatTimestamp(b.createdAt) : '—'} ${b.active ? '● LIVE' : '○ DISMISSED'}</div>
      <div class="bc-msg">${b.message}</div>
    </div>`;
  }).join('');
}

// =============================================
// UTILITY
// =============================================
function formatTimestamp(ts) {
  if (!ts) return '';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch { return ''; }
}

// Auto-logging is now handled directly in alerts.js actions.
export function initAutoLogger() {
  console.log("Auto-logger initialized (Source-level logging active)");
}
