import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const root = createRoot(document.getElementById('root')!)

// Dev-only visualization harness (M2). import.meta.env.DEV is false in
// production builds, so this branch and the harness chunk are removed.
if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('viz-harness')) {
  void import('./dev/VizHarness').then(({ VizHarness }) =>
    root.render(
      <StrictMode>
        <VizHarness />
      </StrictMode>,
    ),
  )
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
