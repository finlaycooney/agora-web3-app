"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, ArrowRight } from 'lucide-react';

const ActiveNetworkQueries = () => {
    const queries = [
        {
            id: '0x7A',
            role: 'Infrastructure Lead',
            context: 'L1 Ecosystem',
            comp: '$220k - $350k + Equity'
        },
        {
            id: '0xBC',
            role: 'ZK-Proof Engineer',
            context: 'Stealth DeFi Primitive',
            comp: 'Verified Signal Required'
        },
        {
            id: '0xF2',
            role: 'Senior Rust Developer',
            context: 'Cross-Chain Security',
            comp: '40.8% Network Share'
        },
        {
            id: '0xDE',
            role: 'Protocol Architect',
            context: 'Tier 1 Foundation',
            comp: 'Direct Placement'
        }
    ];

    return (

        <section className="w-full bg-transparent py-24 relative overflow-hidden">
            <div className="max-w-7xl mx-auto px-4 relative z-10">
                {/* Header */}
                <div className="mb-12 text-center md:text-left">
                    <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest text-white font-outfit mb-3">
                        Active Network Queries
                    </h2>
                    <p className="text-gray-500 font-sans text-lg">
                        Real-time protocol demand and institutional engineering requirements.
                    </p>
                </div>

                {/* Terminal List Container */}
                <div className="bg-white/[0.02] backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden">
                    <div className="flex flex-col">
                        {queries.map((query, idx) => (
                            <motion.div
                                key={query.id}
                                initial={{ opacity: 0, x: -20 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.1, duration: 0.4 }}
                                viewport={{ once: true }}
                                className="group relative flex flex-col md:flex-row items-start md:items-center justify-between p-6 border-b border-white/5 last:border-0 hover:bg-teal-500/[0.05] transition-colors duration-300 cursor-default"
                            >
                                {/* Left Side: Prefix + ID + Role */}
                                <div className="flex items-center gap-4 md:gap-8 flex-1">
                                    <div className="flex items-center gap-3 min-w-[140px]">
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                        </span>
                                        <span className="font-mono text-emerald-500/80 text-sm tracking-wider">
                                            [QUERY: {query.id}]
                                        </span>
                                    </div>

                                    <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-8 font-mono text-sm md:text-base text-gray-300 group-hover:text-teal-200 transition-colors">
                                        <span className="font-bold">{query.role}</span>
                                        <span className="hidden md:block text-gray-700">|</span>
                                        <span className="text-gray-500 group-hover:text-teal-400/70 transition-colors">{query.context}</span>
                                        <span className="hidden md:block text-gray-700">|</span>
                                        <span className="text-gray-500 group-hover:text-teal-400/70 transition-colors">{query.comp}</span>
                                    </div>
                                </div>

                                {/* Right Side: Interaction */}
                                <div className="flex items-center gap-4 mt-4 md:mt-0 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-4 group-hover:translate-x-0">
                                    <span className="hidden md:inline-flex items-center text-xs font-mono text-teal-400 uppercase tracking-widest border border-teal-500/30 rounded px-3 py-1 bg-teal-500/10">
                                        VIEW_SIGNAL_REQUIREMENTS <ArrowRight size={12} className="ml-2" />
                                    </span>
                                    {/* Agora4 Verification Tick */}
                                    <CheckCircle2 className="text-cyan-300 fill-cyan-300/10 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]" size={24} />
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};

export default ActiveNetworkQueries;
