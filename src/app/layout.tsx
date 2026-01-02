import type { Metadata } from 'next'
import { Pixelify_Sans } from 'next/font/google'
import './globals.css'

const pixelify = Pixelify_Sans({
  subsets: ['latin'],
  weight: ['400'], // Pixelify only supports 400
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Memestonks',
  description: 'giving our memestonks value with an automated flywheel protocol',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={pixelify.className}>
        {children}
      </body>
    </html>
  )
}
