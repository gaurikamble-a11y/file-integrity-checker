import { useEffect, useState } from "react";
import "./App.css";

const API = "https://file-integrity-checker-v121.onrender.com";

function App() {
  const [files, setFiles] = useState([]);
  const [logs, setLogs] = useState([]);

  // Fetch status
  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API}/api/status`);
      const data = await res.json();
      setFiles(data.files || []);
    } catch (err) {
      console.error("Error fetching status:", err);
    }
  };

  // Fetch logs
  const fetchLogs = async () => {
    try {
      const res = await fetch(`${API}/api/logs`);
      const data = await res.json();
      setLogs(data || []);
    } catch (err) {
      console.error("Error fetching logs:", err);
    }
  };

  // Reset baseline
  const resetBaseline = async () => {
    try {
      await fetch(`${API}/api/initialize`, {
        method: "POST",
      });
      fetchStatus();
    } catch (err) {
      console.error("Error resetting baseline:", err);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchLogs();

    const interval = setInterval(() => {
      fetchStatus();
      fetchLogs();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="App">
      <h1>🔐 File Integrity Dashboard</h1>

      <button onClick={resetBaseline}>Reset Baseline</button>

      <h2>Status</h2>
      {files.map((file, i) => (
        <div
          key={i}
          style={{
            padding: "10px",
            margin: "10px",
            borderRadius: "8px",
            backgroundColor:
              file.status === "safe"
                ? "green"
                : file.status === "modified"
                  ? "red"
                  : file.status === "deleted"
                    ? "purple"
                    : "orange",
            color: "white",
          }}
        >
          {file.file} → {file.status}
        </div>
      ))}

      <h2>Logs</h2>
      {logs.slice().reverse().map((log, i) => (
        <div key={i}>
          {log.time} → {log.file} → {log.action}
        </div>
      ))}
    </div>
  );
}

export default App;