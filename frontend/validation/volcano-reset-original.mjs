/**
 * Reset volcano must restore the TRUE original label state — the live
 * TOP N / MY LIST config — no matter how many pathways were selected in a row
 * beforehand, and must never leave an intermediate pathway state behind.
 *
 * See ./README.md for how to run this. Drives the project named below with
 * Vite on :5173 and uvicorn on :8000.
 */
const { chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core')

const PROJECT = '90afa131-c075-4680-8845-d1d7b13d1244'
const URL = `http://localhost:5173/project/${PROJECT}/dashboard`

const out = []
let failures = 0
const check = (n, ok, d = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); if (!ok) failures++ }
const note = m => out.push(`      · ${m}`)
const up = s => String(s).trim().toUpperCase()
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1720, height: 1200 } })

let rPayload = null   // what Generate R plot actually asks for
await page.route('**/render-r-volcano', route => {
  try { rPayload = JSON.parse(route.request().postData() || '{}') } catch {}
  route.abort()       // the payload is the whole point; no need to spend 40 s in R
})

const panel = t => page.locator('.panel').filter({ has: page.locator(`.panel-header .t-display:text-is("${t}")`) })
const vol = () => panel('Volcano')
const labels = () => vol().locator('svg text[font-weight="700"]').allTextContents()
const resetBtn = () => vol().locator('.panel-header button:text-is("Reset volcano")')
const view = async v => { await vol().locator(`.panel-header .seg button:text-is("${v}")`).click(); await page.waitForTimeout(500) }

await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

// pathway gene sets, plus four significant genes in none of them for MY LIST
const { pathways, spare } = await page.evaluate(async p => {
  const pj = await (await fetch(`http://localhost:8000/projects/${p}/pathway-data?top_n=20`)).json()
  const rows = (pj.rows || pj).map(r => ({
    label: r.Description_short || r.Description,
    genes: String(r.geneID || '').split('/').map(s => s.trim()).filter(Boolean),
  }))
  const inAny = new Set(rows.flatMap(r => r.genes))
  const de = await (await fetch(`http://localhost:8000/projects/${p}/volcano-data`)).json()
  const sig = de
    .filter(r => r.padj != null && r.log2FoldChange != null && r.padj < 0.05 && Math.abs(r.log2FoldChange) > 1)
    .map(r => ({ s: r.symbol && !String(r.symbol).startsWith('ENSG') ? r.symbol : r.gene, padj: r.padj }))
    .filter(r => r.s && !inAny.has(r.s))
    .sort((a, b) => a.padj - b.padj)
  return { pathways: rows, spare: [...new Set(sig.map(r => r.s))].slice(10, 14) }
}, PROJECT)

// The three pathways have to hold genuinely different gene sets: the top GO
// rows here are near-duplicate terms over one identical 45-gene set, and an
// A -> B switch between two identical sets tests nothing.
const overlap = (a, b) => {
  const s = new Set(b)
  return a.filter(g => s.has(g)).length / Math.min(a.length, b.length)
}
const bars = panel('Pathways').locator('button.pw-row')
const nBars = await bars.count()
const chosen = []
for (let i = 0; i < nBars && chosen.length < 3; i++) {
  const t = up(await bars.nth(i).locator('span').first().innerText())
  const p = pathways.find(x => up(x.label) === t)
  if (!p || p.genes.length < 8) continue
  if (chosen.some(c => overlap(c.p.genes, p.genes) > 0.3)) continue
  chosen.push({ i, p })
}
const sets = chosen.map(c => new Set(c.p.genes))
check('0.1 three pathways with distinct gene sets are available', chosen.length === 3,
  `${chosen.length} found among ${nBars} bars`)
if (chosen.length < 3) { await browser.close(); console.log(out.join('\n')); process.exit(1) }
note(chosen.map((c, i) => `${'ABC'[i]}="${c.p.label}" (${c.p.genes.length} genes)`).join(' · '))
note(`MY LIST genes (in no pathway above): ${spare.join(', ')}`)

const pick = async k => { await bars.nth(chosen[k].i).click(); await page.waitForTimeout(1300) }
// The config as the R-exact panel reads it — the live TOP N / MY LIST state.
const config = async () => {
  await view('R-exact')
  const mode = up(await vol().locator('.seg[aria-label="Gene label source"] button[aria-pressed="true"]').innerText())
  const n = mode === 'TOP N' ? await vol().locator('#rv-n').inputValue() : null
  const chips = mode === 'TOP N' ? null : (await vol().locator('.chip').allTextContents()).map(s => s.trim()).join('|')
  await view('Interactive')
  return { mode, n, chips }
}

