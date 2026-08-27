import { useMemo, useState } from 'react'
import Plot from 'react-plotly.js'
import { getProjectCategoryVolcano, renderProjectRCategoryVolcanos } from '../api/client'

const UP_COLOR   = '#B22222'
const DOWN_COLOR = '#4878CF'
const NS_COLOR   = '#9ca3af'

const TAB_PLOTLY = 'plotly'
const TAB_R      = 'r'

function CategoryVolcanoPanel({ cat, allGenes, padjCutoff, lfcCutoff }) {
  const catSet = useMemo(() => new Set(cat.genes), [cat.genes])
  const nCatGenes = cat.genes.length

  const { bgX, bgY, catX, catY, catColors, catTexts, catLabels } = useMemo(() => {
    const bgX = [], bgY = []
    const catX = [], catY = [], catColors = [], catTexts = [], catLabels = []

    const catRows = allGenes.filter(r => catSet.has(r.symbol) && r.log2FoldChange != null && r.padj != null)
    const upSig   = catRows.filter(r => r.padj < padjCutoff && r.log2FoldChange >  lfcCutoff).sort((a, b) => a.padj - b.padj)
    const downSig = catRows.filter(r => r.padj < padjCutoff && r.log2FoldChange < -lfcCutoff).sort((a, b) => a.padj - b.padj)
    const toLabel = new Set([
      ...upSig.slice(0, 8).map(r => r.symbol),
      ...downSig.slice(0, 8).map(r => r.symbol),
    ])

    for (const r of allGenes) {
      if (r.log2FoldChange == null || r.padj == null || !isFinite(r.log2FoldChange)) continue
      const negLogP = r.padj > 0 ? Math.min(-Math.log10(r.padj), 300) : 300
      if (!catSet.has(r.symbol)) {
        bgX.push(r.log2FoldChange)
        bgY.push(negLogP)
      } else {
        const isUp   = r.padj < padjCutoff && r.log2FoldChange >  lfcCutoff
        const isDown = r.padj < padjCutoff && r.log2FoldChange < -lfcCutoff
        catX.push(r.log2FoldChange)
        catY.push(negLogP)
        catColors.push(isUp ? UP_COLOR : isDown ? DOWN_COLOR : NS_COLOR)
        catTexts.push(`<b>${r.symbol}</b><br>log2FC: ${r.log2FoldChange.toFixed(3)}<br>padj: ${r.padj.toExponential(2)}`)
        catLabels.push(toLabel.has(r.symbol) ? r.symbol : '')
      }
    }
    return { bgX, bgY, catX, catY, catColors, catTexts, catLabels }
  }, [allGenes, catSet, padjCutoff, lfcCutoff])

  const nUp   = catColors.filter(c => c === UP_COLOR).length
  const nDown = catColors.filter(c => c === DOWN_COLOR).length

  const threshold = -Math.log10(padjCutoff)
  const shapes = [
    { type: 'line', xref: 'paper', x0: 0, x1: 1, yref: 'y', y0: threshold, y1: threshold,
      line: { color: '#999', width: 1, dash: 'dash' } },
    { type: 'line', xref: 'x', x0:  lfcCutoff, x1:  lfcCutoff, yref: 'paper', y0: 0, y1: 1,
      line: { color: '#999', width: 1, dash: 'dash' } },
    { type: 'line', xref: 'x', x0: -lfcCutoff, x1: -lfcCutoff, yref: 'paper', y0: 0, y1: 1,
      line: { color: '#999', width: 1, dash: 'dash' } },
  ]

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 6 }}>
      <div style={{ padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb', fontWeight: 600, fontSize: '0.9em', borderRadius: '6px 6px 0 0' }}>
        {cat.name}
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: '0.82em' }}>
          {nCatGenes} genes in category · {nUp} up · {nDown} down
        </span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <Plot
          data={[
            {
              x: bgX, y: bgY, mode: 'markers', type: 'scattergl',
              marker: { color: '#e5e7eb', size: 3, opacity: 0.35 },
              hoverinfo: 'skip',
              showlegend: false,
            },
            {
              x: catX, y: catY, mode: 'markers+text', type: 'scatter',
              marker: { color: catColors, size: 7, opacity: 0.85 },
              text: catLabels,
              textposition: 'top center',
              textfont: { size: 9, color: '#222' },
              hovertext: catTexts,
              hoverinfo: 'text',
              showlegend: false,
            },
          ]}
          layout={{
            xaxis: { title: 'log2 Fold Change', zeroline: false, titlefont: { size: 12 } },
            yaxis: { title: '-log10(padj)', zeroline: false, titlefont: { size: 12 } },
            shapes,
            width: 520,
            height: 420,
            margin: { t: 20, b: 55, l: 65, r: 20 },
            hovermode: 'closest',
            paper_bgcolor: '#ffffff',
            plot_bgcolor: '#ffffff',
          }}
          config={{ responsive: false, displayModeBar: false }}
        />
      </div>
    </div>
  )
}

