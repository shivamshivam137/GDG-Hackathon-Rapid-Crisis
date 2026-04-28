import { db } from './config.js';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/**
 * Listen for all alerts in real-time
 */
export function subscribeToAlerts(callback) {
  const q = query(collection(db, 'alerts'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const alerts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(alerts);
  });
}

/**
 * Update alert status to RESPONDING
 */
export async function claimAlert(alertId, responderName = 'Staff') {
  const alertRef = doc(db, 'alerts', alertId);
  await updateDoc(alertRef, {
    status: 'RESPONDING',
    responderName: responderName,
  });
  return logIncident('status', `Staff "${responderName}" is responding to Alert ${alertId}`);
}

/**
 * Update alert status to RESOLVED
 */
export async function resolveAlert(alertId, proofData = {}) {
  const alertRef = doc(db, 'alerts', alertId);
  await updateDoc(alertRef, {
    status: 'RESOLVED',
    resolvedAt: serverTimestamp(),
    proofType: proofData.type || 'text',
    proofText: proofData.text || '',
    proofFileName: proofData.fileName || '',
    proofDataUrl: proofData.dataUrl || ''
  });
  return logIncident('proof', `Alert ${alertId} RESOLVED with ${proofData.type} proof`);
}

/**
 * Escalate alert if staff can't handle it
 */
export async function escalateAlert(alertId) {
  const alertRef = doc(db, 'alerts', alertId);
  await updateDoc(alertRef, {
    status: 'ESCALATED',
    escalatedAt: serverTimestamp()
  });
  return logIncident('status', `Alert ${alertId} ESCALATED to Admin`, null);
}

/**
 * Log an incident to the database
 */
export async function logIncident(type, message, floor = null) {
  try {
    return await addDoc(collection(db, 'incident_log'), {
      type, message, floor,
      timestamp: serverTimestamp()
    });
  } catch (e) {
    console.warn('Log write failed:', e);
  }
}
