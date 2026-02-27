"use client";

import dynamic from 'next/dynamic';

// Dynamically import Beams to unblock the main thread, 
// using a Client Component wrapper since ssr: false is not allowed in Server Components
const Beams = dynamic(() => import('@/components/common/Beams'), {
    ssr: false,
    loading: () => <div className="absolute inset-0 w-full h-full bg-[#00244b]" />
});

export default function BeamsWrapper(props) {
    return <Beams {...props} />;
}
