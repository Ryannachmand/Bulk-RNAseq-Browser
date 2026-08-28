/**
 * Backend reconnection — the app must recover on its own when the backend
 * comes back, with no page reload.
 *
 * Aborts /health so the tab loads believing the backend is down (what an SSH
 * tunnel drop or a uvicorn restart looks like to an open tab), then lets it
 * through and watches the app heal.
 *
 * See ./README.md. argv[2] is a path to any small CSV — it only exists to make
 * the create form valid, so the submit gate can be observed reopening.
 */
const { chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core')

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage()

let blocked = true
await page.route('**/health', r => blocked ? r.abort() : r.continue())

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)

const status = async () =>
  (await page.locator('body').innerText()).split('\n').find(l => /BACKEND/i.test(l))
const btn = page.locator('button:has-text("Create project")')

// a fully valid form, submitted while the backend looks unreachable
await page.locator('#np-name').fill('Recovery test')
await page.locator('input[type=file]').nth(1).setInputFiles(process.argv[2])
await page.waitForTimeout(500)
console.log('form complete, backend down  :', await status(), '| create disabled =', await btn.isDisabled())

blocked = false
await page.waitForTimeout(6000)
const final = await status()
const disabledAfter = await btn.isDisabled()
console.log('after the backend returns    :', final, '| create disabled =', disabledAfter)

await browser.close()

if (!/CONNECTED/i.test(final) || disabledAfter) {
  console.log('\nFAIL — the app did not recover without a reload')
  process.exit(1)
}
console.log('\nPASS — recovered with no reload: status flipped and the submit gate reopened')
