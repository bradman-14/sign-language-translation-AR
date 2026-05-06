import os
import numpy as np
from sklearn.model_selection import train_test_split
from tensorflow.keras.utils import to_categorical
from tensorflow.keras.callbacks import TensorBoard
from model import build_lstm_model

# Constants
DATA_PATH = os.path.join('..', 'dataset')
actions = np.array(['hello', 'thanks', 'iloveyou']) # INCLUDE dataset classes
sequence_length = 30
num_features = 1662

def load_data():
    """
    Loads coordinate data from extracted numpy arrays.
    """
    sequences, labels = [], []
    for action in actions:
        for sequence in range(30):
            window = []
            for frame_num in range(sequence_length):
                # Simulated loading for structure
                # res = np.load(os.path.join(DATA_PATH, action, str(sequence), "{}.npy".format(frame_num)))
                res = np.random.rand(num_features) # Mock data
                window.append(res)
            sequences.append(window)
            
            # Label map
            label_map = {label:num for num, label in enumerate(actions)}
            labels.append(label_map[action])
            
    X = np.array(sequences)
    y = to_categorical(labels).astype(int)
    return train_test_split(X, y, test_size=0.05)

def train_model():
    """
    Trains the LSTM sequence model.
    """
    print("Loading data...")
    X_train, X_test, y_train, y_test = load_data()
    
    print("Building model...")
    model = build_lstm_model(sequence_length, num_features, len(actions))
    
    log_dir = os.path.join('..', 'Logs')
    tb_callback = TensorBoard(log_dir=log_dir)
    
    print("Starting training...")
    model.fit(X_train, y_train, epochs=200, callbacks=[tb_callback])
    
    # Save weights
    model_path = os.path.join('..', 'models', 'action.h5')
    model.save(model_path)
    print(f"Model saved to {model_path}")

if __name__ == "__main__":
    train_model()
