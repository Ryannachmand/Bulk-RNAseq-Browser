import { useEffect, useMemo, useRef, useState } from 'react'
import { getProjectHeatmapData } from '../api/client'
import PanelFrame from './PanelFrame'
import HeatmapPlot from './HeatmapPlot'
import RHeatmapPanel from './RHeatmapPanel'
import { ChipWell, ErrorMsg, MissingStrip, SegToggle, groupColorMap, parseSymbols } from './ui'

const VIEW = [
  { value: 'interactive', label: 'Interactive' },
  { value: 'r', label: 'R-exact' },
]

const SOURCES = [
  { value: 'top', label: 'Top variable' },
  { value: 'list', label: 'My gene list' },
  { value: 'linked', label: 'Linked pathway' },
]

export default function HeatmapSection({
  projectId, projectName,
  selection, selectionSet,
  expandedPanel, onToggleExpand,
}) {
  const [view, setView] = useState('interactive')
  const [source, setSource] = useState('top')
  const [nGenes, setNGenes] = useState(40)
  const [symbols, setSymbols] = useState([])
  const [draft, setDraft] = useState('')
  const [clusterRows, setClusterRows] = useState(false)

  const [heatmapData, setHeatmapData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fileRef = useRef(null)

  // The gene list actually sent for the current source.
  function listFor(src) {
    if (src === 'list') return symbols
    if (src === 'linked') return selection?.genes ?? []
    return null
  }

  async function fetchHeatmap(src = source, list = listFor(src), cluster = clusterRows, n = nGenes) {
    setLoading(true)
    setError(null)
    try {
      const data = await getProjectHeatmapData(projectId, {
        nGenes: n,
        geneList: list && list.length > 0 ? list : null,
        clusterRows: cluster,
      })
      setHeatmapData(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchHeatmap('top', null, false, 40) }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // Selecting a pathway pulls the gene-set toggle over to LINKED PATHWAY.
  // Keyed on the pathway identity so this fires on an actual change of
  // selection only — a manual switch back to TOP VARIABLE or MY GENE LIST is
  // not undone on the next render. `symbols` is left alone throughout, so the
  // user's own list is still there when they switch back to it.
  const seenSelection = useRef(null)
  useEffect(() => {
    const id = selection?.id ?? null
    if (id === seenSelection.current) return
    seenSelection.current = id
    if (!id) return
    setSource('linked')
    fetchHeatmap('linked', selection.genes)
  }, [selection])  // eslint-disable-line react-hooks/exhaustive-deps

  function switchSource(next) {
    setSource(next)
    const list = next === 'list' ? symbols : next === 'linked' ? (selection?.genes ?? []) : null
    if (next === 'linked' && (!list || list.length === 0)) return  // nothing to show yet
    if (next === 'list' && (!list || list.length === 0)) return
    fetchHeatmap(next, list)
  }

  function applyList(next) {
    setSymbols(next)
    if (source === 'list' && next.length > 0) fetchHeatmap('list', next)
  }

  function handleAddGenes() {
    const parsed = parseSymbols(draft)
    const next = parsed.length ? [...new Set([...symbols, ...parsed])] : symbols
    setDraft('')
    setSymbols(next)
    setSource('list')
    if (next.length > 0) fetchHeatmap('list', next)
  }

  function handleUpload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const next = [...new Set([...symbols, ...parseSymbols(String(reader.result))])]
      setSymbols(next)
      setSource('list')
      if (next.length > 0) fetchHeatmap('list', next)
    }
    reader.readAsText(file)
  }

  function handleFromSelection() {
    if (!selection) return
    const next = [...new Set([...symbols, ...selection.genes])]
    setSymbols(next)
    setSource('list')
    fetchHeatmap('list', next)
  }

  function toggleCluster(e) {
    const next = e.target.checked
    setClusterRows(next)
    fetchHeatmap(source, listFor(source), next)
  }

  // Symbols the matrix did not have — the API returns only the genes it found.
  const missing = useMemo(() => {
    if (source !== 'list' || !heatmapData) return []
    const found = new Set(heatmapData.genes)
    return symbols.filter(s => !found.has(s))
  }, [source, symbols, heatmapData])

  const groupColors = useMemo(() => {
    const order = heatmapData?.grouping?.group_order || []
    return groupColorMap(order, null)
  }, [heatmapData])

  const setNote =
    source === 'top' ? `top ${nGenes} by variance`
    : source === 'list'
      ? (symbols.length ? `${symbols.length} genes from your list · order preserved` : 'no genes in your list yet')
      : selection
        ? `genes in ${selection.label}`
        : 'no pathway selected — showing top variable'

  const headerRight = (
    <>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <input type="checkbox" checked={clusterRows} onChange={toggleCluster} />
        <span className="t-util">Cluster rows</span>
      </label>
      <SegToggle ariaLabel="Heatmap view" options={VIEW} value={view} onChange={setView} />
    </>
  )

  return (
    <PanelFrame
      id="heatmap"
      title="Heatmap"
      kicker="z-score fill · FPKM label"
      headerRight={headerRight}
      expandedPanel={expandedPanel}
      onToggleExpand={onToggleExpand}
      bodyStyle={{ padding: 0 }}
    >
      {/* shared gene-set sub-bar — governs the R render too */}
      <div style={{
        background: 'var(--ground-alt)',
        borderBottom: '1.5px solid var(--rule-mid)',
        padding: '10px 14px 11px',
        display: 'flex', flexDirection: 'column', gap: 9,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="t-util t-util-field" id="hm-set-label">Gene set</span>
          <SegToggle
            ariaLabel="Heatmap gene set source"
            options={SOURCES.map(s => ({
              ...s,
              disabled: s.value === 'linked' && !selection,
              title: s.value === 'linked' && !selection ? 'Select a pathway first' : undefined,
            }))}
            value={source}
            onChange={switchSource}
          />
          {source === 'top' && (
            <>
              <label className="t-util t-util-field" htmlFor="hm-n">N</label>
              <input id="hm-n" type="number" className="fld" style={{ width: 64 }}
                     min={1} max={500} step={5} value={nGenes}
                     onChange={e => setNGenes(Number(e.target.value))} />
              <button type="button" className="btn btn-outline"
                      onClick={() => fetchHeatmap('top', null, clusterRows, nGenes)}>
                Apply
              </button>
            </>
          )}
          <span className="t-note" style={{ marginLeft: 'auto' }}>{setNote}</span>
        </div>

        {source === 'list' && (
          <>
            <ChipWell
              inputId="hm-symbols"
              ariaLabel="Heatmap gene list"
              symbols={symbols}
              missing={new Set(missing)}
              draft={draft}
              onDraft={setDraft}
              onRemove={s => applyList(symbols.filter(g => g !== s))}
              onCommit={added => applyList([...new Set([...symbols, ...added])])}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" onClick={handleAddGenes}>
                Add genes
              </button>
              <button type="button" className="btn btn-outline" onClick={() => fileRef.current?.click()}>
                Upload .txt / .csv
              </button>
              <input ref={fileRef} type="file" accept=".txt,.csv,.tsv,text/plain"
                     style={{ display: 'none' }} onChange={handleUpload} />
              <button type="button" className="btn btn-outline"
                      onClick={handleFromSelection} disabled={!selection}>
                From linked selection
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => applyList([])}>
                Clear
              </button>
              <span className="t-note t-num" style={{ marginLeft: 'auto' }}>
                {symbols.length} in list
              </span>
            </div>
            <MissingStrip missing={missing} noun="not in matrix" />
          </>
        )}
      </div>

      <div style={{ padding: '11px 14px 13px' }}>
        {loading && <p className="msg-wait">Loading heatmap data…</p>}
        <ErrorMsg>{error}</ErrorMsg>

        {view === 'interactive' && heatmapData && (
          <HeatmapPlot
            data={heatmapData}
            selectionSet={selectionSet}
            groupColors={groupColors}
          />
        )}

        {view === 'r' && (
          <RHeatmapPanel
            projectId={projectId}
            genes={heatmapData?.genes ?? null}
            clusterRows={clusterRows}
            defaultTitle={projectName}
            setNote={setNote}
          />
        )}
      </div>
    </PanelFrame>
  )
}
