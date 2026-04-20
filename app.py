from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
import hashlib
import json
import time

app = FastAPI()

# ✅ CORS FIX (IMPORTANT FOR VERCEL)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FILES_DIR = "files"
BASELINE_FILE = "baseline.json"
LOG_FILE = "logs.json"

baseline = {}
logs = []

# 🔐 Generate SHA-256 hash
def get_hash(file_path):
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(4096):
            sha256.update(chunk)
    return sha256.hexdigest()

# 📦 Load baseline
def load_baseline():
    global baseline
    if os.path.exists(BASELINE_FILE):
        with open(BASELINE_FILE, "r") as f:
            baseline = json.load(f)

# 💾 Save baseline
def save_baseline():
    with open(BASELINE_FILE, "w") as f:
        json.dump(baseline, f, indent=4)

# 📜 Save logs
def save_logs():
    with open(LOG_FILE, "w") as f:
        json.dump(logs, f, indent=4)

# 🔁 Initialize baseline
@app.post("/api/initialize")
def initialize():
    global baseline
    baseline = {}
    for file in os.listdir(FILES_DIR):
        path = os.path.join(FILES_DIR, file)
        if os.path.isfile(path):
            baseline[file] = get_hash(path)
    save_baseline()
    return {"message": "Baseline initialized"}

# 📊 Get status
@app.get("/api/status")
def status():
    load_baseline()

    current_files = set(os.listdir(FILES_DIR))
    baseline_files = set(baseline.keys())

    result = []

    # Check modified and safe
    for file in current_files:
        path = os.path.join(FILES_DIR, file)
        if os.path.isfile(path):
            new_hash = get_hash(path)

            if file not in baseline:
                result.append({"file": file, "status": "new"})
                logs.append({"file": file, "action": "new", "time": time.ctime()})
            elif baseline[file] != new_hash:
                result.append({"file": file, "status": "modified"})
                logs.append({"file": file, "action": "modified", "time": time.ctime()})
            else:
                result.append({"file": file, "status": "safe"})

    # Check deleted
    for file in baseline_files - current_files:
        result.append({"file": file, "status": "deleted"})
        logs.append({"file": file, "action": "deleted", "time": time.ctime()})

    save_logs()

    return {"files": result}

# 📜 Get logs
@app.get("/api/logs")
def get_logs():
    if os.path.exists(LOG_FILE):
        with open(LOG_FILE, "r") as f:
            return json.load(f)
    return []