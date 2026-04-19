import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { BrandBibleProvider } from './brand-bible.tsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrandBibleProvider>
      <App />
    </BrandBibleProvider>
  </StrictMode>,
)
