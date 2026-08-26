import { useEffect, useState } from 'react'
import HeatmapPlot from './HeatmapPlot'
import { getCategorizedHeatmap, renderRCategoryHeatmaps, listFpkmDatasets } from '../api/client'

const TAB_PLOTLY = 'plotly'
const TAB_R      = 'r'

// Mini heatmap panel — wraps HeatmapPlot with a title and feeds the shared
// samples/grouping into the per-category data shape HeatmapPlot expects.
function CategoryPanel({ cat, samples, grouping }) {
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
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 6 }}>
      <div style={{ padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb', fontWeight: 600, fontSize: '0.9em', borderRadius: '6px 6px 0 0' }}>
        {cat.name}
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: '0.85em' }}>
          {cat.genes.length} genes
        </span>
      </div>
      {/* overflow-x: auto lets the fixed-width Plotly chart scroll rather than clip */}
      <div style={{ overflowX: 'auto' }}>
        <HeatmapPlot data={data} />
      </div>
    </div>
  )
}

export default function CategoryHeatmapSection() {
  const [datasets, setDatasets]     = useState(null)
  const [datasetId, setDatasetId]   = useState('')
  const [nTopGenes, setNTopGenes]   = useState(40)
  const [subtab, setSubtab]         = useState(TAB_PLOTLY)

  // Interactive state
  const [loading, setLoading]       = useState(false)
  const [heatmapData, setHeatmapData] = useState(null)
  const [dataError, setDataError]   = useState(null)

  // R-exact state
  const [rLoading, setRLoading]     = useState(false)
  const [rImageUrl, setRImageUrl]   = useState(null)
  const [rError, setRError]         = useState(null)

  useEffect(() => {
    listFpkmDatasets()
      .then(d => {
        setDatasets(d.datasets)
        if (d.datasets.length > 0) setDatasetId(d.datasets[0].id)
      })
      .catch(() => setDatasets([]))
  }, [])

  async function loadHeatmap() {
    if (!datasetId) return
    setLoading(true)
    setDataError(null)
    setHeatmapData(null)
    try {
      const data = await getCategorizedHeatmap(datasetId, nTopGenes)
      setHeatmapData(data)
    } catch (e) {
      setDataError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function generateRPlot() {
    if (!datasetId) return
    setRLoading(true)
    setRError(null)
    setRImageUrl(null)
    try {
      const url = await renderRCategoryHeatmaps(datasetId, nTopGenes)
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
      {/* Dataset selector + controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <label style={{ fontSize: '0.9em', fontWeight: 500 }}>
          Dataset:&nbsp;
          <select
            value={datasetId}
            onChange={e => { setDatasetId(e.target.value); setHeatmapData(null); setRImageUrl(null) }}
            style={{ padding: '3px 6px', fontSize: '0.9em', border: '1px solid #ccc', borderRadius: 3 }}
          >
            {!datasets && <option>Loading…</option>}
            {datasets && datasets.length === 0 && <option value="">No FPKM datasets uploaded yet</option>}
            {datasets && datasets.map(d => (
              <option key={d.id} value={d.id}>{d.id.slice(0, 8)}…</option>
            ))}
          </select>
        </label>

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
          disabled={!datasetId || loading}
          style={{ padding: '4px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: '0.88em' }}
        >
          {loading ? 'Loading…' : 'Load heatmap'}
        </button>
      </div>

      {dataError && <p style={{ color: '#dc2626' }}><strong>Error:</strong> {dataError}</p>}

      {/* Subtabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #ccc', marginBottom: 0 }}>
        <button style={tabStyle(subtab === TAB_PLOTLY)} onClick={() => setSubtab(TAB_PLOTLY)}>
          Interactive
        </button>
        <button style={tabStyle(subtab === TAB_R)} onClick={() => setSubtab(TAB_R)}>
          R-exact plot
        </button>
      </div>

      <div style={{ border: '1px solid #ccc', borderTop: 'none', padding: '1rem', background: '#fff' }}>
        {/* ── Interactive subtab ── */}
        {subtab === TAB_PLOTLY && (
          <div>
            {!heatmapData && !loading && (
              <p style={{ color: '#6b7280', margin: 0 }}>
                Select a dataset and click "Load heatmap" to render panels for all active categories.
              </p>
            )}
            {loading && <p style={{ color: '#555' }}>Computing z-scores…</p>}
            {heatmapData && (() => {
              const active = heatmapData.categories.filter(c => c.genes && c.genes.length > 0)
              return (
                <div>
                  <p style={{ color: '#6b7280', fontSize: '0.82em', margin: '0 0 12px' }}>
                    {active.length} active categor{active.length === 1 ? 'y' : 'ies'} · {heatmapData.samples.length} samples
                  </p>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 16,
                  }}>
                    {heatmapData.categories.map((cat, i) => (
                      <CategoryPanel
                        key={i}
                        cat={cat}
                        samples={heatmapData.samples}
                        grouping={heatmapData.grouping}
                      />
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* ── R-exact subtab ── */}
        {subtab === TAB_R && (
          <div>
            <p style={{ margin: '0 0 10px', color: '#374151', fontSize: '0.9em' }}>
              Renders all active categories using pheatmap in R, matching BulkSIX3SB's
              z-score + FPKM-label style. Output is 300 dpi PNG + PDF.
            </p>
            <button
              onClick={generateRPlot}
              disabled={!datasetId || rLoading}
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
