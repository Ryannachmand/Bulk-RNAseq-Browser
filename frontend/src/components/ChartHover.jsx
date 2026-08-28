import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

/**
 * Hover tooltips for the expanded state of a chart panel.
 *
 * PERFORMANCE — the reason this is a shared module rather than a listener per
 * mark. One project's annotation set runs past 60,000 genes, and attaching a
 * mouse handler to every circle at that scale is visibly slow. Instead there
 * is exactly ONE pointermove listener, on the wrapper element, and the point
 * under the cursor is found by nearest-neighbour lookup against a uniform
 * bucket grid built once per data change.
 *
 * The other half of the cost is React: a chart that re-renders on every
 * pointermove would rebuild its 60,000-point path string sixty times a
 * second. Callers therefore hold their <svg> in a useMemo, so the element
 * identity is unchanged across a hover state update and React skips the whole
 * subtree. Hover state lives on the wrapper, never inside the plot.
 */

const HIT_PX = 16       // proximity threshold, in screen pixels
const GAP = 14          // cursor-to-tooltip offset
const EDGE = 5          // keep-inside-the-panel margin

/* ── Nearest-point index ───────────────────────────────────────────────────
   Uniform grid keyed "col,row". Cell size is derived from the point count so
   a dense chart gets a fine grid and a sparse one does not pay for empty
   buckets; a query then only has to scan the cells the hit radius covers. */

function buildIndex(points) {
  const n = points.length
  if (!n) return null

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (let i = 0; i < n; i++) {
    const p = points[i]
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }

  const span = Math.max(maxX - minX, maxY - minY) || 1
  const divisions = Math.max(8, Math.min(96, Math.ceil(Math.sqrt(n))))
  const cell = span / divisions

  const buckets = new Map()
  for (let i = 0; i < n; i++) {
    const key = (((points[i].x - minX) / cell) | 0) + ',' + (((points[i].y - minY) / cell) | 0)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(i)
    else buckets.set(key, [i])
  }

  return { minX, minY, cell, buckets }
}

function nearest(index, points, x, y, radius) {
  if (!index) return -1
  const { minX, minY, cell, buckets } = index
  const c0 = Math.floor((x - radius - minX) / cell)
  const c1 = Math.floor((x + radius - minX) / cell)
  const r0 = Math.floor((y - radius - minY) / cell)
  const r1 = Math.floor((y + radius - minY) / cell)

  let best = -1
  let bestDist = radius * radius        // nothing beyond the threshold wins
  for (let c = c0; c <= c1; c++) {
    for (let r = r0; r <= r1; r++) {
      const bucket = buckets.get(c + ',' + r)
      if (!bucket) continue
      for (let k = 0; k < bucket.length; k++) {
        const i = bucket[k]
        const dx = points[i].x - x
        const dy = points[i].y - y
        const d = dx * dx + dy * dy
        if (d < bestDist) { bestDist = d; best = i }
      }
    }
  }
  return best
}

/**
 * Nearest-point hover over an SVG chart.
 *
 * `points` are [{ x, y, ... }] in the SVG's own user units; the cursor is
 * projected into those units through the live screen CTM, and the hit radius
 * is divided by the CTM scale so the threshold stays constant in screen
 * pixels however the viewBox is stretched.
 *
 * Returns a ref for the wrapper element, the current hover (or null), and the
 * handlers to spread onto that wrapper. When `enabled` is false the handlers
 * are empty — no listener is registered at all in the compact grid view.
 */
export function useNearestHover({ enabled, points, hitPx = HIT_PX }) {
  const ref = useRef(null)
  const [hover, setHover] = useState(null)
  const frame = useRef(0)
  const queued = useRef(null)

  const index = useMemo(() => buildIndex(points), [points])

  const resolve = useCallback(() => {
    frame.current = 0
    const ev = queued.current
    const wrap = ref.current
    if (!ev || !wrap) return

    const svg = wrap.querySelector('svg')
    const ctm = svg?.getScreenCTM?.()
    if (!ctm) return

    const pt = svg.createSVGPoint()
    pt.x = ev.clientX
    pt.y = ev.clientY
    const local = pt.matrixTransform(ctm.inverse())

    // Geometric mean of the CTM scale — one number for a uniform viewBox fit.
    const scale = Math.sqrt(Math.abs(ctm.a * ctm.d - ctm.b * ctm.c)) || 1
    const i = nearest(index, points, local.x, local.y, hitPx / scale)

    setHover(prev => {
      if (i < 0) return prev === null ? prev : null
      if (prev && prev.index === i && prev.clientX === ev.clientX && prev.clientY === ev.clientY) {
        return prev
      }
      return { index: i, point: points[i], clientX: ev.clientX, clientY: ev.clientY }
    })
  }, [index, points, hitPx])

  const onPointerMove = useCallback(e => {
    queued.current = { clientX: e.clientX, clientY: e.clientY }
    if (!frame.current) frame.current = requestAnimationFrame(resolve)
  }, [resolve])

  const onPointerLeave = useCallback(() => {
    queued.current = null
    if (frame.current) { cancelAnimationFrame(frame.current); frame.current = 0 }
    setHover(null)
  }, [])

  // Collapsing the panel must clear the tooltip in the same commit, so it can
  // never be seen for a frame over the compact grid.
  useEffect(() => {
    if (enabled) return undefined
    setHover(null)
    return () => {}
  }, [enabled])

  useEffect(() => () => {
    if (frame.current) cancelAnimationFrame(frame.current)
  }, [])

  return {
    ref,
    hover: enabled ? hover : null,
    handlers: enabled ? { onPointerMove, onPointerLeave } : {},
  }
}

