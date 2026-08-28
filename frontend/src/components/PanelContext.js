import { createContext, useContext } from 'react'

/**
 * Whether the surrounding PanelFrame is currently expanded.
 *
 * Expansion promotes the panel in place — the same component instance, moved
 * to fixed positioning — so there is no second mounted "expanded chart" to
 * hang extra behaviour off. Charts that only behave differently when expanded
 * read that state from here instead.
 *
 * Provided by PanelFrame around its children, so anything rendered inside a
 * panel body sees it however deeply nested. A component that renders the
 * PanelFrame itself sits above the provider and must derive the flag from the
 * expandedPanel prop it already holds.
 */
export const PanelContext = createContext({ expanded: false })

export function usePanelExpanded() {
  return useContext(PanelContext).expanded
}
