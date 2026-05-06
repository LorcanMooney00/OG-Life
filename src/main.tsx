import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { InstallPromptProvider } from './contexts/InstallPromptContext'
import { AuthProvider } from './lib/auth'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <InstallPromptProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </InstallPromptProvider>
    </AuthProvider>
  </StrictMode>,
)
