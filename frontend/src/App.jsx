import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts'
import './App.css'

const API = 'https://file-integrity-checker-v121.onrender.com'

/* ── Icon helpers ───────────────────────────────────────── */
const ShieldIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
)
const RefreshIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
  </svg>
)

/* ── Status config ──────────────────────────────────────── */
const STATUS_CONFIG = {
  secure: { icon: '🛡️', color: '#22c55e', label: 'Secure' },
  modified: { icon: '⚠️', color: '#ef4444', label: 'Corrupted' },
  deleted: { icon: '🗑️', color: '#a855f7', label: 'Deleted' },
  new: { icon: '🆕', color: '#eab308', label: 'New' },
}

const CHART_COLORS = ['#6366f1', '#22c55e', '#ef4444', '#a855f7', '#eab308']

/* ── Framer variants ────────────────────────────────────── */
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
}
const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
}

/* ── Summary Card ───────────────────────────────────────── */
function SummaryCard({ icon, value, label, className }) {
  return (
    <motion.div className={`summary-card ${className}`} variants={fadeUp} whileHover={{ y: -4, scale: 1.02 }}>
      <div className="card-icon">{icon}</div>
      <div className="card-value">{value}</div>
      <div className="card-label">{label}</div>
    </motion.div>
  )
}

/* ── File Row ───────────────────────────────────────────── */
function FileRow({ file, index }) {
  const cfg = STATUS_CONFIG[file.status] || STATUS_CONFIG.secure
  return (
    <motion.div
      className="file-item"
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      layout
    >
      <div className="file-info">
        <span className="file-icon">{cfg.icon}</span>
        <div className="file-details">
          <div className="file-name">{file.name}</div>
          <div className="file-hash">{file.hash === '—' ? 'N/A' : file.hash}</div>
        </div>
      </div>
      <span className={`status-badge ${file.status}`}>{cfg.label}</span>
    </motion.div>
  )
}

/* ── Log Row ────────────────────────────────────────────── */
function LogRow({ log, index }) {
  return (
    <motion.div
      className="log-item"
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03, duration: 0.3 }}
      layout
    >
      <span className={`log-dot ${log.level}`} />
      <div className="log-content">
        <div className="log-message">{log.message}</div>
        <div className="log-time">{log.timestamp}</div>
      </div>
    </motion.div>
  )
}

/* ── Custom Pie Tooltip ─────────────────────────────────── */
function PieTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 10, padding: '8px 14px', fontSize: '0.78rem', color: '#f1f5f9',
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    }}>
      <span style={{ color: payload[0].payload.fill, fontWeight: 700 }}>{payload[0].name}</span>
      : {payload[0].value}
    </div>
  )
}

