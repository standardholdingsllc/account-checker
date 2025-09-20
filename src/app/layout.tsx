import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Account Closure Finder',
  description: 'Automated dormant account monitoring system',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
