"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Github, Zap, GraduationCap, FileText, CheckCircle2 } from 'lucide-react';
import './FlowingHub.css';

const SOURCES = [
    { id: 'github', label: 'GitHub', icon: Github },
    { id: 'telegram', label: 'Telegram Alpha', icon: Zap },
    { id: 'universities', label: 'Elite Universities', icon: GraduationCap },
    { id: 'research', label: 'Substack/Research', icon: FileText },
];

const PROJECTS = [
    { id: 'p1', label: 'Project Alpha' },
    { id: 'p2', label: 'Project Beta' },
    { id: 'p3', label: 'Project Gamma' },
];

const useMobile = () => {
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);
    return isMobile;
};

const AnimatedBeam = ({ path, delay = 0, duration = 3, isTargeted = false, side }) => {
    const strokeWidth = side === 'left' ? (isTargeted ? 2.5 : 1.5) : (isTargeted ? 4 : 3);

    return (
        <motion.path
            d={path}
            fill="none"
            stroke={side === 'left' ? "url(#beam-gradient-left)" : "url(#beam-gradient-right)"}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            initial={{ pathLength: 0.1, pathOffset: -0.1, opacity: 0 }}
            animate={{
                pathOffset: 1.1,
                opacity: [0, 1, 1, 0]
            }}
            transition={{
                duration: duration,
                delay: delay,
                repeat: Infinity,
                ease: "linear",
            }}
            style={{
                filter: side === 'right'
                    ? 'drop-shadow(0 0 12px rgba(16, 185, 129, 0.6))'
                    : isTargeted ? 'drop-shadow(0 0 8px rgba(34, 211, 238, 0.6))' : 'none'
            }}
        />
    );
};

const Particle = ({ path, delay, isTargeted, onEnteringHub }) => {
    return (
        <motion.div
            style={{
                position: 'absolute',
                width: isTargeted ? 8 : 4,
                height: isTargeted ? 8 : 4,
                borderRadius: '50%',
                background: '#fff',
                offsetPath: `path("${path}")`,
                zIndex: 15,
            }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{
                opacity: [0, 1, 1, 0],
                scale: [0.5, 1, 1.2, 0.8],
                background: [
                    '#ffffff',
                    '#ffffff',
                    '#10b981',
                    '#06b6d4'
                ],
                offsetDistance: '100%',
            }}
            transition={{
                duration: 3,
                delay: delay,
                repeat: Infinity,
                ease: "linear"
            }}
            onUpdate={(latest) => {
                const dist = parseFloat(latest.offsetDistance);
                if (dist > 48 && dist < 52) {
                    onEnteringHub();
                }
            }}
        >
            <div className="particle-streak" style={{
                position: 'absolute',
                top: '50%',
                right: '100%',
                width: '30px',
                height: '2px',
                background: 'linear-gradient(to left, #10b981, transparent)',
                transform: 'translateY(-50%)',
                opacity: 0.6
            }} />
        </motion.div>
    );
};

