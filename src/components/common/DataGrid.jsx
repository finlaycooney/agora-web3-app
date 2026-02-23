"use client";

import { cn } from "@/lib/utils";
import React, { useState, useEffect } from "react";

export default function DataGrid({
    width = 40,
    height = 40,
    squares = [24, 24], // [rows, columns]
    className,
    squaresClassName,
    ...props
}) {
    const [horizontal, vertical] = squares;
    const [pulsingSquare, setPulsingSquare] = useState(null);

    useEffect(() => {
        const interval = setInterval(() => {
            const randomIndex = Math.floor(Math.random() * (horizontal * vertical));
            setPulsingSquare(randomIndex);

            // Turn off pulse after a short duration
            setTimeout(() => {
                setPulsingSquare(null);
            }, 2000);

        }, 4000); // Every 4 seconds

        return () => clearInterval(interval);
    }, [horizontal, vertical]);

    return (
        <svg
            width={width * horizontal}
            height={height * vertical}
            className={cn(
                "absolute inset-0 h-full w-full border border-gray-400/5",
                className
            )}
            {...props}
        >
            {Array.from({ length: horizontal * vertical }).map((_, index) => {
                const x = (index % horizontal) * width;
                const y = Math.floor(index / horizontal) * height;
                const isPulsing = pulsingSquare === index;

                return (
                    <rect
                        key={index}
                        x={x}
                        y={y}
                        width={width}
                        height={height}
                        className={cn(
                            "stroke-emerald-500/5 transition-all duration-1000 ease-in-out",
                            isPulsing ? "fill-emerald-500/20 stroke-emerald-500/50" : "fill-transparent",
                            squaresClassName
                        )}
                    />
                );
            })}
        </svg>
    );
}
