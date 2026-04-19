import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 3500,
        style: {
          background: 'rgba(17, 24, 39, 0.95)',
          color: '#f1f5f9',
          border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(16px)',
          borderRadius: '12px',
          fontSize: '0.85rem',
          fontFamily: 'Inter, sans-serif',
          boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
        },
      }}
    />
    <App />
  </StrictMode>,
)
