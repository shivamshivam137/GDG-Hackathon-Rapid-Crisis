/**
 * AI Emergency Assistant Chat Module
 * Uses Gemini API for real-time emergency guidance
 * Can trigger emergency alerts to staff/admin panels via Firestore
 */

import { db, auth } from './config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Gemini API Configuration (same as gemini.js)
const GEMINI_API_KEY = "YOUR_API_KEY";
const GEMINI_API_URL = atob("aHR0cHM6Ly9hcGkuZ3JvcS5jb20vb3BlbmFpL3YxL2NoYXQvY29tcGxldGlvbnM=");
const GEMINI_MODEL = atob("bGxhbWEtMy4zLTcwYi12ZXJzYXRpbGU=");

// Valid emergency types (must match what staff/admin panels expect)
const VALID_TYPES = ['FIRE', 'MEDICAL', 'SECURITY', 'FLOOD', 'OTHER'];

// System prompt for emergency context
const SYSTEM_PROMPT = `You are an AI Emergency Assistant for a hospital's Rapid Crisis Response System. A patient or visitor is reaching out during or before reporting an emergency.

Your role:
- Hospital's name is KASS City Hospital and its located in Navi Mumbai.
- Provide calm, clear, and immediate safety guidance
- Ask clarifying questions about the emergency if needed        
- Give step-by-step instructions the guest can follow RIGHT NOW
- Be reassuring but urgent — lives may depend on your response
- Keep responses SHORT (2-4 sentences max) — this is a crisis chat, not an essay
- If the situation is life-threatening, always advise calling emergency services (101 for fire, 102 for ambulance, 100 for police)
- You can help with: fire safety, medical emergencies, security threats, floods, evacuation guidance, first aid tips

ALERT DISPATCHING CAPABILITY:
You have the ability to send emergency alerts directly to hospital staff and admin panels.
When a user describes an emergency and you can determine BOTH:
1. The TYPE of emergency (one of: FIRE, MEDICAL, SECURITY, FLOOD, OTHER)
2. The ROOM NUMBER or location

You MUST include this exact tag at the END of your response (after your safety advice):
[ALERT:{"type":"EMERGENCY_TYPE","room":"ROOM_NUMBER"}]

Examples:
- User says "There's a fire in room 305" → give safety advice, then add [ALERT:{"type":"FIRE","room":"305"}]
- User says "Someone collapsed in ward 12" → give first aid advice, then add [ALERT:{"type":"MEDICAL","room":"12"}]
- User says "I smell smoke on the 3rd floor room 301" → give advice, then add [ALERT:{"type":"FIRE","room":"301"}]
- 

IMPORTANT RULES FOR ALERTS:
- ONLY send the [ALERT] tag when you have BOTH type AND room number
- If you only have one piece of info, ASK for the missing piece before sending
- The type MUST be exactly one of: FIRE, MEDICAL, SECURITY, FLOOD, OTHER
- NEVER send duplicate alerts — if an alert was already sent in this conversation, do NOT send another unless the user explicitly reports a NEW emergency
- After sending an alert, tell the user that help has been dispatched
- If the user just wants advice or information without reporting an emergency, do NOT send an alert
- Most importantly you should strictly not send the alert without knowing the room number from where the emergency is sent.

CRITICAL RULES:
- NEVER say "I'm just an AI" or refuse to help
- NEVER give lengthy disclaimers
- Be DIRECT and ACTIONABLE
- Respond like a trained emergency dispatcher would`;

class AIChatAssistant {
  constructor() {
    this.conversationHistory = [];
    this.isOpen = false;
    this.isTyping = false;
    this.emergencyContext = null;
    this.alertsSent = []; // Track alerts sent via chat to prevent duplicates
    this.onAlertSent = null; // Callback for when alert is sent (used by sos.js)

    this.initDOM();
    this.bindEvents();
    this.showWelcome();
  }

  /**
   * Set emergency context (called after SOS is sent via the manual button)
   */
  setEmergencyContext(type, room) {
    this.emergencyContext = { type, room };
    // Mark this alert as already sent so the AI doesn't duplicate it
    this.alertsSent.push(`${type}-${room}`);

    // Update system prompt with context
    this.conversationHistory = [];

    // Auto-send context message from AI
    const contextMsg = `🚨 I see a **${type}** emergency has been reported for **Room ${room}**. I'm here to help you stay safe. What's your current situation?`;
    this.addMessage('ai', contextMsg);
  }

  /**
   * Initialize DOM elements
   */
  initDOM() {
    this.fab = document.getElementById('ai-chat-fab');
    this.fabLabel = document.getElementById('ai-chat-fab-label');
    this.panel = document.getElementById('ai-chat-panel');
    this.messagesContainer = document.getElementById('ai-chat-messages');
    this.input = document.getElementById('ai-chat-input');
    this.sendBtn = document.getElementById('ai-chat-send');
    this.quickActions = document.getElementById('ai-chat-quick-actions');
  }

