export function initUI() {
  initSpotlight();
  initClock();
}

// 1. Interactive Glass Spotlight
function initSpotlight() {
  document.addEventListener('mousemove', (e) => {
    const target = e.target.closest('button, .alert-card');
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    target.style.setProperty('--spotlight-x', `${x}px`);
    target.style.setProperty('--spotlight-y', `${y}px`);
  });
}

// 2. Live Command Center Clock
function initClock() {
  const clockElements = document.querySelectorAll('.sys-clock');
  if (clockElements.length === 0) return;

  function updateClock() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { hour12: false });
    const ms = String(now.getMilliseconds()).padStart(3, '0').substring(0, 2);

    clockElements.forEach(el => {
      el.textContent = `SYS.TIME: ${timeString}:${ms} LOC`;
    });
    requestAnimationFrame(updateClock);
  }
  updateClock();
}

// 4. 3D Parallax Tilt (Exported for dynamic elements)
export function makeTiltable(element) {
  element.addEventListener('mousemove', (e) => {
    const rect = element.getBoundingClientRect();
    const x = e.clientX - rect.left; // x position within the element.
    const y = e.clientY - rect.top;  // y position within the element.

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -6; // Max rotation 10deg
    const rotateY = ((x - centerX) / centerX) * 6;

    element.style.transition = 'none';
    element.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02) translateY(-4px)`;
  });

  element.addEventListener('mouseleave', () => {
    element.style.transition = 'transform 0.9s ease-out';
    element.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1) translateY(0)';
  });
}

// 5. Text Scramble Effect
export class TextScrambler {
  constructor(el) {
    this.el = el;
    this.chars = '!<>-_\\\\/[]{}—=+*^?#________';
    this.update = this.update.bind(this);
  }

  setText(newText) {
    const oldText = this.el.innerText;
    const length = Math.max(oldText.length, newText.length);
    const promise = new Promise((resolve) => this.resolve = resolve);
    this.queue = [];
    for (let i = 0; i < length; i++) {
      const from = oldText[i] || '';
      const to = newText[i] || '';
      const start = Math.floor(Math.random() * 40);
      const end = start + Math.floor(Math.random() * 40);
      this.queue.push({ from, to, start, end });
    }
    cancelAnimationFrame(this.frameRequest);
    this.frame = 0;
    this.update();
    return promise;
  }

  update() {
    let output = '';
    let complete = 0;
    for (let i = 0, n = this.queue.length; i < n; i++) {
      let { from, to, start, end, char } = this.queue[i];
      if (this.frame >= end) {
        complete++;
        output += to;
      } else if (this.frame >= start) {
        if (!char || Math.random() < 0.28) {
          char = this.randomChar();
          this.queue[i].char = char;
        }
        output += `<span class="scramble-char">${char}</span>`;
      } else {
        output += from;
      }
    }
    this.el.innerHTML = output;
    if (complete === this.queue.length) {
      this.resolve();
    } else {
      this.frameRequest = requestAnimationFrame(this.update);
      this.frame++;
    }
  }

  randomChar() {
    return this.chars[Math.floor(Math.random() * this.chars.length)];
  }
}

/**
 * Custom Cinematic Notification System (Toasts)
 * Replaces generic browser alert() boxes
 */
export function showNotification(message, type = 'info') {
  const container = document.getElementById('toast-container') || createToastContainer();
  
  const toast = document.createElement('div');
  toast.className = `toast glass toast-${type}`;
  
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : '✦';
  
  toast.innerHTML = `
    <div class="toast-content">
      <span class="toast-icon">${icon}</span>
      <span class="toast-message">${message}</span>
    </div>
    <div class="toast-progress"></div>
  `;
  
  container.appendChild(toast);
  
  // Animation: slide in
  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });
  
  // Auto-remove after 4s
  setTimeout(() => {
    toast.classList.remove('visible');
    toast.classList.add('exit');
    setTimeout(() => toast.remove(), 500);
  }, 4000);
}

function createToastContainer() {
  const container = document.createElement('div');
  container.id = 'toast-container';
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}
