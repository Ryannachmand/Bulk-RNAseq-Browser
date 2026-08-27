import { useEffect, useState } from 'react'
import Plot from 'react-plotly.js'
import { getProjectPathwayResults, renderProjectRPathwayBarplot } from '../api/client'

const TAB_PLOTLY = 'plotly'
const TAB_R      = 'r'

export default function PathwayBarplotSection({ projectId, projectName }) {
  const [directionAvailable, setDirAvail] = useState(false)
  const [tab, setTab]                     = useState(TAB_PLOTLY)
  const [topN, setTopN]                   = useState(20)
  const [plotTitle, setPlotTitle]         = useState(projectName || 'Pathway Enrichment')

  const [loading, setLoading]             = useState(true)
  const [rows, setRows]                   = useState(null)
  const [loadError, setLoadError]         = useState(null)

  const [rLoading, setRLoading]           = useState(false)
  const [rError, setRError]               = useState(null)
  const [rImageUrl, setRImageUrl]         = useState(null)

  useEffect(() => {
    setLoading(true)
    setLoadError(null)
    getProjectPathwayResults(projectId, topN)
      .then(({ rows: r, direction_available }) => {
        setRows(r)
        setDirAvail(direction_available)
        setLoading(false)
      })
      .catch(e => {
        setLoadError(e.message)
        setLoading(false)
      })
  }, [projectId, topN])

  async function handleRender() {
    setRLoading(true)
    setRError(null)
    setRImageUrl(null)
    try {
      const url = await renderProjectRPathwayBarplot(projectId, { topN, plotTitle })
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

  if (loading) return <p style={{ color: '#555' }}>Loading pathway data…</p>
  if (loadError) return <p style={{ color: '#cc2222' }}><strong>Error:</strong> {loadError}</p>

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #ccc' }}>
        <button style={tabStyle(tab === TAB_PLOTLY)} onClick={() => setTab(TAB_PLOTLY)}>
          Interactive (Plotly)
        </button>
        <button style={tabStyle(tab === TAB_R)} onClick={() => setTab(TAB_R)}>
          R-exact
        </button>
      </div>

      <div style={{ border: '1px solid #ccc', borderTop: 'none', padding: '1rem', background: '#fff' }}>
        {/* Shared top-N control */}
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

        {/* Interactive tab */}
        {tab === TAB_PLOTLY && (
          <>
            {rows && <PathwayPlot rows={rows} directionAvailable={directionAvailable} />}
            {!rows && <p style={{ color: '#555' }}>No pathway data to display.</p>}
          </>
        )}

        {/* R-exact tab */}
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
    </div>
  )
}


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
    const up   = rows.filter(r => String(r.direction || '').toLowerCase().startsWith('up'))
    const down = rows.filter(r => String(r.direction || '').toLowerCase().startsWith('down'))
    const all  = [...rows].sort((a, b) => a.neg_log10_padj_signed - b.neg_log10_padj_signed)
    const yLabels = all.map(r => r.Description_short)

    const makeTrace = (subset, color, name) => ({
      type: 'bar',
      orientation: 'h',
      name,
      x: subset.map(r => r.neg_log10_padj_signed),
      y: subset.map(r => r.Description_short),
      marker: { color },
      customdata: subset.map(r => ({ desc: r.Description, padj: r['p.adjust'], genes: r.geneID, count: r.Count })),
      hovertemplate: '<b>%{customdata.desc}</b><br>p.adjust: %{customdata.padj:.2e}<br>Gene count: %{customdata.count}<br>Genes: %{customdata.genes}<extra></extra>',
      text: subset.map(r => `n=${r.Count}`),
      textposition: 'outside',
    })

    traces = [makeTrace(up, UP_COLOR, 'Upregulated'), makeTrace(down, DOWN_COLOR, 'Downregulated')]
    const maxAbsVal = Math.max(...all.map(r => Math.abs(r.neg_log10_padj_signed))) * 1.25
    const range = maxAbsVal
    const step  = range / 4
    const ticks = [-4, -3, -2, -1, 0, 1, 2, 3, 4].map(i => i * step)

    layout = {
      barmode: 'overlay',
      xaxis: {
        title: '-log10(adjusted p-value)',
        range: [-maxAbsVal, maxAbsVal],
        tickvals: ticks,
        ticktext: ticks.map(v => Math.abs(v).toFixed(1)),
        automargin: true,
      },
      yaxis: { categoryorder: 'array', categoryarray: yLabels, automargin: true, tickfont: { size: 12 } },
      shapes: [{ type: 'line', x0: 0, x1: 0, y0: -0.5, y1: rows.length - 0.5, yref: 'paper', xref: 'x', line: { color: 'black', width: 1 } }],
      legend: { orientation: 'h', y: -0.15 },
      margin: { l: 20, r: 20, t: 40, b: 60 },
      height: Math.max(400, rows.length * 22 + 120),
    }
  } else {
    const sorted = [...rows].sort((a, b) => a.neg_log10_padj - b.neg_log10_padj)
    traces = [{
      type: 'bar',
      orientation: 'h',
      name: 'Pathways',
      x: sorted.map(r => r.neg_log10_padj),
      y: sorted.map(r => r.Description_short),
      marker: { color: SOLO_COLOR },
      customdata: sorted.map(r => ({ desc: r.Description, padj: r['p.adjust'], genes: r.geneID, count: r.Count })),
      hovertemplate: '<b>%{customdata.desc}</b><br>p.adjust: %{customdata.padj:.2e}<br>Gene count: %{customdata.count}<br>Genes: %{customdata.genes}<extra></extra>',
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
      layout={{ ...layout, paper_bgcolor: 'white', plot_bgcolor: 'white', font: { family: 'system-ui, sans-serif', size: 12 } }}
      config={{ responsive: true, displayModeBar: true, toImageButtonOptions: { format: 'png', scale: 2 } }}
      style={{ width: '100%' }}
      useResizeHandler
    />
  )
}
