"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Github, Shield, Radio, Layers, CheckCircle2 } from 'lucide-react';
import DecryptedText from '../magicui/DecryptedText';

const TalentPortal = () => {
    // Generate static hex codes for the ring
    const hexCodes = Array.from({ length: 12 }).map((_, i) =>
        `0x${Math.floor(Math.random() * 16777215).toString(16).toUpperCase().padStart(6, '0').slice(0, 4)}...`
    );

    const features = [
        {
            title: "Selective stealth mode",
            description: "Retain full privacy. Your identity is only surfaced to high-conviction teams with your permission."
        },
        {
            title: "Open source discovery",
            description: "Map your proof-of-work directly to core engineering roles at Tier 1 projects."
        },
        {
            title: "Proof-of-work verification",
            description: "Skip the resume fluff. Our index authenticate your identity and qualificationswith your GitHub and technical contributions."
        }

    ];

    return (
        <section className="w-full max-w-7xl mx-auto px-4 py-24 relative overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

                {/* LEFT SIDE: Scanning Identity Animation */}
                <div className="relative h-[400px] flex items-center justify-center">
                    {/* Background Pulse/Glow */}
                    <motion.div
                        className="absolute inset-0 bg-emerald-500/10 blur-[100px] rounded-full"
                        animate={{
                            opacity: [0.2, 0.5, 0.2],
                            scale: [0.8, 1.2, 0.8]
                        }}
                        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    />

                    {/* Central Scanning Hub */}
                    <div className="relative z-10 w-80 h-80 flex items-center justify-center">

                        {/* Radar/Sonar Rings */}
                        {[0, 1, 2].map((i) => (
                            <motion.div
                                key={i}
                                className="absolute border border-blue-400/20 rounded-full"
                                initial={{ width: 100, height: 100, opacity: 0.8 }}
                                animate={{
                                    width: [100, 320],
                                    height: [100, 320],
                                    opacity: [0.8, 0],
                                }}
                                transition={{
                                    duration: 3,
                                    repeat: Infinity,
                                    delay: i * 1,
                                    ease: "easeOut",
                                }}
                            />
                        ))}

                        {/* Hex Code Ring */}
                        <motion.div
                            className="absolute w-64 h-64 rounded-full flex items-center justify-center"
                            animate={{ rotate: 360 }}
                            transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
                        >
                            {hexCodes.map((code, i) => (
                                <div
                                    key={i}
                                    className="absolute text-[10px] font-mono text-blue-300/40"
                                    style={{
                                        transform: `rotate(${i * 30}deg) translateY(-120px)`,
                                    }}
                                >
                                    {code}
                                </div>
                            ))}
                        </motion.div>

                        {/* Main Interaction Circle */}
                        <div className="relative w-32 h-32 bg-blue-950/50 backdrop-blur-md rounded-full border border-blue-400/30 flex items-center justify-center overflow-hidden">
                            {/* Rotating Scan Line */}
                            <motion.div
                                className="absolute inset-0 bg-gradient-to-br from-transparent via-blue-500/10 to-transparent"
                                animate={{ rotate: 360 }}
                                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                            />
                            <div className="absolute inset-0 border-t border-blue-400/50 rounded-full animate-spin-slow" />
                        </div>

                        {/* Central Icons */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <motion.div
                                animate={{ y: [-5, 5, -5] }}
                                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                                className="filter drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]"
                            >
                                <Github size={40} className="text-white" />
                            </motion.div>
                            <motion.div
                                className="absolute -right-8 -bottom-4 filter drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                                animate={{ x: [-3, 3, -3] }}
                                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                            >
                                <Shield size={24} className="text-emerald-400" />
                            </motion.div>
                            <motion.div
                                className="absolute -left-6 -top-4 filter drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                                animate={{ scale: [1, 1.1, 1] }}
                                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                            >
                                <Radio size={20} className="text-cyan-400" />
                            </motion.div>
                        </div>

                        {/* Status Text */}
                        <div className="absolute top-[-30px] font-mono text-[10px] text-emerald-400 tracking-widest flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                            SIGNAL_ACQUIRED
                        </div>
                    </div>
                </div>

                {/* RIGHT SIDE: Copy & CTA */}
                <div className="flex flex-col items-start space-y-8 z-10">
                    <div className="flex items-center space-x-2 text-cyan-300 font-mono text-xs md:text-sm tracking-widest uppercase font-semibold">
                        <Layers size={16} className="text-cyan-300 fill-cyan-300/10" />
                        <DecryptedText
                            text="Join the talent layer"
                            animateOn="view"
                            revealDirection="center"
                            speed={100}
                            className="text-cyan-300"
                        />
                    </div>

                    <h2 className="text-5xl md:text-6xl font-bold text-white leading-[1.1] font-outfit">
                        Sync your signal
                    </h2>

                    <ul className="space-y-5">
                        {features.map((feature, index) => (
                            <li key={index} className="flex items-start text-sm md:text-base leading-relaxed group">
                                <CheckCircle2 className="text-cyan-300 mt-1 mr-3 flex-shrink-0 fill-cyan-300/10 group-hover:scale-110 transition-transform" size={18} />
                                <span className="text-gray-400">
                                    <strong className="text-gray-200 font-semibold">{feature.title} — </strong>
                                    {feature.description}
                                </span>
                            </li>
                        ))}
                    </ul>

                    <button className="relative group overflow-hidden rounded-full p-[1px] focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-900 transition-all hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] mt-4">
                        <span className="absolute inset-[-1000%] animate-[spin_2s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#10b981_0%,#06b6d4_50%,#10b981_100%)]" />
                        <span className="inline-flex h-full w-full cursor-pointer items-center justify-center rounded-full bg-slate-950/90 px-8 py-4 text-sm font-bold text-white backdrop-blur-3xl transition-all group-hover:bg-slate-950/70 font-outfit tracking-wide">
                            <Github className="mr-2 h-5 w-5 group-hover:text-emerald-400 transition-colors" />
                            Sync GitHub Identity
                        </span>
                    </button>
                </div>
            </div>
        </section>
    );
};

export default TalentPortal;
