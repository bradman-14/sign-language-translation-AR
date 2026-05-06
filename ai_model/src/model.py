from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout

def build_lstm_model(sequence_length, num_features, num_classes):
    """
    Constructs the LSTM network for temporal gesture recognition.
    - Context window: `sequence_length` frames
    - Input shape: (sequence_length, num_features)
    """
    model = Sequential()
    
    # Recurrent Hidden Layers for sequential pattern recognition
    model.add(LSTM(64, return_sequences=True, activation='relu', input_shape=(sequence_length, num_features)))
    model.add(Dropout(0.2))
    
    model.add(LSTM(128, return_sequences=True, activation='relu'))
    model.add(Dropout(0.2))
    
    model.add(LSTM(64, return_sequences=False, activation='relu'))
    
    # Dense Softmax layer to output class probabilities
    model.add(Dense(64, activation='relu'))
    model.add(Dense(32, activation='relu'))
    model.add(Dense(num_classes, activation='softmax'))
    
    model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['categorical_accuracy'])
    
    return model

if __name__ == "__main__":
    # Test model build
    # 543 landmarks: 33 pose (x,y,z,v) + 468 face (x,y,z) + 21 lh (x,y,z) + 21 rh (x,y,z) = 132 + 1404 + 63 + 63 = 1662 features
    model = build_lstm_model(sequence_length=30, num_features=1662, num_classes=10)
    model.summary()
