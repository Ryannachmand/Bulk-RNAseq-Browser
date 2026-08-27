import { useEffect, useState } from 'react'
import { getProjectVolcanoData } from '../api/client'
import VolcanoPlot from './VolcanoPlot'
import RVolcanoPanel from './RVolcanoPanel'

const TAB_PLOTLY = 'plotly'
const TAB_R = 'r'

export default function VolcanoSection({ projectId, projectName, deProvenance }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [rows, setRows] = useState(null)
  const [tab, setTab] = useState(TAB_PLOTLY)
  const [padjCutoff, setPadjCutoff] = useState(0.05)
  const [lfcCutoff, setLfcCutoff] = useState(1)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setRows(null)
    getProjectVolcanoData(projectId)
      .then(data => {
        setRows(data)
        setLoading(false)
      })
      .catch(e => {
        setError(e.message)
        setLoading(false)
      })
  }, [projectId])

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

  if (loading) return <p style={{ color: '#555' }}>Loading DE data…</p>
  if (error) return <p style={{ color: '#cc2222' }}><strong>Error:</strong> {error}</p>
  if (!rows) return null

  const badgeStyle = (provenance) => {
    if (!provenance) return null
    const isLimma = provenance.startsWith('limma')
    return {
      display: 'inline-block',
      padding: '0.15rem 0.55rem',
      borderRadius: 4,
      fontSize: '0.78em',
      fontWeight: 600,
      marginBottom: '0.75rem',
      background: isLimma ? '#fef3c7' : provenance === 'uploaded' ? '#eff6ff' : '#f0fdf4',
      color: isLimma ? '#92400e' : provenance === 'uploaded' ? '#1d4ed8' : '#15803d',
      border: `1px solid ${isLimma ? '#fcd34d' : provenance === 'uploaded' ? '#bfdbfe' : '#bbf7d0'}`,
    }
  }

  return (
    <div>
      {deProvenance && (
        <div style={badgeStyle(deProvenance)}>
          DE method: {deProvenance}
        </div>
      )}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #ccc' }}>
        <button style={tabStyle(tab === TAB_PLOTLY)} onClick={() => setTab(TAB_PLOTLY)}>
          Plotly preview
        </button>
        <button style={tabStyle(tab === TAB_R)} onClick={() => setTab(TAB_R)}>
          Plot generator (R)
        </button>
      </div>

      <div style={{ border: '1px solid #ccc', borderTop: 'none', padding: '1rem', background: '#fff' }}>
        {tab === TAB_PLOTLY && (
          <VolcanoPlot
            rows={rows}
            padjCutoff={padjCutoff}
            lfcCutoff={lfcCutoff}
            onPadjChange={setPadjCutoff}
            onLfcChange={setLfcCutoff}
          />
        )}
        {tab === TAB_R && (
          <RVolcanoPanel
            projectId={projectId}
            defaultTitle={projectName}
            padjCutoff={padjCutoff}
            lfcCutoff={lfcCutoff}
          />
        )}
      </div>
    </div>
  )
}
