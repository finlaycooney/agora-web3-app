"use client";

import type { ReactNode } from 'react';
import { SessionProvider } from 'next-auth/react';

// Record previews use the current session to invalidate their in-memory cache.
export function StaffSessionProvider({ children }: { children: ReactNode }) {
    return <SessionProvider>{children}</SessionProvider>;
}
