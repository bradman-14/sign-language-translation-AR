import cv2
import numpy as np
import mediapipe as mp
import time
import math
import socket
from model import build_lstm_model
from data_extraction import normalize_keypoints

# Constants
actions = np.array(['hello', 'thanks', 'iloveyou'])
sequence_length = 30
num_features = 1662

# Networking Setup (UDP to Unity)
UDP_IP = "127.0.0.1" # Send to local Unity app (or mobile IP if deployed)
UDP_PORT = 5052
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

def send_prediction(text):
    sock.sendto(text.encode(), (UDP_IP, UDP_PORT))

def check_wake_gesture(results):
    """
    Heuristic mathematical model to activate LSTM.
    Checks Euclidean distance between Wrist (Node 0) and Index Fingertip (Node 8).
    """
    if results.right_hand_landmarks:
        landmarks = results.right_hand_landmarks.landmark
        wrist = landmarks[0]
        index_tip = landmarks[8]
        dist = math.sqrt((wrist.x - index_tip.x)**2 + (wrist.y - index_tip.y)**2)
        
        # If hand is raised / specific distance maintained
        if dist > 0.3:  # Threshold value
            return True
    return False

def live_inference():
    # Load Model
    model = build_lstm_model(sequence_length, num_features, len(actions))
    try:
        model.load_weights('../models/action.h5')
    except:
        print("Warning: Model weights not found. Using untrained weights for demonstration.")

    # MediaPipe setup
    mp_holistic = mp.solutions.holistic
    cap = cv2.VideoCapture(0)

    sequence = []
    predictions = []
    threshold = 0.8
    
    active_inference = False
    wake_start_time = None

    with mp_holistic.Holistic(min_detection_confidence=0.5, min_tracking_confidence=0.5) as holistic:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret: break

            # Image processing
            image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            image.flags.writeable = False
            results = holistic.process(image)
            image.flags.writeable = True
            image = cv2.cvtColor(image, cv2.RGB2BGR)
            
            # --- WAKE GESTURE LOGIC ---
            if not active_inference:
                if check_wake_gesture(results):
                    if wake_start_time is None:
                        wake_start_time = time.time()
                    elif time.time() - wake_start_time > 2.0: # Hold for 2 seconds
                        active_inference = True
                        print("System Active: Tracking Started")
                        send_prediction("[System Active]")
                else:
                    wake_start_time = None
            
            # --- LSTM INFERENCE LOGIC ---
            if active_inference:
                keypoints = normalize_keypoints(results)
                sequence.append(keypoints)
                sequence = sequence[-sequence_length:]
                
                # Predict every 5 frames (Stride)
                if len(sequence) == sequence_length and len(sequence) % 5 == 0:
                    res = model.predict(np.expand_dims(sequence, axis=0))[0]
                    predictions.append(np.argmax(res))
                    
                    if np.unique(predictions[-10:])[0] == np.argmax(res): 
                        if res[np.argmax(res)] > threshold:
                            predicted_text = actions[np.argmax(res)]
                            print(f"Prediction: {predicted_text}")
                            send_prediction(predicted_text)

            cv2.imshow('OpenCV Feed', image)
            if cv2.waitKey(10) & 0xFF == ord('q'):
                break
                
        cap.release()
        cv2.destroyAllWindows()

if __name__ == "__main__":
    live_inference()
