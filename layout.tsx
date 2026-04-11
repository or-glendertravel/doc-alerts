import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'DOC Alerts — NZ Track Monitor',
  description: 'ניטור התראות טרקים מרשות השימור של ניו זילנד',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  )
}
