import { useState } from 'react'
import { renderProjectRHeatmap } from '../api/client'
import { ErrorMsg, ROutput } from './ui'

export default function RHeatmapPanel({ projectId, genes, clusterRows, defaultTitle, setNote }) {
  const [plotTitle, setPlotTitle] = useState(defaultTitle || '')
  const [loading, setLoading] = useState(false)
  const [imgUrl, setImgUrl] = useState(null)
  const [error, setError] = useState(null)

  const hasGenes = genes && genes.length > 0

  async function handleGenerate() {
    if (!hasGenes) return
    setLoading(true)
    setError(null)
    setImgUrl(null)
    try {
      setImgUrl(await renderProjectRHeatmap(projectId, {
        genes,
        clusterRows,
        plotTitle: plotTitle.trim() || defaultTitle || null,
      }))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ width: 196, flex: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label className="t-util t-util-field" htmlFor="rh-title"
                 style={{ display: 'block', marginBottom: 5 }}>
            Plot title
          </label>
          <input id="rh-title" type="text" className="fld" style={{ width: '100%' }}
                 value={plotTitle} placeholder={defaultTitle || 'Enter title…'}
                 onChange={e => setPlotTitle(e.target.value)} />
        </div>

        <p className="t-note" style={{ margin: 0 }}>
          Rendered by <code className="t-mono">render_heatmap.R</code> —{' '}
          <code className="t-mono">pheatmap(scale="row", color=rev(brewer.pal(11,"RdBu")),
          display_numbers=FPKM, annotation_col=condition, cluster_rows={String(!!clusterRows)})</code>{' '}
          at 300 dpi.
        </p>

        <p className="t-note" style={{ margin: 0 }}>
          {setNote} · {hasGenes ? `${genes.length} rows` : 'no rows selected'}
          {hasGenes && (clusterRows ? ' · rows clustered' : ' · source order')}
        </p>

        <button type="button" className="btn btn-primary"
                onClick={handleGenerate} disabled={loading || !hasGenes}>
          {loading ? 'Generating…' : 'Generate R plot'}
        </button>
      </div>

      <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 9 }}>
        <ErrorMsg label="R error">{error}</ErrorMsg>
        <ROutput imgUrl={imgUrl} filename="heatmap.png" alt="R pheatmap heatmap" />
      </div>
    </div>
  )
}
