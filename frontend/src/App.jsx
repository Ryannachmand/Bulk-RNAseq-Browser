import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  checkHealth, getProject, getProjectSamples, getProjectVolcanoData,
  saveProjectMetadata, runDeseq2, runLimma,
} from './api/client'
import EntranceScreen from './components/EntranceScreen'
import ProjectRail from './components/ProjectRail'
import StatusStrip from './components/StatusStrip'
import PanelFrame from './components/PanelFrame'
import LockedPanel from './components/LockedPanel'
import SampleMetaPanel from './components/SampleMetaPanel'
import HeatmapSection from './components/HeatmapSection'
import PCASection from './components/PCASection'
import VolcanoSection from './components/VolcanoSection'
import DeTableSection from './components/DeTableSection'
import GeneCategoryPlotsSection from './components/GeneCategoryPlotsSection'
import PathwayBarplotSection from './components/PathwayBarplotSection'

const SCREEN = { ENTRANCE: 'entrance', DASHBOARD: 'dashboard' }

// Retained from the tabbed build. The dashboard shows every panel at once, so
// nothing renders from this any more, but the value is still computed so the
// capability flags keep a single meaning across the app.
function firstAvailableTab(caps) {
  if (caps.tabs.heatmap) return 'heatmap'
  if (caps.tabs.pca) return 'pca'
  if (caps.tabs.volcano) return 'volcano'
  if (caps.tabs.gene_category_plots) return 'category'
  if (caps.tabs.pathway_barplot) return 'pathway'
  return 'heatmap'
}

