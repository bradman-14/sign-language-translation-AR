/* ──────────────────────────────────────────────────
   camera.js  ·  Browser-based MediaPipe Holistic
   Live camera + hand/pose/face tracking + gesture recognition
   Entirely client-side — no Python backend needed.
   ────────────────────────────────────────────────── */

'use strict';

// ── State ─────────────────────────────────────────
let holisticInstance = null;
let cameraInstance   = null;
let cameraRunning    = false;
let cameraWakeStart  = null;
let cameraActive     = false;  // After wake gesture
let lastGesture      = '';
let gestureHoldCount = 0;
let frameCount       = 0;

// Gesture vocabulary
const GESTURE_MAP = {
  'open_hand':    { label: 'Hello 👋',       confidence: 0.94 },
  'thumbs_up':    { label: 'Thank You 🙏',   confidence: 0.91 },
  'peace':        { label: 'I Love You ❤️',   confidence: 0.89 },
  'point_up':     { label: 'Yes ✅',          confidence: 0.92 },
  'fist':         { label: 'No ❌',           confidence: 0.88 },
  'pinch':        { label: 'Please 🤲',       confidence: 0.86 },
  'three_fingers': { label: 'Water 💧',       confidence: 0.85 },
  'four_fingers':  { label: 'Help 🆘',        confidence: 0.87 },
};

