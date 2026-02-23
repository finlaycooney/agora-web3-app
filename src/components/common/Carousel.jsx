"use client";

import { useEffect, useState, useRef } from 'react';
import { motion, useMotionValue, useTransform } from 'motion/react';
// replace icons with your own if needed
import { FiCircle, FiCode, FiFileText, FiLayers, FiLayout } from 'react-icons/fi';

import './Carousel.css';

const DEFAULT_ITEMS = [
    {
        title: <p>Q. What kind of companies do you work with?</p>,
        description: <p>A. We partner with a curated portfolio of high-quality, well-funded companies, including: High-Growth Startups, Established Protocols, Web2 Innovators and funds that back the best in the business.</p>,
        id: 1,
        icon: <FiFileText className="carousel-icon" />
    },
    {
        title: <p>Q. Im a Web2 developer (e.g., React, Python, Go). How can my skills transfer to Web3?</p>,
        description: <p>A. Your Web2 skills are the engine room of Web3. React developers build the dApps and wallets, while Python, Rust and Go engineers build the critical off-chain infrastructure and APIs. You genuinely have 90% of the skills needed, and we're here to help you bridge that last 10% gap.</p>,
        id: 2,
        icon: <FiCircle className="carousel-icon" />
    },
    {
        title: <p>Q. How do you technically validate a candidate's real-world engineering skills?</p>,
        description: <p>A. We go far beyond resumes. Our team has a technical background, so we conduct in-depth screenings covering real-world system design and past architectural challenges. We'd rather send you one perfectly-calibrated, technically solid candidate than five "maybes," saving your team's valuable time.</p>,
        id: 3,
        icon: <FiLayers className="carousel-icon" />
    },
    {
        title: <p>Q. What technologies and role specialisms do you actually cover?</p>,
        description: <p>A. We are specialists, not generalists. We focus on three core areas: Artificial Intelligence & ML (MLOps, AI Research, LLMs), Blockchain & Web3 (Protocol Engineers, Smart Contracts, Security), and the intersection of DeFi & TradFi (HFT, HPC, Low Latency).</p>,
        id: 4,
        icon: <FiLayout className="carousel-icon" />
    },
    {
        title: <p>Q. I get plenty of recruiter spam. Why use you instead of just applying directly?</p>,
        description: <p>A. Applying directly is like throwing your resume into a black hole—it gets fed into an Applicant Tracking System and filtered by keywords. We don't do that. We have long-standing, direct relationships with the actual engineering leaders and founders, so we bypass the HR queue and get your profile straight to the person who makes the decision. We also handle the awkward salary talk, so you can focus on what matters.</p>,
        id: 5,
        icon: <FiCode className="carousel-icon" />
    }
];

const DRAG_BUFFER = 0;
const VELOCITY_THRESHOLD = 500;
const GAP = 16;
const SPRING_OPTIONS = { type: 'spring', stiffness: 300, damping: 30 };

