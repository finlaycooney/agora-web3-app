"use client";

import Header from './Header';
import useScrollHandler from '@/hooks/useScrollHandler';

const HeaderWrapper = () => {
    const isHeaderVisible = useScrollHandler();

    return <Header isVisible={isHeaderVisible} />;
};

export default HeaderWrapper;
