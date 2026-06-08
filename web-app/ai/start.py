import os
import sys
import subprocess

def check_models_exist():
    """Check if models are already downloaded"""
    MODEL_CACHE_DIR = os.path.join(os.path.dirname(__file__), "models")
    clip_cache_dir = os.path.join(MODEL_CACHE_DIR, "clip-vit-base-patch32")
    sbert_cache_dir = os.path.join(MODEL_CACHE_DIR, "all-MiniLM-L6-v2")
    
    clip_exists = os.path.exists(clip_cache_dir) and os.listdir(clip_cache_dir)
    sbert_exists = os.path.exists(sbert_cache_dir) and os.listdir(sbert_cache_dir)
    
    return clip_exists and sbert_exists

def main():
    """Main startup function"""
    print("Starting FilDOS AI API...")
    
    # Check if models exist
    if not check_models_exist():
        print("AI models not found in cache!")
        print("Models need to be downloaded first for optimal performance.")
        
        response = input("\nDownload models now? (Y/n): ").lower()
        if response not in ['n', 'no']:
            print("⬇️  Downloading models...")
            try:
                subprocess.run([sys.executable, "download_models.py"], check=True)
                print("Models downloaded successfully!")
            except subprocess.CalledProcessError:
                print("Model download failed!")
                print("You can manually download models later with: python download_models.py")
                response = input("\nContinue anyway? (y/N): ").lower()
                if response not in ['y', 'yes']:
                    print("Exiting...")
                    sys.exit(1)
        else:
            print("Skipping model download.")
            print("First startup will be slower as models download automatically.")
    else:
        print("Models found in cache!")
    
    # Start the Flask app
    print("Starting Flask server...")
    try:
        subprocess.run([sys.executable, "app.py"], check=True)
    except KeyboardInterrupt:
        print("\nShutting down server...")
    except subprocess.CalledProcessError as e:
        print(f"Server failed to start: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