/* ── Loading Skeleton ───────────────────────────────────── */
function Skeleton() {
  return (
    <div className="app">
      <div className="skeleton" style={{ height: 80, marginBottom: 32, borderRadius: 16 }} />
      <div className="summary-grid">
        {[...Array(5)].map((_, i) => <div key={i} className="skeleton skeleton-card" />)}
      </div>
      <div className="main-grid">
        <div className="skeleton" style={{ height: 400, borderRadius: 16 }} />
        <div className="skeleton" style={{ height: 400, borderRadius: 16 }} />
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Main App
   ══════════════════════════════════════════════════════════ */
export default function App() {
  const [files, setFiles] = useState([])
  const [summary, setSummary] = useState({ total: 0, secure: 0, modified: 0, deleted: 0, new: 0 })
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState(false)
  const prevLogsLen = useRef(0)

  /* ── Fetch status ── */
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/status`)
      const data = await res.json()
      setFiles(data.files)
      setSummary(data.summary)
      setLoading(false)
    } catch {
      /* silently retry next cycle */
    }
  }, [])

  /* ── Fetch logs ── */
  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/logs?limit=30`)
      const data = await res.json()
      // Show toast on new log entries
      if (prevLogsLen.current > 0 && data.logs.length > 0) {
        const newest = data.logs[0]
        if (prevLogsLen.current !== data.logs.length) {
          const toastStyle = {
            warning: { icon: '⚠️', style: { borderLeft: '3px solid #ef4444' } },
            danger: { icon: '🗑️', style: { borderLeft: '3px solid #a855f7' } },
            success: { icon: '✅', style: { borderLeft: '3px solid #22c55e' } },
            info: { icon: '🔵', style: { borderLeft: '3px solid #6366f1' } },
          }
          const ts = toastStyle[newest.level] || toastStyle.info
          toast(newest.message, { icon: ts.icon, style: ts.style })
        }
      }
      prevLogsLen.current = data.logs.length
      setLogs(data.logs)
    } catch {
      /* silently retry */
    }
  }, [])

  /* ── Polling ── */
  useEffect(() => {
    fetchStatus()
    fetchLogs()
    const id = setInterval(() => { fetchStatus(); fetchLogs() }, 2500)
    return () => clearInterval(id)
  }, [fetchStatus, fetchLogs])

  /* ── Reset baseline ── */
  const resetBaseline = async () => {
    setResetting(true)
    try {
      const res = await fetch(`${API}/api/initialize`, { method: 'POST' })
      const data = await res.json()
      toast.success(data.message, { icon: '🔄' })
      await fetchStatus()
      await fetchLogs()
    } catch {
      toast.error('Failed to reset baseline')
    }
    setResetting(false)
  }

  /* ── Chart data ── */
  const pieData = [
    { name: 'Secure', value: summary.secure, fill: '#22c55e' },
    { name: 'Corrupted', value: summary.modified, fill: '#ef4444' },
    { name: 'Deleted', value: summary.deleted, fill: '#a855f7' },
    { name: 'New', value: summary.new, fill: '#eab308' },
  ].filter(d => d.value > 0)

  const barData = [
    { name: 'Secure', count: summary.secure, fill: '#22c55e' },
    { name: 'Corrupted', count: summary.modified, fill: '#ef4444' },
    { name: 'Deleted', count: summary.deleted, fill: '#a855f7' },
    { name: 'New', count: summary.new, fill: '#eab308' },
  ]

  if (loading) return <Skeleton />

  return (
    <div className="app">
      {/* ── Header ── */}
      <motion.header className="header" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="header-left">
          <div className="header-icon"><ShieldIcon /></div>
          <div className="header-text">
            <h1>File Integrity Checker</h1>
            <p>Real-time SHA-256 file monitoring dashboard</p>
          </div>
        </div>
        <div className="header-right">
          <div className="live-badge">
            <span className="live-dot" />
            Monitoring
          </div>
          <button className={`btn-reset ${resetting ? 'spinning' : ''}`} onClick={resetBaseline} disabled={resetting}>
            <RefreshIcon />
            {resetting ? 'Resetting…' : 'Reset Baseline'}
          </button>
        </div>
      </motion.header>

      {/* ── Summary cards ── */}
      <motion.div className="summary-grid" variants={stagger} initial="hidden" animate="visible">
        <SummaryCard icon="📊" value={summary.total} label="Total Files" className="total" />
        <SummaryCard icon="🛡️" value={summary.secure} label="Secure" className="secure" />
        <SummaryCard icon="⚠️" value={summary.modified} label="Corrupted" className="modified" />
        <SummaryCard icon="🗑️" value={summary.deleted} label="Deleted" className="deleted" />
        <SummaryCard icon="🆕" value={summary.new} label="New Files" className="new" />
      </motion.div>

      {/* ── Charts ── */}
      <motion.div className="chart-section" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
        <div className="main-grid" style={{ marginBottom: 24 }}>
          {/* Pie */}
          <div className="chart-panel">
            <div className="chart-title">📈 Status Distribution</div>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={4} dataKey="value" strokeWidth={0}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: '40px 0' }}>
                <div className="empty-icon">📊</div>
                <div className="empty-text">No data yet</div>
              </div>
            )}
          </div>
          {/* Bar */}
          <div className="chart-panel">
            <div className="chart-title">📊 File Status Breakdown</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} barSize={36}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 10, fontSize: '0.78rem', color: '#f1f5f9',
                  }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {barData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>

      {/* ── File status + Logs ── */}
      <div className="main-grid">
        {/* Files panel */}
        <motion.div className="panel" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <div className="panel-header">
            <div className="panel-title"><span className="panel-title-icon">📂</span> Monitored Files</div>
            <span className="panel-count">{files.length}</span>
          </div>
          <div className="panel-body">
            <AnimatePresence mode="popLayout">
              {files.length > 0 ? (
                files.map((f, i) => <FileRow key={f.name} file={f} index={i} />)
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">📭</div>
                  <div className="empty-text">No files being monitored</div>
                </div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Logs panel */}
        <motion.div className="panel" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <div className="panel-header">
            <div className="panel-title"><span className="panel-title-icon">📋</span> Activity Logs</div>
            <span className="panel-count">{logs.length}</span>
          </div>
          <div className="panel-body">
            <AnimatePresence mode="popLayout">
              {logs.length > 0 ? (
                logs.map((l, i) => <LogRow key={`${l.timestamp}-${i}`} log={l} index={i} />)
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">🔇</div>
                  <div className="empty-text">No activity yet</div>
                </div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      {/* ── Footer ── */}
      <footer className="footer">
        File Integrity Checker v1.0 — SHA-256 Real-Time Monitoring
      </footer>
    </div>
  )
}
