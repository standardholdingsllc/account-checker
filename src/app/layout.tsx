import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Account Checker',
  description: 'Automated monitoring system ensuring compliance and operational excellence',
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
