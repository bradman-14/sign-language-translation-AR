"""
inference.py
------------
Real-time ISL inference with:
  1. Heuristic Wake-Gesture activation to prevent thermal throttling.
  2. LSTM-based gesture classification with a 30-frame sliding window.
  3. UDP broadcast of predictions to the Unity AR layer (port 5052).
  4. WebSocket broadcast of predictions to the Web Demo UI (port 8765).
"""

import cv2
import numpy as np
import mediapipe as mp
import time
import math
import socket
import asyncio
import threading
import json
import websockets

from model import build_lstm_model
from data_extraction import normalize_keypoints, mediapipe_detection

# ── Constants ──────────────────────────────────────────────────────────────────
ACTIONS         = np.array(["Hello", "Thank You", "I Love You", "Yes", "No",
                             "Please", "Help", "Good Morning", "Sorry", "Water"])
SEQUENCE_LENGTH = 30
NUM_FEATURES    = 1662
THRESHOLD       = 0.80
STRIDE          = 5          # Run LSTM every N frames (166 ms at 30 FPS)
WAKE_HOLD_SECS  = 2.0        # Seconds the wake-gesture must be held
WAKE_DIST_TH    = 0.30       # Euclidean threshold for wake detection

# ── UDP (Unity AR) ─────────────────────────────────────────────────────────────
UDP_IP   = "127.0.0.1"
UDP_PORT = 5052
udp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

# ── WebSocket (Web Demo) ───────────────────────────────────────────────────────
WS_PORT = 8765
ws_clients: set = set()

def send_udp(text: str):
    """Sends prediction string to Unity via UDP."""
    try:
        udp_sock.sendto(text.encode("utf-8"), (UDP_IP, UDP_PORT))
    except Exception as e:
        print(f"[UDP] Send error: {e}")

def broadcast_ws(payload: dict):
    """Non-blocking broadcast of a JSON payload to all WebSocket clients."""
    if not ws_clients:
        return
    message = json.dumps(payload)
    # Schedule coroutine on the event loop thread
    asyncio.run_coroutine_threadsafe(_broadcast_coro(message), ws_loop)

async def _broadcast_coro(message: str):
    disconnected = set()
    for ws in ws_clients:
        try:
            await ws.send(message)
        except websockets.exceptions.ConnectionClosed:
            disconnected.add(ws)
    ws_clients.difference_update(disconnected)

async def ws_handler(websocket, path=None):
    """Registers/deregisters WebSocket client connections."""
    ws_clients.add(websocket)
    print(f"[WS] Client connected: {websocket.remote_address}")
    try:
        await websocket.wait_closed()
    finally:
        ws_clients.discard(websocket)
        print(f"[WS] Client disconnected.")

def start_ws_server():
    """Runs the asyncio event loop + WebSocket server in a background thread."""
    global ws_loop
    ws_loop = asyncio.new_event_loop()
    asyncio.set_event_loop(ws_loop)
    server = websockets.serve(ws_handler, "0.0.0.0", WS_PORT)
    ws_loop.run_until_complete(server)
    print(f"[WS] WebSocket server running on ws://localhost:{WS_PORT}")
    ws_loop.run_forever()


# ── Wake-Gesture Heuristic ─────────────────────────────────────────────────────
def check_wake_gesture(results) -> bool:
    """
    Returns True if the Euclidean distance between Wrist (Node 0) and
    Index Fingertip (Node 8) of the right hand exceeds WAKE_DIST_TH.
    This heuristic detects a raised/open hand without running the heavy LSTM.
    """
    if not results.right_hand_landmarks:
        return False
    lm = results.right_hand_landmarks.landmark
    wrist = lm[0]
    index_tip = lm[8]
    dist = math.sqrt((wrist.x - index_tip.x) ** 2 + (wrist.y - index_tip.y) ** 2)
    return dist > WAKE_DIST_TH


# ── Drawing Helpers ────────────────────────────────────────────────────────────
def draw_landmarks(image, results):
    """Draws MediaPipe skeletal overlay on frame."""
    mp_drawing = mp.solutions.drawing_utils
    mp_holistic = mp.solutions.holistic
    mp_drawing.draw_landmarks(image, results.face_landmarks,
                              mp_holistic.FACEMESH_CONTOURS,
                              mp_drawing.DrawingSpec(color=(80, 110, 10), thickness=1, circle_radius=1),
                              mp_drawing.DrawingSpec(color=(80, 256, 121), thickness=1, circle_radius=1))
    mp_drawing.draw_landmarks(image, results.pose_landmarks,
                              mp_holistic.POSE_CONNECTIONS,
                              mp_drawing.DrawingSpec(color=(80, 22, 10), thickness=2, circle_radius=4),
                              mp_drawing.DrawingSpec(color=(80, 44, 121), thickness=2, circle_radius=2))
    mp_drawing.draw_landmarks(image, results.left_hand_landmarks,
                              mp_holistic.HAND_CONNECTIONS,
                              mp_drawing.DrawingSpec(color=(121, 22, 76), thickness=2, circle_radius=4),
                              mp_drawing.DrawingSpec(color=(121, 44, 250), thickness=2, circle_radius=2))
    mp_drawing.draw_landmarks(image, results.right_hand_landmarks,
                              mp_holistic.HAND_CONNECTIONS,
                              mp_drawing.DrawingSpec(color=(245, 117, 66), thickness=2, circle_radius=4),
                              mp_drawing.DrawingSpec(color=(245, 66, 230), thickness=2, circle_radius=2))


