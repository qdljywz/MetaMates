import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './App.css'
import './i18n'
import ErrorBoundary from './components/ErrorBoundary'
import { applyThemeBootstrapToDocument } from './utils/themeBootstrap'

applyThemeBootstrapToDocument()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
