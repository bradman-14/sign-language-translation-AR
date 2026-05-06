/* ──────────────────────────────────────────────────
   app.js  ·  ISL-AR Translation Presentation Demo
   ────────────────────────────────────────────────── */

'use strict';

// ── ISL Gesture Vocabulary ────────────────────────────────────────
const GESTURES = [
  { label: 'Hello',        emoji: '👋' },
  { label: 'Thank You',   emoji: '🙏' },
  { label: 'I Love You',  emoji: '🤟' },
  { label: 'Peace',        emoji: '✌️' },
  { label: 'Yes',          emoji: '✅' },
  { label: 'No',           emoji: '❌' },
  { label: 'Please',       emoji: '🤲' },
  { label: 'Help',         emoji: '🆘' },
  { label: 'Toilet',       emoji: '🚽' },
  { label: 'Call Me',      emoji: '📞' },
  { label: 'Perfect',      emoji: '👌' },
  { label: 'Water',        emoji: '💧' },
];

// ── State ─────────────────────────────────────────────────────────
let simInterval = null;
let sessionStart = null;
let totalPredictions = 0;
let confidenceSum = 0;
let history = [];
let freqMap = {};
let wakePhase = false;
let wakeTimer = null;

// ── DOM refs ──────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const btnSim      = $('btn-simulate');
const btnStopSim  = $('btn-stop-sim');
const logStream   = $('log-stream');
const bubbleText  = $('bubble-text');
const bubble      = document.querySelector('.translation-bubble');
const currentPred = $('current-pred');
const confFill    = $('confidence-fill');
const confPct     = $('confidence-pct');
const statTotal   = $('stat-total');
const statAvg     = $('stat-avg');
const statFreq    = $('stat-freq');
const statTime    = $('stat-time');
const histChips   = $('history-chips');
const modeInd     = $('mode-indicator');
const wakeBarCont = $('wake-bar-container');
const wakeProgFill= $('wake-progress-fill');

// ── Boot ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  buildGestureGrid();
  initParticleCanvas();
  drawGaugeArc(null);
  initSmoothScroll();
  initNavHighlight();
  btnSim.addEventListener('click', startSimulation);
  btnStopSim.addEventListener('click', stopSimulation);
  $('btn-clear-log').addEventListener('click', clearLog);
  startSkeletonAnimation();
});

// ── Gesture Grid ──────────────────────────────────────────────────
function buildGestureGrid() {
  const grid = $('gesture-grid');
  GESTURES.forEach(g => {
    const chip = document.createElement('div');
    chip.className = 'gesture-chip';
    chip.textContent = `${g.emoji} ${g.label}`;
    chip.title = `Inject: ${g.label}`;
    chip.addEventListener('click', () => injectPrediction(g.label, 0.95));
    grid.appendChild(chip);
  });
}



// ── Simulation ────────────────────────────────────────────────────
function startSimulation() {
  if (simInterval) return;
  if (!sessionStart) sessionStart = new Date();
  btnSim.disabled = true;
  btnStopSim.disabled = false;
  addLog('Simulation mode started', 'system');

  // Show wake gesture first
  triggerWakeAnimation(() => {
    // Then stream predictions
    simInterval = setInterval(() => {
      const g = GESTURES[Math.floor(Math.random() * GESTURES.length)];
      const conf = 0.78 + Math.random() * 0.20;
      handlePrediction(g.label, conf);
    }, 2800);
  });
}

function stopSimulation() {
  clearInterval(simInterval);
  simInterval = null;
  btnSim.disabled = false;
  btnStopSim.disabled = true;
  addLog('Simulation stopped', 'system');
  setStandbyMode();
}

// ── Wake Gesture Animation ────────────────────────────────────────
function triggerWakeAnimation(cb) {
  wakeBarCont.style.display = 'block';
  modeInd.textContent = '● WAKE DETECTED';
  let progress = 0;
  const tick = setInterval(() => {
    progress = Math.min(progress + 3, 100);
    wakeProgFill.style.width = progress + '%';
    if (progress >= 100) {
      clearInterval(tick);
      wakeBarCont.style.display = 'none';
      setActiveMode();
      addLog('System Active → Inference running', 'system');
      if (cb) cb();
    }
  }, 60);
}

