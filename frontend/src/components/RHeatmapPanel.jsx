import { useState } from 'react'
import { renderRHeatmap } from '../api/client'

export default function RHeatmapPanel({ heatmapId, genes, clusterRows }) {
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
      const url = await renderRHeatmap(heatmapId, { genes, clusterRows })
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
        reversed RdBu palette, FPKM cell labels, and condition annotation bar when
        grouping is detected. Uses the same gene selection currently shown in the
        Interactive tab.
      </p>

      {/* Mirror of the current interactive tab selection (read-only) */}
      <div style={{
        marginBottom: '0.75rem',
        padding: '0.5rem 0.75rem',
        background: '#f5f5f5',
        border: '1px solid #ddd',
        borderRadius: 4,
        fontSize: '0.85em',
      }}>
        <strong>Current selection:</strong>{' '}
        {hasGenes
          ? `${genes.length} genes${clusterRows ? ', rows clustered' : ', variance-rank order'}`
          : <span style={{ color: '#888' }}>
              No heatmap loaded yet — go to the Interactive tab and click Update.
            </span>
        }
        {hasGenes && (
          <details style={{ marginTop: '0.3rem' }}>
            <summary style={{ cursor: 'pointer', color: '#2563eb' }}>
              Show gene list
            </summary>
            <div style={{ marginTop: '0.3rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
              {genes.join(', ')}
            </div>
          </details>
        )}
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
