"use client";

import { useEffect, useState, useRef, useCallback } from "react";

/**
 * DecryptedText
 *
 * @param {string} text - The text to display and animate.
 * @param {number} speed - The speed of the animation in ms per character iteration.
 * @param {number} maxIterations - Maximum number of iterations before revealing the final character.
 * @param {boolean} sequential - If true, reveals characters one by one. If false, reveals all at once.
 * @param {string} revealDirection - "start" | "end" | "center" (only applicable if sequential is true).
 * @param {boolean} useOriginalCharsOnly - If true, mostly uses characters from the original text for scrambling.
 * @param {string} characters - String of characters to use for scrambling.
 * @param {string} className - Class name for the text element.
 * @param {string} parentClassName - Class name for the container.
 * @param {boolean} animateOn - "view" | "hover" | "always" - When to start the animation.
 */
export default function DecryptedText({
    text = "",
    speed = 50,
    maxIterations = 10,
    sequential = false,
    revealDirection = "start",
    useOriginalCharsOnly = false,
    characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+",
    className = "",
    parentClassName = "",
    animateOn = "hover",
    interval = 0,
    ...props
}) {
    const [displayText, setDisplayText] = useState(text);
    const [isScrolledIntoView, setIsScrolledIntoView] = useState(false);
    const containerRef = useRef(null);
    const iterations = useRef(0);
    const intervalRef = useRef(null);

    // Initial fill
    useEffect(() => {
        setDisplayText(text);
    }, [text]);

    // Handle viewport visibility
    useEffect(() => {
        if (animateOn !== "view") return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsScrolledIntoView(true);
                }
            },
            { threshold: 0.1 }
        );

        if (containerRef.current) {
            observer.observe(containerRef.current);
        }

        return () => {
            if (containerRef.current) observer.unobserve(containerRef.current);
        };
    }, [animateOn]);

    const animate = useCallback(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);

        iterations.current = 0;

        intervalRef.current = setInterval(() => {
            setDisplayText((prev) =>
                text
                    .split("")
                    .map((char, index) => {
                        if (char === " ") return " ";

                        if (iterations.current >= maxIterations) {
                            return char;
                        }

                        if (sequential) {
                            if (revealDirection === "start") {
                                if (index < Math.floor(iterations.current / 2)) return char;
                            } else if (revealDirection === "end") {
                                if (index > text.length - 1 - Math.floor(iterations.current / 2)) return char;
                            } else if (revealDirection === "center") {
                                const middle = Math.floor(text.length / 2);
                                const offset = Math.floor(iterations.current / 2);
                                if (index >= middle - offset && index <= middle + offset) return char;
                            }
                        }

                        return characters[Math.floor(Math.random() * characters.length)];
                    })
                    .join("")
            );

            if (sequential) {
                if (iterations.current >= text.length * 2 + maxIterations) {
                    clearInterval(intervalRef.current);
                    setDisplayText(text);
                }
            } else {
                if (iterations.current >= maxIterations) {
                    clearInterval(intervalRef.current);
                    setDisplayText(text);
                }
            }

            iterations.current += 1;
        }, speed);
    }, [text, speed, maxIterations, sequential, revealDirection, characters]);

    // Trigger animation
    useEffect(() => {
        if (animateOn === "view" && isScrolledIntoView) {
            animate();
        } else if (animateOn === "always") {
            animate();
        }
    }, [animateOn, isScrolledIntoView, animate]);

    // Interval animation
    useEffect(() => {
        if (!interval || interval <= 0) return;

        const timer = setInterval(() => {
            // Only animate if in view (when animateOn is view)
            if (animateOn === "view" && !isScrolledIntoView) return;
            animate();
        }, interval);

        return () => clearInterval(timer);
    }, [interval, animateOn, isScrolledIntoView, animate]);

    return (
        <span
            ref={containerRef}
            className={`inline-block whitespace-nowrap ${parentClassName}`}
            {...props}
        >
            <span className={className}>{displayText}</span>
        </span>
    );
}
