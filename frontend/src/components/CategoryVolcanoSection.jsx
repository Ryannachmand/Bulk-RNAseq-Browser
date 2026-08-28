import { useMemo, useState } from 'react'
import { getProjectCategoryVolcano, renderProjectRCategoryVolcanos } from '../api/client'
import { ErrorMsg, ROutput, SegToggle } from './ui'

/**
 * One 200x106 mini-volcano per active category, on a shared scale so the
 * four cells are comparable. Category genes are coloured by direction;
 * everything else is background.
 */

const VIEW = [
  { value: 'interactive', label: 'Interactive' },
  { value: 'r', label: 'R-exact' },
]

const CELL = { w: 200, h: 106, padX: 5, padTop: 5, padBottom: 5 }

function circlesPath(pts, r) {
  let d = ''
  for (const [x, y] of pts) {
    d += `M${(x - r).toFixed(1)},${y.toFixed(1)}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`
  }
  return d
}

function MiniVolcano({ cat, allGenes, scale, padjCutoff, lfcCutoff, selectionSet }) {
  const catSet = useMemo(() => new Set(cat.genes), [cat.genes])

  const { bg, up, down, ns, dim, nUp, nDown } = useMemo(() => {
    const bg = [], up = [], down = [], ns = [], dim = []
    let nUp = 0, nDown = 0
    for (const r of allGenes) {
      const lfc = r.log2FoldChange, padj = r.padj
      if (lfc == null || padj == null || !isFinite(lfc)) continue
      const nlog = padj > 0 ? Math.min(-Math.log10(padj), 300) : 300
      const xy = [scale.x(lfc), scale.y(nlog)]
      if (!catSet.has(r.symbol)) { bg.push(xy); continue }
      if (selectionSet && !selectionSet.has(r.symbol)) { dim.push(xy); continue }
      const isUp = padj < padjCutoff && lfc > lfcCutoff
      const isDown = padj < padjCutoff && lfc < -lfcCutoff
      if (isUp) { up.push(xy); nUp++ }
      else if (isDown) { down.push(xy); nDown++ }
      else ns.push(xy)
    }
    return { bg, up, down, ns, dim, nUp, nDown }
  }, [allGenes, catSet, scale, padjCutoff, lfcCutoff, selectionSet])

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

      <svg viewBox="0 0 200 106" width="100%" role="img"
           aria-label={`${cat.name}: ${nUp} up, ${nDown} down`}
           style={{ display: 'block', marginTop: 5 }}>
        <rect x="0.5" y="0.5" width="199" height="105"
              fill="var(--surface-plot)" stroke="var(--rule-hair)" strokeWidth="1" />
        <line x1={scale.x(0)} y1="1" x2={scale.x(0)} y2="105"
              stroke="var(--rule-faint)" strokeWidth="1" />
        <path d={circlesPath(bg, 1.3)} fill="var(--de-ns)" opacity="0.35" />
        {dim.length > 0 && <path d={circlesPath(dim, 2.1)} fill="var(--de-dimmed)" opacity="0.14" />}
        <path d={circlesPath(ns, 2.1)} fill="var(--overlay-ns)" opacity="0.8" />
        <path d={circlesPath(down, 2.1)} fill="var(--overlay-down)" />
        <path d={circlesPath(up, 2.1)} fill="var(--overlay-up)" />
      </svg>

      <div style={{ display: 'flex', gap: 10, marginTop: 5 }}>
        <span className="t-num" style={{ fontWeight: 600, fontSize: 9.5, color: 'var(--de-up)' }}>
          ↑{nUp}
        </span>
        <span className="t-num" style={{ fontWeight: 600, fontSize: 9.5, color: 'var(--de-down)' }}>
          ↓{nDown}
        </span>
      </div>
    </div>
  )
}

