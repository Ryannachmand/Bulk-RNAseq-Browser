import { useEffect, useState } from 'react'
import { checkHealth, getDeResults, uploadDataset } from './api/client'
import UploadPanel from './components/UploadPanel'
import VolcanoPlot from './components/VolcanoPlot'

export default function App() {
  const [connected, setConnected] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [rows, setRows] = useState(null)

  useEffect(() => {
    checkHealth()
      .then(() => setConnected(true))
      .catch(() => setConnected(false))
  }, [])

  async function handleUpload(file) {
    setError(null)
    setRows(null)
    setUploading(true)
    try {
      const { dataset_id } = await uploadDataset(file)
      const data = await getDeResults(dataset_id)
      setRows(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  const statusColor = connected === null ? '#888' : connected ? '#2a9d2a' : '#cc2222'
  const statusText =
    connected === null ? 'Checking backend…' :
    connected ? 'Backend connected' : 'Backend unreachable'

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '1.5rem', maxWidth: 800 }}>
      <h1 style={{ marginBottom: '0.25rem' }}>Bulk RNA-seq Browser</h1>
      <p style={{ color: statusColor, marginTop: 0 }}>{statusText}</p>

      <UploadPanel onUpload={handleUpload} disabled={uploading || !connected} />

      {uploading && <p style={{ color: '#555' }}>Uploading and parsing…</p>}
      {error && <p style={{ color: '#cc2222' }}><strong>Error:</strong> {error}</p>}
      {rows && <VolcanoPlot rows={rows} />}
    </div>
  )
}
