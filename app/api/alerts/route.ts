import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/alerts?region=Fiordland&type=closed&unread=true&limit=50
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const region = searchParams.get('region')
  const type = searchParams.get('type')
  const unreadOnly = searchParams.get('unread') === 'true'
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100'), 200)

  let query = supabaseAdmin
    .from('doc_alerts')
    .select('*')
    .order('detected_at', { ascending: false })
    .limit(limit)

  if (region) query = query.eq('region', region)
  if (type) query = query.eq('alert_type', type)
  if (unreadOnly) query = query.eq('is_read', false)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Stats summary
  const stats = {
    total: data.length,
    unread: data.filter(a => !a.is_read).length,
    closed: data.filter(a => a.alert_type === 'closed').length,
    weather: data.filter(a => a.alert_type === 'weather').length,
    construction: data.filter(a => a.alert_type === 'construction').length,
    open: data.filter(a => a.alert_type === 'open').length,
  }

  return NextResponse.json({ alerts: data, stats })
}

// PATCH /api/alerts — mark as read
export async function PATCH(request: NextRequest) {
  const body = await request.json()
  const { ids, markAll } = body

  if (markAll) {
    const { error } = await supabaseAdmin
      .from('doc_alerts')
      .update({ is_read: true })
      .eq('is_read', false)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, updated: 'all' })
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids required' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('doc_alerts')
    .update({ is_read: true })
    .in('id', ids)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, updated: ids.length })
}
