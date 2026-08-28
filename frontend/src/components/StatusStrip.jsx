/**
 * Full-width status strip: DE provenance | global thresholds + counts |
 * linked-selection readout. Three cells divided by 2px ink.
 *
 * The provenance text is rendered exactly as the API reports it — it is never
 * recomputed, shortened or genericised here.
 */

const CELL = {
  padding: '13px 16px',
  borderRight: '2px solid var(--ink)',
  background: 'var(--ground)',
  minWidth: 0,
}

const METRIC_INPUT = {
  fontFamily: 'inherit',
  fontWeight: 800,
  fontSize: 20,
  lineHeight: 1,
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--ink)',
  background: 'transparent',
  border: 'none',
  borderBottom: '1.5px solid var(--rule-mid)',
  padding: '0 0 2px',
  width: 74,
}

// padj slider runs on a log ladder (1e-5 … 1) so the useful region around
// 0.05 is reachable by dragging. Values are rounded to two significant
// figures. The numeric field above it still accepts any value in [0, 1].
const PADJ_MIN_LOG = -5
function padjToSlider(v) {
  if (!v || v <= 0) return 0
  const l = Math.log10(v)
  return Math.max(0, Math.min(100, ((l - PADJ_MIN_LOG) / (0 - PADJ_MIN_LOG)) * 100))
}
function sliderToPadj(s) {
  const l = PADJ_MIN_LOG + (s / 100) * (0 - PADJ_MIN_LOG)
  const v = Math.pow(10, l)
  return Number(v.toPrecision(2))
}

function Threshold({ id, label, value, onChange, sliderValue, onSlider, step, min, max, numStep, numMin, numMax }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 138 }}>
      <label className="t-util" htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        className="t-num"
        style={METRIC_INPUT}
        value={value}
        min={numMin}
        max={numMax}
        step={numStep}
        onChange={e => {
          const v = Number(e.target.value)
          if (!isNaN(v)) onChange(v)
        }}
      />
      <input
        type="range"
        className="range"
        aria-label={`${label} slider`}
        min={min}
        max={max}
        step={step}
        value={sliderValue}
        onChange={e => onSlider(Number(e.target.value))}
        style={{ width: 138 }}
      />
    </div>
  )
}

function Count({ label, value, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="t-util">{label}</span>
      <span className="t-metric" style={{ color }}>{value}</span>
    </div>
  )
}

export default function StatusStrip({
  provenance,
  hasDe,
  padjCutoff,
  lfcCutoff,
  onPadjChange,
  onLfcChange,
  upCount,
  downCount,
  selection,
  onClearSelection,
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        background: 'var(--ink)',
        flex: 'none',
      }}
    >
      {/* cell 1 — DE provenance */}
      <div style={{ ...CELL, minWidth: 268, flex: 'none' }}>
        <div className="t-util">DE provenance</div>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 7 }}>
          <span aria-hidden="true" style={{
            width: 9, height: 9, flex: 'none',
            background: hasDe ? 'var(--accent)' : 'transparent',
            border: hasDe ? 'none' : '1.5px solid var(--ink)',
          }} />
          <span style={{ fontWeight: 700, fontSize: 11.5, color: 'var(--ink)' }}>
            {hasDe ? (provenance || 'uploaded') : 'no DE results'}
          </span>
        </div>
        <div className="t-note" style={{ marginTop: 5 }}>
          {hasDe
            ? 'Method and source reported by the API for this DE table.'
            : 'Run a DE model from the rail, or create a project with a DE table.'}
        </div>
      </div>

      {/* cell 2 — global thresholds and counts */}
      <div style={{ ...CELL, display: 'flex', alignItems: 'flex-start', gap: 22, flex: 'none' }}>
        <Threshold
          id="thr-padj"
          label="padj cutoff"
          value={padjCutoff}
          onChange={onPadjChange}
          sliderValue={padjToSlider(padjCutoff)}
          onSlider={s => onPadjChange(sliderToPadj(s))}
          min={0} max={100} step={0.5}
          numMin={0} numMax={1} numStep={0.01}
        />
        <Threshold
          id="thr-lfc"
          label="|log2FC| cutoff"
          value={lfcCutoff}
          onChange={onLfcChange}
          sliderValue={lfcCutoff}
          onSlider={onLfcChange}
          min={0} max={6} step={0.1}
          numMin={0} numMax={20} numStep={0.1}
        />
        <div style={{ display: 'flex', gap: 14 }}>
          <Count label="Up" value={hasDe ? upCount : '—'} color="var(--de-up)" />
          <Count label="Down" value={hasDe ? downCount : '—'} color="var(--de-down)" />
        </div>
      </div>

      {/* cell 3 — linked selection */}
      <div style={{ ...CELL, flex: 1, borderRight: 'none' }}>
        <div className="t-util">Linked selection</div>
        {selection ? (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{
              padding: '5px 8px',
              background: 'var(--accent-tint)',
              border: '1.5px solid var(--accent)',
              fontWeight: 700, fontSize: 11, color: 'var(--ink)',
            }}>
              {selection.label}
            </span>
            <span style={{ fontWeight: 500, fontSize: 11, color: 'var(--ink-700)' }}>
              {selection.genes.length} genes projected onto the volcano, heatmap, DE table and categories.
            </span>
            <button type="button" className="btn btn-invert" onClick={onClearSelection}>
              Clear
            </button>
          </div>
        ) : (
          <p style={{ margin: '8px 0 0', fontWeight: 400, fontSize: 11.5, color: 'var(--ink-600)', lineHeight: 1.4 }}>
            Click a pathway bar to project its gene set onto every panel.
          </p>
        )}
      </div>
    </div>
  )
}
