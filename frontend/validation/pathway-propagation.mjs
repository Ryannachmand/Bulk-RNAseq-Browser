/**
 * Pathway-selection propagation — volcano labels, heatmap gene set, DE table
 * grouping, and the category panel's non-participation.
 *
 * See ./README.md for how to run this. Drives the project named below with
 * Vite on :5173 and uvicorn on :8000.
 */
// playwright-core is installed out of tree, so it is resolved by path rather
// than as a bare specifier — ESM does not consult NODE_PATH.
const { chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core')

const PROJECT = '90afa131-c075-4680-8845-d1d7b13d1244'
const URL = `http://localhost:5173/project/${PROJECT}/dashboard`

const out = []
let failures = 0
const check = (name, ok, detail = '') => {
  out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures++
}
const note = m => out.push(`      · ${m}`)
const up = s => String(s).trim().toUpperCase()

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1720, height: 1200 } })

// heatmap rows: read the gene set the API actually returned for the panel
let lastHeatmapGenes = null
page.on('response', async r => {
  if (r.url().includes('/heatmap-data') && r.ok()) {
    try { lastHeatmapGenes = (await r.json()).genes } catch {}
  }
})
// R volcano payload: what Generate R Plot actually asks for
let rVolcanoPayload = null
await page.route('**/render-r-volcano', route => {
  try { rVolcanoPayload = JSON.parse(route.request().postData() || '{}') } catch {}
  route.abort()   // the payload is the whole point; no need to spend 40 s in R
})

const panel = title =>
  page.locator('.panel').filter({ has: page.locator(`.panel-header .t-display:text-is("${title}")`) })
const volcanoLabels = () => panel('Volcano').locator('svg text[font-weight="700"]').allTextContents()

await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

const pathways = await page.evaluate(async p => {
  const r = await fetch(`http://localhost:8000/projects/${p}/pathway-data?top_n=20`)
  const j = await r.json()
  return (j.rows || j).map(row => ({
    label: row.Description_short || row.Description,
    genes: String(row.geneID || '').split('/').map(s => s.trim()).filter(Boolean),
  }))
}, PROJECT)

const bars = panel('Pathways').locator('button.pw-row')
const nBars = await bars.count()
const barText = i => bars.nth(i).locator('span').first().innerText()
const pick = async skip => {
  for (let i = 0; i < nBars; i++) {
    if (i === skip) continue
    const t = up(await barText(i))
    const p = pathways.find(p => up(p.label) === t)
    if (p && p.genes.length >= 8) return { i, p }
  }
}
const A = await pick(-1)
const B = await pick(A.i)
const setA = new Set(A.p.genes), setB = new Set(B.p.genes)
note(`pathway A = "${A.p.label}" (${A.p.genes.length} genes); pathway B = "${B.p.label}" (${B.p.genes.length} genes)`)

// ══ 4. CATEGORY PANEL — captured BEFORE any selection ═════════════════════
const cats = panel('Categories')
await cats.locator('button:has-text("Load volcanos")').click()
await page.waitForTimeout(3000)
const catsBefore = await cats.locator('.panel-body').innerHTML()
note(`category panel body captured before selection (${catsBefore.length} chars of markup)`)

// ══ 1. VOLCANO ═══════════════════════════════════════════════════════════
const baseLabels = await volcanoLabels()
note(`volcano labels with no pathway (TOP N = 5): ${baseLabels.join(', ')}`)
check('1.0 volcano starts on the TOP N label set', baseLabels.length > 0)

await bars.nth(A.i).click()
await page.waitForTimeout(1500)

const labelsA = await volcanoLabels()
check('1.1 labels switch to the pathway members',
  labelsA.length > 0 && labelsA.every(l => setA.has(l)),
  `${labelsA.length} labels, every one a member: ${labelsA.join(', ')}`)
check('1.2 labels are no longer the TOP N set', JSON.stringify(labelsA) !== JSON.stringify(baseLabels))
note(`de-collision placed ${labelsA.length} of ${A.p.genes.length} members; the rest fall past the plot floor`)

const resetVolcano = () => panel('Volcano').locator('.panel-header button:text-is("Reset volcano")')
check('1.3 Reset volcano appears', await resetVolcano().count() === 1)

const dimNote = await panel('Volcano').locator('.t-note').last().innerText()
await resetVolcano().click()
await page.waitForTimeout(700)
check('1.4 reset restores the TOP N labels',
  JSON.stringify(await volcanoLabels()) === JSON.stringify(baseLabels))
check('1.5 the button disappears after the click', await resetVolcano().count() === 0)
check('1.6 point highlighting is untouched by the reset',
  (await panel('Volcano').locator('.t-note').last().innerText()) === dimNote &&
  await panel('Volcano').locator('svg path[fill="var(--de-dimmed)"]').count() === 1, dimNote)

