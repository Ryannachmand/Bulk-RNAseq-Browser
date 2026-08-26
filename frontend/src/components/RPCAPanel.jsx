import { useState } from 'react'
import { renderRPca } from '../api/client'

export default function RPCAPanel({ datasetId, hasCorrected, nGenes }) {
  const [pcPair, setPcPair] = useState('PC1_PC2')
  const [useCorrected, setUseCorrected] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [imgUrl, setImgUrl] = useState(null)
  const [error, setError] = useState(null)

  async function handleRender() {
    setRendering(true)
    setError(null)
    try {
      const pcX = 'PC1'
      const pcY = pcPair === 'PC1_PC2' ? 'PC2' : 'PC3'
      const url = await renderRPca(datasetId, {
        pcX,
        pcY,
        useCorrected: useCorrected && hasCorrected,
        nGenes,
      })
      setImgUrl(url)
    } catch (e) {
      setError(e.message)
    } finally {
      setRendering(false)
    }
  }

  return (
    <div>
      <p style={{ fontSize: '0.8em', color: '#6b7280', fontStyle: 'italic', marginTop: 0 }}>
        PCA computed from FPKM (log2-transformed), not VST — exact VST-based PCA requires raw counts,
        available in a future update.
      </p>

      {/* Parameter panel */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1rem',
        alignItems: 'flex-end',
        padding: '0.75rem',
        background: '#fafafa',
        border: '1px solid #e0e0e0',
        borderRadius: 4,
        marginBottom: '1rem',
      }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: '0.9em' }}>
          PC pair
          <select
            value={pcPair}
            onChange={e => setPcPair(e.target.value)}
            style={{ fontSize: '0.9em', padding: '0.2rem 0.4rem' }}
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

        <button
          onClick={handleRender}
          disabled={rendering}
          style={{
            padding: '0.4rem 0.9rem',
            background: rendering ? '#9ca3af' : '#374151',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: rendering ? 'default' : 'pointer',
            fontSize: '0.9em',
          }}
        >
          {rendering ? 'Rendering…' : 'Generate R plot'}
        </button>
      </div>

      {error && (
        <p style={{ color: '#dc2626', fontSize: '0.9em' }}>
          <strong>Error:</strong> {error}
        </p>
      )}

      {imgUrl && (
        <div>
          <img
            src={imgUrl}
            alt="PCA plot (R)"
            style={{ maxWidth: '100%', border: '1px solid #e5e7eb', borderRadius: 4 }}
          />
          <p style={{ fontSize: '0.8em', color: '#6b7280', marginTop: '0.4rem' }}>
            Styled to match Yang et al. NewPCA2.R (geom_point size=3, geom_text_repel,
            theme_bw, 9×6 in at 300 dpi). PDF also saved server-side.
          </p>
        </div>
      )}
    </div>
  )
}
