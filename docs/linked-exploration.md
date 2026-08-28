# Linked exploration: what a pathway click actually does

Selecting a pathway in the Pathways panel is the app's central interaction. It
does **not** apply one shared filter across the dashboard. Each panel responds in
the way that panel's own reading benefits from, and each response is independently
reversible.

This document is the exhaustive version. The README carries the short one.

---

## The selection object

Clicking a bar in `PathwayBarplotSection` calls `handleSelectPathway` in
`App.jsx`, which builds:

```js
{
  id:          row.Description,                            // stable identity
  label:       row.Description_short || row.Description,   // panel kickers
  description: row.Description,
  genes:       String(row.geneID).split('/').filter(Boolean),
}
```

The gene list comes from `enrichGO`'s `geneID` column, which is populated with
symbols because the enrichment runs with `readable = TRUE`. That is what makes
the member list directly joinable against the DE table and the heatmap without a
second identifier mapping.

Selection lives in `App.jsx` and is passed down, along with a memoized
`selectionSet` (a `Set` of the member symbols) so per-row membership tests are
O(1) rather than a linear scan per row.

Clicking the already-selected bar clears the selection. So does `Escape`, and the
`Clear` button in the status strip. An expanded panel consumes `Escape` first —
`PanelFrame` listens in the capture phase and stops propagation — so closing a
modal does not also drop your selection.

## Volcano — relabels, keeps every point

`VolcanoSection.jsx`

- Every point stays plotted. Members are drawn at full opacity; non-members are
  dimmed to `--de-dimmed` at 0.16 opacity. Nothing is filtered out, so the
  pathway is read *in the context of the whole result*, which is the reason to
  look at a volcano at all.
- The gene labels are replaced by the pathway's members. Label placement runs the
  same de-collision pass as normal, so on a dense pathway only the labels that
  fit are drawn — a 45-gene pathway typically places 5–8.
- The user's label configuration underneath (`Top N` or `My list`) is **not
  touched**. The override is a bare boolean, `pathwayLabels`, and the displayed
  set is chosen at render time:

  ```js
  const overrideActive = pathwayLabels && !!selectionSet && selectionSet.size > 0
  const shownLabels = overrideActive ? selectionSet : labelSymbols
  ```

  `labelSymbols` is recomputed from the live configuration on every render. It is
  deliberately **not** a snapshot taken when the pathway was selected: a snapshot
  recaptured per selection change would restore whichever pathway happened to be
  showing at the last switch, so `Reset volcano` after a sequence of switches
  would restore an intermediate pathway rather than the user's real
  configuration.
- `Reset volcano` appears only while the override is active and only in the
  Interactive view. It clears the flag, restoring the exact configured label set.
- The override re-arms for a newly selected pathway — including one that was just
  reset — because the arming effect is keyed on pathway identity rather than on
  the selection object:

  ```js
  useEffect(() => { setPathwayLabels(!!selection) }, [selection?.id])
  ```

  A re-render while the same pathway stays selected therefore leaves a reset in
  place.
- The **R-exact render is never affected**. `Generate R plot` sends the
  configured `n_label` / `custom_genes`, never the pathway's members — so the
  figure you export is the figure you configured.

`frontend/validation/volcano-reset-original.mjs` asserts all of this, including
that a reset after five consecutive pathway switches restores the exact original
label set and that none of the five intermediate states survives.

## Heatmap — re-fetches, preserves your list

`HeatmapSection.jsx`

- The gene-set selector has three sources: `Top variable`, `My gene list`,
  `Linked pathway`. Selecting a pathway auto-switches the selector to `Linked
  pathway` and re-fetches with the pathway's genes.
- The auto-switch is guarded by a ref holding the last pathway identity acted on:

  ```js
  const seenSelection = useRef(null)
  useEffect(() => {
    const id = selection?.id ?? null
    if (id === seenSelection.current) return
    seenSelection.current = id
    if (!id) return
    setSource('linked')
    fetchHeatmap('linked', selection.genes)
  }, [selection])
  ```

  So the switch fires on a genuine change of pathway, and a **manual switch back
  to `Top variable` or `My gene list` is not undone on the next render**. The app
  suggests; it does not insist.
- The user's own gene list (`symbols`) is never modified by a pathway selection.
  Switching back to `My gene list` finds it exactly as it was left.
- `Linked pathway` is disabled, with an explanatory `title`, when no pathway is
  selected.
- `From linked selection` is a separate, explicit action: it unions the pathway's
  genes into the user's own list and switches to `My gene list`. That is the
  path for building a custom set *starting from* a pathway — a deliberate copy,
  not an automatic one.

## DE table — regroups, hides nothing

`DeTableSection.jsx`

- **No row is hidden.** Members get the `row-in` class (a faint accent tint),
  non-members `row-out` (dimmed).
- Members are lifted to the top of the **entire sorted result**, not just the
  visible page:

  ```js
  if (!grouped || !selectionSet) return sorted
  const members = [], others = []
  for (const r of sorted) (selectionSet.has(symbolOf(r)) ? members : others).push(r)
  return [...members, ...others]
  ```

  The grouping is applied *before* the slice that pages the table, so a member
  40,000 rows down still surfaces at the top. Regrouping only the visible page
  would look identical on page one and be wrong everywhere else.
- Both partitions preserve the active column sort, because the partition walks
  the already-sorted array in order. Re-sorting on a new column re-sorts both
  groups and keeps the grouping.
- The panel kicker reports the membership count found in this DE table —
  `EXTRACELLULAR MATRIX ORGANIZATION · 45 IN SET` — which is a useful check in
  its own right, since a pathway's gene count and the number of those genes
  actually present in the result need not agree.
- `Reset DE table` collapses the grouping back to one flat sort spanning all
  rows. Dimming survives the reset: membership is still worth seeing even when
  the ordering is no longer grouped by it.
- Grouping re-engages for a newly selected pathway on the same identity-keyed
  pattern the volcano uses:
  `useEffect(() => { setGrouped(!!selection) }, [selection?.id])`.

## Categories — deliberately does not participate

`GeneCategoryPlotsSection` / `CategoryVolcanoSection`

The Categories panel is a fixed comparison frame: the same four active gene
categories, rendered identically every time, so two projects — or two moments in
one project — can be compared directly. Letting a pathway selection dim or
reorder it would make the 2×2 mean something different from one moment to the
next, which is exactly what a reference frame must not do.

This is an explicit scope decision, not an unimplemented case. It is enforced by
test: `frontend/validation/pathway-propagation.mjs` captures the category panel's
markup before and after a selection and asserts the two are **byte-identical**,
and separately asserts that the panel's kicker does not echo the pathway name and
that no dimmed layer appears in the mini-volcanos.

## Reset scope

Each panel's reset is local. `Reset volcano` restores the volcano's labels and
leaves the heatmap and DE table linked; `Reset DE table` flattens the table's
sort and leaves the volcano relabelled. Only `Clear` in the status strip, the
`Escape` key, or clicking the selected bar again drops the selection everywhere
at once.

## Test coverage

`frontend/validation/pathway-propagation.mjs` drives the real dashboard against
the real backend and asserts the full matrix of behaviour above — volcano label
override and reset, heatmap auto-switch and gene-list preservation, DE table
grouping across the paging boundary and under re-sorting, category-panel
non-participation, and live propagation on a direct pathway-to-pathway switch.

`frontend/validation/volcano-reset-original.mjs` covers the multi-switch reset
semantics specifically, in both `Top N` and `My list` configurations.

See `frontend/validation/README.md` for how to run them.
