import { useMemo, useState } from 'react'
import PanelFrame from './PanelFrame'
import VolcanoPlot from './VolcanoPlot'
import RVolcanoPanel from './RVolcanoPanel'
import { ErrorMsg, SegToggle } from './ui'

const VIEW = [
  { value: 'interactive', label: 'Interactive' },
  { value: 'r', label: 'R-exact' },
]

export default function VolcanoSection({
  projectId, projectName,
  rows, loading, error,
  padjCutoff, lfcCutoff,
  selection, selectionSet,
  expandedPanel, onToggleExpand,
}) {
  const [view, setView] = useState('interactive')

  // Label state is shared by both views — what you label is what R prints.
  const [plotTitle, setPlotTitle] = useState(projectName || '')
  const [labelMode, setLabelMode] = useState('topn')
  const [nLabel, setNLabel] = useState(5)
  const [customGenes, setCustomGenes] = useState([])

  const knownSymbols = useMemo(() => {
    const s = new Set()
    if (!rows) return s
    for (const r of rows) {
      const sym = r.symbol && !String(r.symbol).startsWith('ENSG') ? r.symbol : r.gene
      if (sym) s.add(sym)
    }
    return s
  }, [rows])

  const missingGenes = useMemo(
    () => customGenes.filter(g => !knownSymbols.has(g)),
    [customGenes, knownSymbols]
  )

  // Mirrors render_volcano.R: top N per direction by padj among significant.
  const labelSymbols = useMemo(() => {
    if (!rows) return new Set()
    if (labelMode === 'list') {
      return new Set(customGenes.filter(g => knownSymbols.has(g)))
    }
    if (!nLabel) return new Set()
    const sig = []
    for (const r of rows) {
      const lfc = r.log2FoldChange, padj = r.padj
      if (lfc == null || padj == null || !isFinite(lfc) || !isFinite(padj)) continue
      if (!(padj < padjCutoff && Math.abs(lfc) > lfcCutoff)) continue
      const sym = r.symbol && !String(r.symbol).startsWith('ENSG') ? r.symbol : r.gene
      sig.push({ sym, padj, up: lfc > 0 })
    }
    sig.sort((a, b) => a.padj - b.padj)
    const out = new Set()
    let up = 0, down = 0
    for (const s of sig) {
      if (s.up && up < nLabel) { out.add(s.sym); up++ }
      else if (!s.up && down < nLabel) { out.add(s.sym); down++ }
      if (up >= nLabel && down >= nLabel) break
    }
    return out
  }, [rows, labelMode, customGenes, knownSymbols, nLabel, padjCutoff, lfcCutoff])

  const headerRight = (
    <SegToggle ariaLabel="Volcano view" options={VIEW} value={view} onChange={setView} />
  )

  return (
    <PanelFrame
      id="volcano"
      title="Volcano"
      kicker={selection ? selection.label : 'log2FC × −log10 padj'}
      headerRight={headerRight}
      expandedPanel={expandedPanel}
      onToggleExpand={onToggleExpand}
    >
      {loading && <p className="msg-wait">Loading DE data…</p>}
      <ErrorMsg>{error}</ErrorMsg>

      {rows && view === 'interactive' && (
        <VolcanoPlot
          rows={rows}
          padjCutoff={padjCutoff}
          lfcCutoff={lfcCutoff}
          labelSymbols={labelSymbols}
          selectionSet={selectionSet}
        />
      )}

      {rows && view === 'r' && (
        <RVolcanoPanel
          projectId={projectId}
          padjCutoff={padjCutoff}
          lfcCutoff={lfcCutoff}
          plotTitle={plotTitle}
          onPlotTitle={setPlotTitle}
          labelMode={labelMode}
          onLabelMode={setLabelMode}
          nLabel={nLabel}
          onNLabel={setNLabel}
          customGenes={customGenes}
          onCustomGenes={setCustomGenes}
          missingGenes={missingGenes}
        />
      )}
    </PanelFrame>
  )
}
