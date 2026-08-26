import { useState, useEffect } from 'react'
import { getHeatmapData } from '../api/client'
import HeatmapPlot from './HeatmapPlot'
import RHeatmapPanel from './RHeatmapPanel'

const TAB_INTERACTIVE = 'interactive'
const TAB_R = 'r'

export default function HeatmapSection({ heatmapId, initialSamples }) {
  const [tab, setTab] = useState(TAB_INTERACTIVE)

  // Controls (lifted so both tabs see the same values)
  const [nGenes, setNGenes] = useState(40)
  const [customGenesText, setCustomGenesText] = useState('')
  const [clusterRows, setClusterRows] = useState(false)

  // Loaded heatmap data (shared between both tabs)
  const [heatmapData, setHeatmapData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function fetchHeatmap() {
    setLoading(true)
    setError(null)
    try {
      const geneList = customGenesText
        .split(/[\n,]+/)
        .map(s => s.trim())
        .filter(Boolean)
      const data = await getHeatmapData(heatmapId, {
        nGenes,
        geneList: geneList.length > 0 ? geneList : null,
        clusterRows,
      })
      setHeatmapData(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Auto-fetch on mount
  useEffect(() => { fetchHeatmap() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const tabStyle = (active) => ({
    padding: '0.35rem 1rem',
    border: '1px solid #ccc',
    borderBottom: active ? '1px solid #fff' : '1px solid #ccc',
    background: active ? '#fff' : '#f5f5f5',
    cursor: 'pointer',
    fontWeight: active ? 600 : 400,
    fontSize: '0.9em',
    marginBottom: -1,
    position: 'relative',
  })

  return (
    <div>
      {/* Controls */}
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
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: '0.85em' }}>Top N genes (by variance)</span>
          <input
            type="number"
            value={nGenes}
            min={1}
            max={500}
            step={5}
            onChange={e => setNGenes(Number(e.target.value))}
            style={{ width: 80 }}
            disabled={customGenesText.trim().length > 0}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: '0.85em' }}>
            Custom gene list (comma or newline)
            <span style={{ color: '#888', fontWeight: 400 }}> — overrides N</span>
          </span>
          <textarea
            value={customGenesText}
            onChange={e => setCustomGenesText(e.target.value)}
            rows={2}
            style={{ width: 280, fontFamily: 'monospace', fontSize: '0.85em', resize: 'vertical' }}
            placeholder="GAPDH, ACTB, MYC"
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9em' }}>
          <input
            type="checkbox"
            checked={clusterRows}
            onChange={e => setClusterRows(e.target.checked)}
          />
          Cluster rows
        </label>

        <button
          onClick={fetchHeatmap}
          disabled={loading}
          style={{
            padding: '0.4rem 0.9rem',
            background: loading ? '#aaa' : '#374151',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: loading ? 'default' : 'pointer',
            fontSize: '0.9em',
            alignSelf: 'flex-end',
          }}
        >
          {loading ? 'Loading…' : 'Update'}
        </button>

        {initialSamples && (
          <span style={{ fontSize: '0.8em', color: '#777', alignSelf: 'flex-end' }}>
            {initialSamples.length} samples
          </span>
        )}
      </div>

      {error && (
        <p style={{ color: '#cc2222', fontSize: '0.9em', margin: '0 0 0.75rem' }}>
          <strong>Error:</strong> {error}
        </p>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #ccc' }}>
        <button style={tabStyle(tab === TAB_INTERACTIVE)} onClick={() => setTab(TAB_INTERACTIVE)}>
          Interactive (Plotly)
        </button>
        <button style={tabStyle(tab === TAB_R)} onClick={() => setTab(TAB_R)}>
          R-exact (pheatmap)
        </button>
      </div>

      <div style={{ border: '1px solid #ccc', borderTop: 'none', padding: '1rem', background: '#fff' }}>
        {tab === TAB_INTERACTIVE && (
          <>
            {loading && !heatmapData && (
              <p style={{ color: '#555' }}>Loading heatmap data…</p>
            )}
            {heatmapData && (
              <HeatmapPlot data={heatmapData} />
            )}
          </>
        )}

        {tab === TAB_R && (
          <RHeatmapPanel
            heatmapId={heatmapId}
            genes={heatmapData?.genes ?? null}
            clusterRows={clusterRows}
          />
        )}
      </div>
    </div>
  )
}