// ══ 1. TOP N ══════════════════════════════════════════════════════════════
await view('R-exact')
await vol().locator('#rv-n').fill('3')
await page.waitForTimeout(400)
await view('Interactive')
const base1 = await labels()
check('1.1 TOP N = 3 is configured and labelled', base1.length > 0, base1.join(', '))
const cfg1 = await config()

const seen1 = []
for (let k = 0; k < 3; k++) {
  await pick(k)
  const l = await labels()
  seen1.push(l)
  check(`1.2${'abc'[k]} pathway ${'ABC'[k]} overrides the labels`,
    l.length > 0 && l.every(g => sets[k].has(g)), `${l.length} labels, all members`)
  if (k === 1) {
    check('1.3 config is untouched mid-sequence', same(await config(), cfg1), JSON.stringify(cfg1))
    check('1.4 the override still stands after reading the config',
      (await labels()).every(g => sets[1].has(g)))
  }
}

check('1.2d the three pathway states are pairwise distinct',
  !same(seen1[0], seen1[1]) && !same(seen1[1], seen1[2]) && !same(seen1[0], seen1[2]),
  seen1.map((l, i) => `${'ABC'[i]}: ${l.slice(0, 3).join('/')}…`).join(' · '))

check('1.5 Reset volcano is offered', await resetBtn().count() === 1)
await resetBtn().click()
await page.waitForTimeout(700)
const after1 = await labels()
check('1.6 reset after A→B→C restores the exact TOP N set', same(after1, base1), after1.join(', '))
check('1.7 no intermediate pathway state survives the reset',
  seen1.every(l => !same(l, after1)), `checked against all ${seen1.length} pathway states`)
check('1.8 config still reads TOP N = 3 after the whole sequence', same(await config(), cfg1))
await view('R-exact')
await vol().locator('button:text-is("Generate R plot")').click()
await page.waitForTimeout(1300)
check('1.9 Generate R plot sends the configured TOP N',
  rPayload?.n_label === 3 && rPayload.custom_genes == null, JSON.stringify(rPayload))

// ══ 2. MY LIST, five switches deep ════════════════════════════════════════
await vol().locator('.seg[aria-label="Gene label source"] button:text-is("My list")').click()
await page.waitForTimeout(300)
const inp = vol().locator('#rv-symbols')
await inp.fill(spare.join(' '))
await inp.press('Enter')
await page.waitForTimeout(600)
await view('Interactive')
const base2 = await labels()
check('2.1 MY LIST labels exactly the configured genes',
  base2.length === spare.length && base2.every(g => spare.includes(g)), base2.join(', '))
const cfg2 = await config()

const order = [0, 1, 2, 0, 1]
const seen2 = []
for (const k of order) { await pick(k); seen2.push(await labels()) }
check('2.2 five consecutive pathway switches each override live',
  seen2.every((l, i) => l.length > 0 && l.every(g => sets[order[i]].has(g))),
  seen2.map((l, i) => `${'ABC'[order[i]]}:${l.length}`).join(' → '))
await resetBtn().click()
await page.waitForTimeout(700)
const after2 = await labels()
check('2.3 reset after five switches restores the exact MY LIST', same(after2, base2), after2.join(', '))
check('2.4 none of the five intermediate states survives', seen2.every(l => !same(l, after2)))
check('2.5 the MY LIST config is untouched by the whole sequence', same(await config(), cfg2), JSON.stringify(cfg2))
rPayload = null
await view('R-exact')
await vol().locator('button:text-is("Generate R plot")').click()
await page.waitForTimeout(1300)
check('2.6 Generate R plot sends MY LIST, not any pathway',
  rPayload?.n_label === 0 && rPayload.custom_genes?.length === spare.length &&
  rPayload.custom_genes.every(g => spare.includes(g)), JSON.stringify(rPayload))

await view('Interactive')
await page.screenshot({ path: 'volcano-reset-original.png', fullPage: false })
await browser.close()
console.log(out.join('\n'))
console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`)
process.exit(failures ? 1 : 0)