const SourceNode = ({ node, index, total, onHover, isMobile }) => {
    const styleSource = isMobile
        ? { top: '10%', left: `${(index + 1) * (100 / (total + 1))}%` }
        : { top: `${(index + 1) * (100 / (total + 1))}%`, left: '10%' };

    return (
        <motion.div
            className="node-container source"
            style={styleSource}
            onMouseEnter={() => onHover(node.id)}
            onMouseLeave={() => onHover(null)}
            initial={{ opacity: 0, scale: 0.9, x: '-50%', y: -26 }}
            animate={{ opacity: 1, scale: 1, x: '-50%', y: -26 }}
            whileHover={{ scale: 1.05 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
            <div className="node-icon-box">
                <node.icon size={22} className="text-slate-400" />
            </div>
            <span className="node-label">{node.label}</span>
        </motion.div>
    );
};

const ProjectNode = ({ index, total, isMobile }) => {
    const styleProject = isMobile
        ? { bottom: '10%', left: `${(index + 1) * (100 / (total + 1))}%` }
        : { top: `${(index + 1) * (100 / (total + 1))}%`, right: '10%' };

    return (
        <motion.div
            className="node-container project"
            style={styleProject}
            initial={{ opacity: 1, scale: 0.9, x: isMobile ? '-50%' : '50%', y: isMobile ? 26 : -26 }}
            animate={{ opacity: 1, scale: 1, x: isMobile ? '-50%' : '50%', y: isMobile ? 26 : -26 }}
            whileHover={{ scale: 1.05 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
            <div className="node-icon-box" style={{ borderColor: 'rgba(16, 185, 129, 0.4)' }}>
                <CheckCircle2 size={22} className="text-emerald-400" />
            </div>
            <span className="node-label">Tier 1 Project</span>
        </motion.div>
    );
};

const FlowingHub = () => {
    const [hoveredSource, setHoveredSource] = useState(null);
    const [isFlashActive, setIsFlashActive] = useState(false);
    const isMobile = useMobile();

    const triggerFlash = () => {
        if (!isFlashActive) {
            setIsFlashActive(true);
            setTimeout(() => setIsFlashActive(false), 300);
        }
    };

    const generatePath = (side, index, total) => {
        const viewW = 1200;
        const viewH = isMobile ? 1000 : 600;
        const centerX = viewW / 2;
        const centerY = viewH / 2;
        const radius = 12;

        if (isMobile) {
            const startX = (index + 1) * (viewW / (total + 1));
            const startY = side === 'left' ? 100 : viewH - 100;
            const targetX = centerX;
            const targetY = centerY;
            const midY = (startY + targetY) / 2;

            if (side === 'left') {
                return `M ${startX} ${startY} 
                        L ${startX} ${midY - radius}
                        Q ${startX} ${midY} ${startX > targetX ? startX - radius : startX + radius} ${midY}
                        L ${targetX > startX ? targetX - radius : targetX + radius} ${midY}
                        Q ${targetX} ${midY} ${targetX} ${midY + radius}
                        L ${targetX} ${targetY}`;
            } else {
                return `M ${targetX} ${targetY} 
                        L ${targetX} ${midY - radius}
                        Q ${targetX} ${midY} ${startX > targetX ? targetX + radius : targetX - radius} ${midY}
                        L ${startX > targetX ? startX - radius : startX + radius} ${midY}
                        Q ${startX} ${midY} ${startX} ${midY + radius}
                        L ${startX} ${startY}`;
            }
        } else {
            const nodeTopPercent = (index + 1) / (total + 1);
            const startX = side === 'left' ? 120 : 1080;
            const startY = nodeTopPercent * viewH;

            if (side === 'left') {
                // Merge Logic: All input wires turn at a SHARED vertical spine
                const mergePointX = 400; // Common convergence point

                // Straight line if vertically aligned
                if (Math.abs(startY - centerY) < 5) {
                    return `M ${startX} ${startY} L ${centerX} ${centerY}`;
                }

                return `M ${startX} ${startY}
                        L ${mergePointX - radius} ${startY}
                        Q ${mergePointX} ${startY} ${mergePointX} ${startY > centerY ? startY - radius : startY + radius}
                        L ${mergePointX} ${centerY > startY ? centerY - radius : centerY + radius}
                        Q ${mergePointX} ${centerY} ${mergePointX + radius} ${centerY}
                        L ${centerX} ${centerY}`;
            } else {
                // Staggered hub exit point for Output wires
                const staggeredCenterY = centerY + (index - (total - 1) / 2) * 8;
                const hubX = centerX;
                const hubY = staggeredCenterY;
                const turnX = startX - (60 + index * 40);

                if (Math.abs(startY - hubY) < 5) {
                    return `M ${hubX} ${hubY} L ${startX} ${startY}`;
                }

                return `M ${hubX} ${hubY}
                        L ${turnX - radius} ${hubY}
                        Q ${turnX} ${hubY} ${turnX} ${hubY > startY ? hubY - radius : hubY + radius}
                        L ${turnX} ${startY > hubY ? startY - radius : startY + radius}
                        Q ${turnX} ${startY} ${turnX + radius} ${startY}
                        L ${startX} ${startY}`;
            }
        }
    };

    return (
        <section className="flowing-hub-section">
            <div className="text-center px-4 max-w-5xl mx-auto mb-16 mt-10">
                <h2 className="section-heading mb-6">
                    Transforming raw signal into Tier 1 infrastructure
                </h2>
                <p className="text-gray-400 text-lg md:text-xl leading-relaxed mx-auto max-w-4xl font-sans">
                    The gap between elite engineering talent and the world's most ambitious projects is no longer a search problem—it's a trust problem. agora4 acts as the high-fidelity filter, sourcing from non-obvious alpha channels like Telegram Research groups and GitHub's top 0.1%. We don't just find talent; we integrate it into the projects that define the next decade of digital infrastructure.
                </p>
            </div>

            <div className="flowing-hub-container">
                <div className="hub-wrapper">
                    <div className="hub-outer-glow" />
                    <motion.div
                        className="hub-ring"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
                    />
                    <div className="hub-main overflow-hidden">
                        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 mix-blend-overlay pointer-events-none"></div>
                        <img src="/agora4logo.webp" alt="Agora4" className="hub-image" />
                        <AnimatePresence>
                            {isFlashActive && (
                                <motion.div
                                    className="hub-flash"
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 0.5, scale: 1.4 }}
                                    exit={{ opacity: 0, scale: 1.8 }}
                                    transition={{ duration: 0.4 }}
                                />
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                <div className="source-nodes">
                    {SOURCES.map((node, i) => (
                        <SourceNode
                            key={node.id}
                            node={node}
                            index={i}
                            total={SOURCES.length}
                            onHover={setHoveredSource}
                            isMobile={isMobile}
                        />
                    ))}
                </div>

                <div className="output-nodes">
                    {PROJECTS.map((node, i) => (
                        <ProjectNode key={node.id} index={i} total={PROJECTS.length} isMobile={isMobile} />
                    ))}
                </div>

                <svg
                    className="svg-layer"
                    viewBox={`0 0 1200 ${isMobile ? 1000 : 600}`}
                    preserveAspectRatio="none"
                >
                    <defs>
                        <linearGradient id="beam-gradient-left" gradientUnits="userSpaceOnUse">
                            <stop offset="0%" stopColor="#94a3b8" stopOpacity="0" />
                            <stop offset="50%" stopColor="#22d3ee" stopOpacity="1" />
                            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
                        </linearGradient>
                        <linearGradient id="beam-gradient-right" gradientUnits="userSpaceOnUse">
                            <stop offset="0%" stopColor="#10b981" stopOpacity="0" />
                            <stop offset="50%" stopColor="#10b981" stopOpacity="1" />
                            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
                        </linearGradient>
                    </defs>

                    {SOURCES.map((node, i) => {
                        const path = generatePath('left', i, SOURCES.length);
                        return (
                            <React.Fragment key={`flow-left-${node.id}`}>
                                <path
                                    d={path}
                                    className={`flow-path input ${hoveredSource === node.id ? 'highlighted' : ''}`}
                                />
                                <path
                                    d={path}
                                    className="crawling-path"
                                    style={{ stroke: 'rgba(148, 163, 184, 0.2)', animationDelay: `${i * 0.5}s` }}
                                />
                                <AnimatedBeam
                                    path={path}
                                    delay={i * 0.5}
                                    duration={2.5}
                                    isTargeted={hoveredSource === node.id}
                                    side="left"
                                />
                                {[0].map((delay) => (
                                    <Particle
                                        key={`p-left-${node.id}-${delay}`}
                                        path={path}
                                        delay={delay + (i * 1.5)}
                                        isTargeted={hoveredSource === node.id}
                                        onEnteringHub={triggerFlash}
                                    />
                                ))}
                            </React.Fragment>
                        );
                    })}

                    {PROJECTS.map((node, i) => {
                        const path = generatePath('right', i, PROJECTS.length);
                        const baseDelay = 1.8;
                        return (
                            <React.Fragment key={`flow-right-${node.id}`}>
                                <path
                                    d={path}
                                    className="flow-path output"
                                />
                                <path
                                    d={path}
                                    className="crawling-path"
                                    style={{ stroke: 'rgba(16, 185, 129, 0.2)', animationDelay: `${i * 1.2}s` }}
                                />
                                <AnimatedBeam
                                    path={path}
                                    delay={baseDelay + (i * 0.8)}
                                    duration={3.5}
                                    side="right"
                                />
                                {[0].map((delay) => (
                                    <motion.div
                                        key={`p-right-${node.id}-${delay}`}
                                        style={{
                                            position: 'absolute',
                                            width: 14,
                                            height: 14,
                                            offsetPath: `path("${path}")`,
                                            zIndex: 15,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                        initial={{ opacity: 0 }}
                                        animate={{
                                            opacity: [0, 1, 1, 0],
                                            offsetDistance: ['0%', '100%'],
                                        }}
                                        transition={{
                                            duration: 1.5,
                                            delay: baseDelay + (i * 1.2),
                                            repeat: Infinity,
                                            ease: "linear"
                                        }}
                                    >
                                        <div className="bg-emerald-500 rounded-full p-1 shadow-lg shadow-emerald-500/50">
                                            <CheckCircle2 size={10} className="text-white" />
                                        </div>
                                    </motion.div>
                                ))}
                            </React.Fragment>
                        );
                    })}
                </svg>
            </div>
        </section>
    );
};

export default FlowingHub;
