import { useState } from 'react'
import CategoryEditor from './CategoryEditor'
import CategoryHeatmapSection from './CategoryHeatmapSection'
import CategoryVolcanoSection from './CategoryVolcanoSection'

const SUBTAB_HEATMAP  = 'heatmap'
const SUBTAB_VOLCANO  = 'volcano'

export default function GeneCategoryPlotsSection({ projectId, hasFpkm, hasDe }) {
  const defaultSubtab = hasFpkm ? SUBTAB_HEATMAP : SUBTAB_VOLCANO
  const [subtab, setSubtab] = useState(defaultSubtab)
  const [editorOpen, setEditorOpen] = useState(true)

  const subtabStyle = (active) => ({
    padding: '0.35rem 1.1rem',
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
      {/* Gene list editor — collapsible */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 20, overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', background: '#f8fafc', cursor: 'pointer',
            borderBottom: editorOpen ? '1px solid #e5e7eb' : 'none',
          }}
          onClick={() => setEditorOpen(x => !x)}
        >
          <span style={{ fontWeight: 600 }}>Gene List Editor</span>
          <span style={{ color: '#6b7280', fontSize: '0.85em' }}>
            {editorOpen ? 'collapse ▲' : 'expand ▼'}
          </span>
        </div>
        {editorOpen && (
          <div style={{ padding: '12px 14px' }}>
            <CategoryEditor />
          </div>
        )}
      </div>

      {/* Subtabs — only show tabs that have data */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #ccc' }}>
        {hasFpkm && (
          <button style={subtabStyle(subtab === SUBTAB_HEATMAP)} onClick={() => setSubtab(SUBTAB_HEATMAP)}>
            Categorized Heatmap
          </button>
        )}
        {hasDe && (
          <button style={subtabStyle(subtab === SUBTAB_VOLCANO)} onClick={() => setSubtab(SUBTAB_VOLCANO)}>
            Categorized Volcano
          </button>
        )}
      </div>

      <div style={{ border: '1px solid #ccc', borderTop: 'none', padding: '1.2rem', background: '#fff' }}>
        {subtab === SUBTAB_HEATMAP && hasFpkm && <CategoryHeatmapSection projectId={projectId} />}
        {subtab === SUBTAB_VOLCANO && hasDe && <CategoryVolcanoSection projectId={projectId} />}
      </div>
    </div>
  )
}
