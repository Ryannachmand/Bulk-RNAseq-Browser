import { useEffect, useRef, useState } from 'react'
import Plot from 'react-plotly.js'
import {
  getPathwayResults,
  renderRPathwayBarplot,
  uploadPathway,
} from '../api/client'

const TAB_PLOTLY = 'plotly'
const TAB_R      = 'r'

export default function PathwayBarplotSection() {
  const [uploading, setUploading]         = useState(false)
  const [uploadError, setUploadError]     = useState(null)
  const [datasetId, setDatasetId]         = useState(null)
  const [directionAvailable, setDirAvail] = useState(false)
  const [tab, setTab]                     = useState(TAB_PLOTLY)

  // shared top-N state (kept in sync between tabs)
  const [topN, setTopN]             = useState(20)
  const [plotTitle, setPlotTitle]   = useState('Pathway Enrichment')

  // interactive tab
  const [rows, setRows]       = useState(null)
  const [loadError, setLoadError] = useState(null)

  // R tab
  const [rLoading, setRLoading]   = useState(false)
  const [rError, setRError]       = useState(null)
  const [rImageUrl, setRImageUrl] = useState(null)
  const fileInputRef              = useRef(null)

  // Re-fetch interactive data when topN or datasetId changes
  useEffect(() => {
    if (!datasetId) return
    setLoadError(null)
    getPathwayResults(datasetId, topN)
      .then(({ rows: r, direction_available }) => {
        setRows(r)
        setDirAvail(direction_available)
      })
      .catch(e => setLoadError(e.message))
  }, [datasetId, topN])

  async function handleUpload(file) {
    setUploadError(null)
    setRows(null)
    setDatasetId(null)
    setRImageUrl(null)
    setUploading(true)
    try {
      const { dataset_id, direction_available } = await uploadPathway(file)
      setDatasetId(dataset_id)
      setDirAvail(direction_available)
      setTab(TAB_PLOTLY)
    } catch (e) {
      setUploadError(e.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleRender() {
    setRLoading(true)
    setRError(null)
    setRImageUrl(null)
    try {
      const url = await renderRPathwayBarplot(datasetId, { topN, plotTitle })
      setRImageUrl(url)
    } catch (e) {
      setRError(e.message)
    } finally {
      setRLoading(false)
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
      {/* Upload area */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'inline-block', cursor: 'pointer' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv"
            style={{ display: 'none' }}
            onChange={e => { if (e.target.files[0]) handleUpload(e.target.files[0]) }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              padding: '0.5rem 1.2rem',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: uploading ? 'not-allowed' : 'pointer',
              opacity: uploading ? 0.6 : 1,
            }}
          >
            {uploading ? 'Uploading…' : 'Upload pathway results CSV'}
          </button>
        </label>
        <span style={{ marginLeft: '0.75rem', fontSize: '0.85em', color: '#555' }}>
          clusterProfiler enrichGO / enrichKEGG output — expects columns: ID, Description, p.adjust, Count, geneID
        </span>
      </div>

      {uploadError && (
        <p style={{ color: '#cc2222' }}><strong>Error:</strong> {uploadError}</p>
      )}

      {datasetId && (
        <>
          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #ccc', marginTop: '1rem' }}>
            <button style={tabStyle(tab === TAB_PLOTLY)} onClick={() => setTab(TAB_PLOTLY)}>
              Interactive (Plotly)
            </button>
            <button style={tabStyle(tab === TAB_R)} onClick={() => setTab(TAB_R)}>
              R-exact
            </button>
          </div>

          <div style={{ border: '1px solid #ccc', borderTop: 'none', padding: '1rem', background: '#fff' }}>
            {/* ── Shared top-N control ── */}
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9em' }}>
                Top pathways per direction:
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={topN}
                  onChange={e => setTopN(Number(e.target.value))}
                  style={{ width: 60, padding: '0.2rem 0.4rem', border: '1px solid #ccc', borderRadius: 3 }}
                />
              </label>

              {!directionAvailable && (
                <span style={{
                  background: '#fef9c3',
                  border: '1px solid #ca8a04',
                  borderRadius: 4,
                  padding: '0.2rem 0.6rem',
                  fontSize: '0.82em',
                  color: '#78350f',
                }}>
                  Direction data not available — showing pathways sorted by significance
                </span>
              )}
            </div>

            {/* ── Interactive tab ── */}
            {tab === TAB_PLOTLY && (
              <>
                {loadError && (
                  <p style={{ color: '#cc2222' }}><strong>Error:</strong> {loadError}</p>
                )}
                {rows && <PathwayPlot rows={rows} directionAvailable={directionAvailable} />}
              </>
            )}

            {/* ── R-exact tab ── */}
            {tab === TAB_R && (
              <div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9em' }}>
                    Plot title:
                    <input
                      type="text"
                      value={plotTitle}
                      onChange={e => setPlotTitle(e.target.value)}
                      style={{ width: 220, padding: '0.2rem 0.4rem', border: '1px solid #ccc', borderRadius: 3 }}
                    />
                  </label>
                  <button
                    onClick={handleRender}
                    disabled={rLoading}
                    style={{
                      padding: '0.4rem 1rem',
                      background: '#16a34a',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      cursor: rLoading ? 'not-allowed' : 'pointer',
                      opacity: rLoading ? 0.6 : 1,
                    }}
                  >
                    {rLoading ? 'Generating…' : 'Generate R plot'}
                  </button>
                </div>

                {rError && (
                  <p style={{ color: '#cc2222' }}><strong>R error:</strong> {rError}</p>
                )}

                {rImageUrl && (
                  <div>
                    <img src={rImageUrl} alt="Pathway barplot" style={{ maxWidth: '100%', border: '1px solid #eee' }} />
                    <div style={{ marginTop: '0.5rem', fontSize: '0.85em', color: '#555' }}>
                      <a href={rImageUrl} download="pathway_barplot.png">Download PNG</a>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}


// ── Interactive Plotly barplot ─────────────────────────────────────────────────

function PathwayPlot({ rows, directionAvailable }) {
  if (!rows || rows.length === 0) {
    return <p style={{ color: '#555' }}>No pathways to display.</p>
  }

  const UP_COLOR   = '#E41A1C'
  const DOWN_COLOR = '#FB9A99'
  const SOLO_COLOR = '#E41A1C'

  let traces
  let layout

  if (directionAvailable) {
    // Build diverging barplot: one trace per direction so legend works
    const up   = rows.filter(r => String(r.direction || '').toLowerCase().startsWith('up'))
    const down = rows.filter(r => String(r.direction || '').toLowerCase().startsWith('down'))

    // Sort by signed value so the combined list looks right (Plotly y-axis will be categorical)
    const all = [...rows].sort((a, b) => a.neg_log10_padj_signed - b.neg_log10_padj_signed)

    const yLabels = all.map(r => r.Description_short)

    const makeTrace = (subset, color, name) => ({
      type: 'bar',
      orientation: 'h',
      name,
      x: subset.map(r => r.neg_log10_padj_signed),
      y: subset.map(r => r.Description_short),
      marker: { color },
      customdata: subset.map(r => ({
        desc: r.Description,
        padj: r['p.adjust'],
        genes: r.geneID,
        count: r.Count,
      })),
      hovertemplate:
        '<b>%{customdata.desc}</b><br>' +
        'p.adjust: %{customdata.padj:.2e}<br>' +
        'Gene count: %{customdata.count}<br>' +
        'Genes: %{customdata.genes}<extra></extra>',
      text: subset.map(r => `n=${r.Count}`),
      textposition: subset.map(r =>
        String(r.direction || '').toLowerCase().startsWith('up') ? 'outside' : 'outside'
      ),
    })

    traces = [
      makeTrace(up,   UP_COLOR,   'Upregulated'),
      makeTrace(down, DOWN_COLOR, 'Downregulated'),
    ]

    const maxAbsVal = Math.max(...all.map(r => Math.abs(r.neg_log10_padj_signed))) * 1.25

    layout = {
      barmode: 'overlay',
      xaxis: {
        title: '-log10(adjusted p-value)',
        range: [-maxAbsVal, maxAbsVal],
        tickvals: null,
        ticktext: null,
        // Show absolute values on axis
        tickformat: '.1f',
        automargin: true,
      },
      yaxis: {
        categoryorder: 'array',
        categoryarray: yLabels,
        automargin: true,
        tickfont: { size: 12 },
      },
      shapes: [{
        type: 'line',
        x0: 0, x1: 0, y0: -0.5, y1: rows.length - 0.5,
        yref: 'paper',
        xref: 'x',
        line: { color: 'black', width: 1 },
      }],
      legend: { orientation: 'h', y: -0.15 },
      margin: { l: 20, r: 20, t: 40, b: 60 },
      height: Math.max(400, rows.length * 22 + 120),
    }

    // Apply absolute-value tick labels via ticktext
    const range = maxAbsVal
    const step  = range / 4
    const ticks = [-4, -3, -2, -1, 0, 1, 2, 3, 4].map(i => i * step)
    layout.xaxis.tickvals = ticks
    layout.xaxis.ticktext = ticks.map(v => Math.abs(v).toFixed(1))

  } else {
    // Single-direction: sort descending by significance, bars going right
    const sorted = [...rows].sort((a, b) => a.neg_log10_padj - b.neg_log10_padj)

    traces = [{
      type: 'bar',
      orientation: 'h',
      name: 'Pathways',
      x: sorted.map(r => r.neg_log10_padj),
      y: sorted.map(r => r.Description_short),
      marker: { color: SOLO_COLOR },
      customdata: sorted.map(r => ({
        desc: r.Description,
        padj: r['p.adjust'],
        genes: r.geneID,
        count: r.Count,
      })),
      hovertemplate:
        '<b>%{customdata.desc}</b><br>' +
        'p.adjust: %{customdata.padj:.2e}<br>' +
        'Gene count: %{customdata.count}<br>' +
        'Genes: %{customdata.genes}<extra></extra>',
      text: sorted.map(r => `n=${r.Count}`),
      textposition: 'outside',
    }]

    layout = {
      xaxis: { title: '-log10(adjusted p-value)', automargin: true },
      yaxis: { automargin: true, tickfont: { size: 12 } },
      margin: { l: 20, r: 60, t: 40, b: 40 },
      height: Math.max(350, rows.length * 22 + 100),
      showlegend: false,
    }
  }

  return (
    <Plot
      data={traces}
      layout={{
        ...layout,
        paper_bgcolor: 'white',
        plot_bgcolor: 'white',
        font: { family: 'system-ui, sans-serif', size: 12 },
      }}
      config={{ responsive: true, displayModeBar: true, toImageButtonOptions: { format: 'png', scale: 2 } }}
      style={{ width: '100%' }}
      useResizeHandler
    />
  )
}
