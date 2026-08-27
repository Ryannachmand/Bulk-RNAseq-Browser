import { useState } from 'react'
import { getDeResults, uploadDataset } from '../api/client'
import UploadPanel from './UploadPanel'
import VolcanoPlot from './VolcanoPlot'
import RVolcanoPanel from './RVolcanoPanel'

const TAB_PLOTLY = 'plotly'
const TAB_R = 'r'

export default function VolcanoSection({ connected }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [rows, setRows] = useState(null)
  const [datasetId, setDatasetId] = useState(null)
  const [tab, setTab] = useState(TAB_PLOTLY)
  const [padjCutoff, setPadjCutoff] = useState(0.05)
  const [lfcCutoff, setLfcCutoff] = useState(1)

  async function handleUpload(file) {
    setError(null)
    setRows(null)
    setDatasetId(null)
    setUploading(true)
    try {
      const { dataset_id } = await uploadDataset(file)
      const data = await getDeResults(dataset_id)
      setDatasetId(dataset_id)
      setRows(data)
      setTab(TAB_PLOTLY)
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  const tabStyle = (active) => ({
    padding: '0.35rem 1rem',
    border: '1px solid #ccc',
    borderBottom: active ? '1px solid #fff' : '1px solid #ccc',
    background: active ? '#fff' : '#f5f5f5',
    cursor: 'pointer',
    fontWeight: active ? 600 : 400,
    fontSize: '0.9em',
    marginBottom: -1,
    position: 'relative',
  })

  return (
    <div>
      <UploadPanel
        onUpload={handleUpload}
        disabled={uploading || !connected}
        label="Upload DE results table (.csv)"
      />
      {uploading && <p style={{ color: '#555' }}>Uploading and parsing…</p>}
      {error && (
        <p style={{ color: '#cc2222' }}><strong>Error:</strong> {error}</p>
      )}

      {rows && (
        <div>
          <div style={{ display: 'flex', gap: 0, marginTop: '1.5rem', borderBottom: '1px solid #ccc' }}>
            <button style={tabStyle(tab === TAB_PLOTLY)} onClick={() => setTab(TAB_PLOTLY)}>
              Plotly preview
            </button>
            <button style={tabStyle(tab === TAB_R)} onClick={() => setTab(TAB_R)}>
              Plot generator (R)
            </button>
          </div>

          <div style={{ border: '1px solid #ccc', borderTop: 'none', padding: '1rem', background: '#fff' }}>
            {tab === TAB_PLOTLY && (
              <VolcanoPlot
                rows={rows}
                padjCutoff={padjCutoff}
                lfcCutoff={lfcCutoff}
                onPadjChange={setPadjCutoff}
                onLfcChange={setLfcCutoff}
              />
            )}
            {tab === TAB_R && (
              <RVolcanoPanel
                datasetId={datasetId}
                padjCutoff={padjCutoff}
                lfcCutoff={lfcCutoff}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
