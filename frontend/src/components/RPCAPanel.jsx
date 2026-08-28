import { useState } from 'react'
import { renderProjectRPca } from '../api/client'
import { ErrorMsg, ROutput } from './ui'

export default function RPCAPanel({ projectId, pcX, pcY, useCorrected, nGenes, defaultTitle }) {
  const [plotTitle, setPlotTitle] = useState(defaultTitle || '')
  const [rendering, setRendering] = useState(false)
  const [imgUrl, setImgUrl] = useState(null)
  const [error, setError] = useState(null)

  async function handleRender() {
    setRendering(true)
    setError(null)
    setImgUrl(null)
    try {
      setImgUrl(await renderProjectRPca(projectId, {
        pcX, pcY, useCorrected, nGenes,
        plotTitle: plotTitle.trim() || defaultTitle || null,
      }))
    } catch (e) {
      setError(e.message)
    } finally {
      setRendering(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ width: 196, flex: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label className="t-util t-util-field" htmlFor="rp-title"
                 style={{ display: 'block', marginBottom: 5 }}>
            Plot title
          </label>
          <input id="rp-title" type="text" className="fld" style={{ width: '100%' }}
                 value={plotTitle} placeholder={defaultTitle || 'Leave blank for auto title'}
                 onChange={e => setPlotTitle(e.target.value)} />
        </div>

        <p className="t-note" style={{ margin: 0 }}>
          Rendered by <code className="t-mono">render_pca.R</code> — Yang et al. NewPCA2.R
          styling (geom_point size=3, geom_text_repel, theme_bw, 9×6 in at 300 dpi). PDF is
          also written server-side. Uses {pcX} vs {pcY}
          {useCorrected ? ', batch-corrected' : ''}, top {nGenes} genes.
        </p>

        <button type="button" className="btn btn-primary" onClick={handleRender} disabled={rendering}>
          {rendering ? 'Rendering…' : 'Generate R plot'}
        </button>
      </div>

      <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 9 }}>
        <ErrorMsg label="R error">{error}</ErrorMsg>
        <ROutput imgUrl={imgUrl} filename="pca_plot.png" alt="PCA plot (R)" />
      </div>
    </div>
  )
}
