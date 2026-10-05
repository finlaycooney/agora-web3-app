import './globals.css';
import { Outfit } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';

const outfit = Outfit({ subsets: ['latin'] });

export const metadata = {
  title: 'Agora4 | High-Fidelity Talent Infrastructure',
  description: 'The discovery primitive for Web3 talent.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className={`${outfit.className} text-foreground bg-background antialiased`}>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
