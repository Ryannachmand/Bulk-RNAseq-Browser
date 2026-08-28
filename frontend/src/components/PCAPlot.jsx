import { useMemo } from 'react'
import { groupColorMap } from './ui'

/**
 * PCA scatter at the design geometry: viewBox 0 0 442 268, plot rect
 * x34 y10 w398 h216, centre guides at x=233 / y=118, r=6 points with a 1.5px
 * ground-coloured stroke, sample labels offset +9x / -7y.
 *
 * Coordinates and variance-explained percentages come from the API. The axis
 * titles are built from the block actually being shown, so switching to the
 * batch-corrected block changes the percentages with it.
 */

const PLOT = { x: 34, y: 10, w: 398, h: 216 }
const PAD = { l: 16, r: 26, t: 16, b: 16 }

export default function PCAPlot({ block, rawBlock, pcX, pcY, varExplained }) {
  const samples = rawBlock.samples || []
  const meta = rawBlock.sample_meta || {}

  const conditions = useMemo(() => {
    const out = []
    for (const s of samples) {
      const c = meta[s]?.condition ?? s
      if (!out.includes(c)) out.push(c)
    }
    return out
  }, [samples, meta])

  const colorFor = useMemo(() => groupColorMap(conditions, null), [conditions])

  const pts = useMemo(() => {
    const xs = block[pcX] || []
    const ys = block[pcY] || []
    const xMin = Math.min(...xs), xMax = Math.max(...xs)
    const yMin = Math.min(...ys), yMax = Math.max(...ys)
    const xSpan = (xMax - xMin) || 1
    const ySpan = (yMax - yMin) || 1
    const px0 = PLOT.x + PAD.l, px1 = PLOT.x + PLOT.w - PAD.r
    const py0 = PLOT.y + PAD.t, py1 = PLOT.y + PLOT.h - PAD.b
    return samples.map((s, i) => ({
      s,
      cond: meta[s]?.condition ?? s,
      cx: px0 + ((xs[i] - xMin) / xSpan) * (px1 - px0),
      cy: py1 - ((ys[i] - yMin) / ySpan) * (py1 - py0),
    }))
  }, [block, pcX, pcY, samples, meta])

  const xTitle = `${pcX}: ${(varExplained[pcX] ?? 0).toFixed(1)}% variance`
  const yTitle = `${pcY}: ${(varExplained[pcY] ?? 0).toFixed(1)}% variance`

  return (
    <div>
      <svg viewBox="0 0 442 268" width="100%" role="img"
           aria-label={`PCA scatter, ${xTitle} against ${yTitle}`} style={{ display: 'block' }}>
        <rect x={PLOT.x} y={PLOT.y} width={PLOT.w} height={PLOT.h}
              fill="var(--surface-plot)" stroke="var(--rule-soft)" strokeWidth="1" />

        <line x1="233" y1={PLOT.y} x2="233" y2={PLOT.y + PLOT.h}
              stroke="var(--rule-faint)" strokeWidth="1" />
        <line x1={PLOT.x} y1="118" x2={PLOT.x + PLOT.w} y2="118"
              stroke="var(--rule-faint)" strokeWidth="1" />

        {pts.map(p => (
          <circle key={p.s} cx={p.cx} cy={p.cy} r="6"
                  fill={colorFor[p.cond]} stroke="#f3f2f2" strokeWidth="1.5">
            <title>{`${p.s} · ${p.cond}`}</title>
          </circle>
        ))}

        {pts.map(p => (
          <text key={'l' + p.s} x={p.cx + 9} y={p.cy - 7}
                fontSize="10" fontWeight="600" fill="var(--ink-600)">
            {p.s}
          </text>
        ))}

        <text x="233" y="252" textAnchor="middle"
              fontSize="10" fontWeight="600" letterSpacing="1" fill="var(--ink-600)">
          {xTitle}
        </text>
        <text x="12" y="118" textAnchor="middle" transform="rotate(-90 12 118)"
              fontSize="10" fontWeight="600" letterSpacing="1" fill="var(--ink-600)">
          {yTitle}
        </text>
      </svg>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--rule-hair)',
      }}>
        {conditions.map(c => (
          <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span aria-hidden="true" style={{ width: 9, height: 9, background: colorFor[c] }} />
            <span className="t-util">{c}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
