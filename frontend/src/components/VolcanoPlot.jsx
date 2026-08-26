import { useMemo, useState } from 'react'
import Plot from 'react-plotly.js'

const UP_COLOR = '#E41A1C'
const DOWN_COLOR = '#4878CF'
const NS_COLOR = '#B3B3B3'
const LINE_COLOR = '#999999'

export default function VolcanoPlot({ rows }) {
  const [padjCutoff, setPadjCutoff] = useState(0.05)
  const [lfcCutoff, setLfcCutoff] = useState(1)

  const { x, y, colors, texts } = useMemo(() => {
    const x = [], y = [], colors = [], texts = []
    for (const r of rows) {
      const lfc = r.log2FoldChange
      const padj = r.padj
      if (lfc == null || padj == null || !isFinite(lfc) || !isFinite(padj)) continue

      // Cap -log10(padj) at 300 to avoid Inf from padj=0
      const negLogP = padj > 0 ? Math.min(-Math.log10(padj), 300) : 300

      x.push(lfc)
      y.push(negLogP)
      texts.push(
        `<b>${r.gene}</b><br>log2FC: ${lfc.toFixed(3)}<br>padj: ${padj.toExponential(2)}`
      )

      const sig = padj < padjCutoff && Math.abs(lfc) > lfcCutoff
      colors.push(!sig ? NS_COLOR : lfc > 0 ? UP_COLOR : DOWN_COLOR)
    }
    return { x, y, colors, texts }
  }, [rows, padjCutoff, lfcCutoff])

  const threshold = -Math.log10(padjCutoff)

  const shapes = [
    // horizontal padj threshold line
    {
      type: 'line', xref: 'paper', x0: 0, x1: 1,
      yref: 'y', y0: threshold, y1: threshold,
      line: { color: LINE_COLOR, width: 1, dash: 'dash' },
    },
    // vertical lfc cutoffs
    {
      type: 'line', xref: 'x', x0: lfcCutoff, x1: lfcCutoff,
      yref: 'paper', y0: 0, y1: 1,
      line: { color: LINE_COLOR, width: 1, dash: 'dash' },
    },
    {
      type: 'line', xref: 'x', x0: -lfcCutoff, x1: -lfcCutoff,
      yref: 'paper', y0: 0, y1: 1,
      line: { color: LINE_COLOR, width: 1, dash: 'dash' },
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', gap: '2rem', marginBottom: '0.5rem', alignItems: 'center' }}>
        <label>
          padj cutoff:{' '}
          <input
            type="number" value={padjCutoff} min={0} max={1} step={0.01}
            style={{ width: 70 }}
            onChange={e => setPadjCutoff(Number(e.target.value))}
          />
        </label>
        <label>
          |log2FC| cutoff:{' '}
          <input
            type="number" value={lfcCutoff} min={0} step={0.1}
            style={{ width: 70 }}
            onChange={e => setLfcCutoff(Number(e.target.value))}
          />
        </label>
        <span style={{ color: '#555', fontSize: '0.9em' }}>
          {colors.filter(c => c === UP_COLOR).length} up &nbsp;|&nbsp;
          {colors.filter(c => c === DOWN_COLOR).length} down &nbsp;|&nbsp;
          {colors.filter(c => c === NS_COLOR).length} NS
        </span>
      </div>

      <Plot
        data={[{
          x, y,
          mode: 'markers',
          type: 'scattergl',
          marker: { color: colors, size: 5, opacity: 0.7 },
          text: texts,
          hoverinfo: 'text',
        }]}
        layout={{
          title: { text: 'Volcano Plot', font: { size: 16 } },
          xaxis: { title: 'log₂ Fold Change', zeroline: false },
          yaxis: { title: '-log₁₀(padj)', zeroline: false },
          shapes,
          width: 720,
          height: 560,
          margin: { t: 55, b: 55, l: 65, r: 20 },
          hovermode: 'closest',
        }}
        config={{ responsive: true, displayModeBar: true }}
      />
    </div>
  )
}
