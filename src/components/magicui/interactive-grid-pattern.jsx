"use client";

import { cn } from "@/lib/utils";
import React, { useState } from "react";

export default function InteractiveGridPattern({
    width = 40,
    height = 40,
    squares = [24, 24], // [rows, columns]
    className,
    squaresClassName,
    ...props
}) {
    const [horizontal, vertical] = squares;
    const [hoveredSquare, setHoveredSquare] = useState(null);

    return (
        <svg
            width={width * horizontal}
            height={height * vertical}
            className={cn(
                "absolute inset-0 h-full w-full border border-gray-400/30",
                className
            )}
            {...props}
        >
            {Array.from({ length: horizontal * vertical }).map((_, index) => {
                const x = (index % horizontal) * width;
                const y = Math.floor(index / horizontal) * height;
                return (
                    <rect
                        key={index}
                        x={x}
                        y={y}
                        width={width}
                        height={height}
                        className={cn(
                            "stroke-blue-500/20 transition-all duration-100 ease-in-out hover:duration-0.5",
                            hoveredSquare === index ? "fill-white/70" : "fill-transparent",
                            squaresClassName
                        )}
                        onMouseEnter={() => setHoveredSquare(index)}
                        onMouseLeave={() => setHoveredSquare(null)}
                        fill={
                            hoveredSquare === index ? "white opacity-70" : "transparent"
                        } // Highlight color
                    />
                );
            })}
        </svg>
    );
}