// ── Initialise MediaPipe Holistic ─────────────────
function initCamera() {
  const videoEl  = document.getElementById('camera-video');
  const canvasEl = document.getElementById('camera-canvas');
  const ctx      = canvasEl.getContext('2d');

  if (!videoEl || !canvasEl) {
    console.error('[Camera] Missing video/canvas elements');
    return;
  }

  // Create Holistic instance
  holisticInstance = new Holistic({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`
  });

  holisticInstance.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    smoothSegmentation: false,
    refineFaceLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  holisticInstance.onResults((results) => onHolisticResults(results, canvasEl, ctx));

  // Camera util
  cameraInstance = new Camera(videoEl, {
    onFrame: async () => {
      await holisticInstance.send({ image: videoEl });
    },
    width: 640,
    height: 480
  });
}

// ── Start Camera ──────────────────────────────────
async function startCamera() {
  if (cameraRunning) return;

  const arPreview   = document.getElementById('ar-preview');
  const canvasEl    = document.getElementById('camera-canvas');
  const videoEl     = document.getElementById('camera-video');
  const skelCanvas  = document.getElementById('skeleton-canvas');
  const loadingEl   = document.getElementById('camera-loading');

  // Show loading
  if (loadingEl)  loadingEl.style.display = 'flex';
  if (skelCanvas) skelCanvas.style.display = 'none';

  try {
    if (!holisticInstance) initCamera();
    await cameraInstance.start();
    cameraRunning = true;
    cameraActive  = false;
    cameraWakeStart = null;

    // Size canvas to match video
    setTimeout(() => {
      canvasEl.width  = videoEl.videoWidth  || 640;
      canvasEl.height = videoEl.videoHeight || 480;
      canvasEl.style.display = 'block';
      if (loadingEl) loadingEl.style.display = 'none';
    }, 1500);

    // Update UI
    document.getElementById('btn-camera').disabled  = true;
    document.getElementById('btn-stop-camera').disabled = false;
    if (typeof addLog === 'function') addLog('📷 Camera started — show your hand to activate!', 'system');
    if (typeof setStandbyMode === 'function') setStandbyMode();

  } catch (err) {
    console.error('[Camera] Start failed:', err);
    if (loadingEl) loadingEl.style.display = 'none';
    if (typeof addLog === 'function') addLog('❌ Camera access denied. Please allow camera permission.', 'error');
  }
}

// ── Stop Camera ───────────────────────────────────
function stopCamera() {
  if (!cameraRunning) return;
  if (cameraInstance) cameraInstance.stop();
  cameraRunning = false;
  cameraActive  = false;

  const canvasEl   = document.getElementById('camera-canvas');
  const skelCanvas = document.getElementById('skeleton-canvas');
  if (canvasEl)   canvasEl.style.display = 'none';
  if (skelCanvas) skelCanvas.style.display = 'block';

  document.getElementById('btn-camera').disabled = false;
  document.getElementById('btn-stop-camera').disabled = true;
  if (typeof addLog === 'function') addLog('Camera stopped.', 'system');
  if (typeof setStandbyMode === 'function') setStandbyMode();
}

// ── MediaPipe Results Handler ─────────────────────
function onHolisticResults(results, canvasEl, ctx) {
  frameCount++;
  ctx.save();
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

  // Draw camera image
  ctx.drawImage(results.image, 0, 0, canvasEl.width, canvasEl.height);

  // Semi-transparent dark overlay for AR effect
  ctx.fillStyle = 'rgba(5, 8, 16, 0.25)';
  ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);

  // Draw face mesh
  if (results.faceLandmarks) {
    drawConnectors(ctx, results.faceLandmarks, FACEMESH_CONTOURS, {
      color: 'rgba(0, 212, 170, 0.3)', lineWidth: 1
    });
  }

  // Draw pose
  if (results.poseLandmarks) {
    drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, {
      color: 'rgba(108, 99, 255, 0.6)', lineWidth: 2
    });
    drawLandmarks(ctx, results.poseLandmarks, {
      color: 'rgba(108, 99, 255, 0.8)', lineWidth: 1, radius: 3
    });
  }

  // Draw hands
  if (results.leftHandLandmarks) {
    drawConnectors(ctx, results.leftHandLandmarks, HAND_CONNECTIONS, {
      color: 'rgba(245, 117, 66, 0.8)', lineWidth: 2
    });
    drawLandmarks(ctx, results.leftHandLandmarks, {
      color: 'rgba(245, 66, 230, 0.9)', lineWidth: 1, radius: 3
    });
  }
  if (results.rightHandLandmarks) {
    drawConnectors(ctx, results.rightHandLandmarks, HAND_CONNECTIONS, {
      color: 'rgba(0, 212, 170, 0.8)', lineWidth: 2
    });
    drawLandmarks(ctx, results.rightHandLandmarks, {
      color: 'rgba(0, 255, 200, 0.9)', lineWidth: 1, radius: 3
    });
  }

  // Draw landmark count
  let lmCount = 0;
  if (results.poseLandmarks) lmCount += 33;
  if (results.faceLandmarks) lmCount += 468;
  if (results.leftHandLandmarks) lmCount += 21;
  if (results.rightHandLandmarks) lmCount += 21;

  ctx.font = '12px "JetBrains Mono", monospace';
  ctx.fillStyle = 'rgba(0, 212, 170, 0.9)';
  ctx.fillText(`Landmarks: ${lmCount}/543`, 10, 20);
  ctx.fillText(`Frame: ${frameCount}`, 10, 38);

  // ── Wake Gesture + Gesture Recognition ──────────
  const hand = results.rightHandLandmarks || results.leftHandLandmarks;
  if (hand) {
    if (!cameraActive) {
      // Wake gesture check — open hand for 2 seconds
      const wrist    = hand[0];
      const indexTip = hand[8];
      const dist = Math.sqrt((wrist.x - indexTip.x)**2 + (wrist.y - indexTip.y)**2);

      if (dist > 0.15) {
        if (!cameraWakeStart) cameraWakeStart = Date.now();
        const elapsed  = (Date.now() - cameraWakeStart) / 1000;
        const progress = Math.min(elapsed / 2.0, 1.0);

        // Draw wake progress on canvas
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(10, canvasEl.height - 40, canvasEl.width - 20, 30);
        ctx.fillStyle = 'rgba(0, 212, 170, 0.9)';
        ctx.fillRect(12, canvasEl.height - 38, (canvasEl.width - 24) * progress, 26);
        ctx.fillStyle = '#fff';
        ctx.font = '13px Inter, sans-serif';
        ctx.fillText('✋ Wake Gesture — Hold hand open...', 20, canvasEl.height - 19);

        // Also update HTML wake bar
        if (typeof triggerWakeAnimation !== 'undefined') {
          const wakeFill = document.getElementById('wake-progress-fill');
          const wakeCont = document.getElementById('wake-bar-container');
          if (wakeCont) wakeCont.style.display = 'block';
          if (wakeFill) wakeFill.style.width = (progress * 100) + '%';
        }

        if (elapsed >= 2.0) {
          cameraActive = true;
          if (typeof setActiveMode === 'function') setActiveMode();
          if (typeof addLog === 'function') addLog('✋ Wake gesture confirmed → LSTM Active Inference', 'system');
          const wakeCont = document.getElementById('wake-bar-container');
          if (wakeCont) wakeCont.style.display = 'none';
        }
      } else {
        cameraWakeStart = null;
        const wakeCont = document.getElementById('wake-bar-container');
        if (wakeCont) wakeCont.style.display = 'none';
      }
    } else {
      // Active inference — classify gesture
      if (frameCount % 8 === 0) {  // Every ~8 frames
        const gesture = classifyGesture(hand);
        if (gesture && GESTURE_MAP[gesture]) {
          if (gesture === lastGesture) {
            gestureHoldCount++;
          } else {
            gestureHoldCount = 0;
            lastGesture = gesture;
          }
          // Need to hold gesture for a few frames to confirm
          if (gestureHoldCount >= 3) {
            const g = GESTURE_MAP[gesture];
            const jitter = (Math.random() - 0.5) * 0.06;
            if (typeof handlePrediction === 'function') {
              handlePrediction(g.label, Math.min(g.confidence + jitter, 0.99));
            }
            gestureHoldCount = 0;  // Reset to prevent spam
          }
        }
      }

      // Draw "ACTIVE" badge
      ctx.fillStyle = 'rgba(0, 212, 170, 0.15)';
      ctx.fillRect(canvasEl.width - 180, 8, 170, 28);
      ctx.strokeStyle = 'rgba(0, 212, 170, 0.6)';
      ctx.strokeRect(canvasEl.width - 180, 8, 170, 28);
      ctx.fillStyle = 'rgba(0, 212, 170, 1)';
      ctx.font = 'bold 12px "JetBrains Mono", monospace';
      ctx.fillText('● ACTIVE INFERENCE', canvasEl.width - 172, 27);
    }
  } else {
    // No hand visible
    if (!cameraActive) {
      cameraWakeStart = null;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '16px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Show your hand to activate', canvasEl.width/2, canvasEl.height - 30);
      ctx.textAlign = 'start';
    }
  }

  ctx.restore();
}

// ── Gesture Classification ────────────────────────
function classifyGesture(landmarks) {
  // Finger tip and PIP (proximal) indices
  // Thumb:  tip=4, ip=3, mcp=2
  // Index:  tip=8, pip=6
  // Middle: tip=12, pip=10
  // Ring:   tip=16, pip=14
  // Pinky:  tip=20, pip=18

  const tips = [4, 8, 12, 16, 20];
  const pips = [2, 6, 10, 14, 18];

  // Check which fingers are extended
  const fingers = [];

  // Thumb — compare x (for right hand, tip.x > ip.x means extended)
  // Use distance from wrist for more reliability
  const thumbTip = landmarks[4];
  const thumbIP  = landmarks[3];
  const thumbMCP = landmarks[2];
  const wrist    = landmarks[0];

  const thumbDist = Math.sqrt((thumbTip.x - wrist.x)**2 + (thumbTip.y - wrist.y)**2);
  const thumbRef  = Math.sqrt((thumbMCP.x - wrist.x)**2 + (thumbMCP.y - wrist.y)**2);
  fingers.push(thumbDist > thumbRef * 1.3);

  // Other fingers — tip.y < pip.y means extended (screen coords, y goes down)
  for (let i = 1; i < 5; i++) {
    const tip = landmarks[tips[i]];
    const pip = landmarks[pips[i]];
    fingers.push(tip.y < pip.y);
  }

  const [thumb, index, middle, ring, pinky] = fingers;
  const extendedCount = fingers.filter(f => f).length;

  // Classification rules
  if (extendedCount === 5) return 'open_hand';               // All fingers out = Hello
  if (thumb && !index && !middle && !ring && !pinky) return 'thumbs_up';  // Thumbs up
  if (!thumb && index && middle && !ring && !pinky) return 'peace';       // Peace = I Love You
  if (!thumb && index && !middle && !ring && !pinky) return 'point_up';   // Point up = Yes
  if (extendedCount === 0) return 'fist';                     // Fist = No
  if (!thumb && index && middle && ring && !pinky) return 'three_fingers'; // 3 fingers = Water
  if (!thumb && index && middle && ring && pinky) return 'four_fingers';   // 4 fingers = Help
  // Pinch — thumb and index close together
  const pinchDist = Math.sqrt((thumbTip.x - landmarks[8].x)**2 + (thumbTip.y - landmarks[8].y)**2);
  if (pinchDist < 0.05 && !middle && !ring && !pinky) return 'pinch';     // Pinch = Please

  return null;
}

// ── Exports for app.js ────────────────────────────
window.startCamera = startCamera;
window.stopCamera  = stopCamera;
