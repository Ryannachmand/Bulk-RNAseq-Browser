/**
 * Shared presentational primitives for the Modernist dashboard.
 * Pure chrome — no fetching, no data transforms.
 */

/* ── Gene symbol parsing (one rule, used by every symbol input) ─────────── */

export function parseSymbols(text) {
  const out = []
  const seen = new Set()
  for (const raw of String(text || '').split(/[\s,;\n\t]+/)) {
    const s = raw.trim().toUpperCase()
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

/* ── Segmented toggle ───────────────────────────────────────────────────── */

export function SegToggle({ options, value, onChange, ariaLabel, style }) {
  return (
    <div className="seg" role="group" aria-label={ariaLabel} style={style}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ── Chip well: a symbol list with an inline free-text entry field ──────── */

export function ChipWell({
  symbols,
  onRemove,
  onCommit,
  missing,
  placeholder = 'Paste or type symbols — Enter to add',
  tall = false,
  inputId,
  ariaLabel = 'Gene symbol list',
  draft,          // optional controlled draft text
  onDraft,
}) {
  const controlled = draft !== undefined

  function handleKeyDown(e) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const parsed = parseSymbols(e.currentTarget.value)
    if (parsed.length) onCommit(parsed)
    if (controlled) onDraft('')
    else e.currentTarget.value = ''
  }
  function handlePaste(e) {
    const text = e.clipboardData?.getData('text')
    if (!text || !/[\s,;\n\t]/.test(text)) return
    e.preventDefault()
    const parsed = parseSymbols(text)
    if (parsed.length) onCommit(parsed)
    if (controlled) onDraft('')
  }
  return (
    <div className={'chip-well' + (tall ? ' chip-well-tall' : '')}>
      {symbols.map(s => (
        <span key={s} className={'chip' + (missing?.has(s) ? ' chip-missing' : '')}>
          {s}
          <button type="button" aria-label={`Remove ${s}`} onClick={() => onRemove(s)}>×</button>
        </span>
      ))}
      <input
        id={inputId}
        className="chip-input"
        type="text"
        aria-label={ariaLabel}
        placeholder={placeholder}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        {...(controlled ? { value: draft, onChange: e => onDraft(e.target.value) } : {})}
      />
    </div>
  )
}

/* ── "N not in matrix" warning strip ────────────────────────────────────── */

export function MissingStrip({ missing, noun = 'not in matrix' }) {
  if (!missing || missing.length === 0) return null
  return (
    <div className="warn-strip" style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
      <span style={{
        fontWeight: 700, fontSize: 10, letterSpacing: '.09em',
        textTransform: 'uppercase', color: 'var(--accent-deep)', flex: 'none',
      }}>
        {missing.length} {noun}
      </span>
      <span style={{ fontWeight: 500, fontSize: 10.5, color: 'var(--accent-darkest)', lineHeight: 1.35 }}>
        {missing.join(', ')}
      </span>
    </div>
  )
}

/* ── R render output area ───────────────────────────────────────────────── */

export function ROutput({ imgUrl, filename, alt, minHeight = 200 }) {
  if (imgUrl) {
    return (
      <div>
        <img src={imgUrl} alt={alt} style={{ maxWidth: '100%', display: 'block', border: '1px solid var(--rule-soft)' }} />
        <div style={{ marginTop: 7 }}>
          <a href={imgUrl} download={filename} className="btn btn-outline" style={{ display: 'inline-block' }}>
            Download PNG
          </a>
        </div>
      </div>
    )
  }
  return (
    <div
      className="stripe-output"
      style={{
        minHeight,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 6,
      }}
    >
      <span style={{
        fontWeight: 600, fontSize: 10.5, letterSpacing: '.14em',
        textTransform: 'uppercase', color: 'var(--ink-600)',
      }}>
        R output · 300 dpi
      </span>
      <span className="t-mono" style={{ fontSize: 10.5 }}>{filename}</span>
    </div>
  )
}

/* ── Error / status copy ────────────────────────────────────────────────── */

export function ErrorMsg({ label = 'Error', children }) {
  if (!children) return null
  return (
    <div className="msg-error" role="alert">
      <strong style={{ fontWeight: 700 }}>{label}: </strong>{children}
    </div>
  )
}

/* ── Sample group swatch colours ────────────────────────────────────────── */

const NEUTRAL_RAMP = ['#201e1d', '#605d5d', '#9b9797', '#cfcbcb']

export function groupColorMap(groups, numerator) {
  const map = {}
  if (numerator && groups.includes(numerator)) {
    let n = 0
    groups.forEach(g => {
      map[g] = g === numerator ? 'var(--accent)' : NEUTRAL_RAMP[n++ % NEUTRAL_RAMP.length]
    })
    return map
  }
  if (groups.length <= 2) {
    groups.forEach((g, i) => { map[g] = i === groups.length - 1 && groups.length > 1 ? 'var(--accent)' : '#201e1d' })
    return map
  }
  if (groups.length === 3) {
    const three = ['#201e1d', '#9b9797', 'var(--accent)']
    groups.forEach((g, i) => { map[g] = three[i] })
    return map
  }
  groups.forEach((g, i) => {
    map[g] = i === groups.length - 1 ? 'var(--accent)' : NEUTRAL_RAMP[i % NEUTRAL_RAMP.length]
  })
  return map
}

/* ── Number formatting ──────────────────────────────────────────────────── */

export function fmtExp(v, digits = 1) {
  if (v == null || !isFinite(v)) return '—'
  if (v === 0) return '0'
  return Number(v).toExponential(digits)
}

export function fmtSigned(v, digits = 2) {
  if (v == null || !isFinite(v)) return '—'
  return (v > 0 ? '+' : '') + Number(v).toFixed(digits)
}

export function fmtNum(v, digits = 2) {
  if (v == null || !isFinite(v)) return '—'
  return Number(v).toFixed(digits)
}

/**
 * Per-condition mean expression carried on a DE row.
 *
 * A DESeq2 run through this app writes FPKM_<condition> columns alongside the
 * statistics; an uploaded DE table may have none. Returns [condition, value]
 * pairs, empty when the row does not carry them, so callers can show the
 * field only where it actually exists.
 */
export function fpkmFields(row) {
  if (!row) return []
  const out = []
  for (const k of Object.keys(row)) {
    if (k.startsWith('FPKM_') && row[k] != null && isFinite(row[k])) {
      out.push([k.slice(5), row[k]])
    }
  }
  return out
}
