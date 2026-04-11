# DOC Alerts — New Zealand Track Monitor

מערכת ניטור אוטומטי של התראות טרקים מרשות השימור של ניו זילנד (DOC).

## סטאק
- **Next.js 14** (App Router + TypeScript)
- **Tailwind CSS**
- **Supabase** (DB + Realtime)
- **Vercel** (Hosting + Cron Jobs)
- **Resend** (שליחת מיילים אוטומטית)

---

## הקמה מהירה

### 1. צור פרויקט חדש
```bash
npx create-next-app@latest doc-alerts --typescript --tailwind --app --no-src-dir
cd doc-alerts
npm install @supabase/supabase-js
```

### 2. העתק את הקבצים
העתק את כל הקבצים מהתיקייה הזו לתוך הפרויקט.

### 3. הגדרת Supabase — הרץ ב-SQL Editor

```sql
-- התראות
create table doc_alerts (
  id uuid default gen_random_uuid() primary key,
  track_name text,
  region text not null,
  alert_type text not null check (alert_type in ('closed','weather','construction','open','other')),
  description text not null,
  source_url text,
  detected_at timestamptz default now(),
  is_read boolean default false,
  read_by text,
  valid_from timestamptz,
  valid_until timestamptz,
  raw_snippet text
);

-- Snapshots לזיהוי שינויים
create table doc_snapshots (
  id uuid default gen_random_uuid() primary key,
  region text not null,
  content_hash text not null,
  raw_text text,
  scraped_at timestamptz default now()
);

-- נמעני מייל
create table email_recipients (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  email text not null unique,
  alert_types text[] default array['closed','weather'],
  created_at timestamptz default now()
);

-- אינדקסים
create index on doc_alerts(detected_at desc);
create index on doc_alerts(is_read);
create index on doc_snapshots(region, scraped_at desc);

-- RLS
alter table doc_alerts enable row level security;
alter table doc_snapshots enable row level security;
alter table email_recipients enable row level security;

create policy "service role full access" on doc_alerts for all using (true) with check (true);
create policy "service role full access" on doc_snapshots for all using (true) with check (true);
create policy "service role full access" on email_recipients for all using (true) with check (true);
```

### 4. משתני סביבה — `.env.local`
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
CRON_SECRET=choose_any_random_string

# Resend — שליחת מיילים (הרשם בחינם ב-resend.com)
RESEND_API_KEY=re_xxxxxxxxxxxx
FROM_EMAIL=alerts@yourdomain.com
FROM_NAME=DOC Track Alerts NZ

# URL של האפליקציה (לקישור במייל)
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

### 5. Resend — הגדרת מייל
1. הירשם בחינם ב-resend.com (3,000 מיילים/חודש חינם)
2. אמת את הדומיין שלך
3. העתק את ה-API key ל-env

### 6. Deploy
```bash
git init && git add . && git commit -m "init"
# Push ל-GitHub → חבר ל-Vercel → הוסף env vars
```

---

## איך זה עובד

```
כל 15 דקות — Vercel Cron:
  ↓
שליפת HTML מ-18 דפי אזורים של DOC
  ↓
השוואת hash לגרסה הקודמת ב-Supabase
  ↓ (אם יש שינוי)
שמירת ה-alert + Supabase Realtime מעדכן את ה-dashboard
  ↓
שליחת מייל לכל נמען שבחר את סוג ההתראה הרלוונטי
```

## פיצ'רים
- Dashboard עם פילטרים, חיפוש, פילטר לפי אזור
- תאריכי תוקף (מ/עד) לכל התראה
- "בדיקה עכשיו" לסריקה ידנית
- סימון כנקרא + שם המשתמש שסימן
- הגדרות מייל: ניהול נמענים + בחירת סוגי התראות לכל נמען

## הערות
- ה-cron ב-Vercel ל-15 דקות דורש **Vercel Pro**. בחינם — שנה ל-`"0 * * * *"` (שעתי).
- חלופה חינמית: **Supabase Edge Functions** עם `pg_cron`.
