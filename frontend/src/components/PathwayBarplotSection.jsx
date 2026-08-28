import { useEffect, useMemo, useState } from 'react'
import { getProjectPathwayResults, renderProjectRPathwayBarplot, runPathwayAnalysis } from '../api/client'
import PanelFrame from './PanelFrame'
import { ErrorMsg, ROutput, SegToggle } from './ui'

const VIEW = [
  { value: 'interactive', label: 'Interactive' },
  { value: 'r', label: 'R-exact' },
]

const BAR_MAX = 100          // px, longest bar either side of the zero line
const ROW_H = 19
const BAR_H = 13

function isUp(row) {
  return String(row.direction || '').toLowerCase().startsWith('up')
}

/** One diverging bar row. A real button so it is tabbable and Enter/Space works. */
function PathwayRow({ row, value, max, selected, anySelected, directionAvailable, onClick }) {
  const up = !directionAvailable || isUp(row)
  const frac = max > 0 ? Math.min(1, Math.abs(value) / max) : 0
  const len = Math.max(2, frac * BAR_MAX)
  const base = up ? 'var(--de-up)' : 'var(--de-down)'
  const fill = anySelected && !selected
    ? `color-mix(in srgb, ${base} 38%, #eae9e9)`
    : base

  return (
    <button
      type="button"
      className="pw-row"
      aria-pressed={selected}
      title={`${row.Description} · p.adjust ${Number(row['p.adjust']).toExponential(2)} · ${row.Count} genes`}
      onClick={onClick}
    >
      <span style={{
        fontWeight: 500, fontSize: 10.5,
        color: selected ? 'var(--ink)' : 'var(--ink-700)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {row.Description_short || row.Description}
      </span>

      <span style={{ position: 'relative', height: ROW_H, minWidth: 0 }}>
        <span aria-hidden="true" style={{
          position: 'absolute', left: '50%', top: 0, bottom: 0,
          width: 1, background: 'var(--ink)',
        }} />
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', top: (ROW_H - BAR_H) / 2, height: BAR_H,
            width: len,
            background: fill,
            border: selected ? '1.5px solid var(--ink)' : 'none',
            ...(up ? { left: '50%' } : { right: '50%' }),
          }}
        />
        <span
          className="t-num"
          style={{
            position: 'absolute', top: 4, fontWeight: 600, fontSize: 9.5,
            color: 'var(--ink-600)', whiteSpace: 'nowrap',
            ...(up
              ? { left: `min(calc(50% + ${len + 4}px), calc(100% - 30px))` }
              : { right: `min(calc(50% + ${len + 4}px), calc(100% - 30px))` }),
          }}
        >
          n={row.Count}
        </span>
      </span>
    </button>
  )
}

