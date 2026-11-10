/**
 * Visits every route at desktop, tablet and phone width, captures a screenshot of each,
 * and reports console errors and any element wider than the viewport.
 *
 * Usage:  node scripts/screenshot.mjs [baseUrl] [outDir]
 * The dev server (or `npm run preview`) must already be running.
 */

import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const BASE = process.argv[2] ?? 'http://localhost:5173'
const OUT = process.argv[3] ?? '/tmp/tcl-shots'

const ROUTES = [
  ['dashboard', '/'],
  ['products', '/products'],
  ['product-new', '/products/new'],
  ['manufacturers', '/manufacturers'],
  ['manufacturer-new', '/manufacturers/new'],
  ['clients', '/clients'],
  ['client-new', '/clients/new'],
  ['requirements', '/requirements'],
  ['requirements-unsourced', '/requirements/unsourced'],
  ['requirement-new', '/requirements/new'],
  ['engagements-board', '/engagements'],
  ['engagements-table', '/engagements?view=table'],
  ['samples', '/samples'],
  ['client-orders', '/client-orders'],
  ['client-order-new', '/client-orders/new'],
  ['indents', '/indents'],
  ['shipments', '/shipments'],
  ['batches', '/batches'],
  ['commissions', '/commissions'],
  ['commissions-analysis', '/commissions/analysis'],
  ['relationships', '/relationships'],
  ['relationships-tree', '/relationships/tree'],
  ['matrix-client-product', '/relationships/client-product'],
  ['matrix-manufacturer-product', '/relationships/manufacturer-product'],
  ['documents', '/documents'],
  ['documents-expiring', '/documents/expiring'],
  ['reports', '/reports'],
  ['report-register', '/reports/development-register'],
  ['report-pipeline', '/reports/pipeline'],
  ['report-funnel', '/reports/funnel'],
  ['report-commission', '/reports/commission'],
  ['admin', '/admin'],
  ['admin-users', '/admin/users'],
  ['admin-roles', '/admin/roles'],
  ['admin-reference', '/admin/reference'],
  ['admin-workflow', '/admin/workflow'],
  ['admin-notifications', '/admin/notifications'],
  ['admin-audit', '/admin/audit'],
  ['admin-duplicates', '/admin/duplicates'],
  ['admin-health', '/admin/health'],
  ['not-found', '/this-route-does-not-exist'],
]

/** Signs in by clicking the first person on the login screen. */
async function signIn(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  const enter = page.getByRole('button', { name: /^Enter as/ })
  await enter.waitFor({ timeout: 15000 })
  await enter.click()
  // wait out the splash: the workspace is up once the rail and a heading exist
  await page.waitForSelector('main h1', { timeout: 20000 })
  await page.waitForTimeout(400)
}

/** Finds the first detail record id for the deep-linked routes. */
async function discoverDetailRoutes(page) {
  const found = []
  const probes = [
    ['product-detail', '/products', 'a[href^="/products/"], tr'],
    ['manufacturer-detail', '/manufacturers', 'tr'],
    ['client-detail', '/clients', 'tr'],
    ['engagement-detail', '/engagements?view=table', 'tr'],
    ['requirement-detail', '/requirements', 'tr'],
    ['client-order-detail', '/client-orders', 'tr'],
    ['indent-detail', '/indents', 'tr'],
    ['shipment-detail', '/shipments', 'tr'],
    ['batch-detail', '/batches', 'tr'],
  ]
  for (const [name, listPath] of probes) {
    try {
      await page.goto(`${BASE}${listPath}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(900)
      const row = page.locator('tbody tr').first()
      if ((await row.count()) === 0) continue
      await row.click()
      await page.waitForTimeout(900)
      const url = new URL(page.url())
      if (url.pathname !== listPath.split('?')[0]) found.push([name, url.pathname + url.search])
    } catch {
      // a probe failing is not fatal: the screenshot pass still covers the list
    }
  }
  return found
}

async function main() {
  await mkdir(OUT, { recursive: true })
  // PLAYWRIGHT_CHROMIUM_PATH lets a machine without Playwright's own build use an installed Chrome
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined })
  const report = { consoleErrors: [], overflow: [], failed: [], shots: 0 }
  let detailRoutes = null

  for (const [widthName, viewport] of [
    ['desktop', { width: 1280, height: 900 }],
    ['tablet', { width: 820, height: 1180 }],
    ['phone', { width: 390, height: 844 }],
  ]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
    const page = await context.newPage()

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text()
        // Third-party noise, not defects: React Router future flags, and
        // recharts 2.x still using defaultProps on its axis components.
        if (/Download the React DevTools|future flag/i.test(text)) return
        if (/Support for defaultProps will be removed/i.test(text)) return
        report.consoleErrors.push({ width: widthName, url: page.url(), text: text.slice(0, 300) })
      }
    })
    page.on('pageerror', (err) => {
      report.consoleErrors.push({ width: widthName, url: page.url(), text: `pageerror: ${String(err).slice(0, 300)}` })
    })

    await signIn(page)
    // detail pages are found once, on the first pass, and reused at every width
    if (!detailRoutes) detailRoutes = await discoverDetailRoutes(page)
    const routes = [...ROUTES, ...detailRoutes]

    for (const [name, route] of routes) {
      try {
        await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(1100) // let skeletons resolve and animations settle
        await page.screenshot({ path: `${OUT}/${widthName}-${name}.png`, fullPage: widthName === 'desktop' })
        report.shots++

        // horizontal overflow check
        const overflow = await page.evaluate(() => {
          const docWidth = document.documentElement.clientWidth
          const bad = []
          for (const el of Array.from(document.querySelectorAll('body *'))) {
            const r = el.getBoundingClientRect()
            if (r.width > docWidth + 2 && r.height > 0) {
              bad.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} w=${Math.round(r.width)}`)
              if (bad.length > 3) break
            }
          }
          return { scrollWidth: document.documentElement.scrollWidth, clientWidth: docWidth, bad }
        })
        if (overflow.scrollWidth > overflow.clientWidth + 2) {
          report.overflow.push({ width: widthName, route, ...overflow })
        }
      } catch (err) {
        report.failed.push({ width: widthName, route, error: String(err).slice(0, 200) })
      }
    }
    await context.close()
  }

  await browser.close()
  await writeFile(`${OUT}/report.json`, JSON.stringify(report, null, 2))
  console.log(`shots: ${report.shots}`)
  console.log(`console errors: ${report.consoleErrors.length}`)
  console.log(`overflow pages: ${report.overflow.length}`)
  console.log(`failed routes: ${report.failed.length}`)
  for (const e of report.consoleErrors.slice(0, 12)) console.log(`  ERROR [${e.width}] ${e.url}\n    ${e.text}`)
  for (const o of report.overflow.slice(0, 12)) console.log(`  OVERFLOW [${o.width}] ${o.route} ${o.clientWidth}->${o.scrollWidth} ${o.bad.join(' | ')}`)
  for (const f of report.failed.slice(0, 12)) console.log(`  FAILED [${f.width}] ${f.route} ${f.error}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
