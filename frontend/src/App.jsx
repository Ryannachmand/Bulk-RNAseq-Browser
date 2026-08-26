import { useEffect, useState } from 'react'
import { checkHealth, getDeResults, uploadDataset, uploadFpkmMatrix } from './api/client'
import UploadPanel from './components/UploadPanel'
import VolcanoPlot from './components/VolcanoPlot'
import RVolcanoPanel from './components/RVolcanoPanel'
import HeatmapSection from './components/HeatmapSection'
import PCASection from './components/PCASection'

const FIG_VOLCANO = 'volcano'
const FIG_HEATMAP = 'heatmap'
const FIG_PCA     = 'pca'

const TAB_PLOTLY = 'plotly'
const TAB_R      = 'r'

export default function App() {
  const [connected, setConnected] = useState(null)
  const [figureType, setFigureType] = useState(FIG_VOLCANO)

  // ── Volcano state ────────────────────────────────────────────────────────
  const [volcanoUploading, setVolcanoUploading] = useState(false)
  const [volcanoError, setVolcanoError] = useState(null)
  const [rows, setRows] = useState(null)
  const [datasetId, setDatasetId] = useState(null)
  const [volcanoTab, setVolcanoTab] = useState(TAB_PLOTLY)
  const [padjCutoff, setPadjCutoff] = useState(0.05)
  const [lfcCutoff, setLfcCutoff]   = useState(1)

  // ── Heatmap state ────────────────────────────────────────────────────────
  const [heatmapUploading, setHeatmapUploading] = useState(false)
  const [heatmapError, setHeatmapError]         = useState(null)
  const [heatmapId, setHeatmapId]               = useState(null)
  const [heatmapSamples, setHeatmapSamples]     = useState(null)

  useEffect(() => {
    checkHealth()
      .then(() => setConnected(true))
      .catch(() => setConnected(false))
  }, [])

  // ── Upload handlers ───────────────────────────────────────────────────────

  async function handleVolcanoUpload(file) {
    setVolcanoError(null)
    setRows(null)
    setDatasetId(null)
    setVolcanoUploading(true)
    try {
      const { dataset_id } = await uploadDataset(file)
      const data = await getDeResults(dataset_id)
      setDatasetId(dataset_id)
      setRows(data)
      setVolcanoTab(TAB_PLOTLY)
    } catch (e) {
      setVolcanoError(e.message)
    } finally {
      setVolcanoUploading(false)
    }
  }

  async function handleHeatmapUpload(file) {
    setHeatmapError(null)
    setHeatmapId(null)
    setHeatmapSamples(null)
    setHeatmapUploading(true)
    try {
      const { heatmap_id, samples } = await uploadFpkmMatrix(file)
      setHeatmapId(heatmap_id)
      setHeatmapSamples(samples)
    } catch (e) {
      setHeatmapError(e.message)
    } finally {
      setHeatmapUploading(false)
    }
  }

  // ── Shared styles ─────────────────────────────────────────────────────────

  const statusColor = connected === null ? '#888' : connected ? '#2a9d2a' : '#cc2222'
  const statusText  =
    connected === null ? 'Checking backend…' :
    connected ? 'Backend connected' : 'Backend unreachable'

  const figTabStyle = (active) => ({
    padding: '0.5rem 1.4rem',
    border: '2px solid ' + (active ? '#2563eb' : '#ccc'),
    background: active ? '#2563eb' : '#f9f9f9',
    color: active ? '#fff' : '#333',
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: active ? 600 : 400,
    fontSize: '0.95em',
  })

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
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '1.5rem', maxWidth: 1100 }}>
      <h1 style={{ marginBottom: '0.25rem' }}>Bulk RNA-seq Browser</h1>
      <p style={{ color: statusColor, marginTop: 0 }}>{statusText}</p>

      {/* Figure-type selector */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <button style={figTabStyle(figureType === FIG_VOLCANO)} onClick={() => setFigureType(FIG_VOLCANO)}>
          Volcano
        </button>
        <button style={figTabStyle(figureType === FIG_HEATMAP)} onClick={() => setFigureType(FIG_HEATMAP)}>
          Heatmap
        </button>
        <button style={figTabStyle(figureType === FIG_PCA)} onClick={() => setFigureType(FIG_PCA)}>
          PCA
        </button>
      </div>

      {/* ── Volcano section ─────────────────────────────────────────────── */}
      {figureType === FIG_VOLCANO && (
        <div>
          <UploadPanel
            onUpload={handleVolcanoUpload}
            disabled={volcanoUploading || !connected}
            label="Upload DE results table (.csv)"
          />
          {volcanoUploading && <p style={{ color: '#555' }}>Uploading and parsing…</p>}
          {volcanoError && (
            <p style={{ color: '#cc2222' }}><strong>Error:</strong> {volcanoError}</p>
          )}

          {rows && (
            <div>
              <div style={{ display: 'flex', gap: 0, marginTop: '1.5rem', borderBottom: '1px solid #ccc' }}>
                <button style={tabStyle(volcanoTab === TAB_PLOTLY)} onClick={() => setVolcanoTab(TAB_PLOTLY)}>
                  Plotly preview
                </button>
                <button style={tabStyle(volcanoTab === TAB_R)} onClick={() => setVolcanoTab(TAB_R)}>
                  Plot generator (R)
                </button>
              </div>

              <div style={{ border: '1px solid #ccc', borderTop: 'none', padding: '1rem', background: '#fff' }}>
                {volcanoTab === TAB_PLOTLY && (
                  <VolcanoPlot
                    rows={rows}
                    padjCutoff={padjCutoff}
                    lfcCutoff={lfcCutoff}
                    onPadjChange={setPadjCutoff}
                    onLfcChange={setLfcCutoff}
                  />
                )}
                {volcanoTab === TAB_R && (
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
      )}

      {/* ── Heatmap section ─────────────────────────────────────────────── */}
      {figureType === FIG_HEATMAP && (
        <div>
          <UploadPanel
            onUpload={handleHeatmapUpload}
            disabled={heatmapUploading || !connected}
            label="Upload FPKM matrix (.csv) — genes × samples"
          />
          {heatmapUploading && <p style={{ color: '#555' }}>Uploading and parsing…</p>}
          {heatmapError && (
            <p style={{ color: '#cc2222' }}><strong>Error:</strong> {heatmapError}</p>
          )}

          {heatmapId && (
            <div style={{ marginTop: '1.5rem' }}>
              <HeatmapSection heatmapId={heatmapId} initialSamples={heatmapSamples} />
            </div>
          )}
        </div>
      )}

      {/* ── PCA section ─────────────────────────────────────────────────── */}
      {figureType === FIG_PCA && (
        <div>
          {!heatmapId && (
            <>
              <UploadPanel
                onUpload={handleHeatmapUpload}
                disabled={heatmapUploading || !connected}
                label="Upload FPKM matrix (.csv) — genes × samples"
              />
              {heatmapUploading && <p style={{ color: '#555' }}>Uploading and parsing…</p>}
              {heatmapError && (
                <p style={{ color: '#cc2222' }}><strong>Error:</strong> {heatmapError}</p>
              )}
            </>
          )}

          {heatmapId && (
            <div style={{ marginTop: '1rem' }}>
              <PCASection datasetId={heatmapId} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
