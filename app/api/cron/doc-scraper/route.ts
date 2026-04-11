import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { fetchAllRegions } from '@/lib/scraper'
import { sendAlertEmails } from '@/lib/email'
import { DocAlert } from '@/types/alerts'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[cron] Starting DOC alerts scrape...')
  const startTime = Date.now()

  try {
    const regions = await fetchAllRegions()
    let newAlertsCount = 0
    let regionsChanged = 0
    const allNewAlerts: DocAlert[] = []

    for (const region of regions) {
      const { data: lastSnapshot } = await supabaseAdmin
        .from('doc_snapshots')
        .select('content_hash')
        .eq('region', region.region)
        .order('scraped_at', { ascending: false })
        .limit(1)
        .single()

      const hasChanged = !lastSnapshot || lastSnapshot.content_hash !== region.contentHash
      if (!hasChanged) continue

      regionsChanged++

      await supabaseAdmin.from('doc_snapshots').insert({
        region: region.region,
        content_hash: region.contentHash,
        raw_text: region.rawText,
      })

      const alertRows = region.alerts.length > 0
        ? region.alerts.map(alert => ({
            track_name: alert.trackName,
            region: region.region,
            alert_type: alert.alertType,
            description: alert.description,
            source_url: region.url,
            raw_snippet: alert.rawSnippet,
            read_by: null,
            valid_from: null,
            valid_until: null,
          }))
        : [{
            track_name: null,
            region: region.region,
            alert_type: 'other' as const,
            description: `עדכון חדש באזור ${region.region} — בדוק באתר ה-DOC`,
            source_url: region.url,
            raw_snippet: region.rawText.slice(0, 500),
            read_by: null,
            valid_from: null,
            valid_until: null,
          }]

      const { data: inserted, error } = await supabaseAdmin
        .from('doc_alerts')
        .insert(alertRows)
        .select()

      if (error) {
        console.error(`[cron] Error saving alerts for ${region.region}:`, error)
      } else if (inserted) {
        allNewAlerts.push(...(inserted as DocAlert[]))
        newAlertsCount += inserted.length
      }
    }

    // Send emails for all new alerts
    if (allNewAlerts.length > 0) {
      await sendAlertEmails(allNewAlerts)
    }

    const duration = Date.now() - startTime
    console.log(`[cron] Done. ${regionsChanged} regions changed, ${newAlertsCount} alerts, ${duration}ms`)

    return NextResponse.json({
      ok: true,
      regionsScraped: regions.length,
      regionsChanged,
      newAlerts: newAlertsCount,
      emailsSent: allNewAlerts.length > 0,
      durationMs: duration,
    })
  } catch (err) {
    console.error('[cron] Fatal error:', err)
    return NextResponse.json({ error: 'Scrape failed', detail: String(err) }, { status: 500 })
  }
}