export default function CategoryVolcanoSection({
  projectId, padjCutoff, lfcCutoff, selectionSet,
}) {
  const [view, setView] = useState('interactive')
  const [loading, setLoading] = useState(false)
  const [volcData, setVolcData] = useState(null)
  const [dataError, setDataError] = useState(null)

  const [rLoading, setRLoading] = useState(false)
  const [rImageUrl, setRImageUrl] = useState(null)
  const [rError, setRError] = useState(null)

  async function loadVolcano() {
    setLoading(true)
    setDataError(null)
    setVolcData(null)
    try {
      setVolcData(await getProjectCategoryVolcano(projectId))
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
      setRImageUrl(await renderProjectRCategoryVolcanos(projectId, {
        padjCutoff, lfcCutoff, nLabel: 15,
      }))
    } catch (e) {
      setRError(e.message)
    } finally {
      setRLoading(false)
    }
  }

  // One scale shared by every cell so the four panels are directly comparable.
  // The y range comes from the union of the category gene sets rather than
  // from every DE gene: in a 106px cell, scaling to a background maximum of
  // -log10(padj) ~ 300 flattens every category point onto the floor. Points
  // above the range clamp to the top edge.
  const scale = useMemo(() => {
    const genes = volcData?.all_genes || []
    const inAnyCategory = new Set()
    for (const c of volcData?.categories || []) for (const g of c.genes) inAnyCategory.add(g)
    let maxAbs = 0, maxNlog = 0
    for (const r of genes) {
      const lfc = r.log2FoldChange, padj = r.padj
      if (lfc == null || padj == null || !isFinite(lfc)) continue
      if (Math.abs(lfc) > maxAbs) maxAbs = Math.abs(lfc)
      if (!inAnyCategory.has(r.symbol)) continue
      const nlog = padj > 0 ? Math.min(-Math.log10(padj), 300) : 300
      if (nlog > maxNlog) maxNlog = nlog
    }
    const xMax = Math.max(1, maxAbs)
    const yMax = Math.max(1, maxNlog)
    const x0 = CELL.padX, x1 = CELL.w - CELL.padX
    const y0 = CELL.padTop, y1 = CELL.h - CELL.padBottom
    const mid = (x0 + x1) / 2
    return {
      x: v => mid + (Math.max(-xMax, Math.min(xMax, v)) / xMax) * ((x1 - x0) / 2),
      y: v => y1 - (Math.min(v, yMax) / yMax) * (y1 - y0),
    }
  }, [volcData])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <SegToggle ariaLabel="Category volcano view" options={VIEW} value={view} onChange={setView} />
        <button type="button" className="btn btn-outline" onClick={loadVolcano} disabled={loading}>
          {loading ? 'Loading…' : volcData ? 'Reload volcanos' : 'Load volcanos'}
        </button>
        <span className="t-note" style={{ marginLeft: 'auto' }}>
          padj &lt; {padjCutoff} · |log2FC| &gt; {lfcCutoff}
        </span>
      </div>

      <ErrorMsg>{dataError}</ErrorMsg>

      {view === 'interactive' && (
        <>
          {!volcData && !loading && (
            <p className="t-body" style={{ margin: 0 }}>
              Click <strong>Load volcanos</strong> to render one mini-volcano per active category.
            </p>
          )}
          {loading && <p className="msg-wait">Loading…</p>}
          {volcData && (
            <>
              <p className="t-note" style={{ margin: '0 0 8px' }}>
                {volcData.categories.length} active categor
                {volcData.categories.length === 1 ? 'y' : 'ies'} ·{' '}
                {volcData.all_genes.length} DE genes · category genes coloured, all others in grey.
              </p>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 2, background: 'var(--rule-soft)', border: '1px solid var(--rule-soft)',
              }}>
                {volcData.categories.map((cat, i) => (
                  <MiniVolcano
                    key={cat.name + i}
                    cat={cat}
                    allGenes={volcData.all_genes}
                    scale={scale}
                    padjCutoff={padjCutoff}
                    lfcCutoff={lfcCutoff}
                    selectionSet={selectionSet}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {view === 'r' && (
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ width: 196, flex: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p className="t-note" style={{ margin: 0 }}>
              Rendered by <code className="t-mono">render_category_volcanos.R</code> — a ggplot2 +
              ggrepel patchwork matching DiffExpr_Grid.R. PNG at 200 dpi plus PDF.
            </p>
            <button type="button" className="btn btn-primary" onClick={generateRPlot} disabled={rLoading}>
              {rLoading ? 'Generating…' : 'Generate R plot'}
            </button>
            {rLoading && <p className="msg-wait" style={{ margin: 0 }}>Running R — 20–40 s.</p>}
          </div>
          <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 9 }}>
            <ErrorMsg label="R error">{rError}</ErrorMsg>
            <ROutput imgUrl={rImageUrl} filename="category_volcanos.png" alt="R category volcanos" />
          </div>
        </div>
      )}
    </div>
  )
}
