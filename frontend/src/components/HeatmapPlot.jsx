import { useCallback, useMemo } from 'react'
import { ChartTooltip, useTargetHover } from './ChartHover'
import { usePanelExpanded } from './PanelContext'
import { fmtNum } from './ui'

/**
 * Expression heatmap drawn as DOM rows: z-score fill, raw FPKM as the cell
 * label. The values come straight from the API — nothing is recomputed here.
 *
 * Samples are laid out grouped (group order from the API's grouping block,
 * matrix order preserved inside each group) with a 2px gap between groups.
 */

const LOW  = [0x21, 0x66, 0xac]   // z = -3
const MID  = [0xf4, 0xf2, 0xf0]   // z =  0
const HIGH = [0xb2, 0x18, 0x2b]   // z = +3

function zColor(z) {
  if (z == null || !isFinite(z)) return 'var(--rule-hair)'
  const c = Math.max(-3, Math.min(3, z))
  const t = Math.abs(c) / 3
  const to = c < 0 ? LOW : HIGH
  const mix = i => Math.round(MID[i] + (to[i] - MID[i]) * t)
  return `rgb(${mix(0)},${mix(1)},${mix(2)})`
}

const zText = z => (z != null && Math.abs(z) > 1.75 ? '#ffffff' : 'var(--ink)')

export default function HeatmapPlot({
  data,
  selectionSet,
  groupColors,
  labelWidth = 96,
  cellHeight = 25,
  showCellLabels = true,
  showLegend = true,
}) {
  const { genes, samples, z_scores, fpkm_labels, grouping } = data

  // Group the sample columns; keep matrix order inside each group.
  const columnGroups = useMemo(() => {
    if (!grouping?.detected) {
      return [{ name: null, indices: samples.map((_, i) => i) }]
    }
    const { group_order, sample_to_group } = grouping
    const order = group_order && group_order.length ? group_order : [...new Set(Object.values(sample_to_group))]
    const out = order.map(g => ({ name: g, indices: [] }))
    const byName = Object.fromEntries(out.map(o => [o.name, o]))
    samples.forEach((s, i) => {
      const g = sample_to_group?.[s]
      if (byName[g]) byName[g].indices.push(i)
      else {
        // a sample with no group still has to appear somewhere
        if (!byName.__ungrouped) { byName.__ungrouped = { name: '—', indices: [] }; out.push(byName.__ungrouped) }
        byName.__ungrouped.indices.push(i)
      }
    })
    return out.filter(g => g.indices.length > 0)
  }, [samples, grouping])

  // ── Expanded-mode hover ───────────────────────────────────────────────
  // Cells are DOM nodes, so the nearest-point search is unnecessary: one
  // delegated listener resolves the cell under the cursor with closest(),
  // which costs the same whether the matrix holds 40 cells or 8,000.
  const expanded = usePanelExpanded()

  const resolveCell = useCallback(key => {
    const [r, c] = key.split(',').map(Number)
    const gene = genes[r]
    const sample = samples[c]
    if (gene == null || sample == null) return null
    return {
      gene,
      sample,
      group: grouping?.sample_to_group?.[sample] ?? null,
      fpkm: fpkm_labels?.[r]?.[c],
      z: z_scores?.[r]?.[c],
    }
  }, [genes, samples, grouping, fpkm_labels, z_scores])

  const { ref, hover, handlers } = useTargetHover({
    enabled: expanded,
    selector: '[data-hover]',
    resolve: resolveCell,
  })

  const tipRows = useMemo(() => {
    const p = hover?.point
    if (!p) return []
    return [
      [p.group ? 'Sample · group' : 'Sample', p.group ? `${p.sample} · ${p.group}` : p.sample, false],
      ['FPKM', p.fpkm ?? '—'],
      ['z-score', fmtNum(p.z, 2)],
    ]
  }, [hover])

  // Memoised so a hover state change does not re-reconcile every cell — a
  // 500-gene matrix is several thousand DOM nodes and the tooltip must not
  // pay for them on each pointermove.
  const matrix = useMemo(() => (
      <div>
        {genes.map((gene, r) => {
          const inSel = selectionSet ? selectionSet.has(gene) : null
          return (
            <div
              key={gene + r}
              style={{
                display: 'flex', gap: 2, marginBottom: 2,
                opacity: inSel === false ? 0.28 : 1,
              }}
            >
              <div style={{
                width: labelWidth, flex: 'none',
                display: 'flex', alignItems: 'center',
                fontWeight: 600, fontSize: 11,
                color: inSel ? 'var(--accent-deep)' : 'var(--ink)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                paddingRight: 6,
              }}>
                {gene}
              </div>
              {columnGroups.map(g => (
                <div key={(g.name ?? 'all') + r} style={{ flex: `${g.indices.length} 1 0`, display: 'flex', gap: 2, minWidth: 0 }}>
                  {g.indices.map(c => {
                    const z = z_scores?.[r]?.[c]
                    return (
                      <div
                        key={c}
                        data-hover={`${r},${c}`}
                        // Native title in the compact grid only — expanded,
                        // the hover tooltip carries the same values.
                        title={expanded ? undefined
                          : `${gene} · ${samples[c]} · z ${z == null ? '—' : z.toFixed(2)} · FPKM ${fpkm_labels?.[r]?.[c] ?? '—'}`}
                        style={{
                          flex: '1 1 0', minWidth: 0, height: cellHeight,
                          background: zColor(z),
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          overflow: 'hidden',
                        }}
                      >
                        {showCellLabels && (
                          <span className="t-num" style={{
                            fontWeight: 600, fontSize: 9.5, color: zText(z), lineHeight: 1,
                          }}>
                            {fpkm_labels?.[r]?.[c]}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )
        })}
      </div>
  ), [genes, columnGroups, samples, z_scores, fpkm_labels, selectionSet,
      labelWidth, cellHeight, showCellLabels, expanded])

  return (
    <div ref={ref} {...handlers}>
      {/* group annotation row */}
      <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', marginBottom: 5 }}>
        <div style={{ width: labelWidth, flex: 'none' }} />
        {columnGroups.map(g => (
          <div key={g.name ?? 'all'} style={{ flex: `${g.indices.length} 1 0`, minWidth: 0 }}>
            <div style={{
              height: 5,
              background: groupColors?.[g.name] || 'var(--ink)',
            }} />
            {g.name && (
              <div style={{
                marginTop: 4, fontWeight: 600, fontSize: 9.5, letterSpacing: '.1em',
                textTransform: 'uppercase', color: 'var(--ink-600)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {g.name}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* matrix */}
      {matrix}

      <ChartTooltip
        anchorRef={ref}
        hover={hover}
        title={hover?.point?.gene}
        rows={tipRows}
      />

      {showLegend && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginTop: 10,
          paddingTop: 8, borderTop: '1px solid var(--rule-hair)', flexWrap: 'wrap',
        }}>
          <span className="t-util">z −3</span>
          <span className="z-ramp" aria-hidden="true" style={{ width: 120 }} />
          <span className="t-util">+3</span>
          <span className="t-note" style={{ marginLeft: 'auto' }}>
            cell label = raw FPKM, one decimal
          </span>
        </div>
      )}
    </div>
  )
}