// ══ 4. CATEGORY PANEL — same markup with a pathway selected ══════════════
const catsAfter = await cats.locator('.panel-body').innerHTML()
check('4.1 category panel renders identically with a pathway selected',
  catsAfter === catsBefore,
  catsAfter === catsBefore ? 'byte-identical panel markup' : 'markup differs')
check('4.2 category kicker no longer echoes the pathway',
  !up(await cats.locator('.panel-header .t-kicker').innerText()).includes(up(A.p.label)),
  await cats.locator('.panel-header .t-kicker').innerText())
check('4.3 no dimmed layer in the mini-volcanos',
  await cats.locator('svg path[fill="var(--de-dimmed)"]').count() === 0)

// ══ 5. R-EXACT still reads TOP N / MY LIST, not the pathway ══════════════
// clicking the selected bar clears the selection; clicking it again re-selects
await bars.nth(A.i).click()
await page.waitForTimeout(700)
check('5.0a clearing the pathway drops the override and the button',
  await resetVolcano().count() === 0 &&
  JSON.stringify(await volcanoLabels()) === JSON.stringify(baseLabels))
await bars.nth(A.i).click()
await page.waitForTimeout(1200)
check('5.0b re-selecting a previously-cleared pathway re-arms the override',
  await resetVolcano().count() === 1 && (await volcanoLabels()).every(l => setA.has(l)))
await panel('Volcano').locator('.panel-header .seg button:text-is("R-exact")').click()
await page.waitForTimeout(600)
await panel('Volcano').locator('button:text-is("Generate R plot")').click()
await page.waitForTimeout(1500)
check('5.1 Generate R Plot sends the TOP N config, not the pathway genes',
  rVolcanoPayload && rVolcanoPayload.n_label === 5 && rVolcanoPayload.custom_genes == null,
  JSON.stringify(rVolcanoPayload))
await panel('Volcano').locator('.panel-header .seg button:text-is("Interactive")').click()
await page.waitForTimeout(600)

// ══ 2. HEATMAP ═══════════════════════════════════════════════════════════
const hmSeg = panel('Heatmap').locator('.seg[aria-label="Heatmap gene set source"]')
const hmActive = async () => up(await hmSeg.locator('button[aria-pressed="true"]').innerText())
check('2.1 heatmap auto-switched to LINKED PATHWAY', await hmActive() === 'LINKED PATHWAY', await hmActive())
check('2.2 heatmap rows are the pathway gene set',
  lastHeatmapGenes?.length > 0 && lastHeatmapGenes.every(g => setA.has(g)),
  `${lastHeatmapGenes?.length} rows, all members: ${lastHeatmapGenes?.slice(0, 6).join(', ')} …`)

await hmSeg.locator('button:text-is("My gene list")').click()
await page.waitForTimeout(400)
const hmInput = panel('Heatmap').locator('#hm-symbols')
await hmInput.fill('GAPDH ACTB CDH5')
await hmInput.press('Enter')
await page.waitForTimeout(1500)
const chipsBefore = (await panel('Heatmap').locator('.chip').allTextContents()).join('|')
check('2.3 a gene list is entered and held', chipsBefore.includes('GAPDH'), chipsBefore)

await bars.nth(B.i).click()
await page.waitForTimeout(1800)
check('2.4 a different pathway re-triggers the auto-switch', await hmActive() === 'LINKED PATHWAY')
check('2.5 rows update live to the new pathway',
  lastHeatmapGenes?.length > 0 && lastHeatmapGenes.every(g => setB.has(g)),
  `${lastHeatmapGenes?.length} rows from pathway B`)

await hmSeg.locator('button:text-is("My gene list")').click()
await page.waitForTimeout(1500)
const chipsAfter = (await panel('Heatmap').locator('.chip').allTextContents()).join('|')
check('2.6 MY GENE LIST survived the auto-switch untouched', chipsAfter === chipsBefore, chipsAfter)

// force re-renders that do not change the selection
for (const [x, y] of [[600, 600], [900, 400], [1200, 800]]) await page.mouse.move(x, y)
await page.locator('.panel').first().hover()
await page.waitForTimeout(2000)
check('2.7 a manual switch away is not undone on re-render',
  await hmActive() === 'MY GENE LIST', await hmActive())

await hmSeg.locator('button:text-is("Linked pathway")').click()
await page.waitForTimeout(1500)
check('2.8 switching back manually still shows the pathway genes',
  lastHeatmapGenes?.length > 0 && lastHeatmapGenes.every(g => setB.has(g)))

// ══ 3. DE TABLE ══════════════════════════════════════════════════════════
const table = panel('DE table')
const rowClasses = () => table.locator('table.dtable tbody tr').evaluateAll(e => e.map(x => x.className))
const col = c => table.locator('table.dtable tbody tr').evaluateAll(
  (e, i) => e.map(x => Number(x.children[i].textContent.replace('−', '-'))), c)
const sortDir = async () =>
  table.locator('thead th[aria-sort="ascending"], thead th[aria-sort="descending"]')
       .first().getAttribute('aria-sort')
