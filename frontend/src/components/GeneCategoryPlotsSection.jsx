import { useState } from 'react'
import PanelFrame from './PanelFrame'
import CategoryEditor from './CategoryEditor'
import CategoryHeatmapSection from './CategoryHeatmapSection'
import CategoryVolcanoSection from './CategoryVolcanoSection'
import { SegToggle } from './ui'

export default function GeneCategoryPlotsSection({
  projectId, hasFpkm, hasDe,
  padjCutoff, lfcCutoff, selection, selectionSet,
  expandedPanel, onToggleExpand,
}) {
  const [mode, setMode] = useState(hasDe ? 'volcano' : 'heatmap')
  const [manageOpen, setManageOpen] = useState(false)

  const headerRight = (
    <button type="button" className="btn btn-outline"
            aria-expanded={manageOpen} onClick={() => setManageOpen(o => !o)}>
      Manage
    </button>
  )

  return (
    <PanelFrame
      id="categories"
      title="Categories"
      kicker={selection ? selection.label : '2×2 · shared taxonomy'}
      headerRight={headerRight}
      expandedPanel={expandedPanel}
      onToggleExpand={onToggleExpand}
      bodyStyle={{ padding: 0 }}
    >
      <div style={{
        background: 'var(--ground-alt)',
        borderBottom: '1.5px solid var(--rule-mid)',
        padding: '10px 14px 11px',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <span className="t-util t-util-field">Rendering</span>
        <SegToggle
          ariaLabel="Category rendering"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'volcano', label: 'Volcano', disabled: !hasDe, title: hasDe ? undefined : 'Needs DE results' },
            { value: 'heatmap', label: 'Heatmap', disabled: !hasFpkm, title: hasFpkm ? undefined : 'Needs an FPKM matrix' },
          ]}
        />
        <span className="t-note" style={{ marginLeft: 'auto' }}>
          taxonomy shared across both renderings
        </span>
      </div>

      {manageOpen && (
        <div style={{ borderBottom: '1.5px solid var(--rule-mid)', padding: '11px 14px 13px' }}>
          <CategoryEditor />
        </div>
      )}

      <div style={{ padding: '11px 14px 13px' }}>
        {mode === 'volcano' && hasDe && (
          <CategoryVolcanoSection
            projectId={projectId}
            padjCutoff={padjCutoff}
            lfcCutoff={lfcCutoff}
            selectionSet={selectionSet}
          />
        )}
        {mode === 'heatmap' && hasFpkm && (
          <CategoryHeatmapSection projectId={projectId} selectionSet={selectionSet} />
        )}
      </div>
    </PanelFrame>
  )
}
