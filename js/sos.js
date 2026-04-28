import { db, auth } from './config.js';
import { collection, addDoc, serverTimestamp, onSnapshot, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { initUI, showNotification } from './ui.js';
import { AIChatAssistant } from './ai-chat.js';

initUI();

// Initialize AI Chat Assistant
const aiChat = new AIChatAssistant();

// DOM Elements
const sosBtn = document.getElementById('sos-trigger');
const roomInput = document.getElementById('room-number');
const typeGrid = document.getElementById('type-grid');
const typeButtons = document.querySelectorAll('.type-button');
const mainScreen = document.querySelector('main');
const successScreen = document.getElementById('success-screen');
const summaryBadge = document.getElementById('summary-badge');

let selectedType = null;

// Handle Type Selection
const otherDescWrap = document.getElementById('other-description-wrap');
const otherDescInput = document.getElementById('other-description');

typeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    typeButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedType = btn.dataset.type;
    
    // Show/hide the description field for OTHER
    if (selectedType === 'OTHER') {
      otherDescWrap.style.display = 'block';
    } else {
      otherDescWrap.style.display = 'none';
      if (otherDescInput) otherDescInput.value = '';
    }
  });
});

// Trigger SOS
sosBtn.addEventListener('click', async () => {
  const room = roomInput.value.trim();

  if (!room) {
    showNotification('Room number is required for emergency dispatch.', 'error');
    roomInput.focus();
    return;
  }

  if (!selectedType) {
    showNotification('Please select the emergency type.', 'error');
    return;
  }

  // Animation Feedback
  const originalContent = sosBtn.innerHTML;
  sosBtn.style.transform = 'scale(0.9)';
  sosBtn.innerHTML = '<span style="font-size: 1.5rem;">...</span>';
  sosBtn.disabled = true;

  try {
    // 1. Ensure Anonymous Auth (for Firestore security rules)
    if (!auth.currentUser) {
      await signInAnonymously(auth);
    }

    // 2. Add Document to Firestore
    const description = (selectedType === 'OTHER' && otherDescInput) ? otherDescInput.value.trim() : '';
    const docRef = await addDoc(collection(db, 'alerts'), {
      roomNumber: room,
      emergencyType: selectedType,
      description: description,
      status: 'OPEN',
      responderId: null,
      responderName: null,
      notes: '',
      geminiSuggestion: null,
      createdAt: serverTimestamp(),
      resolvedAt: null
    });

    console.log("Alert sent with ID: ", docRef.id);

    // 3. UI Transition
    showSuccess(room, selectedType);
    
    // 4. Listen for updates to this specific alert
    listenToAlertStatus(docRef.id);

    // 5. Activate AI Chat with emergency context
    aiChat.setEmergencyContext(selectedType, room);

  } catch (error) {
    console.error("Error adding document: ", error);
    showNotification('Failed to send SOS. Please try again or call the front desk.', 'error');
    sosBtn.style.transform = 'scale(1)';
    sosBtn.innerHTML = originalContent;
    sosBtn.disabled = false;
  }
});

function showSuccess(room, type) {
  mainScreen.style.display = 'none';
  successScreen.style.display = 'flex';
  summaryBadge.innerText = `ROOM ${room} • ${type}`;
  
  // Haptic feedback if supported
  if ('vibrate' in navigator) {
    navigator.vibrate([200, 100, 200]);
  }
}

function listenToAlertStatus(alertId) {
  const alertRef = doc(db, 'alerts', alertId);
  onSnapshot(alertRef, (docSnap) => {
    if (!docSnap.exists()) return;
    
    const data = docSnap.data();
    updateTimeline(data);
  });
}

function updateTimeline(data) {
  const stepSent = document.getElementById('step-sent');
  const stepAi = document.getElementById('step-ai');
  const stepResponding = document.getElementById('step-responding');
  const stepAdmin = document.getElementById('step-admin');
  const stepResolved = document.getElementById('step-resolved');
  
  // Helper to set states
  const setStep = (el, state) => {
    if (!el) return;
    el.classList.remove('active', 'completed');
    if (state) el.classList.add(state);
  };

  // Visibility logic for Admin Step
  // Show if current status is admin-related OR if the alert was previously handled/resolved by admin
  const isAdminInvolved = data.status === 'ADMIN_RESPONDING' || 
                          data.status === 'ESCALATED' || 
                          data.adminAction === true || 
                          data.adminResolvedBy != null;

  if (stepAdmin) {
    if (isAdminInvolved) {
      stepAdmin.style.display = 'flex';
    } else if (data.status !== 'RESOLVED') {
      // Only hide if not resolved (if resolved and wasn't admin involved, keep hidden)
      stepAdmin.style.display = 'none';
    }
  }

  // Logic flow
  if (data.status === 'RESOLVED') {
    setStep(stepSent, 'completed');
    setStep(stepAi, 'completed');
    setStep(stepResponding, 'completed');
    
    // If admin was involved, mark that step completed too
    if (stepAdmin && stepAdmin.style.display !== 'none') {
      setStep(stepAdmin, 'completed');
    }
    
    setStep(stepResolved, 'active');

    // Auto-redirect logic
    const notice = document.getElementById('redirect-notice');
    const countdown = document.getElementById('redirect-countdown');
    if (notice && notice.style.display === 'none') {
      notice.style.display = 'block';
      let seconds = 6;
      const timer = setInterval(() => {
        seconds--;
        if (countdown) countdown.innerText = seconds;
        if (seconds <= 0) {
          clearInterval(timer);
          location.reload(); // Returns to home
        }
      }, 1000);
    }
  } else if (data.status === 'ADMIN_RESPONDING' || data.status === 'ESCALATED') {
    setStep(stepSent, 'completed');
    setStep(stepAi, 'completed');
    setStep(stepResponding, 'completed');
    setStep(stepAdmin, 'active');
    setStep(stepResolved, null);
  } else if (data.status === 'RESPONDING') {
    setStep(stepSent, 'completed');
    setStep(stepAi, 'completed');
    setStep(stepResponding, 'active');
    setStep(stepAdmin, null);
    setStep(stepResolved, null);
    
    if (data.responderName) {
      const desc = stepResponding.querySelector('.step-desc');
      if (desc) desc.innerText = `Responder ${data.responderName} is en route.`;
    }
  } else if (data.geminiSuggestion) {
    setStep(stepSent, 'completed');
    setStep(stepAi, 'active');
    setStep(stepResponding, null);
    setStep(stepAdmin, null);
    setStep(stepResolved, null);
    const desc = stepAi.querySelector('.step-desc');
    if (desc) desc.innerText = "Emergency protocol active.";
  } else {
    setStep(stepSent, 'active');
    setStep(stepAi, null);
    setStep(stepResponding, null);
    setStep(stepAdmin, null);
    setStep(stepResolved, null);
  }
}
