"""
File Integrity Checker — Backend (FastAPI)
==========================================
Monitors a target folder using SHA-256 hashing, detects modifications,
deletions, and new files. Exposes a REST API consumed by the React dashboard.
"""

import hashlib
import json
import os
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
MONITOR_DIR = Path(__file__).parent / "files"
BASELINE_FILE = Path(__file__).parent / "baseline.json"
LOG_FILE = Path(__file__).parent / "logs.json"
SCAN_INTERVAL = 3  # seconds

# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------
app = FastAPI(title="File Integrity Checker API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# In-memory state (thread-safe via GIL for simple reads/writes)
# ---------------------------------------------------------------------------
file_statuses: Dict[str, dict] = {}
activity_logs: List[dict] = []
monitor_running = False
MAX_LOGS = 200


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------
def sha256(filepath: Path) -> str:
    """Return the SHA-256 hex digest of a file."""
    h = hashlib.sha256()
    try:
        with open(filepath, "rb") as f:
            while chunk := f.read(8192):
                h.update(chunk)
    except (OSError, PermissionError):
        return ""
    return h.hexdigest()


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _add_log(message: str, level: str = "info") -> None:
    """Append a log entry (capped at MAX_LOGS)."""
    global activity_logs
    entry = {"timestamp": _now(), "message": message, "level": level}
    activity_logs.append(entry)
    if len(activity_logs) > MAX_LOGS:
        activity_logs = activity_logs[-MAX_LOGS:]
    _persist_logs()


def _persist_logs() -> None:
    try:
        with open(LOG_FILE, "w") as f:
            json.dump(activity_logs, f, indent=2)
    except OSError:
        pass


def _load_logs() -> None:
    global activity_logs
    if LOG_FILE.exists():
        try:
            with open(LOG_FILE, "r") as f:
                activity_logs = json.load(f)
        except (json.JSONDecodeError, OSError):
            activity_logs = []


# ---------------------------------------------------------------------------
# Baseline management
# ---------------------------------------------------------------------------
def _load_baseline() -> Dict[str, str]:
    if BASELINE_FILE.exists():
        try:
            with open(BASELINE_FILE, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def _save_baseline(data: Dict[str, str]) -> None:
    with open(BASELINE_FILE, "w") as f:
        json.dump(data, f, indent=2)


def build_baseline() -> Dict[str, str]:
    """Scan MONITOR_DIR and return {relative_name: sha256_hash}."""
    baseline: Dict[str, str] = {}
    if not MONITOR_DIR.exists():
        MONITOR_DIR.mkdir(parents=True, exist_ok=True)
    for entry in sorted(MONITOR_DIR.iterdir()):
        if entry.is_file():
            baseline[entry.name] = sha256(entry)
    return baseline


# ---------------------------------------------------------------------------
# Monitoring logic
# ---------------------------------------------------------------------------
# Track the *previous* status of each file so we only log on state change.
_prev_statuses: Dict[str, str] = {}


def scan_files() -> None:
    """Compare current files against baseline and update statuses & logs."""
    global file_statuses, _prev_statuses

    baseline = _load_baseline()
    current_files: Dict[str, str] = {}

    if MONITOR_DIR.exists():
        for entry in sorted(MONITOR_DIR.iterdir()):
            if entry.is_file():
                current_files[entry.name] = sha256(entry)

    new_statuses: Dict[str, dict] = {}

    # Check baseline files -------------------------------------------------
    for name, expected_hash in baseline.items():
        if name not in current_files:
            status = "deleted"
        elif current_files[name] != expected_hash:
            status = "modified"
        else:
            status = "secure"

        new_statuses[name] = {
            "name": name,
            "status": status,
            "hash": current_files.get(name, "—"),
            "expected_hash": expected_hash,
            "last_checked": _now(),
        }

    # Detect new files (not in baseline) -----------------------------------
    for name, h in current_files.items():
        if name not in baseline:
            new_statuses[name] = {
                "name": name,
                "status": "new",
                "hash": h,
                "expected_hash": "—",
                "last_checked": _now(),
            }

    # Log only state *changes* ---------------------------------------------
    for name, info in new_statuses.items():
        prev = _prev_statuses.get(name)
        cur = info["status"]
        if prev != cur:
            if cur == "modified":
                _add_log(f"⚠️  File modified: {name}", "warning")
            elif cur == "deleted":
                _add_log(f"🗑️  File deleted: {name}", "danger")
            elif cur == "new":
                _add_log(f"🆕  New file detected: {name}", "info")
            elif cur == "secure" and prev is not None:
                _add_log(f"✅  File restored to secure: {name}", "success")

    # Detect files that disappeared from new_statuses but were tracked
    for name in list(_prev_statuses):
        if name not in new_statuses:
            pass  # already handled via baseline deletion

    _prev_statuses = {n: s["status"] for n, s in new_statuses.items()}
    file_statuses = new_statuses


def _monitor_loop() -> None:
    """Background thread that scans periodically."""
    global monitor_running
    monitor_running = True
    while monitor_running:
        try:
            scan_files()
        except Exception as exc:
            _add_log(f"Monitor error: {exc}", "danger")
        time.sleep(SCAN_INTERVAL)


# ---------------------------------------------------------------------------
# Startup / shutdown
# ---------------------------------------------------------------------------
@app.on_event("startup")
def startup() -> None:
    _load_logs()
    # Auto-create baseline if missing
    if not BASELINE_FILE.exists():
        baseline = build_baseline()
        _save_baseline(baseline)
        _add_log("🔐  Initial baseline created", "success")
    # First scan
    scan_files()
    # Start background monitor
    t = threading.Thread(target=_monitor_loop, daemon=True)
    t.start()


@app.on_event("shutdown")
def shutdown() -> None:
    global monitor_running
    monitor_running = False


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/status")
def get_status():
    """Return current file statuses + summary counts."""
    counts = {"total": 0, "secure": 0, "modified": 0, "deleted": 0, "new": 0}
    for info in file_statuses.values():
        counts["total"] += 1
        s = info["status"]
        if s in counts:
            counts[s] += 1
    return {"files": list(file_statuses.values()), "summary": counts}


@app.get("/api/logs")
def get_logs(limit: int = 50):
    """Return the most recent activity logs."""
    return {"logs": activity_logs[-limit:][::-1]}


@app.post("/api/initialize")
def initialize_baseline():
    """Rebuild baseline from the current state of the monitored folder."""
    global _prev_statuses
    baseline = build_baseline()
    _save_baseline(baseline)
    _prev_statuses = {}
    scan_files()
    _add_log("🔄  Baseline re-initialized by user", "success")
    return {"message": "Baseline re-initialized", "files": len(baseline)}


@app.get("/api/health")
def health_check():
    return {"status": "ok", "monitoring": monitor_running, "directory": str(MONITOR_DIR)}


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """Upload a file to the monitored directory."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    # Sanitize filename (no path traversal)
    safe_name = Path(file.filename).name
    dest = MONITOR_DIR / safe_name
    try:
        contents = await file.read()
        with open(dest, "wb") as f:
            f.write(contents)
        _add_log(f"📤  File uploaded: {safe_name}", "info")
        scan_files()
        return {"message": f"File '{safe_name}' uploaded successfully", "filename": safe_name}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.delete("/api/files/{filename}")
def delete_file(filename: str):
    """Delete a file from the monitored directory."""
    safe_name = Path(filename).name
    filepath = MONITOR_DIR / safe_name
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="File not found")
    try:
        filepath.unlink()
        _add_log(f"🗑️  File removed by user: {safe_name}", "danger")
        scan_files()
        return {"message": f"File '{safe_name}' deleted"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
