import { useState } from 'react'
import { renderProjectRVolcano } from '../api/client'

export default function RVolcanoPanel({ projectId, defaultTitle, padjCutoff, lfcCutoff }) {
  const [nLabel, setNLabel] = useState(5)
  const [customGenes, setCustomGenes] = useState('')
  const [plotTitle, setPlotTitle] = useState(defaultTitle || '')
  const [loading, setLoading] = useState(false)
  const [imgUrl, setImgUrl] = useState(null)
  const [error, setError] = useState(null)

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    setImgUrl(null)
    try {
      const custom = customGenes
        .split(/[\n,]+/)
        .map(s => s.trim())
        .filter(Boolean)
      const url = await renderProjectRVolcano(projectId, {
        padj_cutoff: padjCutoff,
        lfc_cutoff: lfcCutoff,
        n_label: nLabel,
        custom_genes: custom.length > 0 ? custom : null,
        plot_title: plotTitle,
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
        Generates the plot via R/ggplot2 using the exact Ola-lab style. Uses the padj and
        |log2FC| cutoffs set in the Plotly tab above.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.75rem', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: '0.85em' }}>Plot title</span>
          <input
            type="text"
            value={plotTitle}
            onChange={e => setPlotTitle(e.target.value)}
            style={{ width: 220 }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: '0.85em' }}>Top N labels per direction</span>
          <input
            type="number"
            value={nLabel}
            min={0}
            max={50}
            step={1}
            onChange={e => setNLabel(Number(e.target.value))}
            style={{ width: 70 }}
          />
        </label>
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.85em' }}>
          Custom genes to always label (comma or newline separated)
        </span>
        <textarea
          value={customGenes}
          onChange={e => setCustomGenes(e.target.value)}
          rows={3}
          style={{ width: 400, fontFamily: 'monospace', fontSize: '0.85em', resize: 'vertical' }}
          placeholder="GENE1, GENE2, GENE3"
        />
      </label>

      <button
        onClick={handleGenerate}
        disabled={loading}
        style={{
          padding: '0.4rem 1rem',
          background: loading ? '#aaa' : '#2563eb',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          cursor: loading ? 'default' : 'pointer',
          fontSize: '0.95em',
        }}
      >
        {loading ? 'Generating… (may take a few seconds)' : 'Generate R plot'}
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
            alt="R volcano plot"
            style={{ maxWidth: '100%', border: '1px solid #ddd', borderRadius: 4 }}
          />
          <div style={{ marginTop: '0.5rem' }}>
            <a href={imgUrl} download="volcano.png" style={{ color: '#2563eb', fontSize: '0.9em' }}>
              Download PNG
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