export default function App() {
  const [connected, setConnected] = useState(null)
  const [screen, setScreen] = useState(SCREEN.ENTRANCE)
  const [project, setProject] = useState(null)
  const [activeTab, setActiveTab] = useState(null)  // eslint-disable-line no-unused-vars

  // ── Dashboard-wide state ──────────────────────────────────────────────────
  const [expandedPanel, setExpandedPanel] = useState(null)
  const [padjCutoff, setPadjCutoff] = useState(0.05)
  const [lfcCutoff, setLfcCutoff] = useState(1)
  const [selection, setSelection] = useState(null)

  const [deRows, setDeRows] = useState(null)
  const [deLoading, setDeLoading] = useState(false)
  const [deLoadError, setDeLoadError] = useState(null)

  const [samplesData, setSamplesData] = useState(null)
  const [samplesError, setSamplesError] = useState(null)
  const [metadataEdits, setMetadataEdits] = useState(null)
  const [metaOpen, setMetaOpen] = useState(false)

  const [refLevel, setRefLevel] = useState('')
  const [cmpLevel, setCmpLevel] = useState('')
  const [deRunning, setDeRunning] = useState(false)
  const [deRunError, setDeRunError] = useState(null)
  const [lastRunLabel, setLastRunLabel] = useState('No DE run in this session.')

  const contrastRef = useRef(null)

  useEffect(() => {
    checkHealth()
      .then(() => setConnected(true))
      .catch(() => setConnected(false))

    // Restore from URL on load/refresh
    const match = window.location.pathname.match(/^\/project\/([^/]+)\/dashboard$/)
    if (match) {
      getProject(match[1])
        .then(proj => {
          setProject(proj)
          setActiveTab(firstAvailableTab(proj.capabilities))
          setScreen(SCREEN.DASHBOARD)
        })
        .catch(() => {
          window.history.replaceState({}, '', '/')
        })
    }
  }, [])

  const projectId = project?.project_id ?? null
  const caps = project?.capabilities ?? null

  // ── Lifted fetches ────────────────────────────────────────────────────────
  // Both the Volcano panel and the DE table read one DE table; fetching it once
  // here keeps the request count identical to the tabbed build.
  const loadDeRows = useCallback(() => {
    if (!projectId || !caps?.has_de) { setDeRows(null); return }
    setDeLoading(true)
    setDeLoadError(null)
    getProjectVolcanoData(projectId)
      .then(data => { setDeRows(data); setDeLoading(false) })
      .catch(e => { setDeLoadError(e.message); setDeLoading(false) })
  }, [projectId, caps?.has_de])

  useEffect(() => { loadDeRows() }, [loadDeRows])

  const loadSamples = useCallback(async () => {
    if (!projectId || !(caps?.has_fpkm || caps?.has_raw_counts)) return
    setSamplesError(null)
    try {
      setSamplesData(await getProjectSamples(projectId))
    } catch (e) {
      setSamplesError(e.message)
    }
  }, [projectId, caps?.has_fpkm, caps?.has_raw_counts])

  useEffect(() => { loadSamples() }, [loadSamples])

  // ── Derived ───────────────────────────────────────────────────────────────
  const conditionLevels = useMemo(() => {
    const source = metadataEdits || samplesData?.metadata
    if (!source) return []
    return [...new Set(Object.values(source).map(e => e?.condition).filter(Boolean))].sort()
  }, [metadataEdits, samplesData])

  useEffect(() => {
    if (refLevel && !conditionLevels.includes(refLevel)) setRefLevel('')
    if (cmpLevel && !conditionLevels.includes(cmpLevel)) setCmpLevel('')
  }, [conditionLevels])  // eslint-disable-line react-hooks/exhaustive-deps

  // Same routing as the metadata screen used: DESeq2 when raw counts exist,
  // limma on log2(FPKM+1) when only FPKM exists.
  const deMethod = caps?.has_raw_counts ? 'deseq2' : caps?.has_fpkm ? 'limma' : null

  const { upCount, downCount } = useMemo(() => {
    if (!deRows) return { upCount: 0, downCount: 0 }
    let up = 0, down = 0
    for (const r of deRows) {
      const lfc = r.log2FoldChange, padj = r.padj
      if (lfc == null || padj == null || !isFinite(lfc) || !isFinite(padj)) continue
      if (padj < padjCutoff && Math.abs(lfc) > lfcCutoff) { lfc > 0 ? up++ : down++ }
    }
    return { upCount: up, downCount: down }
  }, [deRows, padjCutoff, lfcCutoff])

  const selectionSet = useMemo(
    () => (selection ? new Set(selection.genes) : null),
    [selection]
  )

  // Escape clears a pathway selection. An expanded panel consumes Escape first
  // (PanelFrame listens in the capture phase and stops propagation).
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && selection) setSelection(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selection])

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleProjectCreated(proj) {
    window.history.pushState({}, '', `/project/${proj.project_id}/dashboard`)
    setProject(proj)
    setActiveTab(firstAvailableTab(proj.capabilities))
    setScreen(SCREEN.DASHBOARD)
    if (proj.capabilities.has_fpkm || proj.capabilities.has_raw_counts) setMetaOpen(true)
  }

  function handleNewProject() {
    window.history.pushState({}, '', '/')
    setScreen(SCREEN.ENTRANCE)
  }

  async function refreshProject() {
    if (!projectId) return
    try {
      const fresh = await getProject(projectId)
      setProject(fresh)
      setActiveTab(firstAvailableTab(fresh.capabilities))
    } catch { /* keep the current project object */ }
  }

  async function handleRunDe() {
    if (!refLevel || !cmpLevel || refLevel === cmpLevel || !deMethod) return
    setDeRunning(true)
    setDeRunError(null)
    try {
      // Mirrors the metadata screen: unsaved edits are persisted before the run.
      if (metadataEdits) await saveProjectMetadata(projectId, metadataEdits)
      if (deMethod === 'limma') {
        await runLimma(projectId, refLevel, cmpLevel)
      } else {
        await runDeseq2(projectId, refLevel, cmpLevel)
      }
      setLastRunLabel(
        `${deMethod === 'limma' ? 'limma' : 'DESeq2'} · ${cmpLevel} vs ${refLevel} · ` +
        new Date().toLocaleString()
      )
      await refreshProject()
    } catch (e) {
      setDeRunError(e.message)
    } finally {
      setDeRunning(false)
    }
  }

  async function handleMetadataSaved() {
    await loadSamples()
    await refreshProject()
  }

  function handleSelectPathway(row) {
    if (!row) { setSelection(null); return }
    const genes = String(row.geneID || '').split('/').map(s => s.trim()).filter(Boolean)
    setSelection({
      id: row.Description,
      label: row.Description_short || row.Description,
      description: row.Description,
      genes,
    })
  }

  function focusContrast() {
    contrastRef.current?.querySelector('#rail-ref')?.focus()
  }

  // ── Screens ───────────────────────────────────────────────────────────────
  if (screen === SCREEN.ENTRANCE || !project) {
    return <EntranceScreen connected={connected} onProjectCreated={handleProjectCreated} />
  }

  const gridPanel = (id, live, lockedProps) =>
    live ? live : <LockedPanel {...lockedProps} />

  const panelFrameProps = { expandedPanel, onToggleExpand: setExpandedPanel }

  const lockedFor = {
    // Reasons are generated from the live capability flags, never hardcoded.
    noDe: {
      title: 'Volcano',
      kicker: 'log2FC × −log10 padj',
      reason: caps.has_raw_counts || caps.has_fpkm
        ? ['This project has no ', <strong key="b">DE results table</strong>,
           `. Pick a reference and a comparison level in the rail, then run ${deMethod === 'limma' ? 'the limma DE analysis' : 'DESeq2'}.`]
        : ['This project has no ', <strong key="b">DE results table</strong>,
           ' and no counts to compute one from. Create a project with a DE table, a raw counts matrix or an FPKM matrix.'],
      action: caps.has_raw_counts || caps.has_fpkm
        ? { label: deMethod === 'limma' ? 'Choose a contrast' : 'Choose a contrast', onClick: focusContrast }
        : { label: 'Add data', onClick: handleNewProject },
      skeleton: 'scatter',
    },
    noFpkm: {
      reason: caps.has_raw_counts
        ? ['This project has no ', <strong key="b">FPKM matrix</strong>,
           '. FPKM is computed from the raw counts and the species GTF at project creation — recreate the project with a species selected so the GTF can be resolved.']
        : ['This project has no ', <strong key="b">FPKM matrix</strong>,
           '. Upload an FPKM matrix, or a raw counts matrix plus a species so FPKM can be computed from the GTF.'],
      action: { label: 'Add data', onClick: handleNewProject },
      skeleton: 'grid',
    },
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'stretch', minHeight: '100vh' }}>
        <div ref={contrastRef} style={{ flex: 'none' }}>
          <ProjectRail
            project={project}
            connected={connected}
            samplesData={samplesData}
            onOpenSampleMeta={() => setMetaOpen(true)}
            onNewProject={handleNewProject}
            conditionLevels={conditionLevels}
            refLevel={refLevel}
            cmpLevel={cmpLevel}
            onRefLevel={setRefLevel}
            onCmpLevel={setCmpLevel}
            deMethod={deMethod}
            deRunning={deRunning}
            deError={deRunError}
            lastRunLabel={lastRunLabel}
            onRunDe={handleRunDe}
          />
        </div>

        <main
          style={{
            flex: 1, minWidth: 0,
            display: 'flex', flexDirection: 'column', gap: 2,
            background: 'var(--ink)',
          }}
        >
          <StatusStrip
            provenance={caps.de_provenance}
            hasDe={caps.has_de}
            padjCutoff={padjCutoff}
            lfcCutoff={lfcCutoff}
            onPadjChange={setPadjCutoff}
            onLfcChange={setLfcCutoff}
            upCount={upCount}
            downCount={downCount}
            selection={selection}
            onClearSelection={() => setSelection(null)}
          />

          <div
            className="panel-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 470px',
              gridAutoRows: 424,
              gap: 2,
              background: 'var(--ink)',
              flex: 1,
              alignContent: 'start',
            }}
          >
            {/* row 1 — Volcano | Pathways */}
            {gridPanel('volcano',
              caps.tabs.volcano && (
                <VolcanoSection
                  {...panelFrameProps}
                  projectId={project.project_id}
                  projectName={project.name}
                  rows={deRows}
                  loading={deLoading}
                  error={deLoadError}
                  padjCutoff={padjCutoff}
                  lfcCutoff={lfcCutoff}
                  selection={selection}
                  selectionSet={selectionSet}
                />
              ),
              { id: 'volcano', ...lockedFor.noDe, ...panelFrameProps }
            )}

            {gridPanel('pathways',
              caps.tabs.pathway_barplot && (
                <PathwayBarplotSection
                  {...panelFrameProps}
                  projectId={project.project_id}
                  projectName={project.name}
                  hasPathway={caps.has_pathway}
                  hasDe={caps.has_de}
                  deProvenance={caps.de_provenance}
                  selection={selection}
                  onSelectPathway={handleSelectPathway}
                  onPathwayComputed={refreshProject}
                />
              ),
              {
                id: 'pathways', title: 'Pathways', kicker: 'enrichGO · BP',
                reason: lockedFor.noDe.reason, action: lockedFor.noDe.action,
                skeleton: 'bars', ...panelFrameProps,
              }
            )}

            {/* row 2 — Heatmap | PCA */}
            {gridPanel('heatmap',
              caps.tabs.heatmap && (
                <HeatmapSection
                  {...panelFrameProps}
                  projectId={project.project_id}
                  projectName={project.name}
                  selection={selection}
                  selectionSet={selectionSet}
                />
              ),
              {
                id: 'heatmap', title: 'Heatmap', kicker: 'z-score fill · FPKM label',
                ...lockedFor.noFpkm, ...panelFrameProps,
              }
            )}

            {gridPanel('pca',
              caps.tabs.pca && (
                <PCASection
                  {...panelFrameProps}
                  projectId={project.project_id}
                  projectName={project.name}
                  samplesData={samplesData}
                  samplesError={samplesError}
                />
              ),
              {
                id: 'pca', title: 'PCA', kicker: 'VST · blind',
                ...lockedFor.noFpkm, skeleton: 'scatter', ...panelFrameProps,
              }
            )}

            {/* row 3 — DE table | Categories */}
            {gridPanel('table',
              caps.tabs.volcano && (
                <DeTableSection
                  {...panelFrameProps}
                  projectName={project.name}
                  rows={deRows}
                  loading={deLoading}
                  error={deLoadError}
                  padjCutoff={padjCutoff}
                  lfcCutoff={lfcCutoff}
                  selection={selection}
                  selectionSet={selectionSet}
                />
              ),
              {
                id: 'table', title: 'DE table', kicker: 'sorted by padj',
                reason: lockedFor.noDe.reason, action: lockedFor.noDe.action,
                skeleton: 'rows', ...panelFrameProps,
              }
            )}

            {gridPanel('categories',
              caps.tabs.gene_category_plots && (
                <GeneCategoryPlotsSection
                  {...panelFrameProps}
                  projectId={project.project_id}
                  hasFpkm={caps.has_fpkm}
                  hasDe={caps.has_de}
                  padjCutoff={padjCutoff}
                  lfcCutoff={lfcCutoff}
                  selection={selection}
                  selectionSet={selectionSet}
                />
              ),
              {
                id: 'categories', title: 'Categories', kicker: '2×2 · shared taxonomy',
                reason: ['This project has neither ', <strong key="a">DE results</strong>,
                         ' nor an ', <strong key="b">FPKM matrix</strong>,
                         ', so no category rendering can be produced.'],
                action: { label: 'Add data', onClick: handleNewProject },
                skeleton: 'grid', ...panelFrameProps,
              }
            )}
          </div>
        </main>
      </div>

      {/* Sample metadata editor — kept mounted so the contrast pickers keep
          seeing live edits exactly as the metadata screen fed them. */}
      {samplesData && (
        <div style={metaOpen ? undefined : { display: 'none' }}>
          {metaOpen && (
            <button
              type="button"
              className="panel-scrim"
              aria-label="Close sample metadata editor"
              tabIndex={-1}
              onClick={() => setMetaOpen(false)}
            />
          )}
          <div
            className={metaOpen ? 'panel panel-expanded' : 'panel'}
            role={metaOpen ? 'dialog' : undefined}
            aria-modal={metaOpen ? 'true' : undefined}
            aria-label="Sample metadata"
            style={metaOpen ? { maxWidth: 720, height: 'auto', maxHeight: 'calc(100vh - 80px)' } : undefined}
          >
            <div className="panel-header">
              <span className="t-display">Sample metadata</span>
              <span className="t-kicker">condition · batch</span>
              <span className="panel-header-right">
                <button type="button" className="btn btn-outline" onClick={() => setMetaOpen(false)}>
                  Done
                </button>
              </span>
            </div>
            <div className="panel-body">
              <SampleMetaPanel
                key={samplesData.samples.join('|')}
                samplesData={samplesData}
                onSave={(edits) => saveProjectMetadata(project.project_id, edits)}
                onSaved={handleMetadataSaved}
                onEditsChange={setMetadataEdits}
              />
              {samplesError && (
                <p className="msg-error" role="alert">{samplesError}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
