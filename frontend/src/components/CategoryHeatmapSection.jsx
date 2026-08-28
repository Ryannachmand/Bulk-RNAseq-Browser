import { useMemo, useState } from 'react'
import { getProjectCategoryHeatmap, renderProjectRCategoryHeatmaps } from '../api/client'
import HeatmapPlot from './HeatmapPlot'
import { ErrorMsg, ROutput, SegToggle, groupColorMap } from './ui'

const VIEW = [
  { value: 'interactive', label: 'Interactive' },
  { value: 'r', label: 'R-exact' },
]

function CategoryCell({ cat, samples, grouping, groupColors, selectionSet }) {
  if (!cat.genes || cat.genes.length === 0) {
    return (
      <div style={{ background: 'var(--ground)', padding: '8px 9px 9px', minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 10.5 }}>{cat.name}</div>
        <p className="t-note" style={{ margin: '6px 0 0' }}>
          No matching genes in this FPKM matrix.
        </p>
      </div>
    )
  }
  return (
    <div style={{ background: 'var(--ground)', padding: '8px 9px 9px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{
          fontWeight: 700, fontSize: 10.5, minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {cat.name}
        </span>
        <span className="t-num" style={{
          marginLeft: 'auto', flex: 'none',
          fontWeight: 600, fontSize: 9.5, color: 'var(--ink-600)',
        }}>
          {cat.genes.length}
        </span>
      </div>
      <div style={{ marginTop: 6 }}>
        <HeatmapPlot
          data={{
            genes: cat.genes,
            samples,
            z_scores: cat.z_scores,
            fpkm_labels: cat.fpkm_labels,
            grouping,
          }}
          selectionSet={selectionSet}
          groupColors={groupColors}
          labelWidth={72}
          cellHeight={14}
          showCellLabels={false}
          showLegend={false}
        />
      </div>
    </div>
  )
}

export default function CategoryHeatmapSection({ projectId, selectionSet }) {
  const [view, setView] = useState('interactive')
  const [nTopGenes, setNTopGenes] = useState(40)

  const [loading, setLoading] = useState(false)
  const [heatmapData, setHeatmapData] = useState(null)
  const [dataError, setDataError] = useState(null)

  const [rLoading, setRLoading] = useState(false)
  const [rImageUrl, setRImageUrl] = useState(null)
  const [rError, setRError] = useState(null)

  async function loadHeatmap() {
    setLoading(true)
    setDataError(null)
    setHeatmapData(null)
    try {
      setHeatmapData(await getProjectCategoryHeatmap(projectId, nTopGenes))
    } catch (e) {
      setDataError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function generateRPlot() {
    setRLoading(true)
    setRError(null)
    setRImageUrl(null)
    try {
      setRImageUrl(await renderProjectRCategoryHeatmaps(projectId, nTopGenes))
    } catch (e) {
      setRError(e.message)
    } finally {
      setRLoading(false)
    }
  }

  const groupColors = useMemo(
    () => groupColorMap(heatmapData?.grouping?.group_order || [], null),
    [heatmapData]
  )

  const active = heatmapData?.categories?.filter(c => c.genes && c.genes.length > 0) ?? []

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <SegToggle ariaLabel="Category heatmap view" options={VIEW} value={view} onChange={setView} />
        <label className="t-util t-util-field" htmlFor="ch-n">Top genes per category</label>
        <input id="ch-n" type="number" className="fld" style={{ width: 64 }}
               min={1} max={200} value={nTopGenes}
               onChange={e => setNTopGenes(Number(e.target.value))} />
        <button type="button" className="btn btn-outline" onClick={loadHeatmap} disabled={loading}>
          {loading ? 'Loading…' : heatmapData ? 'Reload heatmap' : 'Load heatmap'}
        </button>
      </div>

      <ErrorMsg>{dataError}</ErrorMsg>

      {view === 'interactive' && (
        <>
          {!heatmapData && !loading && (
            <p className="t-body" style={{ margin: 0 }}>
              Click <strong>Load heatmap</strong> to render a panel for each active category.
            </p>
          )}
          {loading && <p className="msg-wait">Computing z-scores…</p>}
          {heatmapData && (
            <>
              <p className="t-note" style={{ margin: '0 0 8px' }}>
                {active.length} active categor{active.length === 1 ? 'y' : 'ies'} ·{' '}
                {heatmapData.samples.length} samples · z-score fill, hover a cell for the FPKM.
              </p>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 2, background: 'var(--rule-soft)', border: '1px solid var(--rule-soft)',
              }}>
                {heatmapData.categories.map((cat, i) => (
                  <CategoryCell
                    key={cat.name + i}
                    cat={cat}
                    samples={heatmapData.samples}
                    grouping={heatmapData.grouping}
                    groupColors={groupColors}
                    selectionSet={selectionSet}
                  />
                ))}
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginTop: 10,
                paddingTop: 8, borderTop: '1px solid var(--rule-hair)',
              }}>
                <span className="t-util">z −3</span>
                <span className="z-ramp" aria-hidden="true" style={{ width: 120 }} />
                <span className="t-util">+3</span>
              </div>
            </>
          )}
        </>
      )}

      {view === 'r' && (
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ width: 196, flex: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p className="t-note" style={{ margin: 0 }}>
              Rendered by <code className="t-mono">render_category_heatmaps.R</code> — pheatmap
              in the BulkSIX3SB z-score + FPKM-label style. 300 dpi PNG plus PDF.
            </p>
            <button type="button" className="btn btn-primary" onClick={generateRPlot} disabled={rLoading}>
              {rLoading ? 'Generating…' : 'Generate R plot'}
            </button>
            {rLoading && <p className="msg-wait" style={{ margin: 0 }}>Running R — 30–60 s.</p>}
          </div>
          <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 9 }}>
            <ErrorMsg label="R error">{rError}</ErrorMsg>
            <ROutput imgUrl={rImageUrl} filename="category_heatmaps.png" alt="R category heatmaps" />
          </div>
        </div>
      )}
    </div>
  )
}
