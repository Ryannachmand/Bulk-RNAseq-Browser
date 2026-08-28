import { useEffect, useMemo, useState } from 'react'
import PanelFrame from './PanelFrame'
import { ErrorMsg, fmtExp, fmtNum, fmtSigned } from './ui'

/**
 * DE results table. Reads the same rows the volcano reads — App fetches the DE
 * table once and hands it to both, so this panel adds no request of its own.
 */

const PAGE = 200

function symbolOf(r) {
  return r.symbol && !String(r.symbol).startsWith('ENSG') ? r.symbol : (r.gene ?? r.symbol ?? '')
}

function csvCell(v) {
  if (v == null) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export default function DeTableSection({
  projectName, rows, loading, error,
  padjCutoff, lfcCutoff, selection, selectionSet,
  expandedPanel, onToggleExpand,
}) {
  const [sortKey, setSortKey] = useState('padj')
  const [sortAsc, setSortAsc] = useState(true)
  const [shown, setShown] = useState(PAGE)
  const [grouped, setGrouped] = useState(false)

  // Same keying as the volcano's label override: grouping re-engages on a
  // change of pathway identity, and a reset is not undone by a re-render
  // under the same pathway.
  useEffect(() => { setGrouped(!!selection) }, [selection?.id])

  const fpkmCols = useMemo(() => {
    if (!rows || rows.length === 0) return []
    return Object.keys(rows[0]).filter(k => k.toUpperCase().startsWith('FPKM_'))
  }, [rows])

  const columns = useMemo(() => ([
    { key: '__symbol', label: 'Symbol', num: false, width: 92 },
    { key: 'baseMean', label: 'baseMean', num: true },
    { key: 'log2FoldChange', label: 'log2FC', num: true },
    { key: 'lfcSE', label: 'lfcSE', num: true },
    { key: 'padj', label: 'padj', num: true },
    ...fpkmCols.map(c => ({ key: c, label: c, num: true, width: 92 })),
  ]), [fpkmCols])

  const sorted = useMemo(() => {
    if (!rows) return []
    const out = [...rows]
    const dir = sortAsc ? 1 : -1
    out.sort((a, b) => {
      if (sortKey === '__symbol') {
        return dir * String(symbolOf(a)).localeCompare(String(symbolOf(b)))
      }
      const av = a[sortKey], bv = b[sortKey]
      const aNull = av == null || !isFinite(av)
      const bNull = bv == null || !isFinite(bv)
      if (aNull && bNull) return 0
      if (aNull) return 1          // nulls always last
      if (bNull) return -1
      return dir * (av - bv)
    })
    return out
  }, [rows, sortKey, sortAsc])

  // Members-first is a grouping over the FULL sorted set, applied before the
  // slice below pages it — regrouping only the visible page would look like a
  // no-op for any pathway whose genes sit past row 200. Partitioning a sorted
  // array is stable, so the active column sort still orders each group.
  const ordered = useMemo(() => {
    if (!grouped || !selectionSet) return sorted
    const members = [], others = []
    for (const r of sorted) (selectionSet.has(symbolOf(r)) ? members : others).push(r)
    return [...members, ...others]
  }, [sorted, grouped, selectionSet])

  function toggleSort(key) {
    if (key === sortKey) { setSortAsc(a => !a) }
    else { setSortKey(key); setSortAsc(key === '__symbol' || key === 'padj') }
    setShown(PAGE)
  }

  function handleExport() {
    if (!rows || rows.length === 0) return
    const keys = Object.keys(rows[0])
    const lines = [keys.join(',')]
    for (const r of ordered) lines.push(keys.map(k => csvCell(r[k])).join(','))
    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(projectName || 'project').replace(/[^\w.-]+/g, '_')}_de_results.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const total = rows?.length ?? 0
  const kicker = selection
    ? `${selection.label} · ${sorted.filter(r => selectionSet.has(symbolOf(r))).length} in set`
    : `${total.toLocaleString('en-US').replace(/,/g, ' ')} genes · sorted by ${sortKey === '__symbol' ? 'symbol' : sortKey}`

  const groupingActive = grouped && !!selectionSet

  const headerRight = (
    <>
      {groupingActive && (
        <button type="button" className="btn btn-outline"
                title="Sort every row by the active column, ignoring pathway membership"
                onClick={() => setGrouped(false)}>
          Reset DE table
        </button>
      )}
      <button type="button" className="btn btn-outline" onClick={handleExport} disabled={!rows || total === 0}>
        Export CSV
      </button>
    </>
  )

  return (
    <PanelFrame
      id="table"
      title="DE table"
      kicker={kicker}
      headerRight={headerRight}
      expandedPanel={expandedPanel}
      onToggleExpand={onToggleExpand}
      bodyStyle={{ padding: 0 }}
    >
      {loading && <p className="msg-wait" style={{ padding: '11px 14px' }}>Loading DE data…</p>}
      {error && <div style={{ padding: '11px 14px' }}><ErrorMsg>{error}</ErrorMsg></div>}

      {rows && (
        <>
          <table className="dtable">
            <thead>
              <tr>
                {columns.map(c => (
                  <th key={c.key} className={c.num ? 'num' : undefined}
                      style={c.width ? { width: c.width } : undefined}
                      aria-sort={sortKey === c.key ? (sortAsc ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" onClick={() => toggleSort(c.key)}
                            title={`Sort by ${c.label}`}>
                      {c.label}{sortKey === c.key ? (sortAsc ? ' ↑' : ' ↓') : ''}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordered.slice(0, shown).map((r, i) => {
                const sym = symbolOf(r)
                const inSel = selectionSet ? selectionSet.has(sym) : null
                const lfc = r.log2FoldChange
                const sig = r.padj != null && r.padj < padjCutoff && Math.abs(lfc ?? 0) > lfcCutoff
                return (
                  <tr
                    key={(r.gene ?? sym) + '::' + i}
                    className={inSel === null ? undefined : inSel ? 'row-in' : 'row-out'}
                  >
                    <td className="sym">{sym}</td>
                    <td className="num">{fmtNum(r.baseMean, 1)}</td>
                    <td className="num" style={{
                      fontWeight: 700,
                      color: lfc == null ? 'var(--ink-600)'
                        : !sig ? 'var(--ink-600)'
                        : lfc > 0 ? 'var(--de-up)' : 'var(--de-down)',
                    }}>
                      {fmtSigned(lfc, 2)}
                    </td>
                    <td className="num">{fmtNum(r.lfcSE, 3)}</td>
                    <td className="num">{fmtExp(r.padj, 1)}</td>
                    {fpkmCols.map(c => <td key={c} className="num">{fmtNum(r[c], 2)}</td>)}
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '9px 14px', borderTop: '1.5px solid var(--rule-mid)',
          }}>
            <span className="t-note">
              Showing {Math.min(shown, total)} of {total.toLocaleString('en-US').replace(/,/g, ' ')} rows
            </span>
            {shown < total && (
              <button type="button" className="btn btn-outline" onClick={() => setShown(s => s + PAGE)}>
                Load {Math.min(PAGE, total - shown)} more
              </button>
            )}
          </div>
        </>
      )}
    </PanelFrame>
  )
}