export default function Carousel({
    items = DEFAULT_ITEMS,
    autoplay = false,
    autoplayDelay = 3000,
    pauseOnHover = false,
    loop = false,
    round = false
}) {
    const containerRef = useRef(null);
    const [containerWidth, setContainerWidth] = useState(0);

    // Measure the container width dynamically
    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver(entries => {
            for (let entry of entries) {
                setContainerWidth(entry.contentRect.width);
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    // If width not known yet, don't render (avoids NaN)
    const safeWidth = containerWidth || window.innerWidth || 300;
    const containerPadding = 16;
    const itemWidth = safeWidth - containerPadding * 2;
    const trackItemOffset = itemWidth + GAP;

    // Now that we have containerWidth, we can safely use it
    const carouselItems = loop ? [...items, items[0]] : items;
    const [currentIndex, setCurrentIndex] = useState(0);
    const x = useMotionValue(0);
    const [isHovered, setIsHovered] = useState(false);
    const [isResetting, setIsResetting] = useState(false);

    useEffect(() => {
        if (pauseOnHover && containerRef.current) {
            const container = containerRef.current;
            const handleMouseEnter = () => setIsHovered(true);
            const handleMouseLeave = () => setIsHovered(false);
            container.addEventListener('mouseenter', handleMouseEnter);
            container.addEventListener('mouseleave', handleMouseLeave);
            return () => {
                container.removeEventListener('mouseenter', handleMouseEnter);
                container.removeEventListener('mouseleave', handleMouseLeave);
            };
        }
    }, [pauseOnHover]);


    useEffect(() => {
        if (autoplay && (!pauseOnHover || !isHovered)) {
            const timer = setInterval(() => {
                setCurrentIndex(prev => {
                    if (prev === items.length - 1 && loop) {
                        return prev + 1;
                    }
                    if (prev === carouselItems.length - 1) {
                        return loop ? 0 : prev;
                    }
                    return prev + 1;
                });
            }, autoplayDelay);
            return () => clearInterval(timer);
        }
    }, [autoplay, autoplayDelay, isHovered, loop, items.length, carouselItems.length, pauseOnHover]);

    const effectiveTransition = isResetting ? { duration: 0 } : SPRING_OPTIONS;

    const handleAnimationComplete = () => {
        if (loop && currentIndex === carouselItems.length - 1) {
            setIsResetting(true);
            x.set(0);
            setCurrentIndex(0);
            setTimeout(() => setIsResetting(false), 50);
        }
    };

    const handleDragEnd = (_, info) => {
        const offset = info.offset.x;
        const velocity = info.velocity.x;
        if (offset < -DRAG_BUFFER || velocity < -VELOCITY_THRESHOLD) {
            if (loop && currentIndex === items.length - 1) {
                setCurrentIndex(currentIndex + 1);
            } else {
                setCurrentIndex(prev => Math.min(prev + 1, carouselItems.length - 1));
            }
        } else if (offset > DRAG_BUFFER || velocity > VELOCITY_THRESHOLD) {
            if (loop && currentIndex === 0) {
                setCurrentIndex(items.length - 1);
            } else {
                setCurrentIndex(prev => Math.max(prev - 1, 0));
            }
        }
    };

    const dragProps = loop
        ? {}
        : {
            dragConstraints: {
                left: -trackItemOffset * (carouselItems.length - 1),
                right: 0
            }
        };

    return (
        <div
            ref={containerRef}
            className={`carousel-container ${round ? 'round' : ''}`}
            style={{
                // width: `${baseWidth}px`, //comment this out to increase width - have text on the left talking avout testimonials and how proud we are to work with people and client satisfaction 
                ...(round && { height: `${safeWidth}px`, borderRadius: '50%' }) // then have the carsel as a square on the right 
            }}
        >
            <motion.div
                className="carousel-track"
                drag="x"
                {...dragProps}
                style={{
                    width: itemWidth,
                    gap: `${GAP}px`,
                    perspective: 1000,
                    perspectiveOrigin: `${currentIndex * trackItemOffset + itemWidth / 2}px 50%`,
                    x
                }}
                onDragEnd={handleDragEnd}
                animate={{ x: -(currentIndex * trackItemOffset) }}
                transition={effectiveTransition}
                onAnimationComplete={handleAnimationComplete}
            >
                {carouselItems.map((item, index) => {
                    const range = [-(index + 1) * trackItemOffset, -index * trackItemOffset, -(index - 1) * trackItemOffset];
                    const outputRange = [90, 0, -90];
                    // eslint-disable-next-line react-hooks/rules-of-hooks
                    const rotateY = useTransform(x, range, outputRange, { clamp: false });
                    return (
                        <motion.div
                            key={index}
                            className={`carousel-item ${round ? 'round' : ''}`}
                            style={{
                                width: itemWidth,
                                height: round ? itemWidth : '100%',
                                rotateY: rotateY,
                                ...(round && { borderRadius: '50%' })
                            }}
                            transition={effectiveTransition}
                        >
                            <div className={`carousel-item-header ${round ? 'round' : ''}`}>
                                <span className="carousel-icon-container">{item.icon}</span>
                            </div>
                            <div className="carousel-item-content">
                                <div className="carousel-item-title">{item.title}</div>
                                <p className="carousel-item-description">{item.description}</p>
                            </div>
                        </motion.div>
                    );
                })}
            </motion.div>
            <div className={`carousel-indicators-container ${round ? 'round' : ''}`}>
                <div className="carousel-indicators">
                    {items.map((_, index) => (
                        <motion.div
                            key={index}
                            className={`carousel-indicator ${currentIndex % items.length === index ? 'active' : 'inactive'}`}
                            animate={{
                                scale: currentIndex % items.length === index ? 1.2 : 1
                            }}
                            onClick={() => setCurrentIndex(index)}
                            transition={{ duration: 0.15 }}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}