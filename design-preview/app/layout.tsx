import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
    title: 'Agora Staff Design Preview',
    description: 'Local-only design preview for the Agora staff workspace.',
    robots: { index: false, follow: false },
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
};

export default function PreviewLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <body className="bg-background text-foreground">{children}</body>
        </html>
    );
}
