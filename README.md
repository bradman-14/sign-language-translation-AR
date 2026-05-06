# Bridging the Communication Divide: Real-Time ISL Translation System with AR

![License](https://img.shields.io/badge/license-MIT-blue)
![Platform](https://img.shields.io/badge/Platform-Android%20%7C%20iOS-lightgrey)
![Framework](https://img.shields.io/badge/Framework-MediaPipe%20%7C%20TensorFlow%20%7C%20Unity-orange)

## 📌 Project Overview
This project presents a novel, hands-free Augmented Reality (AR) translation system for Indian Sign Language (ISL). By shifting the translation interface into a depth-aware AR environment, the system allows Deaf and Hard-of-Hearing (DHH) individuals to maintain natural eye contact during communication, entirely removing the split-attention effect caused by traditional 2D mobile applications.

The pipeline captures 543 spatiotemporal landmarks (manual and non-manual facial markers) using the **MediaPipe Holistic** framework, processes them through an optimized **Long Short-Term Memory (LSTM)** network with a 30-frame context window, and dynamically anchors the translated text in 3D space near the speaker using **Unity AR Foundation**.

### 🔥 Key Features
- **Holistic Tracking:** Simultaneously tracks body pose, dense 468-point facial mesh, and 21-point hand knuckles.
- **Robust Sequence Modeling:** Utilizes LSTMs to recognize continuous ISL sequences via a sliding window (166 ms latency).
- **Wake-Gesture Optimization:** Mitigates thermal throttling by implementing a heuristic mathematical standby mode. Deep learning only triggers upon a 2-second specific hand geometry threshold.
- **Contextual AR UI:** Translated text is mapped from 2D coordinates to 3D physical depth vectors, anchoring naturally in the user's field of view.

---

## 📂 Repository Structure

```text
ISL-AR-Translation/
├── ai_model/
│   ├── models/                # Saved LSTM weights & architecture
│   ├── src/
│   │   ├── data_extraction.py # MediaPipe Holistic processing & normalization
│   │   ├── model.py           # TensorFlow/Keras LSTM model definition
│   │   ├── train.py           # Training pipeline for INCLUDE dataset logic
│   │   └── inference.py       # Live stream translation with Wake-Gesture logic
│   └── requirements.txt       # Python dependencies
├── unity_ar_app/
│   └── Assets/
│       └── Scripts/
│           ├── ARTextPlacer.cs # Unity AR Foundation raycasting script
│           └── UDPReceiver.cs  # Local networking script for AI-to-Unity bridging
└── README.md
```

---

## 🛠️ Setup Instructions

### 1. AI Model Setup (Python Pipeline)

1. Navigate to the model directory:
   ```bash
   cd ai_model
   ```
2. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```
3. Data Extraction (Example):
   To process videos into numpy coordinate arrays (you will need to download the INCLUDE dataset):
   ```bash
   python src/data_extraction.py --dataset_path /path/to/dataset
   ```
4. Train the Model:
   ```bash
   python src/train.py
   ```
5. Run Real-Time Inference:
   This will open your webcam, run the Wake-Gesture heuristic, and send predictions via UDP port 5052.
   ```bash
   python src/inference.py
   ```

### 2. AR Application Setup (Unity3D)

1. Install **Unity Hub** and a compatible Unity version (e.g., 2022.3 LTS).
2. Create a new 3D AR project using the **AR Foundation** template.
3. Replace your `Assets/Scripts/` with the provided scripts in this repository.
4. Attach `ARTextPlacer.cs` and `UDPReceiver.cs` to your main AR Camera or an Empty GameObject.
5. In your Unity UI, assign a 3D TextMeshPro object to the script inspector.
6. Build and Run on your iOS (ARKit) or Android (ARCore) device. Ensure both your PC and mobile device are on the same local network for UDP communication if testing locally.

---

## 🧠 Methodology Deep-Dive

### 1. Coordinate Normalization
To ensure scale and translation invariance, MediaPipe coordinates aren't boxed dynamically. All joint coordinates are translated relative to the **Nose landmark (Node 0)** and scaled uniformly based on the Euclidean distance between the left and right shoulders.

### 2. Wake-Gesture Math
Before heavy inference runs, the script checks the Euclidean distance between specific landmarks (e.g., Wrist Node 0 and Index Fingertip Node 8). If the geometry holds for >2 seconds (e.g., raised hand state), the LSTM activates.

### 3. AR Spatial Projection
MediaPipe provides normalized 2D coordinates `(x, y) ∈ [0,1]`. By casting a ray from the AR Camera towards the generated physical point cloud, the system translates these bounds into accurate `(X, Y, Z)` world-space coordinates, anchoring the UI to the speaker's shoulder.

---

## 📊 Evaluation Framework
- **Machine Learning Metrics:** Evaluated primarily on **F1-Scores** to account for gesture frequency imbalances in the INCLUDE dataset.
- **Hardware Profile:** Targets `<200 ms` end-to-end latency and continuous `30 FPS` on standard smartphone SoCs.
- **UX Metrics:** Measured using System Usability Scale (SUS) and Gaze Retention Time to prove the efficacy of the AR "magic window."

---

## 🌟 Future Scope
- Integration of lightweight quantized **Edge LLMs** to syntactically smooth ISL gloss into grammatically correct English.
- Development of a **3D Bidirectional Avatar** to translate spoken English back into visual sign language.
- A **Hybrid Cloud-Edge architecture** to dynamically load regional ISL dialects on demand.

## 👥 Contributors
- Bhuvan Agarwal
- Ishan Gupta
- Khushi Nawal
- Kr. Aadarsh Suman
*(Ramaiah Institute of Technology)*

**Subject:** CIE644 - Augmented and Virtual Reality  
**Evaluation Term:** Feb 2026 – June 2026
