import { useMemo } from 'react'
import { ChartTooltip, useNearestHover } from './ChartHover'
import { usePanelExpanded } from './PanelContext'
import { fmtExp, fmtNum, fmtSigned, fpkmFields } from './ui'

/**
 * Volcano, drawn as a plain SVG at the design geometry.
 *
 *   viewBox 0 0 700 330 · plot rect x52 y16 w638 h270
 *   cx = 371 + clamp(lfc, -xMax, xMax) * (319 / xMax)
 *   cy = 286 - min(nlogp, yMax) * (270 / yMax)
 *
 * xMax defaults to 6 and yMax to 28, which reproduce the design's 53.17 and
 * 9.64 exactly. Both extend when the data run past them, so a project whose
 * top hits sit at -log10(padj) ~ 300 is not flattened onto the frame edge.
 *
 * Every text node in here is a real SVG <text> with a plain text child. An
 * HTML element inside the SVG namespace has no rendered geometry and paints
 * nothing while still sitting in the DOM with the right x/y/fill.
 */

const PLOT = { x: 52, y: 16, w: 638, h: 270, cx: 371, cy0: 286 }
const LABEL_STEP = 13
const FLOOR_Y = 282

function niceTicks(max, count) {
  const raw = max / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag
  const out = []
  for (let v = 0; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(6)))
  return out
}

function circlesPath(pts, r) {
  let d = ''
  for (const [x, y] of pts) {
    d += `M${(x - r).toFixed(1)},${y.toFixed(1)}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`
  }
  return d
}

// Native browser tooltip, used in the compact grid view. In the expanded
// state the hover tooltip below supersedes it and it is left off, so the two
// never stack up on the same point.
const hoverTitle = p =>
  `${p.symbol}\nlog2FC: ${p.lfc.toFixed(3)}\npadj: ${p.padj.toExponential(2)}`

// Push labels apart within an anchor group so they stay legible. A label that
// would be pushed past the plot floor is dropped rather than clamped onto it —
// clamping stacks the tail of a large set into one illegible line, which a
// pathway gene set hits immediately.
function deCollide(items) {
  const out = []
  for (const side of ['start', 'end']) {
    const group = items.filter(i => i.anchor === side).sort((a, b) => a.y - b.y)
    let prev = -Infinity
    for (const it of group) {
      let y = it.y
      if (y - prev < LABEL_STEP) y = prev + LABEL_STEP
      if (y > FLOOR_Y) continue
      prev = y
      out.push({ ...it, y })
    }
  }
  return out
}