const mono = (a, asc) => a.every((v, i) => i === 0 || (asc ? v >= a[i - 1] : v <= a[i - 1]))

let cls = await rowClasses()
const nMem = cls.filter(c => c === 'row-in').length
const kicker = await table.locator('.panel-header .t-kicker').innerText()
const inSetTotal = Number(kicker.match(/(\d+)\s+IN SET/i)?.[1] ?? -1)
note(`DE table kicker: "${kicker}"`)
check('3.1 every row stays visible, non-members dimmed',
  cls.length === 200 && cls.includes('row-out'), `${cls.length} rows on page 1, ${nMem} of them members`)
check('3.2 members grouped to the top',
  nMem > 0 && cls.slice(0, nMem).every(c => c === 'row-in') && cls[nMem] === 'row-out',
  `rows 1–${nMem} members, row ${nMem + 1} is not`)
check('3.3 the grouping spans the full dataset, not the page',
  nMem === Math.min(200, inSetTotal),
  `${inSetTotal} members in the whole DE table, all ${nMem} of them ahead of the paging boundary`)

await table.locator('button:has-text("Load")').click()
await page.waitForTimeout(900)
cls = await rowClasses()
check('3.4 page 2 holds no stragglers',
  cls.length === 400 && !cls.slice(nMem).includes('row-in'),
  `${cls.length} rows loaded, members still confined to rows 1–${nMem}`)

let asc = (await sortDir()) === 'ascending'
const padj = await col(4)
check('3.5 members follow the active column sort (padj)',
  mono(padj.slice(0, nMem), asc) && mono(padj.slice(nMem), asc), `padj ${asc ? 'ascending' : 'descending'}`)

await table.locator('thead button:has-text("log2FC")').click()
await page.waitForTimeout(900)
cls = await rowClasses()
asc = (await table.locator('thead th:has-text("log2FC")').getAttribute('aria-sort')) === 'ascending'
const lfc = await col(2)
check('3.6 a new column re-sorts both groups and the grouping stands',
  cls.slice(0, nMem).every(c => c === 'row-in') && !cls.slice(nMem).includes('row-in') &&
  mono(lfc.slice(0, nMem), asc) && mono(lfc.slice(nMem), asc),
  `log2FC ${asc ? 'ascending' : 'descending'}: members ${lfc[0]}…${lfc[nMem - 1]}, non-members restart at ${lfc[nMem]}`)

const resetTable = () => table.locator('.panel-header button:text-is("Reset DE table")')
check('3.7 Reset DE table is offered while grouping is active', await resetTable().count() === 1)
await resetTable().click()
await page.waitForTimeout(900)
cls = await rowClasses()
const lfcFlat = await col(2)
const firstOut = cls.indexOf('row-out')
check('3.8 reset yields one flat sort spanning all rows',
  mono(lfcFlat, asc) && cls.slice(firstOut).includes('row-in'),
  `members and non-members now interleaved: ${cls.slice(0, 8).join(', ')}`)
check('3.9 dimming survives the reset', cls.includes('row-out') && cls.includes('row-in'))
check('3.10 the button disappears after the click', await resetTable().count() === 0)

// ══ 6. SWITCHING PATHWAYS WITHOUT A RESET FIRST ══════════════════════════
await bars.nth(A.i).click()
await page.waitForTimeout(1800)
const labelsBack = await volcanoLabels()
cls = await rowClasses()
const nMemA = cls.filter(c => c === 'row-in').length
check('6.1 volcano re-arms for the new pathway after a reset',
  labelsBack.length > 0 && labelsBack.every(l => setA.has(l)) && await resetVolcano().count() === 1,
  `${labelsBack.length} labels from pathway A`)
check('6.2 DE table grouping re-engages after a reset',
  nMemA > 0 && cls.slice(0, nMemA).every(c => c === 'row-in') && await resetTable().count() === 1,
  `${nMemA} members regrouped to the top`)
check('6.3 heatmap follows the switch without a manual step',
  await hmActive() === 'LINKED PATHWAY' && lastHeatmapGenes.every(g => setA.has(g)))

await bars.nth(B.i).click()
await page.waitForTimeout(1800)
const labelsB2 = await volcanoLabels()
cls = await rowClasses()
const nMemB = cls.filter(c => c === 'row-in').length
check('6.4 a direct A→B switch updates all three panels live',
  labelsB2.every(l => setB.has(l)) &&
  nMemB > 0 && cls.slice(0, nMemB).every(c => c === 'row-in') &&
  await hmActive() === 'LINKED PATHWAY' && lastHeatmapGenes.every(g => setB.has(g)),
  `volcano ${labelsB2.length} labels · table ${nMemB} members on top · heatmap ${lastHeatmapGenes.length} rows`)

await page.screenshot({ path: 'pathway-propagation.png', fullPage: false })
await browser.close()
console.log(out.join('\n'))
console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`)
process.exit(failures ? 1 : 0)