def draw_status_bar(image, active_inference, prediction, confidence, wake_progress):
    """Renders a heads-up status bar onto the OpenCV frame."""
    h, w, _ = image.shape
    # Semi-transparent bar
    overlay = image.copy()
    cv2.rectangle(overlay, (0, 0), (w, 60), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.6, image, 0.4, 0, image)

    mode_text = "ACTIVE INFERENCE" if active_inference else "STANDBY - Raise Hand"
    mode_color = (0, 255, 80) if active_inference else (0, 200, 255)
    cv2.putText(image, mode_text, (10, 22),
                cv2.FONT_HERSHEY_SIMPLEX, 0.65, mode_color, 2)

    if not active_inference and wake_progress > 0:
        pct = int(wake_progress * w)
        cv2.rectangle(image, (0, 50), (pct, 60), (0, 220, 255), -1)

    if prediction:
        label = f"{prediction}  ({confidence*100:.1f}%)"
        cv2.putText(image, label, (10, 50),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.70, (255, 255, 255), 2)


# ── Main Inference Loop ────────────────────────────────────────────────────────
def live_inference():
    # Start WebSocket server in background thread
    ws_thread = threading.Thread(target=start_ws_server, daemon=True)
    ws_thread.start()
    time.sleep(0.5)  # Let event loop initialize

    # Load model
    model = build_lstm_model(SEQUENCE_LENGTH, NUM_FEATURES, len(ACTIONS))
    try:
        model.load_weights("../models/action.h5")
        print("[INFO] Loaded trained model weights.")
    except Exception:
        print("[WARNING] Model weights not found. Using untrained weights for demo.")

    mp_holistic = mp.solutions.holistic
    cap = cv2.VideoCapture(0)

    if not cap.isOpened():
        print("[ERROR] Cannot open camera.")
        return

    sequence        = []
    predictions     = []
    last_prediction = ""
    last_confidence = 0.0
    active_inference = False
    wake_start_time  = None
    frame_counter    = 0

    with mp_holistic.Holistic(
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    ) as holistic:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            frame_counter += 1
            image, results = mediapipe_detection(frame, holistic)
            draw_landmarks(image, results)

            # ── Wake Gesture State Machine ──────────────────────────────
            if not active_inference:
                wake_progress = 0.0
                if check_wake_gesture(results):
                    if wake_start_time is None:
                        wake_start_time = time.time()
                    elapsed = time.time() - wake_start_time
                    wake_progress = min(elapsed / WAKE_HOLD_SECS, 1.0)
                    if elapsed >= WAKE_HOLD_SECS:
                        active_inference = True
                        print("[INFO] Wake gesture detected → Active Inference ON")
                        send_udp("[System Active]")
                        broadcast_ws({"event": "wake", "message": "System Active"})
                else:
                    wake_start_time = None
            else:
                wake_progress = 1.0

            # ── LSTM Inference ─────────────────────────────────────────
            if active_inference:
                keypoints = normalize_keypoints(results)
                sequence.append(keypoints)
                sequence = sequence[-SEQUENCE_LENGTH:]

                # Run LSTM every STRIDE frames once buffer is full
                if len(sequence) == SEQUENCE_LENGTH and frame_counter % STRIDE == 0:
                    input_seq = np.expand_dims(np.array(sequence), axis=0)
                    res = model.predict(input_seq, verbose=0)[0]
                    predicted_idx = int(np.argmax(res))
                    predictions.append(predicted_idx)
                    predictions = predictions[-10:]  # Keep last 10 only

                    # Confirm only when majority of last predictions agree
                    if (len(predictions) == 10 and
                            np.unique(predictions[-10:]).size == 1 and
                            res[predicted_idx] > THRESHOLD):
                        last_prediction = ACTIONS[predicted_idx]
                        last_confidence = float(res[predicted_idx])
                        print(f"[PREDICTION] {last_prediction}  ({last_confidence*100:.1f}%)")
                        send_udp(last_prediction)
                        broadcast_ws({
                            "event": "prediction",
                            "text": last_prediction,
                            "confidence": round(last_confidence, 4),
                            "timestamp": time.time()
                        })

            # ── HUD Overlay ────────────────────────────────────────────
            draw_status_bar(image, active_inference, last_prediction,
                            last_confidence, wake_progress)

            cv2.imshow("ISL-AR Translation — MediaPipe Feed", image)
            if cv2.waitKey(10) & 0xFF == ord("q"):
                break

    cap.release()
    cv2.destroyAllWindows()
    udp_sock.close()


if __name__ == "__main__":
    live_inference()
