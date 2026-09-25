"use client";

import { usePathname } from 'next/navigation';
import Header from './Header';
import useScrollHandler from '@/hooks/useScrollHandler';

const HeaderWrapper = () => {
    const pathname = usePathname();
    const isHeaderVisible = useScrollHandler();

    if (pathname?.startsWith('/staff')) {
        return null;
    }
    return <Header isVisible={isHeaderVisible} />;
};

export default HeaderWrapper;
