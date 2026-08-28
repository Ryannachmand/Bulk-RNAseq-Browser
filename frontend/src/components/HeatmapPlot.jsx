import { useMemo } from 'react'

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

  return (
    <div>
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
                        title={`${gene} · ${samples[c]} · z ${z == null ? '—' : z.toFixed(2)} · FPKM ${fpkm_labels?.[r]?.[c] ?? '—'}`}
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
