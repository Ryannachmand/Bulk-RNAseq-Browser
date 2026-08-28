import PanelFrame from './PanelFrame'

/**
 * A capability that is unavailable is rendered in place, ghosted, with the
 * reason and a fix action — never omitted.
 *
 * The reason text is passed in from App, generated from the live capability
 * flags. This component decides nothing about availability.
 */

function Skeleton({ kind }) {
  const fill = 'var(--ink-400)'
  if (kind === 'bars') {
    return (
      <svg viewBox="0 0 200 106" width="100%" role="img" aria-label="Placeholder bar chart" style={{ display: 'block' }}>
        {[86, 70, 58, 44, 33, 21].map((w, i) => (
          <rect key={i} x="8" y={8 + i * 16} width={w} height="10" fill={fill} />
        ))}
      </svg>
    )
  }
  if (kind === 'rows') {
    return (
      <svg viewBox="0 0 200 106" width="100%" role="img" aria-label="Placeholder table" style={{ display: 'block' }}>
        {Array.from({ length: 7 }, (_, i) => (
          <g key={i}>
            <rect x="8" y={8 + i * 14} width="34" height="7" fill={fill} />
            <rect x="60" y={8 + i * 14} width="130" height="7" fill="var(--rule-soft)" />
          </g>
        ))}
      </svg>
    )
  }
  if (kind === 'grid') {
    return (
      <svg viewBox="0 0 200 106" width="100%" role="img" aria-label="Placeholder grid" style={{ display: 'block' }}>
        {Array.from({ length: 4 }, (_, r) =>
          Array.from({ length: 8 }, (_, c) => (
            <rect key={`${r}-${c}`} x={8 + c * 24} y={8 + r * 24} width="22" height="22"
                  fill={(r + c) % 3 === 0 ? fill : 'var(--rule-soft)'} />
          ))
        )}
      </svg>
    )
  }
  // scatter
  const pts = [
    [24, 82], [40, 70], [52, 88], [66, 52], [78, 74], [92, 40],
    [104, 66], [118, 30], [130, 58], [144, 46], [158, 24], [172, 62],
    [36, 94], [88, 92], [148, 86],
  ]
  return (
    <svg viewBox="0 0 200 106" width="100%" role="img" aria-label="Placeholder scatter plot" style={{ display: 'block' }}>
      <line x1="100" y1="6" x2="100" y2="100" stroke="var(--rule-soft)" strokeWidth="1" />
      <line x1="8" y1="53" x2="192" y2="53" stroke="var(--rule-soft)" strokeWidth="1" />
      {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.6" fill={fill} />)}
    </svg>
  )
}

export default function LockedPanel({
  id, title, kicker, reason, action, skeleton = 'scatter',
  expandedPanel, onToggleExpand,
}) {
  return (
    <PanelFrame
      id={id}
      title={title}
      kicker={kicker}
      expandedPanel={expandedPanel}
      onToggleExpand={onToggleExpand}
      bodyStyle={{ padding: 0 }}
    >
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'stretch',
          height: '100%', minHeight: 0,
        }}
      >
        {/* left — ghosted figure */}
        <div
          className="stripe-locked"
          style={{
            flex: '1 1 240px', minWidth: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '14px 16px',
            borderRight: '1.5px solid var(--rule-mid)',
          }}
        >
          <div style={{ width: '100%', maxWidth: 300, opacity: 0.32 }}>
            <Skeleton kind={skeleton} />
          </div>
        </div>

        {/* right — reason and fix action */}
        <div style={{ flex: '1 1 240px', minWidth: 220, padding: '14px 16px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span aria-hidden="true" style={{
              width: 11, height: 11, flex: 'none',
              border: '2px solid var(--accent-deep)',
            }} />
            <span style={{
              fontWeight: 700, fontSize: 11, letterSpacing: '.1em',
              textTransform: 'uppercase', color: 'var(--accent-deep)',
            }}>
              Locked
            </span>
          </div>

          <p style={{
            margin: '10px 0 0', fontWeight: 500, fontSize: 12,
            lineHeight: 1.45, color: 'var(--ink-700)',
          }}>
            {reason}
          </p>

          <div style={{ display: 'flex', gap: 7, marginTop: 14, flexWrap: 'wrap' }}>
            {action && (
              <button type="button" className="btn btn-primary" onClick={action.onClick}>
                {action.label}
              </button>
            )}
            <details style={{ alignSelf: 'center' }}>
              <summary className="btn btn-outline" style={{ display: 'inline-block', listStyle: 'none' }}>
                Why?
              </summary>
              <p style={{
                margin: '8px 0 0', fontWeight: 500, fontSize: 11.5,
                lineHeight: 1.45, color: 'var(--ink-700)',
              }}>
                Panels are gated on what the project actually holds. The browser
                will not render a figure from data it does not have, and it will
                not silently substitute a different input — the numbers in every
                panel have to be traceable to the file they came from.
              </p>
            </details>
          </div>
        </div>
      </div>
    </PanelFrame>
  )
}
