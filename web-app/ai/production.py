#!/usr/bin/env python3
"""
Production startup script for FilDOS AI API
"""

import os
import sys
import subprocess
import signal
import time

def check_models_exist():
    """Check if models are already downloaded"""
    MODEL_CACHE_DIR = os.path.join(os.path.dirname(__file__), "models")
    clip_cache_dir = os.path.join(MODEL_CACHE_DIR, "clip-vit-base-patch32")
    sbert_cache_dir = os.path.join(MODEL_CACHE_DIR, "all-MiniLM-L6-v2")
    
    clip_exists = os.path.exists(clip_cache_dir) and os.listdir(clip_cache_dir)
    sbert_exists = os.path.exists(sbert_cache_dir) and os.listdir(sbert_cache_dir)
    
    return clip_exists and sbert_exists

def download_models_if_needed():
    """Download models if they don't exist"""
    if not check_models_exist():
        print("AI models not found in cache. Downloading...")
        try:
            subprocess.run([sys.executable, "download_models.py"], check=True)
            print("Models downloaded successfully!")
        except subprocess.CalledProcessError as e:
            print(f"Model download failed: {e}")
            return False
    else:
        print("Models found in cache!")
    return True

def main():
    """Main production startup function"""
    print("Starting FilDOS AI API")
    print("=" * 50)
    
    # Ensure models are available
    if not download_models_if_needed():
        print("Cannot start without models!")
        sys.exit(1)
    
    # Get configuration from environment
    port = os.environ.get('PORT', '5001')
    workers = os.environ.get('WORKERS', '1')
    host = os.environ.get('HOST', '0.0.0.0')
    
    print(f"Host: {host}")
    print(f"Port: {port}")
    print(f"Workers: {workers}")
    print("=" * 50)
    
    # Start Gunicorn
    cmd = [
        'gunicorn',
        '--config', 'gunicorn.conf.py',
        '--bind', f'{host}:{port}',
        '--workers', workers,
        'app:app'
    ]
    
    print("Starting Gunicorn server...")
    print(f"Command: {' '.join(cmd)}")
    
    try:
        # Start the server
        process = subprocess.Popen(cmd)
        
        # Set up signal handlers for graceful shutdown
        def signal_handler(signum, frame):
            print(f"\nReceived signal {signum}. Shutting down gracefully...")
            process.terminate()
            try:
                process.wait(timeout=30)
            except subprocess.TimeoutExpired:
                print("Force killing process...")
                process.kill()
            sys.exit(0)
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        
        # Wait for the process
        process.wait()
        
    except FileNotFoundError:
        print("Gunicorn not found! Please install it:")
        print("   pip install gunicorn")
        sys.exit(1)
    except Exception as e:
        print(f"Error starting server: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