function setActiveMode() {
  modeInd.textContent = '● ACTIVE INFERENCE';
  modeInd.className = 'mode-indicator active';
}

function setStandbyMode() {
  modeInd.textContent = '● STANDBY';
  modeInd.className = 'mode-indicator';
  wakeBarCont.style.display = 'none';
}

// ── Prediction Handler ────────────────────────────────────────────
function handlePrediction(text, confidence) {
  // AR bubble
  bubbleText.textContent = text;
  bubble.classList.remove('active');
  void bubble.offsetWidth; // reflow
  bubble.classList.add('active');

  // Sidebar
  currentPred.textContent = text;
  const pct = Math.round(confidence * 100);
  confFill.style.width = pct + '%';
  confPct.textContent = pct + '%';

  // Stats
  totalPredictions++;
  confidenceSum += confidence;
  if (!sessionStart) sessionStart = new Date();
  freqMap[text] = (freqMap[text] || 0) + 1;

  statTotal.textContent = totalPredictions;
  statAvg.textContent   = Math.round((confidenceSum / totalPredictions) * 100) + '%';
  statFreq.textContent  = Object.entries(freqMap).sort((a,b) => b[1]-a[1])[0][0];
  statTime.textContent  = formatDuration(sessionStart);

  // Gauge
  const latency = Math.floor(130 + Math.random() * 60);
  drawGaugeArc(latency);
  $('gauge-value').textContent = latency + 'ms';

  // History
  history.unshift({ text, confidence, time: new Date() });
  if (history.length > 10) history.pop();
  renderHistory();

  // Log
  addLog(`[${pct}%] ${text}`, 'prediction');
}

// ── History Chips ─────────────────────────────────────────────────
function renderHistory() {
  histChips.innerHTML = '';
  history.slice(0, 8).forEach(h => {
    const chip = document.createElement('div');
    chip.className = 'history-chip';
    chip.textContent = h.text;
    histChips.appendChild(chip);
  });
}

// ── Inject Prediction (from gesture grid click) ───────────────────
function injectPrediction(text, conf) {
  if (modeInd.className.includes('active')) {
    handlePrediction(text, conf);
  } else {
    triggerWakeAnimation(() => handlePrediction(text, conf));
  }
}

// ── Log ───────────────────────────────────────────────────────────
function addLog(msg, type = 'system') {
  const now = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;
  entry.innerHTML = `<span class="log-time">${now}</span>${msg}`;
  logStream.appendChild(entry);
  logStream.scrollTop = logStream.scrollHeight;
}

function clearLog() {
  logStream.innerHTML = '';
}

