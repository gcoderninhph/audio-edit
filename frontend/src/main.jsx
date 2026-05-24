import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { I18nProvider } from './i18n/I18nProvider'
import { isExportBenchmarkRequested, runExportBenchmarkIfRequested } from './utils/exportBenchmarkRunner'

const root = createRoot(document.getElementById('root'))

if (isExportBenchmarkRequested()) {
  root.render(<div className="export-benchmark-root">Export benchmark running...</div>)
  void runExportBenchmarkIfRequested()
} else {
  root.render(
    <StrictMode>
      <I18nProvider>
        <App />
      </I18nProvider>
    </StrictMode>,
  )
}
