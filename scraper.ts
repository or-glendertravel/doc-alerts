import crypto from 'crypto'
import { AlertType, NZ_REGIONS } from '@/types/alerts'

const DOC_BASE = 'https://www.doc.govt.nz/parks-and-recreation/places-to-go'
const DOC_ALERTS_BASE = 'https://www.doc.govt.nz/parks-and-recreation/know-before-you-go/alerts'

// Map DOC region slugs to their alert page URLs
function getAlertUrl(slug: string): string {
  return `${DOC_ALERTS_BASE}/${slug}/`
}

export function hashContent(text: string): string {
  return crypto.createHash('sha256').update(text.trim()).digest('hex').slice(0, 16)
}

// Classify alert type from text keywords
export function classifyAlertType(text: string): AlertType {
  const lower = text.toLowerCase()
  if (lower.includes('closed') || lower.includes('closure') || lower.includes('סגור')) {
    return 'closed'
  }
  if (lower.includes('weather') || lower.includes('flood') || lower.includes('snow') ||
      lower.includes('storm') || lower.includes('wind') || lower.includes('rain')) {
    return 'weather'
  }
  if (lower.includes('construction') || lower.includes('maintenance') ||
      lower.includes('work') || lower.includes('repair') || lower.includes('bridge')) {
    return 'construction'
  }
  if (lower.includes('open') || lower.includes('reopened') || lower.includes('reopen')) {
    return 'open'
  }
  return 'other'
}

// Extract track name from alert heading (best-effort)
export function extractTrackName(text: string): string | null {
  // Common patterns: "Milford Track closed", "Closure: Routeburn Track", etc.
  const patterns = [
    /^([A-Z][^:.\n]{3,50}(?:Track|Walk|Crossing|Route|Circuit|Loop|Path|Walkway))/i,
    /closure[:\s]+([A-Z][^.\n]{3,50})/i,
    /^([A-Z][^:.\n]{3,50})[\s:–-]+(?:closed|closure|weather|open)/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return match[1].trim()
  }
  return null
}

export interface ScrapedRegion {
  region: string
  slug: string
  url: string
  contentHash: string
  rawText: string
  alerts: ParsedAlert[]
}

export interface ParsedAlert {
  trackName: string | null
  alertType: AlertType
  description: string
  rawSnippet: string
}

// Parse plain text from HTML response (without DOM — works in Edge)
export function parseAlertsFromHtml(html: string, regionName: string): ParsedAlert[] {
  const alerts: ParsedAlert[] = []

  // Extract text content between common alert containers
  // DOC uses <article>, <li>, <div class="alert"> patterns
  const articleMatches = html.matchAll(
    /<(?:article|li)[^>]*class="[^"]*(?:alert|notice|closure|warning)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|li)>/gi
  )

  for (const match of articleMatches) {
    const inner = match[1]
    // Strip HTML tags
    const text = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (text.length < 20) continue

    const alertType = classifyAlertType(text)
    const trackName = extractTrackName(text)

    alerts.push({
      trackName,
      alertType,
      description: text.slice(0, 400),
      rawSnippet: text.slice(0, 800),
    })
  }

  // Fallback: look for heading + paragraph patterns
  if (alerts.length === 0) {
    const headingMatches = html.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>([\s\S]*?)<p[^>]*>([\s\S]*?)<\/p>/gi)
    for (const match of headingMatches) {
      const heading = match[1].replace(/<[^>]+>/g, '').trim()
      const body = match[3].replace(/<[^>]+>/g, '').trim()
      if (heading.length < 5 || body.length < 10) continue

      const combined = `${heading} ${body}`
      const alertType = classifyAlertType(combined)
      if (alertType === 'other' && !heading.toLowerCase().includes('alert')) continue

      alerts.push({
        trackName: extractTrackName(heading) ?? extractTrackName(combined),
        alertType,
        description: `${heading}: ${body}`.slice(0, 400),
        rawSnippet: combined.slice(0, 800),
      })
    }
  }

  return alerts
}

// Fetch one region's alert page
export async function fetchRegionAlerts(
  regionName: string,
  slug: string
): Promise<ScrapedRegion | null> {
  const url = getAlertUrl(slug)

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'TrailMonitor/1.0 (travel-company-nz-alerts; contact@yourcompany.com)',
        Accept: 'text/html',
      },
      next: { revalidate: 0 }, // always fresh
    })

    if (!response.ok) {
      console.warn(`[scraper] ${regionName}: HTTP ${response.status}`)
      return null
    }

    const html = await response.text()

    // Extract meaningful text for hashing (strip scripts/styles first)
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    const contentHash = hashContent(stripped)
    const alerts = parseAlertsFromHtml(html, regionName)

    return { region: regionName, slug, url, contentHash, rawText: stripped.slice(0, 5000), alerts }
  } catch (err) {
    console.error(`[scraper] Failed to fetch ${regionName}:`, err)
    return null
  }
}

// Fetch all regions (with rate limiting — max 4 concurrent)
export async function fetchAllRegions(): Promise<ScrapedRegion[]> {
  const results: ScrapedRegion[] = []
  const regions = [...NZ_REGIONS]

  // Process in batches of 4 to be polite to DOC servers
  for (let i = 0; i < regions.length; i += 4) {
    const batch = regions.slice(i, i + 4)
    const batchResults = await Promise.all(
      batch.map(r => fetchRegionAlerts(r.name, r.slug))
    )
    results.push(...batchResults.filter((r): r is ScrapedRegion => r !== null))

    // Small delay between batches
    if (i + 4 < regions.length) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  return results
}
