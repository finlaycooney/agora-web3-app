"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";

export const AnimatedList = React.memo(({
    className,
    children
}) => {
    return (
        <div className={`flex flex-col items-center gap-4 ${className}`}>
            <AnimatePresence initial={false} mode="popLayout">
                {React.Children.map(children, (child) => (
                    <AnimatedListItem key={child.key}>
                        {child}
                    </AnimatedListItem>
                ))}
            </AnimatePresence>
        </div>
    );
});

AnimatedList.displayName = "AnimatedList";

export function AnimatedListItem({ children }) {
    const animations = {
        initial: { scale: 0.9, opacity: 0, y: -20 },
        animate: { scale: 1, opacity: 1, y: 0 },
        exit: { scale: 0.9, opacity: 0, y: 20 },
        transition: {
            type: "spring",
            stiffness: 400,
            damping: 30,
            layout: { duration: 0.3 }
        },
    };

    return (
        <motion.div
            {...animations}
            layout
            className="mx-auto w-full origin-top"
        >
            {children}
        </motion.div>
    );
}
