"use client";

import { HeroUIProvider } from '@heroui/system';
import { SessionProvider } from "next-auth/react";

export function Providers({ children }) {
    return (
        <SessionProvider>
            <HeroUIProvider>
                {children}
            </HeroUIProvider>
        </SessionProvider>
    );
}