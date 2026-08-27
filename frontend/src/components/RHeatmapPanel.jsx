import { useState } from 'react'
import { renderProjectRHeatmap } from '../api/client'

export default function RHeatmapPanel({ projectId, genes, clusterRows, defaultTitle }) {
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
      const url = await renderProjectRHeatmap(projectId, {
        genes,
        clusterRows,
        plotTitle: plotTitle.trim() || defaultTitle || null,
      })
      setImgUrl(url)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <p style={{ margin: '0 0 0.75rem', color: '#555', fontSize: '0.9em' }}>
        Generates the heatmap via R/pheatmap using the exact BulkSIX3SB style:
        reversed RdBu palette, FPKM cell labels, and condition annotation bar.
        Uses the same gene selection currently shown in the Interactive tab.
      </p>

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1rem',
        alignItems: 'flex-end',
        padding: '0.6rem 0.75rem',
        background: '#fafafa',
        border: '1px solid #e0e0e0',
        borderRadius: 4,
        marginBottom: '0.75rem',
      }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: '0.9em', flexGrow: 1, minWidth: 200 }}>
          Plot title <span style={{ fontWeight: 400, color: '#6b7280' }}>(defaults to project name)</span>
          <input
            type="text"
            value={plotTitle}
            onChange={e => setPlotTitle(e.target.value)}
            placeholder={defaultTitle || 'Enter title…'}
            style={{ fontSize: '0.9em', padding: '0.2rem 0.4rem', border: '1px solid #d1d5db', borderRadius: 3 }}
          />
        </label>

        <div style={{ marginBottom: '0.75rem', fontSize: '0.85em', color: '#555' }}>
          <strong>Selection:</strong>{' '}
          {hasGenes
            ? `${genes.length} genes${clusterRows ? ', rows clustered' : ', variance-rank order'}`
            : <span style={{ color: '#888' }}>Go to Interactive tab and click Update first.</span>
          }
          {hasGenes && (
            <details style={{ marginTop: '0.3rem' }}>
              <summary style={{ cursor: 'pointer', color: '#2563eb' }}>Show gene list</summary>
              <div style={{ marginTop: '0.3rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap', fontSize: '0.9em' }}>
                {genes.join(', ')}
              </div>
            </details>
          )}
        </div>
      </div>

      <button
        onClick={handleGenerate}
        disabled={loading || !hasGenes}
        style={{
          padding: '0.4rem 1rem',
          background: loading || !hasGenes ? '#aaa' : '#2563eb',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          cursor: loading || !hasGenes ? 'default' : 'pointer',
          fontSize: '0.95em',
        }}
      >
        {loading ? 'Generating… (may take ~10–30 s)' : 'Generate R plot'}
      </button>

      {error && (
        <pre style={{
          marginTop: '0.75rem',
          padding: '0.5rem 0.75rem',
          background: '#fff0f0',
          border: '1px solid #e88',
          borderRadius: 4,
          color: '#c00',
          fontSize: '0.8em',
          whiteSpace: 'pre-wrap',
          maxHeight: 240,
          overflow: 'auto',
        }}>
          {error}
        </pre>
      )}

      {imgUrl && (
        <div style={{ marginTop: '1rem' }}>
          <img
            src={imgUrl}
            alt="R pheatmap heatmap"
            style={{ maxWidth: '100%', border: '1px solid #ddd', borderRadius: 4 }}
          />
          <div style={{ marginTop: '0.5rem' }}>
            <a href={imgUrl} download="heatmap.png" style={{ color: '#2563eb', fontSize: '0.9em' }}>
              Download PNG
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
