import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
try {
  await page.goto('http://127.0.0.1:5175/')
  await page.getByRole('button', { name: /Enter as/ }).click()
  const mobileNav = page.getByRole('navigation', { name: 'Mobile navigation' })
  await mobileNav.getByRole('button', { name: 'More navigation' }).click()
  const allSections = page.getByRole('navigation', { name: 'All sections' })
  if (!await allSections.isVisible()) throw new Error('Navigation dialog did not open')
  await allSections.getByRole('link', { name: 'Reports' }).click()
  if (new URL(page.url()).pathname !== '/reports') throw new Error('Reports navigation failed')
  if (await allSections.count()) throw new Error('Navigation dialog stayed open after route change')
  await mobileNav.getByRole('button', { name: 'More navigation' }).click()
  await page.keyboard.press('Escape')
  if (await allSections.count()) throw new Error('Escape did not close navigation')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  if (overflow) throw new Error('Mobile page has horizontal overflow')
  console.log('Mobile navigation checks passed')
} finally {
  await browser.close()
}
