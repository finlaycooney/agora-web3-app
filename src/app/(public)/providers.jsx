"use client";

import { HeroUIProvider } from '@heroui/system';
import { LazyMotion, domAnimation } from 'framer-motion';

export function PublicProviders({ children }) {
    return (
        <HeroUIProvider>
            <LazyMotion features={domAnimation}>
                {children}
            </LazyMotion>
        </HeroUIProvider>
    );
}
