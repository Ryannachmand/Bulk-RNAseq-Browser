import { useState } from 'react'
import Plot from 'react-plotly.js'

const CONDITION_COLORS = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2',
  '#59a14f', '#edc948', '#b07aa1', '#ff9da7',
  '#9c755f', '#bab0ac',
]

function buildTraces(block, rawBlock, pcX, pcY) {
  const samples  = rawBlock.samples || []
  const xVals    = block[pcX] || []
  const yVals    = block[pcY] || []
  const meta     = rawBlock.sample_meta || {}

  const conditionMap = {}
  samples.forEach((s, i) => {
    const cond = meta[s]?.condition ?? s
    if (!conditionMap[cond]) conditionMap[cond] = { x: [], y: [], text: [] }
    conditionMap[cond].x.push(xVals[i])
    conditionMap[cond].y.push(yVals[i])
    conditionMap[cond].text.push(s)
  })

  return Object.entries(conditionMap).map(([cond, pts], idx) => ({
    type: 'scatter',
    mode: 'markers',
    name: cond,
    x: pts.x,
    y: pts.y,
    text: pts.text,
    hovertemplate: '<b>%{text}</b><br>X: %{x:.2f}<br>Y: %{y:.2f}<extra></extra>',
    marker: {
      color: CONDITION_COLORS[idx % CONDITION_COLORS.length],
      size: 9,
      opacity: 0.85,
      line: { width: 0.5, color: '#fff' },
    },
  }))
}

export default function PCAPlot({ pcaData }) {
  const [pcPair, setPcPair] = useState('PC1_PC2')
  const [useCorrected, setUseCorrected] = useState(false)

  const hasCorrected = !!pcaData.corrected

  const pcX = 'PC1'
  const pcY = pcPair === 'PC1_PC2' ? 'PC2' : 'PC3'

  const block   = useCorrected && hasCorrected ? pcaData.corrected : pcaData.raw
  const rawBlock = pcaData.raw

  const varExp = block.var_explained || []
  const pcIdx  = { PC1: 0, PC2: 1, PC3: 2 }
  const xLabel = `${pcX}: ${(varExp[pcIdx[pcX]] ?? 0).toFixed(1)}% variance`
  const yLabel = `${pcY}: ${(varExp[pcIdx[pcY]] ?? 0).toFixed(1)}% variance`

  const traces = buildTraces(block, rawBlock, pcX, pcY)

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', marginBottom: '0.75rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9em' }}>
          PC pair:
          <select
            value={pcPair}
            onChange={e => setPcPair(e.target.value)}
            style={{ marginLeft: 4, fontSize: '0.9em' }}
          >
            <option value="PC1_PC2">PC1 vs PC2</option>
            <option value="PC1_PC3">PC1 vs PC3</option>
          </select>
        </label>

        {hasCorrected && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9em' }}>
            <input
              type="checkbox"
              checked={useCorrected}
              onChange={e => setUseCorrected(e.target.checked)}
            />
            Batch-corrected
          </label>
        )}
      </div>

      <p style={{ fontSize: '0.8em', color: '#6b7280', fontStyle: 'italic', margin: '0 0 0.5rem' }}>
        PCA computed from FPKM (log2-transformed), not VST — exact VST-based PCA requires raw counts,
        available in a future update.
      </p>

      <Plot
        data={traces}
        layout={{
          xaxis: { title: { text: xLabel }, zeroline: false },
          yaxis: { title: { text: yLabel }, zeroline: false },
          legend: { title: { text: 'Condition' } },
          margin: { t: 20, r: 180, b: 60, l: 70 },
          hovermode: 'closest',
          plot_bgcolor: '#fff',
          paper_bgcolor: '#fff',
        }}
        style={{ width: '100%', height: 460 }}
        config={{ displayModeBar: true, modeBarButtonsToRemove: ['lasso2d', 'select2d'] }}
        useResizeHandler
      />

      <div style={{ fontSize: '0.8em', color: '#6b7280', marginTop: '0.25rem' }}>
        Computed from top {pcaData.n_genes_used} most-variable genes.
      </div>
    </div>
  )
}
