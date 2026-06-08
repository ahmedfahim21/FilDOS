# Gunicorn configuration file for FilDOS AI API

import multiprocessing
import os

# Server socket
bind = f"0.0.0.0:{os.environ.get('PORT', 5001)}"
backlog = 2048

# Worker processes
workers = 1  # Important: Only 1 worker for AI models to avoid memory issues
worker_class = "sync"
worker_connections = 1000
timeout = 600
keepalive = 2
max_requests = 500
max_requests_jitter = 10

# Logging
accesslog = "-"  # Log to stdout
errorlog = "-"   # Log to stderr
loglevel = "info"
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s'

# Process naming
proc_name = "fildos-ai-api"

# Server mechanics
preload_app = True  # Load application before forking workers
daemon = False
pidfile = None
user = None
group = None
tmp_upload_dir = None

# SSL (if needed)
# keyfile = "path/to/keyfile"
# certfile = "path/to/certfile"

# Worker timeouts
graceful_timeout = 30
