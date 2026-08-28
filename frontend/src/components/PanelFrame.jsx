import { useEffect, useMemo, useRef } from 'react'
import { PanelContext } from './PanelContext'

/**
 * Presentational panel chrome. Defines the 2px-ruled header (title + kicker +
 * right slot), the body, and the expand-to-modal behaviour.
 *
 * Expansion promotes THIS element in place by adding a class — it never
 * renders a second copy in a portal — so panel state (selections, gene lists,
 * scroll offsets, in-flight R renders) survives expand and collapse untouched.
 *
 * Contains no data logic.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function ExpandGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" focusable="false"
         fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square">
      <path d="M9 3H4v5M15 3h5v5M15 21h5v-5M9 21H4v-5" />
    </svg>
  )
}

export default function PanelFrame({
  id,
  title,
  kicker,
  headerRight,
  children,
  expandedPanel,
  onToggleExpand,
  bodyStyle,
  bodyClassName = '',
  style,
}) {
  const expanded = expandedPanel === id
  // Published to the panel body so charts can add expanded-only interaction
  // without a second mounted copy of themselves.
  const panelCtx = useMemo(() => ({ expanded }), [expanded])
  const panelRef = useRef(null)
  const closeRef = useRef(null)
  const expandBtnRef = useRef(null)
  const restoreRef = useRef(null)

  // Move focus to the close button on open; restore it on close.
  useEffect(() => {
    if (!expanded) return
    restoreRef.current = expandBtnRef.current
    closeRef.current?.focus()
    return () => { restoreRef.current?.focus() }
  }, [expanded])

  // Escape closes; Tab is trapped between the panel body and the close button.
  useEffect(() => {
    if (!expanded) return
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onToggleExpand(null)
        return
      }
      if (e.key !== 'Tab') return
      const inPanel = panelRef.current
        ? Array.from(panelRef.current.querySelectorAll(FOCUSABLE))
        : []
      const nodes = [...inPanel, closeRef.current].filter(
        n => n && n.offsetParent !== null
      )
      if (nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus()
      } else if (!nodes.includes(document.activeElement)) {
        e.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [expanded, onToggleExpand])

  return (
    <>
      {expanded && (
        <>
          <button
            type="button"
            className="panel-scrim"
            aria-label={`Collapse ${title} panel`}
            tabIndex={-1}
            onClick={() => onToggleExpand(null)}
          />
          <span className="panel-scrim-label">Esc to close</span>
          <button
            type="button"
            ref={closeRef}
            className="panel-scrim-close"
            aria-label={`Close expanded ${title} panel`}
            onClick={() => onToggleExpand(null)}
          >
            ×
          </button>
        </>
      )}

      <div
        ref={panelRef}
        className={'panel' + (expanded ? ' panel-expanded' : '')}
        style={style}
        {...(expanded
          ? { role: 'dialog', 'aria-modal': 'true', 'aria-label': `${title} panel, expanded` }
          : {})}
      >
        <div className="panel-header">
          <span className="t-display">{title}</span>
          {kicker && <span className="t-kicker">{kicker}</span>}
          <span className="panel-header-right">
            {headerRight}
            {onToggleExpand && (
              <button
                type="button"
                ref={expandBtnRef}
                className="expand-btn"
                aria-expanded={expanded}
                aria-label={expanded ? `Collapse ${title} panel` : `Expand ${title} panel`}
                title={expanded ? 'Collapse' : 'Expand'}
                onClick={() => onToggleExpand(expanded ? null : id)}
              >
                <ExpandGlyph />
              </button>
            )}
          </span>
        </div>
        <div className={'panel-body ' + bodyClassName} style={bodyStyle}>
          <PanelContext.Provider value={panelCtx}>
            {children}
          </PanelContext.Provider>
        </div>
      </div>
    </>
  )
}
