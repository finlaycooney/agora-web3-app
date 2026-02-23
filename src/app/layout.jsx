// 1. REMOVED "use client" - Root Layout should be a Server Component

import './globals.css';
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import { Outfit } from 'next/font/google';

// 2. Import Components
import HeaderWrapper from '@/components/common/HeaderWrapper'; // Created a wrapper for scroll logic
import Footer from '@/components/common/Footer';
import { Providers } from "./providers";

const outfit = Outfit({ subsets: ['latin'] });

// 3. Metadata for SEO (Only works in Server Components)
export const metadata = {
  title: 'Agora4 | High-Fidelity Talent Infrastructure',
  description: 'The discovery primitive for Web3 talent.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className={`${outfit.className} text-foreground bg-background antialiased`}>
        <div className="bg-noise" />

        {/* The Handshake: Providers wrap everything that needs Session/UI state */}
        <Providers>
          {/* HeaderWrapper handles the useScrollHandler logic internally now */}
          <HeaderWrapper />

          <main>
            {children}
          </main>

          <Footer />
        </Providers>
      </body>
    </html>
  );
}