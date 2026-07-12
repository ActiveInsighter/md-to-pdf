import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import './job-status.css'
import './auth-session.css'
import './upload.css'
import './submission-recovery.css'
import './white-ui.css'

// Mount the production application with React development safeguards enabled.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
