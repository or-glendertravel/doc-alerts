export type AlertType = 'closed' | 'weather' | 'construction' | 'open' | 'other'

export interface DocAlert {
  id: string
  track_name: string | null
  region: string
  alert_type: AlertType
  description: string
  source_url: string | null
  detected_at: string
  is_read: boolean
  read_by: string | null
  valid_from: string | null
  valid_until: string | null
  raw_snippet: string | null
}

export interface EmailRecipient {
  id: string
  name: string
  email: string
  alert_types: AlertType[]
  created_at: string
}

export interface DocSnapshot {
  id: string
  region: string
  content_hash: string
  raw_text: string | null
  scraped_at: string
}

export const NZ_REGIONS = [
  { name: 'Northland',           slug: 'northland' },
  { name: 'Auckland',            slug: 'auckland' },
  { name: 'Coromandel',          slug: 'coromandel' },
  { name: 'Waikato',             slug: 'waikato' },
  { name: 'Bay of Plenty',       slug: 'bay-of-plenty' },
  { name: 'East Coast',          slug: 'east-coast' },
  { name: 'Taranaki',            slug: 'taranaki' },
  { name: "Hawke's Bay",         slug: 'hawkes-bay' },
  { name: 'Whanganui',           slug: 'whanganui' },
  { name: 'Wellington',          slug: 'wellington' },
  { name: 'Nelson / Tasman',     slug: 'nelson-tasman' },
  { name: 'Marlborough',         slug: 'marlborough' },
  { name: 'West Coast',          slug: 'west-coast' },
  { name: 'Canterbury',          slug: 'canterbury' },
  { name: 'Otago',               slug: 'otago' },
  { name: 'Fiordland',           slug: 'fiordland' },
  { name: 'Southland',           slug: 'southland' },
  { name: 'Stewart Island',      slug: 'stewart-island-rakiura' },
] as const

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  closed: 'סגור',
  weather: 'מזג אוויר',
  construction: 'עבודות',
  open: 'נפתח מחדש',
  other: 'עדכון כללי',
}