  /**
   * Bind all event listeners
   */
  bindEvents() {
    // Toggle chat panel
    this.fab.addEventListener('click', () => this.toggle());

    // Close button
    document.getElementById('ai-chat-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle(false);
    });

    // Send message
    this.sendBtn.addEventListener('click', () => this.handleSend());

    // Enter to send (Shift+Enter for newline)
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    // Auto-resize textarea
    this.input.addEventListener('input', () => {
      this.input.style.height = 'auto';
      this.input.style.height = Math.min(this.input.scrollHeight, 80) + 'px';
    });

    // Quick action buttons
    if (this.quickActions) {
      this.quickActions.addEventListener('click', (e) => {
        const btn = e.target.closest('.ai-quick-btn');
        if (btn) {
          this.input.value = btn.dataset.msg;
          this.handleSend();
        }
      });
    }

    // Show label briefly on load
    setTimeout(() => {
      if (this.fabLabel) {
        this.fabLabel.classList.add('show');
        setTimeout(() => this.fabLabel.classList.remove('show'), 3000);
      }
    }, 2000);
  }

  /**
   * Toggle chat panel open/closed
   * @param {boolean|null} forceState - Optional force state
   */
  toggle(forceState = null) {
    this.isOpen = forceState !== null ? forceState : !this.isOpen;
    this.panel.classList.toggle('open', this.isOpen);
    this.fab.classList.toggle('open', this.isOpen);

    if (this.isOpen) {
      this.scrollToBottom();
      setTimeout(() => this.input.focus(), 300);
    }
  }

  /**
   * Show welcome message
   */
  showWelcome() {
    // Welcome is already in HTML, nothing extra needed
  }

  /**
   * Handle sending a message
   */
  async handleSend() {
    const text = this.input.value.trim();
    if (!text || this.isTyping) return;

    // Clear input
    this.input.value = '';
    this.input.style.height = 'auto';

    // Hide quick actions after first message
    if (this.quickActions) {
      this.quickActions.style.display = 'none';
    }

    // Add user message to UI
    this.addMessage('user', text);

    // Add to conversation history
    this.conversationHistory.push({ role: 'user', content: text });

    // Show typing indicator
    this.showTyping();

    // Get AI response
    try {
      const response = await this.getAIResponse(text);
      this.hideTyping();

      // Check if AI wants to dispatch an alert
      const { cleanResponse, alertData } = this.parseAlertFromResponse(response);

      // Show the AI's message (without the [ALERT] tag)
      this.addMessage('ai', cleanResponse);
      this.conversationHistory.push({ role: 'assistant', content: cleanResponse });

      // If alert data was found, dispatch it
      if (alertData) {
        await this.dispatchAlert(alertData.type, alertData.room);
      }

    } catch (error) {
      console.error('AI Chat Error:', error);
      this.hideTyping();
      this.addMessage('ai', "I'm having trouble connecting right now. Please follow standard safety procedures: stay calm, move to safety, and call emergency services if needed. Help is on the way.");
    }
  }

  /**
   * Parse [ALERT:{"type":"...","room":"..."}] from AI response
   */
  parseAlertFromResponse(response) {
    const alertRegex = /\[ALERT:\s*(\{[^}]+\})\s*\]/i;
    const match = response.match(alertRegex);

    if (match) {
      try {
        const alertData = JSON.parse(match[1]);
        const type = alertData.type?.toUpperCase();
        const room = String(alertData.room).trim();

        // Validate
        if (VALID_TYPES.includes(type) && room) {
          const alertKey = `${type}-${room}`;

          // Check for duplicate
          if (this.alertsSent.includes(alertKey)) {
            console.log('Duplicate alert prevented:', alertKey);
            const cleanResponse = response.replace(alertRegex, '').trim();
            return { cleanResponse, alertData: null };
          }

          const cleanResponse = response.replace(alertRegex, '').trim();
          return { cleanResponse, alertData: { type, room } };
        }
      } catch (e) {
        console.warn('Failed to parse alert JSON from AI response:', e);
      }
    }

    return { cleanResponse: response, alertData: null };
  }

  /**
   * Dispatch an emergency alert to Firestore (appears on staff + admin panels)
   */
  async dispatchAlert(type, room) {
    try {
      // Ensure anonymous auth
      if (!auth.currentUser) {
        await signInAnonymously(auth);
      }

      // Submit to Firestore — same structure as sos.js
      const docRef = await addDoc(collection(db, 'alerts'), {
        roomNumber: room,
        emergencyType: type,
        status: 'OPEN',
        responderId: null,
        responderName: null,
        notes: 'Dispatched via AI Emergency Assistant',
        geminiSuggestion: null,
        createdAt: serverTimestamp(),
        resolvedAt: null
      });

      console.log('🚨 AI Chat dispatched alert:', docRef.id, type, room);

      // Track this alert
      this.alertsSent.push(`${type}-${room}`);

      // Update emergency context
      this.emergencyContext = { type, room };

      // Show alert confirmation card in chat
      this.addAlertCard(type, room, docRef.id);

      // Notify sos.js if callback is set
      if (this.onAlertSent) {
        this.onAlertSent(type, room, docRef.id);
      }

    } catch (error) {
      console.error('Failed to dispatch alert:', error);
      this.addMessage('ai', '⚠️ I tried to send the alert but encountered an error. Please use the **SOS button** on this page or call the front desk directly.');
    }
  }

  /**
   * Show a special alert confirmation card in chat
   */
  addAlertCard(type, room, alertId) {
    const welcome = this.messagesContainer.querySelector('.ai-chat-welcome');
    if (welcome) welcome.remove();

    const cardEl = document.createElement('div');
    cardEl.className = 'chat-alert-card';
    cardEl.innerHTML = `
      <div class="chat-alert-card-inner">
        <div class="chat-alert-icon">🚨</div>
        <div class="chat-alert-details">
          <div class="chat-alert-title">ALERT DISPATCHED</div>
          <div class="chat-alert-meta">
            <span class="chat-alert-type">${type}</span>
            <span class="chat-alert-room">ROOM ${room}</span>
          </div>
          <div class="chat-alert-status">Staff & Admin have been notified</div>
        </div>
      </div>
    `;

    this.messagesContainer.appendChild(cardEl);
    this.scrollToBottom();
  }

  /**
   * Call Gemini API for response
   */
  async getAIResponse(userMessage) {
    // Build messages array with system prompt
    const messages = [
      { role: 'system', content: this.buildSystemPrompt() },
      ...this.conversationHistory
    ];

    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GEMINI_API_KEY}`
      },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        messages: messages,
        max_tokens: 300,
        temperature: 0.3,
        stream: false
      })
    });

    if (!response.ok) {
      if (response.status === 429) {
        return "Our systems are very busy right now. Key safety advice: Stay calm, move away from danger, and dial emergency services. Help has already been dispatched to your room.";
      }
      throw new Error(`API Error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "Stay calm and follow the standard safety procedures. Help is on the way.";
  }

  /**
   * Build system prompt with emergency context
   */
  buildSystemPrompt() {
    let prompt = SYSTEM_PROMPT;
    if (this.emergencyContext) {
      prompt += `\n\nCURRENT EMERGENCY CONTEXT:\n- Type: ${this.emergencyContext.type}\n- Location: Room ${this.emergencyContext.room}\n- Status: Active — staff have been alerted and are responding\n- An alert has ALREADY been sent. Do NOT send another [ALERT] tag unless the user reports a completely NEW and DIFFERENT emergency.`;
    }
    if (this.alertsSent.length > 0) {
      prompt += `\n\nALERTS ALREADY DISPATCHED IN THIS SESSION: ${this.alertsSent.join(', ')}. Do NOT re-dispatch these.`;
    }
    return prompt;
  }

  /**
   * Add a message to the chat UI
   */
  addMessage(sender, text) {
    // Remove welcome message if present
    const welcome = this.messagesContainer.querySelector('.ai-chat-welcome');
    if (welcome) welcome.remove();

    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const msgEl = document.createElement('div');
    msgEl.className = `chat-msg ${sender}`;

    const avatar = sender === 'ai' ? '🤖' : '🚨';

    // Convert markdown bold to HTML
    const formattedText = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');

    msgEl.innerHTML = `
      <div class="chat-msg-avatar">${avatar}</div>
      <div>
        <div class="chat-msg-bubble">${formattedText}</div>
        <span class="chat-msg-time">${time}</span>
      </div>
    `;

    this.messagesContainer.appendChild(msgEl);
    this.scrollToBottom();
  }

  /**
   * Show typing indicator
   */
  showTyping() {
    this.isTyping = true;
    this.sendBtn.disabled = true;

    const typing = document.createElement('div');
    typing.className = 'ai-typing';
    typing.id = 'ai-typing-indicator';
    typing.innerHTML = `
      <div class="chat-msg-avatar">🤖</div>
      <div class="typing-dots">
        <span></span><span></span><span></span>
      </div>
    `;

    this.messagesContainer.appendChild(typing);
    this.scrollToBottom();
  }

  /**
   * Hide typing indicator
   */
  hideTyping() {
    this.isTyping = false;
    this.sendBtn.disabled = false;

    const typing = document.getElementById('ai-typing-indicator');
    if (typing) typing.remove();
  }

  /**
   * Scroll messages to bottom
   */
  scrollToBottom() {
    requestAnimationFrame(() => {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    });
  }
}

export { AIChatAssistant };