export default function CategoryVolcanoSection({ projectId }) {
  const [padjCutoff, setPadjCutoff] = useState(0.05)
  const [lfcCutoff, setLfcCutoff]   = useState(1.0)
  const [subtab, setSubtab]         = useState(TAB_PLOTLY)

  const [loading, setLoading]       = useState(false)
  const [volcData, setVolcData]     = useState(null)
  const [dataError, setDataError]   = useState(null)

  const [rLoading, setRLoading]     = useState(false)
  const [rImageUrl, setRImageUrl]   = useState(null)
  const [rError, setRError]         = useState(null)

  async function loadVolcano() {
    setLoading(true)
    setDataError(null)
    setVolcData(null)
    try {
      const data = await getProjectCategoryVolcano(projectId)
      setVolcData(data)
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
      const url = await renderProjectRCategoryVolcanos(projectId, { padjCutoff, lfcCutoff, nLabel: 15 })
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
          padj cutoff:&nbsp;
          <input type="number" min={0} max={1} step={0.01} value={padjCutoff}
            onChange={e => setPadjCutoff(Number(e.target.value))}
            style={{ width: 65, padding: '3px 5px', border: '1px solid #ccc', borderRadius: 3 }} />
        </label>

        <label style={{ fontSize: '0.9em' }}>
          |log2FC| cutoff:&nbsp;
          <input type="number" min={0} step={0.1} value={lfcCutoff}
            onChange={e => setLfcCutoff(Number(e.target.value))}
            style={{ width: 65, padding: '3px 5px', border: '1px solid #ccc', borderRadius: 3 }} />
        </label>

        <button
          onClick={loadVolcano}
          disabled={loading}
          style={{ padding: '4px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: '0.88em' }}
        >
          {loading ? 'Loading…' : 'Load volcanos'}
        </button>
      </div>

      {dataError && <p style={{ color: '#dc2626' }}><strong>Error:</strong> {dataError}</p>}

      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #ccc' }}>
        <button style={tabStyle(subtab === TAB_PLOTLY)} onClick={() => setSubtab(TAB_PLOTLY)}>Interactive</button>
        <button style={tabStyle(subtab === TAB_R)} onClick={() => setSubtab(TAB_R)}>R-exact plot</button>
      </div>

      <div style={{ border: '1px solid #ccc', borderTop: 'none', padding: '1rem', background: '#fff' }}>
        {subtab === TAB_PLOTLY && (
          <div>
            {!volcData && !loading && (
              <p style={{ color: '#6b7280', margin: 0 }}>
                Click "Load volcanos" to render one panel per active category.
              </p>
            )}
            {loading && <p style={{ color: '#555' }}>Loading…</p>}
            {volcData && (
              <div>
                <p style={{ color: '#6b7280', fontSize: '0.82em', margin: '0 0 12px' }}>
                  {volcData.categories.length} active categories · {volcData.all_genes.length} DE genes total.
                  Category genes are coloured; background shows all other genes in grey.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                  {volcData.categories.map((cat, i) => (
                    <CategoryVolcanoPanel
                      key={i}
                      cat={cat}
                      allGenes={volcData.all_genes}
                      padjCutoff={padjCutoff}
                      lfcCutoff={lfcCutoff}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {subtab === TAB_R && (
          <div>
            <p style={{ margin: '0 0 10px', color: '#374151', fontSize: '0.9em' }}>
              Renders all active categories as a patchwork volcano using ggplot2 + ggrepel,
              matching Ola's DiffExpr_Grid.R styling. Category genes are highlighted;
              background shows all other DE genes in grey. Output is PNG (200 dpi) + PDF.
            </p>
            <button
              onClick={generateRPlot}
              disabled={rLoading}
              style={{ padding: '5px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: '0.9em' }}
            >
              {rLoading ? 'Generating…' : 'Generate R plot'}
            </button>
            {rLoading && <p style={{ color: '#555', marginTop: 8 }}>Running R… this may take 20–40 s.</p>}
            {rError && <p style={{ color: '#dc2626', marginTop: 8 }}><strong>Error:</strong> {rError}</p>}
            {rImageUrl && (
              <div style={{ marginTop: 14 }}>
                <img src={rImageUrl} alt="R category volcanos"
                  style={{ maxWidth: '100%', border: '1px solid #e5e7eb', borderRadius: 4 }} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
