import Plot from 'react-plotly.js'

// Reversed RdBu: blue=low z-score, red=high z-score (matching R's rev(brewer.pal(11,"RdBu")))
const RDBU_REV = [
  [0,    '#053061'],
  [0.09, '#2166ac'],
  [0.18, '#4393c3'],
  [0.27, '#92c5de'],
  [0.36, '#d1e5f0'],
  [0.5,  '#f7f7f7'],
  [0.64, '#fddbc7'],
  [0.73, '#f4a582'],
  [0.82, '#d6604d'],
  [0.91, '#b2182b'],
  [1.0,  '#67001f'],
]

// Set2 palette for condition groups (matches R's brewer.pal(8,"Set2"))
const GROUP_COLORS = [
  '#66C2A5', '#FC8D62', '#8DA0CB', '#E78AC3',
  '#A6D854', '#FFD92F', '#E5C494', '#B3B3B3',
]

export default function HeatmapPlot({ data }) {
  const { genes, samples, z_scores, fpkm_labels, grouping } = data

  const nGenes   = genes.length
  const nSamples = samples.length

  // Cell text font size — scale down for larger heatmaps
  const textFontSize = Math.max(6, Math.min(11, Math.floor(240 / nGenes)))

  // ── Build heatmap traces ──────────────────────────────────────────────────

  const traces = []

  // Annotation bar (shown only when grouping was detected)
  if (grouping.detected) {
    const { group_order, sample_to_group } = grouping
    const groupIndex = group_order.reduce((acc, g, i) => { acc[g] = i; return acc }, {})
    const zRow = [samples.map(s => groupIndex[sample_to_group[s]] ?? 0)]

    // Build a step colorscale mapping each integer to a group color
    const n = group_order.length
    const groupColorscale = []
    group_order.forEach((_, i) => {
      const color = GROUP_COLORS[i % GROUP_COLORS.length]
      groupColorscale.push([i / n,       color])
      groupColorscale.push([(i + 1) / n, color])
    })

    const hoverText = [samples.map(s => sample_to_group[s] || '')]

    traces.push({
      type: 'heatmap',
      z: zRow,
      x: samples,
      y: ['Group'],
      colorscale: groupColorscale,
      showscale: false,
      zmin: 0,
      zmax: n,
      xgap: 1,
      ygap: 1,
      text: hoverText,
      hovertemplate: '%{x}<br>%{text}<extra></extra>',
      yaxis: 'y2',
      xaxis: 'x',
    })
  }

  // Main heatmap: z-score colors + FPKM label text
  traces.push({
    type: 'heatmap',
    z: z_scores,
    x: samples,
    y: genes,
    colorscale: RDBU_REV,
    zmin: -3,
    zmax: 3,
    text: fpkm_labels,
    texttemplate: '%{text}',
    textfont: { size: textFontSize, color: '#333333' },
    showscale: true,
    colorbar: {
      title: { text: 'z-score', side: 'right' },
      thickness: 15,
      len: 0.6,
    },
    xgap: 1,
    ygap: 1,
    hovertemplate: '<b>%{y}</b><br>%{x}<br>z-score: %{z:.2f}<br>FPKM: %{text}<extra></extra>',
    yaxis: 'y',
    xaxis: 'x',
  })

  // ── Layout ────────────────────────────────────────────────────────────────

  const hasBar = grouping.detected
  const mainDomainTop = hasBar ? 0.90 : 1.0

  const plotHeight = Math.max(350, Math.min(900, nGenes * 22 + 100))
  const plotWidth  = Math.max(500, Math.min(1100, nSamples * 55 + 200))

  const layout = {
    // Main heatmap y-axis: first gene at top
    yaxis: {
      domain: [0, mainDomainTop],
      autorange: 'reversed',
      tickfont: { size: 12 },
      fixedrange: true,
    },
    // Annotation bar y-axis (only used when grouping detected)
    yaxis2: {
      domain: [mainDomainTop + 0.03, 1.0],
      showticklabels: hasBar,
      tickfont: { size: 10 },
      fixedrange: true,
      anchor: 'x',
    },
    xaxis: {
      anchor: 'y',
      tickangle: -45,
      tickfont: { size: 11 },
      fixedrange: true,
    },
    height: plotHeight,
    width:  plotWidth,
    margin: { t: 20, b: 90, l: 130, r: 80 },
    paper_bgcolor: '#ffffff',
    plot_bgcolor:  '#ffffff',
  }

  const groupingNote = !grouping.detected
    ? 'Sample grouping not detected — column names do not share a common prefix with a trailing replicate suffix (e.g. CTRL_1, CTRL_2). No annotation bar shown.'
    : null

  return (
    <div>
      {groupingNote && (
        <p style={{
          margin: '0 0 0.5rem',
          padding: '0.4rem 0.75rem',
          background: '#fffbe6',
          border: '1px solid #e6c700',
          borderRadius: 4,
          fontSize: '0.85em',
          color: '#666',
        }}>
          {groupingNote}
        </p>
      )}

      <Plot
        data={traces}
        layout={layout}
        config={{ responsive: false, displayModeBar: true, scrollZoom: false }}
        style={{ display: 'block' }}
      />
    </div>
  )
}