export default function VolcanoPlot({
  rows, padjCutoff, lfcCutoff, labelSymbols, selectionSet,
}) {
  const model = useMemo(() => {
    const pts = []
    let maxAbsLfc = 0
    let maxNlog = 0
    for (const r of rows) {
      const lfc = r.log2FoldChange
      const padj = r.padj
      if (lfc == null || padj == null || !isFinite(lfc) || !isFinite(padj)) continue
      const nlog = padj > 0 ? Math.min(-Math.log10(padj), 300) : 300
      const symbol = r.symbol && !String(r.symbol).startsWith('ENSG') ? r.symbol : r.gene
      const sig = padj < padjCutoff && Math.abs(lfc) > lfcCutoff
      // `row` is the source record by reference, not a copy — the tooltip
      // reads its per-condition FPKM columns without a second 60k-row pass.
      pts.push({ lfc, padj, nlog, symbol, sig, up: lfc > 0, row: r })
      if (Math.abs(lfc) > maxAbsLfc) maxAbsLfc = Math.abs(lfc)
      if (nlog > maxNlog) maxNlog = nlog
    }
    const xMax = Math.max(6, Math.ceil(maxAbsLfc))
    const yMax = Math.max(28, Math.ceil(maxNlog))
    const sx = 319 / xMax
    const sy = 270 / yMax
    const toX = v => PLOT.cx + Math.max(-xMax, Math.min(xMax, v)) * sx
    const toY = v => PLOT.cy0 - Math.min(v, yMax) * sy
    return { pts, xMax, yMax, toX, toY }
  }, [rows, padjCutoff, lfcCutoff])

  const { pts, xMax, yMax, toX, toY } = model

  const groups = useMemo(() => {
    const ns = [], up = [], down = [], dimmed = [], inSel = []
    for (const p of pts) {
      const xy = [toX(p.lfc), toY(p.nlog)]
      if (selectionSet) {
        if (selectionSet.has(p.symbol)) inSel.push({ ...p, xy })
        else dimmed.push(xy)
        continue
      }
      if (!p.sig) ns.push(xy)
      else if (p.up) up.push({ ...p, xy })
      else down.push({ ...p, xy })
    }
    return { ns, up, down, dimmed, inSel }
  }, [pts, toX, toY, selectionSet])

  const counts = useMemo(() => {
    let up = 0, down = 0, ns = 0
    for (const p of pts) { if (!p.sig) ns++; else if (p.up) up++; else down++ }
    return { up, down, ns }
  }, [pts])

  const labels = useMemo(() => {
    if (!labelSymbols || labelSymbols.size === 0) return []
    const seen = new Set()
    const items = []
    for (const p of pts) {
      if (!labelSymbols.has(p.symbol) || seen.has(p.symbol)) continue
      seen.add(p.symbol)
      const x = toX(p.lfc)
      items.push({
        key: p.symbol,
        text: p.symbol,
        anchor: p.lfc >= 0 ? 'start' : 'end',
        x: p.lfc >= 0 ? x + 5 : x - 5,
        y: toY(p.nlog) - 4,
      })
    }
    return deCollide(items)
  }, [pts, labelSymbols, toX, toY])

  const xTicks = useMemo(() => {
    const half = niceTicks(xMax, 3)
    return [...half.slice(1).map(v => -v).reverse(), ...half]
  }, [xMax])
  const yTicks = useMemo(() => niceTicks(yMax, 5), [yMax])

  const guideY = toY(-Math.log10(padjCutoff))
  const showGuideY = isFinite(guideY) && guideY > PLOT.y && guideY < PLOT.cy0

  // ── Expanded-mode hover ───────────────────────────────────────────────
  const expanded = usePanelExpanded()

  const hoverPoints = useMemo(
    () => pts.map(p => ({ x: toX(p.lfc), y: toY(p.nlog), p })),
    [pts, toX, toY]
  )
  const { ref, hover, handlers } = useNearestHover({ enabled: expanded, points: hoverPoints })

  const tipRows = useMemo(() => {
    const p = hover?.point?.p
    if (!p) return []
    return [
      ['log2FC', fmtSigned(p.lfc, 3)],
      ['padj', fmtExp(p.padj, 2)],
      ...fpkmFields(p.row).map(([cond, v]) => [`FPKM ${cond}`, fmtNum(v, 2)]),
    ]
  }, [hover])

  // The <svg> is held in a memo so a hover state change leaves its element
  // identity untouched and React skips the entire subtree — without this the
  // 60k-point path string would be rebuilt on every pointermove.
  const chart = useMemo(() => (
    <svg viewBox="0 0 700 330" width="100%" role="img"
           aria-label={`Volcano plot: ${counts.up} up, ${counts.down} down, ${counts.ns} not significant`}
           style={{ display: 'block' }}>
        <rect x={PLOT.x} y={PLOT.y} width={PLOT.w} height={PLOT.h}
              fill="var(--surface-plot)" stroke="var(--rule-soft)" strokeWidth="1" />

        {/* zero / centre guide */}
        <line x1={PLOT.cx} y1={PLOT.y} x2={PLOT.cx} y2={PLOT.cy0}
              stroke="var(--rule-faint)" strokeWidth="1" />

        {/* threshold guides */}
        <g stroke="var(--ink)" strokeWidth="1" strokeDasharray="5 4">
          <line x1={toX(lfcCutoff)} y1={PLOT.y} x2={toX(lfcCutoff)} y2={PLOT.cy0} />
          <line x1={toX(-lfcCutoff)} y1={PLOT.y} x2={toX(-lfcCutoff)} y2={PLOT.cy0} />
          {showGuideY && <line x1={PLOT.x} y1={guideY} x2={PLOT.x + PLOT.w} y2={guideY} />}
        </g>

        {/* points */}
        {selectionSet ? (
          <>
            <path d={circlesPath(groups.dimmed, 2.2)} fill="var(--de-dimmed)" opacity="0.16" />
            {groups.inSel.map((p, i) => (
              <circle key={p.symbol + i} cx={p.xy[0]} cy={p.xy[1]} r="4.2" opacity="1"
                      fill={p.up ? 'var(--de-up)' : 'var(--de-down)'}>
                {!expanded && <title>{hoverTitle(p)}</title>}
              </circle>
            ))}
          </>
        ) : (
          <>
            <path d={circlesPath(groups.ns, 2.4)} fill="var(--de-ns)" opacity="0.75" />
            {groups.down.map((p, i) => (
              <circle key={'d' + i} cx={p.xy[0]} cy={p.xy[1]} r="3.1" opacity="0.9" fill="var(--de-down)">
                {!expanded && <title>{hoverTitle(p)}</title>}
              </circle>
            ))}
            {groups.up.map((p, i) => (
              <circle key={'u' + i} cx={p.xy[0]} cy={p.xy[1]} r="3.1" opacity="0.9" fill="var(--de-up)">
                {!expanded && <title>{hoverTitle(p)}</title>}
              </circle>
            ))}
          </>
        )}

        {/* gene labels */}
        {labels.map(l => (
          <text key={l.key} x={l.x} y={l.y} textAnchor={l.anchor}
                fontSize="10" fontWeight="700" fill="var(--ink)">
            {l.text}
          </text>
        ))}

        {/* ticks */}
        {xTicks.map(v => (
          <text key={'xt' + v} x={toX(v)} y={302} textAnchor="middle"
                fontSize="10" fontWeight="500" fill="var(--ink-600)">
            {String(v)}
          </text>
        ))}
        {yTicks.map(v => (
          <text key={'yt' + v} x={46} y={toY(v) + 3.5} textAnchor="end"
                fontSize="10" fontWeight="500" fill="var(--ink-600)">
            {String(v)}
          </text>
        ))}

        {/* axis titles */}
        <text x={PLOT.cx} y={322} textAnchor="middle"
              fontSize="10" fontWeight="600" letterSpacing="1" fill="var(--ink-600)">
          LOG2 FOLD CHANGE
        </text>
        <text x={14} y={151} textAnchor="middle" transform="rotate(-90 14 151)"
              fontSize="10" fontWeight="600" letterSpacing="1" fill="var(--ink-600)">
          −LOG10 PADJ
        </text>
      </svg>
  ), [counts, toX, toY, lfcCutoff, guideY, showGuideY, selectionSet, groups, labels, xTicks, yTicks, expanded])

  return (
    <div ref={ref} {...handlers}>
      {chart}

      <ChartTooltip
        anchorRef={ref}
        hover={hover}
        title={hover?.point?.p?.symbol}
        rows={tipRows}
      />

      {/* legend */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--rule-hair)',
      }}>
        {[
          ['Up', counts.up, 'var(--de-up)'],
          ['Down', counts.down, 'var(--de-down)'],
          ['NS', counts.ns, 'var(--de-ns)'],
        ].map(([label, n, color]) => (
          <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span aria-hidden="true" style={{ width: 9, height: 9, background: color }} />
            <span className="t-util">{label}</span>
            <span className="t-num" style={{ fontWeight: 700, fontSize: 11.5 }}>{n}</span>
          </span>
        ))}
        <span className="t-note" style={{ marginLeft: 'auto' }}>
          {selectionSet
            ? 'Points outside the linked gene set are dimmed.'
            : `significant: padj < ${padjCutoff} and |log2FC| > ${lfcCutoff}`}
        </span>
      </div>
    </div>
  )
}
