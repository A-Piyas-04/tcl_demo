/**
 * Drives the CRUD story end to end, the way it would be shown in a
 * presentation, and asserts that the rules actually refuse what they should.
 *
 * Usage:  node scripts/walkthrough.mjs [baseUrl] [outDir]
 * The dev server (or `npm run preview`) must already be running.
 */

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const BASE = process.argv[2] ?? 'http://localhost:5173'
const OUT = process.argv[3] ?? '/tmp/tcl-walk'

const results = []
const step = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false })
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))

  // ---------------------------------------------------------------- sign in
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /^Enter as/ }).click()
  await page.waitForSelector('main h1', { timeout: 20000 })
  step('Sign in reaches the dashboard', true)
  await shot(page, '01-dashboard')

  // ------------------------------------------------- 1. product CRUD + dup
  await page.goto(`${BASE}/products/new`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  const nameField = page.locator('input[placeholder="Budesonide"]')
  await nameField.fill('Budesonide')
  await page.waitForTimeout(400)
  const blocked = await page.getByText(/already exists in this category/i).count()
  step('Exact duplicate product name is blocked', blocked > 0)
  await shot(page, '02-duplicate-blocked')

  await nameField.fill('Budesonid')
  await page.waitForTimeout(400)
  const warned = await page.getByText(/looks like something already in the catalogue/i).count()
  step('Near-duplicate product name warns', warned > 0)

  const unique = `Testolamide ${Date.now().toString().slice(-5)}`
  await nameField.fill(unique)
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /^Add product$/ }).click()
  await page.waitForTimeout(1200)
  const created = page.url().includes('/products/')
  step('A unique product is created', created, page.url().split('/').pop())
  await shot(page, '03-product-created')

  // --------------------------------------------- 2. engagement board rules
  await page.goto(`${BASE}/engagements`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1400)
  // Each card carries a drag handle labelled "Move <product> for <client>".
  const boardCards = await page.getByRole('button', { name: /^Move .+ for / }).count()
  step('Engagement board renders draggable cards', boardCards > 0, `${boardCards} cards`)
  await shot(page, '04-engagement-board')

  // open one engagement and look for the stage control and rail
  await page.goto(`${BASE}/engagements?view=table`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  const firstRow = page.locator('tbody tr').first()
  if ((await firstRow.count()) > 0) {
    await firstRow.click()
    await page.waitForTimeout(1200)
    const onDetail = /\/engagements\/[a-z0-9_]+/i.test(page.url())
    step('Engagement detail opens from the table', onDetail)
    await shot(page, '05-engagement-detail')
  } else {
    step('Engagement detail opens from the table', false, 'no rows found')
  }

  // ------------------------------------------------------- 3. client order
  await page.goto(`${BASE}/client-orders`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  const orderRows = await page.locator('tbody tr').count()
  step('Client orders list renders', orderRows > 0, `${orderRows} rows`)
  await shot(page, '06-client-orders')

  if (orderRows > 0) {
    await page.locator('tbody tr').first().click()
    await page.waitForTimeout(1200)
    const hasIndent = await page.getByText(/indent/i).count()
    step('Client order detail shows its indents', hasIndent > 0)
    await shot(page, '07-client-order-detail')
  }

  // ---------------------------------------------------- 4. shipment detail
  await page.goto(`${BASE}/shipments`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  const shipRows = await page.locator('tbody tr').count()
  step('Shipments list renders', shipRows > 0, `${shipRows} rows`)
  if (shipRows > 0) {
    await page.locator('tbody tr').first().click()
    await page.waitForTimeout(1200)
    step('Shipment detail opens', /\/shipments\/[a-z0-9_]+/i.test(page.url()))
    await shot(page, '08-shipment-detail')
  }

  // ------------------------------------------------------- 5. commission
  await page.goto(`${BASE}/commissions`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  const fromClient = await page.getByText(/client/i).count()
  step('Commission tracker renders', fromClient > 0)
  await shot(page, '09-commission')

  // ------------------------------------------------- 6. relationships tree
  await page.goto(`${BASE}/relationships/tree`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  const nodes = await page.locator('.react-flow__node').count()
  step('Connection tree renders nodes', nodes > 0, `${nodes} nodes`)
  await shot(page, '10-connection-tree')

  // ------------------------------------------- 7. View Only hides actions
  await page.goto(`${BASE}/products`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  const addBefore = await page.getByRole('link', { name: /Add product/i }).count()

  // switch the session role through the user menu
  await page.locator('header button').last().click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'View only' }).first().click()
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  const addAfter = await page.getByRole('link', { name: /Add product/i }).count()
  step('View Only removes the write action', addBefore > 0 && addAfter === 0, `before ${addBefore}, after ${addAfter}`)
  await shot(page, '11-view-only')

  // a write route by deep link must refuse
  await page.goto(`${BASE}/products/new`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  const refused = await page.getByText(/Not permitted/i).count()
  step('View Only deep link to a form is refused', refused > 0)
  await shot(page, '12-not-permitted')

  // ------------------------------------------------------- 8. audit log
  await page.goto(`${BASE}/admin/audit`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  const auditRows = await page.locator('tbody tr').count()
  step('Audit log shows the session activity', auditRows > 0, `${auditRows} rows`)
  await shot(page, '13-audit-log')

  // --------------------------------------------------- 9. command palette
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  await page.keyboard.press('Control+k')
  await page.waitForTimeout(500)
  // "DXM HBr" is only a synonym, so a hit proves synonym search works.
  await page.keyboard.type('DXM')
  await page.waitForTimeout(700)
  const paletteHits = await page.getByText(/matched on synonym/i).count()
  const named = await page.getByText(/Dextromethorphan Hydrobromide/i).count()
  step('Command palette matches a synonym', paletteHits > 0 && named > 0)
  await shot(page, '14-command-palette')

  await browser.close()

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} steps passed`)
  if (errors.length) {
    console.log(`page errors: ${errors.length}`)
    for (const e of errors.slice(0, 8)) console.log(`  ${e}`)
  }
  if (failed.length) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