export default function PathwayBarplotSection({
  projectId, projectName, hasPathway, hasDe, deProvenance,
  selection, onSelectPathway, onPathwayComputed,
  expandedPanel, onToggleExpand,
}) {
  const [view, setView] = useState('interactive')
  const [topN, setTopN] = useState(20)
  const [plotTitle, setPlotTitle] = useState(projectName || 'Pathway Enrichment')

  const [directionAvailable, setDirAvail] = useState(false)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState(null)
  const [loadError, setLoadError] = useState(null)

  const [rLoading, setRLoading] = useState(false)
  const [rError, setRError] = useState(null)
  const [rImageUrl, setRImageUrl] = useState(null)

  // enrichGO run state — its cutoffs are run parameters, deliberately kept
  // separate from the dashboard's display thresholds.
  const [enrichPadjCutoff, setEnrichPadj] = useState(0.05)
  const [enrichLfcCutoff, setEnrichLfc] = useState(1.0)
  const [enrichOpen, setEnrichOpen] = useState(false)
  const [enrichRunning, setEnrichRunning] = useState(false)
  const [enrichError, setEnrichError] = useState(null)
  const [enrichDone, setEnrichDone] = useState(false)

  useEffect(() => {
    if (!hasPathway) return
    setLoading(true)
    setLoadError(null)
    getProjectPathwayResults(projectId, topN)
      .then(({ rows: r, direction_available }) => {
        setRows(r)
        setDirAvail(direction_available)
        setLoading(false)
      })
      .catch(e => {
        setLoadError(e.message)
        setLoading(false)
      })
  }, [projectId, topN, hasPathway])

  async function handleRunEnrichGO() {
    setEnrichRunning(true)
    setEnrichError(null)
    setEnrichDone(false)
    try {
      await runPathwayAnalysis(projectId, { padjCutoff: enrichPadjCutoff, lfcCutoff: enrichLfcCutoff })
      setEnrichDone(true)
      setLoading(true)
      const { rows: r, direction_available } = await getProjectPathwayResults(projectId, topN)
      setRows(r)
      setDirAvail(direction_available)
      setLoading(false)
      onPathwayComputed?.()
    } catch (e) {
      setEnrichError(e.message)
    } finally {
      setEnrichRunning(false)
    }
  }

  async function handleRender() {
    setRLoading(true)
    setRError(null)
    setRImageUrl(null)
    try {
      setRImageUrl(await renderProjectRPathwayBarplot(projectId, { topN, plotTitle }))
    } catch (e) {
      setRError(e.message)
    } finally {
      setRLoading(false)
    }
  }

  const valueOf = r => (directionAvailable ? r.neg_log10_padj_signed : r.neg_log10_padj)

  const ordered = useMemo(() => {
    if (!rows) return []
    const out = [...rows]
    // Most up-regulated first, most down-regulated last — the reading order
    // the Plotly barplot produced.
    out.sort((a, b) => valueOf(b) - valueOf(a))
    return out
  }, [rows, directionAvailable])

  const max = useMemo(
    () => ordered.reduce((m, r) => Math.max(m, Math.abs(valueOf(r))), 0),
    [ordered, directionAvailable]
  )

  const headerRight = (
    <SegToggle ariaLabel="Pathway view" options={VIEW} value={view} onChange={setView} />
  )

  return (
    <PanelFrame
      id="pathways"
      title="Pathways"
      kicker="enrichGO · BP"
      headerRight={headerRight}
      expandedPanel={expandedPanel}
      onToggleExpand={onToggleExpand}
      bodyStyle={{ padding: 0 }}
    >
      {/* shared sub-bar — governs both views */}
      <div style={{
        background: 'var(--ground-alt)',
        borderBottom: '1.5px solid var(--rule-mid)',
        padding: '10px 14px 11px',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <label className="t-util t-util-field" htmlFor="pw-topn">Top N per direction</label>
        <input
          id="pw-topn" type="number" className="fld" style={{ width: 64 }}
          min={1} max={50} value={topN}
          onChange={e => setTopN(Number(e.target.value))}
        />
        {hasDe && (
          <button
            type="button"
            className="btn btn-outline"
            style={{ marginLeft: 'auto' }}
            aria-expanded={enrichOpen}
            onClick={() => setEnrichOpen(o => !o)}
          >
            {hasPathway ? 'Re-run enrichGO' : 'Run enrichGO'}
          </button>
        )}
      </div>

      {/* enrichGO run block */}
      {hasDe && enrichOpen && (
        <div style={{
          padding: '11px 14px 13px',
          borderBottom: '1.5px solid var(--rule-mid)',
          display: 'flex', flexDirection: 'column', gap: 9,
        }}>
          <p className="t-note" style={{ margin: 0 }}>
            clusterProfiler <code className="t-mono">enrichGO</code> · BP, from{' '}
            <strong>{deProvenance || 'the DE table'}</strong>. These cutoffs select the
            input gene set for enrichment; they are separate from the dashboard thresholds.
          </p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label className="t-util t-util-field" htmlFor="pw-padj">padj cutoff</label>
              <input id="pw-padj" type="number" className="fld" style={{ width: 78 }}
                     min={0.001} step={0.001} value={enrichPadjCutoff}
                     onChange={e => setEnrichPadj(Number(e.target.value))} />
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label className="t-util t-util-field" htmlFor="pw-lfc">|LFC| cutoff</label>
              <input id="pw-lfc" type="number" className="fld" style={{ width: 78 }}
                     min={0} step={0.1} value={enrichLfcCutoff}
                     onChange={e => setEnrichLfc(Number(e.target.value))} />
            </span>
            <button type="button" className="btn btn-primary"
                    onClick={handleRunEnrichGO} disabled={enrichRunning}>
              {enrichRunning ? 'Running enrichGO…' : 'Run pathway analysis'}
            </button>
          </div>
          {enrichRunning && (
            <p className="msg-wait" style={{ margin: 0 }}>
              Running clusterProfiler enrichGO — this may take 30–90 seconds. Do not close this page.
            </p>
          )}
          {enrichDone && (
            <p className="t-note" style={{ margin: 0, color: 'var(--accent-deep)', fontWeight: 600 }}>
              Pathway analysis complete. Results below.
            </p>
          )}
          <ErrorMsg>{enrichError}</ErrorMsg>
        </div>
      )}

      <div style={{ padding: '11px 14px 13px' }}>
        {loading && <p className="msg-wait">Loading pathway data…</p>}
        <ErrorMsg>{loadError}</ErrorMsg>

        {!hasPathway && !rows && !loadError && hasDe && (
          <p className="t-body" style={{ margin: 0 }}>
            No enrichment results yet. Open <strong>Run enrichGO</strong> above to compute GO
            Biological Process enrichment from the DE results.
          </p>
        )}

        {rows && view === 'interactive' && (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 7 }}>
              <span style={{
                fontWeight: 500, fontSize: 10, letterSpacing: '.1em',
                textTransform: 'uppercase', color: 'var(--ink-600)',
              }}>
                {directionAvailable ? '↤ down · ±(−log10 padj) · up ↦' : '−log10 padj ↦'}
              </span>
              <span className="t-note" style={{ marginLeft: 'auto' }}>top {topN}</span>
            </div>

            {!directionAvailable && (
              <p className="warn-strip t-note" style={{ margin: '0 0 8px', color: 'var(--accent-darkest)' }}>
                Direction data not available — pathways are sorted by significance only.
              </p>
            )}

            <div role="group" aria-label="Enriched pathways">
              {ordered.map((r, i) => (
                <PathwayRow
                  key={r.Description + i}
                  row={r}
                  value={valueOf(r)}
                  max={max}
                  directionAvailable={directionAvailable}
                  selected={selection?.id === r.Description}
                  anySelected={!!selection}
                  onClick={() => onSelectPathway(selection?.id === r.Description ? null : r)}
                />
              ))}
            </div>

            <p className="t-note" style={{ margin: '9px 0 0' }}>
              Click a bar to project its gene set onto the volcano, heatmap, DE table and
              categories. Clicking again, or Esc, clears it.
            </p>
          </>
        )}

        {rows && view === 'r' && (
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ width: 196, flex: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label className="t-util t-util-field" htmlFor="pw-title"
                       style={{ display: 'block', marginBottom: 5 }}>
                  Plot title
                </label>
                <input id="pw-title" type="text" className="fld" style={{ width: '100%' }}
                       value={plotTitle} onChange={e => setPlotTitle(e.target.value)} />
              </div>
              <p className="t-note" style={{ margin: 0 }}>
                Rendered by <code className="t-mono">render_pathway_barplot.R</code> at the
                same top-N as the interactive view.
              </p>
              <button type="button" className="btn btn-primary" onClick={handleRender} disabled={rLoading}>
                {rLoading ? 'Generating…' : 'Generate R plot'}
              </button>
            </div>
            <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 9 }}>
              <ErrorMsg label="R error">{rError}</ErrorMsg>
              <ROutput imgUrl={rImageUrl} filename="pathway_barplot.png" alt="R pathway barplot" />
            </div>
          </div>
        )}
      </div>
    </PanelFrame>
  )
}
