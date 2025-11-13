import { useState, useEffect, useRef } from 'react';

// This custom hook now tracks scroll direction to show/hide the header.
const useScrollHandler = () => {
    const [isHeaderVisible, setHeaderVisible] = useState(true);
    // A 'ref' is used to store the last scroll position. Using a ref is better
    // than state here because updating it doesn't cause the component to re-render.
    const lastScrollY = useRef(0);

    useEffect(() => {
        const handleScroll = () => {
            const currentScrollY = window.scrollY;
            const threshold = 100; // The header will only hide after scrolling 100px down.

            // If the current scroll position is greater than the last one, we are scrolling down.
            if (currentScrollY > lastScrollY.current) {
                // Scrolling Down
                if (currentScrollY > threshold) {
                    setHeaderVisible(false);
                }
            } else {
                // Scrolling Up
                setHeaderVisible(true);
            }

            // Crucial step: update the 'lastScrollY' ref with the new position
            // for the next scroll event.
            lastScrollY.current = currentScrollY;
        };

        window.addEventListener('scroll', handleScroll);

        // This cleanup function removes the event listener when the component is no longer on screen.
        return () => window.removeEventListener('scroll', handleScroll);
    }, []); // The empty array [] ensures this effect only runs once.

    return isHeaderVisible;
};

export default useScrollHandler;
