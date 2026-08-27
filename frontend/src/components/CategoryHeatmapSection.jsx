import { useState } from 'react'
import HeatmapPlot from './HeatmapPlot'
import { getProjectCategoryHeatmap, renderProjectRCategoryHeatmaps } from '../api/client'

const TAB_PLOTLY = 'plotly'
const TAB_R      = 'r'

function CategoryPanel({ cat, samples, grouping, panelHeight }) {
  if (!cat.genes || cat.genes.length === 0) {
    return (
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 16, background: '#fafafa' }}>
        <p style={{ color: '#9ca3af', margin: 0, fontSize: '0.85em' }}>
          {cat.name} — no matching genes found in this FPKM matrix
        </p>
      </div>
    )
  }

  const data = {
    genes: cat.genes,
    samples,
    z_scores: cat.z_scores,
    fpkm_labels: cat.fpkm_labels,
    grouping,
  }

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, minWidth: 0 }}>
      <div style={{ padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb', fontWeight: 600, fontSize: '0.9em', borderRadius: '6px 6px 0 0' }}>
        {cat.name}
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: '0.85em' }}>
          {cat.genes.length} genes
        </span>
      </div>
      <div>
        <HeatmapPlot data={data} panelHeight={panelHeight} />
      </div>
    </div>
  )
}

export default function CategoryHeatmapSection({ projectId }) {
  const [nTopGenes, setNTopGenes]   = useState(40)
  const [subtab, setSubtab]         = useState(TAB_PLOTLY)

  const [loading, setLoading]       = useState(false)
  const [heatmapData, setHeatmapData] = useState(null)
  const [dataError, setDataError]   = useState(null)

  const [rLoading, setRLoading]     = useState(false)
  const [rImageUrl, setRImageUrl]   = useState(null)
  const [rError, setRError]         = useState(null)

  async function loadHeatmap() {
    setLoading(true)
    setDataError(null)
    setHeatmapData(null)
    try {
      const data = await getProjectCategoryHeatmap(projectId, nTopGenes)
      setHeatmapData(data)
    } catch (e) {
      setDataError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function generateRPlot() {
    setRLoading(true)
    setRError(null)
    setRImageUrl(null)
    try {
      const url = await renderProjectRCategoryHeatmaps(projectId, nTopGenes)
      setRImageUrl(url)
    } catch (e) {
      setRError(e.message)
    } finally {
      setRLoading(false)
    }
  }

  const tabStyle = (active) => ({
    padding: '0.3rem 0.9rem',
    border: '1px solid #ccc',
    borderBottom: active ? '1px solid #fff' : '1px solid #ccc',
    background: active ? '#fff' : '#f5f5f5',
    cursor: 'pointer',
    fontWeight: active ? 600 : 400,
    fontSize: '0.88em',
    marginBottom: -1,
    position: 'relative',
  })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <label style={{ fontSize: '0.9em' }}>
          Top genes per category:&nbsp;
          <input
            type="number" min={1} max={200} value={nTopGenes}
            onChange={e => setNTopGenes(Number(e.target.value))}
            style={{ width: 60, padding: '3px 5px', border: '1px solid #ccc', borderRadius: 3 }}
          />
        </label>

        <button
          onClick={loadHeatmap}
          disabled={loading}
          style={{ padding: '4px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: '0.88em' }}
        >
          {loading ? 'Loading…' : 'Load heatmap'}
        </button>
      </div>

      {dataError && <p style={{ color: '#dc2626' }}><strong>Error:</strong> {dataError}</p>}

      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #ccc', marginBottom: 0 }}>
        <button style={tabStyle(subtab === TAB_PLOTLY)} onClick={() => setSubtab(TAB_PLOTLY)}>
          Interactive
        </button>
        <button style={tabStyle(subtab === TAB_R)} onClick={() => setSubtab(TAB_R)}>
          R-exact plot
        </button>
      </div>

      <div style={{ border: '1px solid #ccc', borderTop: 'none', padding: '1rem', background: '#fff' }}>
        {subtab === TAB_PLOTLY && (
          <div>
            {!heatmapData && !loading && (
              <p style={{ color: '#6b7280', margin: 0 }}>
                Click "Load heatmap" to render panels for all active categories.
              </p>
            )}
            {loading && <p style={{ color: '#555' }}>Computing z-scores…</p>}
            {heatmapData && (() => {
              const active = heatmapData.categories.filter(c => c.genes && c.genes.length > 0)
              const nCols = 2
              const nRows = Math.max(1, Math.ceil(active.length / nCols))
              // Give each panel at least 550px; viewport-fraction keeps single-row panels from
              // being comically tall. Grid may scroll vertically — that's intentional.
              const panelHeight = Math.max(550, Math.floor((window.innerHeight * 0.9) / nRows))
              return (
                <div>
                  <p style={{ color: '#6b7280', fontSize: '0.82em', margin: '0 0 12px' }}>
                    {active.length} active categor{active.length === 1 ? 'y' : 'ies'} · {heatmapData.samples.length} samples
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                    {heatmapData.categories.map((cat, i) => (
                      <CategoryPanel key={i} cat={cat} samples={heatmapData.samples} grouping={heatmapData.grouping} panelHeight={panelHeight} />
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {subtab === TAB_R && (
          <div>
            <p style={{ margin: '0 0 10px', color: '#374151', fontSize: '0.9em' }}>
              Renders all active categories using pheatmap in R, matching BulkSIX3SB's
              z-score + FPKM-label style. Output is 300 dpi PNG + PDF.
            </p>
            <button
              onClick={generateRPlot}
              disabled={rLoading}
              style={{ padding: '5px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: '0.9em' }}
            >
              {rLoading ? 'Generating…' : 'Generate R plot'}
            </button>

            {rLoading && <p style={{ color: '#555', marginTop: 8 }}>Running R… this may take 30–60 s.</p>}
            {rError && <p style={{ color: '#dc2626', marginTop: 8 }}><strong>Error:</strong> {rError}</p>}
            {rImageUrl && (
              <div style={{ marginTop: 14 }}>
                <img
                  src={rImageUrl}
                  alt="R category heatmaps"
                  style={{ maxWidth: '100%', border: '1px solid #e5e7eb', borderRadius: 4 }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