/**
 * Hover over discrete DOM marks (heatmap cells, pathway bars) rather than
 * scattered points. Still one delegated listener: the mark under the cursor is
 * found with closest() on the event target, so the number of marks costs
 * nothing.
 */
export function useTargetHover({ enabled, selector, resolve }) {
  const ref = useRef(null)
  const [hover, setHover] = useState(null)
  const frame = useRef(0)
  const queued = useRef(null)

  const flush = useCallback(() => {
    frame.current = 0
    const q = queued.current
    if (!q) return
    const data = q.key == null ? null : resolve(q.key)
    setHover(prev => {
      if (!data) return prev === null ? prev : null
      if (prev && prev.key === q.key && prev.clientX === q.clientX && prev.clientY === q.clientY) {
        return prev
      }
      return { key: q.key, point: data, clientX: q.clientX, clientY: q.clientY }
    })
  }, [resolve])

  const onPointerMove = useCallback(e => {
    const mark = e.target.closest?.(selector)
    queued.current = {
      key: mark ? mark.getAttribute('data-hover') : null,
      clientX: e.clientX,
      clientY: e.clientY,
    }
    if (!frame.current) frame.current = requestAnimationFrame(flush)
  }, [selector, flush])

  const onPointerLeave = useCallback(() => {
    queued.current = null
    if (frame.current) { cancelAnimationFrame(frame.current); frame.current = 0 }
    setHover(null)
  }, [])

  useEffect(() => {
    if (enabled) return undefined
    setHover(null)
    return () => {}
  }, [enabled])

  useEffect(() => () => {
    if (frame.current) cancelAnimationFrame(frame.current)
  }, [])

  return {
    ref,
    hover: enabled ? hover : null,
    handlers: enabled ? { onPointerMove, onPointerLeave } : {},
  }
}

/**
 * The tooltip itself — the one floating element in the system apart from the
 * expand modal, separated from the chart by its border alone.
 *
 * Positioned near the cursor and clamped to the enclosing .panel, which in the
 * expanded state is the fixed modal box, so it can never spill past the modal
 * edge. When the preferred side would overflow it flips to the other side of
 * the cursor before clamping, so it does not sit under the pointer.
 */
export function ChartTooltip({ anchorRef, hover, title, rows }) {
  const tipRef = useRef(null)

  useLayoutEffect(() => {
    const el = tipRef.current
    if (!el || !hover) return
    const bounds = anchorRef?.current?.closest('.panel')?.getBoundingClientRect()
    const w = el.offsetWidth
    const h = el.offsetHeight

    const minL = (bounds ? bounds.left : 0) + EDGE
    const maxL = (bounds ? bounds.right : window.innerWidth) - EDGE - w
    const minT = (bounds ? bounds.top : 0) + EDGE
    const maxT = (bounds ? bounds.bottom : window.innerHeight) - EDGE - h

    let left = hover.clientX + GAP
    if (left > maxL) left = hover.clientX - GAP - w
    let top = hover.clientY + GAP
    if (top > maxT) top = hover.clientY - GAP - h

    el.style.left = Math.min(Math.max(left, minL), Math.max(minL, maxL)) + 'px'
    el.style.top = Math.min(Math.max(top, minT), Math.max(minT, maxT)) + 'px'
  })

  if (!hover) return null

  return (
    <div ref={tipRef} className="chart-tip" role="status" aria-live="off">
      {title != null && <div className="chart-tip-head">{title}</div>}
      {rows.filter(Boolean).map(([label, value, numeric = true]) => (
        <div key={label} className="chart-tip-row">
          <span className="t-util chart-tip-label">{label}</span>
          <span className={'chart-tip-value' + (numeric ? ' t-num' : '')}>{value}</span>
        </div>
      ))}
    </div>
  )
}