// ── Gauge Arc ─────────────────────────────────────────────────────
function drawGaugeArc(value) {
  const canvas = $('gauge-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 180, 100);

  const cx = 90, cy = 90, r = 70;
  const startAngle = Math.PI;
  const endAngle   = 0;

  // Track
  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, endAngle);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.stroke();

  if (value !== null) {
    const target = 200;
    const pct    = Math.min(value / target, 1);
    const angle  = Math.PI + pct * Math.PI;
    const color  = value < 150 ? '#00d4aa' : value < 180 ? '#ffd166' : '#ff6b6b';
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, angle);
    ctx.strokeStyle = color;
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

// ── Skeleton Canvas Animation ─────────────────────────────────────
function startSkeletonAnimation() {
  const canvas = $('skeleton-canvas');
  if (!canvas) return;
  const ctx  = canvas.getContext('2d');
  let  frame = 0;

  const joints = {
    // Simplified pose joints [x%, y%]
    nose:   [50, 18],
    lShoulder: [35, 32], rShoulder: [65, 32],
    lElbow:[25, 50],    rElbow:[75, 50],
    lWrist:[18, 68],    rWrist:[82, 68],
    lHip: [38, 62],    rHip: [62, 62],
  };

  const connections = [
    ['lShoulder','rShoulder'],['lShoulder','lElbow'],['lElbow','lWrist'],
    ['rShoulder','rElbow'],['rElbow','rWrist'],
    ['lShoulder','lHip'],['rShoulder','rHip'],['lHip','rHip'],
    ['nose','lShoulder'],['nose','rShoulder'],
  ];

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    frame++;

    const w = canvas.width, h = canvas.height;
    const wobble = (key, t) => {
      const [bx, by] = joints[key];
      const dx = Math.sin(t * 0.02 + bx) * 1.5;
      const dy = Math.cos(t * 0.018 + by) * 1.5;
      return [(bx + dx) / 100 * w, (by + dy) / 100 * h];
    };

    const pts = {};
    Object.keys(joints).forEach(k => pts[k] = wobble(k, frame));

    // Connections
    ctx.strokeStyle = 'rgba(108,99,255,0.5)';
    ctx.lineWidth = 1.5;
    connections.forEach(([a, b]) => {
      ctx.beginPath();
      ctx.moveTo(...pts[a]);
      ctx.lineTo(...pts[b]);
      ctx.stroke();
    });

    // Joints
    Object.values(pts).forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,212,170,0.8)';
      ctx.fill();
    });

    // Wrist hand landmarks (simplified)
    ['lWrist','rWrist'].forEach(k => {
      const [wx, wy] = pts[k];
      for (let f = 0; f < 5; f++) {
        const angle  = -Math.PI/2 + (f - 2) * 0.3;
        const len    = 18 + Math.sin(frame * 0.05 + f) * 4;
        const tip    = [wx + Math.cos(angle)*len, wy + Math.sin(angle)*len];
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.lineTo(...tip);
        ctx.strokeStyle = 'rgba(245,117,66,0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(...tip, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(245,117,66,0.8)';
        ctx.fill();
      }
    });

    requestAnimationFrame(draw);
  }
  draw();
}

// ── Particle Canvas ───────────────────────────────────────────────
function initParticleCanvas() {
  const canvas = $('particle-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W = canvas.width  = canvas.offsetWidth;
  let H = canvas.height = canvas.offsetHeight;

  window.addEventListener('resize', () => {
    W = canvas.width  = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
  });

  const particles = Array.from({length: 80}, () => ({
    x: Math.random() * W, y: Math.random() * H,
    r: Math.random() * 1.5 + 0.3,
    dx: (Math.random() - 0.5) * 0.3, dy: (Math.random() - 0.5) * 0.3,
    opacity: Math.random() * 0.5 + 0.1,
  }));

  (function animate() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => {
      p.x += p.dx; p.y += p.dy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(108,99,255,${p.opacity})`;
      ctx.fill();
    });
    requestAnimationFrame(animate);
  })();
}

// ── Nav Highlight ─────────────────────────────────────────────────
function initNavHighlight() {
  const sections = document.querySelectorAll('.section');
  const links    = document.querySelectorAll('.nav-link');
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        links.forEach(l => l.classList.remove('active'));
        const active = document.querySelector(`.nav-link[data-section="${e.target.id}"]`);
        if (active) active.classList.add('active');
      }
    });
  }, { threshold: 0.4 });
  sections.forEach(s => obs.observe(s));
}

// ── Smooth Scroll ─────────────────────────────────────────────────
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const target = document.querySelector(a.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
  });
}

// ── Utils ─────────────────────────────────────────────────────────
function formatDuration(start) {
  if (!start) return '—';
  const diff = Math.floor((Date.now() - start) / 1000);
  const m = Math.floor(diff / 60).toString().padStart(2,'0');
  const s = (diff % 60).toString().padStart(2,'0');
  return `${m}:${s}`;
}

// ── Exports for camera.js ─────────────────────────────────────────
window.addLog = addLog;
window.setStandbyMode = setStandbyMode;
window.setActiveMode = setActiveMode;
window.triggerWakeAnimation = triggerWakeAnimation;
window.handlePrediction = handlePrediction;
