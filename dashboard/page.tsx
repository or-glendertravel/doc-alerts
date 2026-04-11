'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { DocAlert, AlertType, ALERT_TYPE_LABELS, NZ_REGIONS } from '@/types/alerts'

const TYPE_COLORS: Record<AlertType, { border: string; badge: string; icon: string }> = {
  closed:       { border: 'border-r-red-500',    badge: 'bg-red-50 text-red-800',       icon: 'bg-red-50 text-red-700' },
  weather:      { border: 'border-r-amber-500',  badge: 'bg-amber-50 text-amber-800',   icon: 'bg-amber-50 text-amber-700' },
  construction: { border: 'border-r-purple-500', badge: 'bg-purple-50 text-purple-800', icon: 'bg-purple-50 text-purple-700' },
  open:         { border: 'border-r-green-500',  badge: 'bg-green-50 text-green-800',   icon: 'bg-green-50 text-green-700' },
  other:        { border: 'border-r-gray-400',   badge: 'bg-gray-100 text-gray-700',    icon: 'bg-gray-100 text-gray-500' },
}

const TYPE_ICONS: Record<AlertType, string> = {
  closed: '✕', weather: '◈', construction: '◧', open: '✓', other: '·',
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `לפני ${mins} דקות`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `לפני ${hrs} שעות`
  return `לפני ${Math.floor(hrs / 24)} ימים`
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ---------- Email settings types ----------
interface Recipient {
  id: string
  name: string
  email: string
  alert_types: AlertType[]
}

// ---------- Main component ----------
export default function DashboardPage() {
  const [tab, setTab] = useState<'alerts' | 'settings'>('alerts')
  const [alerts, setAlerts] = useState<DocAlert[]>([])
  const [filter, setFilter] = useState<AlertType | 'all' | 'unread'>('all')
  const [regionFilter, setRegionFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [lastScan, setLastScan] = useState<string | null>(null)

  // Settings state
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [digestEnabled, setDigestEnabled] = useState(false)
  const [watchedOnly, setWatchedOnly] = useState(false)

  const loadAlerts = useCallback(async () => {
    const { data, error } = await supabase
      .from('doc_alerts')
      .select('*')
      .order('detected_at', { ascending: false })
      .limit(100)
    if (!error && data) setAlerts(data as DocAlert[])
    setLoading(false)
  }, [])

  const loadLastScan = useCallback(async () => {
    const { data } = await supabase
      .from('doc_snapshots')
      .select('scraped_at')
      .order('scraped_at', { ascending: false })
      .limit(1)
      .single()
    if (data) setLastScan(data.scraped_at)
  }, [])

  const loadRecipients = useCallback(async () => {
    const { data } = await supabase.from('email_recipients').select('*').order('created_at')
    if (data) setRecipients(data as Recipient[])
  }, [])

  useEffect(() => {
    loadAlerts()
    loadLastScan()
    loadRecipients()

    const channel = supabase
      .channel('doc_alerts_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'doc_alerts' }, payload => {
        setAlerts(prev => [payload.new as DocAlert, ...prev])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadAlerts, loadLastScan, loadRecipients])

  // ---------- Alert actions ----------
  const markRead = async (id: string) => {
    // In production: get current user from Supabase auth
    const userName = 'משתמש'
    await fetch('/api/alerts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id], read_by: userName }),
    })
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, is_read: true, read_by: userName } : a))
  }

  const markAllRead = async () => {
    await fetch('/api/alerts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAll: true }),
    })
    setAlerts(prev => prev.map(a => ({ ...a, is_read: true })))
  }

  const triggerScan = async () => {
    setScanning(true)
    await fetch('/api/cron/doc-scraper', {
      headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? ''}` },
    })
    await loadAlerts()
    await loadLastScan()
    setScanning(false)
  }

  // ---------- Recipient actions ----------
  const addRecipient = async () => {
    if (!newEmail.trim()) return
    const name = newName.trim() || newEmail.split('@')[0]
    const { data } = await supabase
      .from('email_recipients')
      .insert({ name, email: newEmail.trim(), alert_types: ['closed', 'weather'] })
      .select()
      .single()
    if (data) setRecipients(prev => [...prev, data as Recipient])
    setNewName(''); setNewEmail('')
  }

  const removeRecipient = async (id: string) => {
    await supabase.from('email_recipients').delete().eq('id', id)
    setRecipients(prev => prev.filter(r => r.id !== id))
  }

  const toggleType = async (rid: string, type: AlertType) => {
    const r = recipients.find(x => x.id === rid)
    if (!r) return
    const types = r.alert_types.includes(type)
      ? r.alert_types.filter(t => t !== type)
      : [...r.alert_types, type]
    await supabase.from('email_recipients').update({ alert_types: types }).eq('id', rid)
    setRecipients(prev => prev.map(x => x.id === rid ? { ...x, alert_types: types } : x))
  }

  const saveSettings = async () => {
    // Settings like digest are stored in a separate config table in production
    setSettingsSaved(true)
    setTimeout(() => setSettingsSaved(false), 2500)
  }

  // ---------- Filtered alerts ----------
  const filteredAlerts = alerts.filter(a => {
    if (regionFilter !== 'all' && a.region !== regionFilter) return false
    if (filter === 'unread') return !a.is_read
    if (filter !== 'all' && a.alert_type !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        (a.track_name ?? '').toLowerCase().includes(q) ||
        a.region.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q)
      )
    }
    return true
  })

  const unreadCount = alerts.filter(a => !a.is_read).length
  const closedCount = alerts.filter(a => a.alert_type === 'closed').length
  const ALL_TYPES: AlertType[] = ['closed', 'weather', 'construction', 'open']
  const TYPE_HEB: Record<AlertType, string> = { closed: 'סגור', weather: 'מזג אוויר', construction: 'עבודות', open: 'נפתח', other: 'אחר' }

  return (
    <main dir="rtl" className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-medium text-gray-900">DOC Track Alerts — New Zealand</h1>
            <p className="text-sm text-gray-500 mt-0.5">מעקב אוטומטי אחר עדכוני רשות השימור</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              סריקה כל 15 דקות
            </div>
            <button
              onClick={triggerScan}
              disabled={scanning}
              className="text-xs border border-gray-200 rounded-full px-3 py-1.5 bg-white hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1"
            >
              <span className={scanning ? 'animate-spin inline-block' : ''}>↻</span>
              {scanning ? 'בודק...' : 'בדיקה עכשיו'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-5">
          {(['alerts', 'settings'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-sm px-4 py-2 border-b-2 -mb-px transition-all ${
                tab === t ? 'border-gray-900 text-gray-900 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'alerts' ? 'התראות' : 'הגדרות מייל'}
            </button>
          ))}
        </div>

        {/* ===== ALERTS TAB ===== */}
        {tab === 'alerts' && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-4 gap-3 mb-5">
              {[
                { label: 'התראות פעילות', value: alerts.length, sub: 'בכל האזורים' },
                { label: 'לא נקראו', value: unreadCount, sub: 'התראות חדשות', color: 'text-blue-600' },
                { label: 'סגורים לחלוטין', value: closedCount, sub: 'טרקים סגורים', color: 'text-red-600' },
                { label: 'סריקה אחרונה', value: lastScan ? timeAgo(lastScan) : '—', sub: 'עדכון אוטומטי', small: true },
              ].map((stat, i) => (
                <div key={i} className="bg-white rounded-lg p-4 border border-gray-100">
                  <div className="text-xs text-gray-500 mb-1">{stat.label}</div>
                  <div className={`font-medium ${stat.small ? 'text-base mt-1' : 'text-2xl'} ${stat.color ?? 'text-gray-900'}`}>{stat.value}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{stat.sub}</div>
                </div>
              ))}
            </div>

            {/* Search + region */}
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">⌕</span>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="חפש טרק, מסלול, מקום..."
                  className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white"
                />
              </div>
              <select
                value={regionFilter}
                onChange={e => setRegionFilter(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 bg-white text-gray-600"
              >
                <option value="all">כל האזורים</option>
                {NZ_REGIONS.map(r => <option key={r.slug} value={r.name}>{r.name}</option>)}
              </select>
            </div>

            {/* Filter chips */}
            <div className="flex gap-2 mb-4 flex-wrap items-center">
              {([['all','הכל'],['unread','לא נקרא'],['closed','סגור'],['weather','מזג אוויר'],['construction','עבודות'],['open','נפתח']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key as typeof filter)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                    filter === key ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
              <div className="mr-auto">
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-xs text-gray-400 hover:text-gray-600 underline">
                    סמן הכל כנקרא
                  </button>
                )}
              </div>
            </div>

            {/* Alerts list */}
            {loading ? (
              <div className="text-center py-12 text-gray-400 text-sm">טוען התראות...</div>
            ) : filteredAlerts.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm bg-white rounded-xl border border-gray-100">
                לא נמצאו התראות
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {filteredAlerts.map(alert => {
                  const colors = TYPE_COLORS[alert.alert_type]
                  return (
                    <div
                      key={alert.id}
                      className={`bg-white rounded-xl border border-gray-100 p-4 flex gap-3 items-start border-r-[3px] ${colors.border} transition-all hover:border-gray-200`}
                    >
                      <div className={`w-8 h-8 rounded-lg ${colors.icon} flex items-center justify-center text-sm flex-shrink-0`}>
                        {TYPE_ICONS[alert.alert_type]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {alert.track_name && <span className="text-sm font-medium text-gray-900">{alert.track_name}</span>}
                          <span className={`text-xs px-2 py-0.5 rounded-full ${colors.badge}`}>{ALERT_TYPE_LABELS[alert.alert_type]}</span>
                          {!alert.is_read && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">חדש</span>}
                          <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{alert.region}</span>
                        </div>
                        <p className="text-sm text-gray-600 leading-relaxed mb-1.5">{alert.description}</p>

                        {/* Date range */}
                        {(alert.valid_from || alert.valid_until) && (
                          <div className="flex gap-2 items-center mb-1.5">
                            {alert.valid_from && (
                              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                                מ־ {formatDate(alert.valid_from)}
                              </span>
                            )}
                            {alert.valid_until && (
                              <>
                                <span className="text-xs text-gray-400">עד</span>
                                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                                  {formatDate(alert.valid_until)}
                                </span>
                              </>
                            )}
                          </div>
                        )}

                        <div className="flex gap-3 text-xs text-gray-400 flex-wrap">
                          <span>{timeAgo(alert.detected_at)}</span>
                          {(alert as any).read_by && (
                            <span className="italic">נקרא ע"י: {(alert as any).read_by}</span>
                          )}
                          {alert.source_url && (
                            <a href={alert.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-600">
                              doc.govt.nz ↗
                            </a>
                          )}
                        </div>
                      </div>
                      {!alert.is_read && (
                        <button onClick={() => markRead(alert.id)} className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-2 py-1 rounded-lg flex-shrink-0">
                          סמן כנקרא
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <div className="text-center text-xs text-gray-400 mt-6">
              {lastScan ? `סריקה אחרונה: ${new Date(lastScan).toLocaleString('he-IL')}` : ''} ·{' '}
              מקור: <a href="https://www.doc.govt.nz/parks-and-recreation/know-before-you-go/alerts/" target="_blank" className="underline">doc.govt.nz</a>
            </div>
          </>
        )}

        {/* ===== SETTINGS TAB ===== */}
        {tab === 'settings' && (
          <div className="flex flex-col gap-4">

            {/* Recipients */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h2 className="text-sm font-medium text-gray-900 mb-1">נמענים</h2>
              <p className="text-xs text-gray-500 mb-4">
                כל נמען יקבל מייל אוטומטי בכל פעם שמתגלה התראה חדשה בסוגים שבחר.
              </p>

              {/* Add row */}
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="שם"
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2"
                />
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="כתובת מייל"
                  className="flex-[2] text-sm border border-gray-200 rounded-lg px-3 py-2"
                  onKeyDown={e => e.key === 'Enter' && addRecipient()}
                />
                <button
                  onClick={addRecipient}
                  className="text-sm px-4 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 hover:bg-blue-100 font-medium"
                >
                  + הוסף
                </button>
              </div>

              {/* Recipient list */}
              {recipients.length === 0 ? (
                <p className="text-xs text-gray-400 py-2">אין נמענים עדיין</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {recipients.map(r => {
                    const initials = r.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
                    const allOn = ALL_TYPES.every(t => r.alert_types.includes(t))
                    return (
                      <div key={r.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5">
                        <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center text-xs font-medium flex-shrink-0">
                          {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900">{r.name}</div>
                          <div className="text-xs text-gray-500">{r.email}</div>
                          <div className="flex gap-1.5 mt-1.5 flex-wrap">
                            <button
                              onClick={() => ALL_TYPES.forEach(t => !allOn !== r.alert_types.includes(t) && toggleType(r.id, t))}
                              className={`text-xs px-2 py-0.5 rounded-full border transition-all ${allOn ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-white border-gray-200 text-gray-500'}`}
                            >
                              הכל
                            </button>
                            {ALL_TYPES.map(t => (
                              <button
                                key={t}
                                onClick={() => toggleType(r.id, t)}
                                className={`text-xs px-2 py-0.5 rounded-full border transition-all ${
                                  r.alert_types.includes(t)
                                    ? t === 'closed' ? 'bg-red-50 border-red-200 text-red-800'
                                    : t === 'weather' ? 'bg-amber-50 border-amber-200 text-amber-800'
                                    : t === 'construction' ? 'bg-purple-50 border-purple-200 text-purple-800'
                                    : 'bg-green-50 border-green-200 text-green-800'
                                    : 'bg-white border-gray-200 text-gray-500'
                                }`}
                              >
                                {TYPE_HEB[t]}
                              </button>
                            ))}
                          </div>
                        </div>
                        <button onClick={() => removeRecipient(r.id)} className="text-gray-300 hover:text-red-400 text-lg leading-none">×</button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Global settings */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h2 className="text-sm font-medium text-gray-900 mb-4">הגדרות נוספות</h2>
              {[
                { label: 'שלח מייל מרוכז יומי', sub: 'סיכום של כל ההתראות ב-08:00 בבוקר', val: digestEnabled, set: setDigestEnabled },
                { label: 'שלח רק על טרקים עם הזמנות פעילות', sub: 'מתאים כשיש רשימת טרקים "תחת מעקב"', val: watchedOnly, set: setWatchedOnly },
              ].map((row, i) => (
                <div key={i} className={`flex items-center justify-between py-3 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                  <div>
                    <div className="text-sm text-gray-900">{row.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{row.sub}</div>
                  </div>
                  <button
                    onClick={() => row.set(!row.val)}
                    className={`w-9 h-5 rounded-full border transition-all relative flex-shrink-0 ${row.val ? 'bg-green-500 border-green-500' : 'bg-gray-200 border-gray-200'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${row.val ? 'right-0.5' : 'right-4'}`} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex justify-end items-center gap-3">
              {settingsSaved && <span className="text-xs text-green-600">השינויים נשמרו</span>}
              <button
                onClick={saveSettings}
                className="text-sm px-5 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 hover:bg-blue-100 font-medium"
              >
                שמור הגדרות
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
