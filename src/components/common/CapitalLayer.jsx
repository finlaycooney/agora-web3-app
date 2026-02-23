"use client";

import { motion } from 'framer-motion';
import { Network, TrendingUp, Users } from 'lucide-react';

const CapitalLayer = () => {
    const cards = [
        {
            title: "VC Portco Support",
            description: "Acting as the talent engine for top-tier VCs, ensuring their portfolio companies hire the best early-stage builders.",
            icon: Network,
            gradient: "from-blue-500 to-purple-500"
        },
        {
            title: "Strategic Fundraising",
            description: "Bridging the gap between human and financial capital. We connect high-conviction teams with our strategic partners.",
            icon: TrendingUp,
            gradient: "from-emerald-500 to-cyan-500"
        },
        {
            title: "Ecosystem Advisory",
            description: "Providing strategy and team architecture consulting to ensure long-term scalability.",
            icon: Users,
            gradient: "from-orange-500 to-red-500"
        }
    ];

    return (
        <section className="w-full max-w-7xl mx-auto px-4 pt-10 pb-24 relative">

            {/* --- Signal Bridge Transition --- */}
            <div className="flex flex-col items-center justify-center mb-12">
                <div className="relative w-[1px] h-[100px] bg-gradient-to-b from-transparent via-emerald-400/30 to-transparent overflow-hidden">
                    <motion.div
                        className="absolute top-0 w-full h-[30px] bg-gradient-to-b from-transparent via-emerald-400 to-transparent shadow-[0_0_10px_rgba(52,211,153,0.8)]"
                        animate={{ top: ['-100%', '100%'] }}
                        transition={{
                            duration: 3,
                            repeat: Infinity,
                            ease: [0.77, 0, 0.175, 1], // Power4.inOut approx
                            repeatDelay: 1
                        }}
                    />
                </div>
            </div>

            {/* Section Background Gradient */}
            <div className="absolute inset-0 bg-gradient-to-b from-[#00244b00] via-[#00244b40] to-[#00244b00] pointer-events-none" />

            {/* Header with Halo */}
            <div className="mb-16 relative z-10 text-center">
                {/* Halo Background */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-[radial-gradient(circle,rgba(0,255,200,0.03)_0%,rgba(5,5,5,0)_70%)] pointer-events-none -z-10" />

                <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 font-outfit">Scaling infrastructure</h2>
                <p className="text-gray-400 max-w-2xl mx-auto text-lg">
                    We don't just place talent; we build the infrastructure for success.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
                {cards.map((card, index) => (
                    <div
                        key={index}
                        className="group relative rounded-2xl p-8 backdrop-blur-[25px] bg-white/[0.03] overflow-hidden hover:-translate-y-2 transition-transform duration-500"
                        style={{
                            boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
                            border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}
                    >
                        {/* Shimmer Border Light Effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-200%] animate-[shimmer_5s_infinite_linear] pointer-events-none" />

                        {/* Node Status Indicator */}
                        <div className="absolute top-6 right-6 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
                            <span className="font-mono text-[10px] text-emerald-400/80 tracking-wider">SIGNAL: LIVE</span>
                        </div>

                        <div className="relative z-10">
                            <div className="w-14 h-14 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-300">
                                {/* Gradient Icon */}
                                <svg width="0" height="0">
                                    <linearGradient id={`icon-gradient-${index}`} x1="100%" y1="100%" x2="0%" y2="0%">
                                        <stop stopColor="#10b981" offset="0%" />
                                        <stop stopColor="#06b6d4" offset="100%" />
                                    </linearGradient>
                                </svg>
                                <card.icon
                                    size={28}
                                    style={{ stroke: `url(#icon-gradient-${index})` }}
                                />
                            </div>

                            <h3 className="text-xl font-bold text-white mb-4 font-outfit">{card.title}</h3>
                            <p className="text-gray-400 text-sm leading-relaxed group-hover:text-gray-200 transition-colors">
                                {card.description}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
};

export default CapitalLayer;
