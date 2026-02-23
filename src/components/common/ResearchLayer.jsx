"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { FileText, ArrowRight, CheckCircle2 } from 'lucide-react';

const ResearchLayer = () => {
    const reports = [
        {
            title: "DeFi Vaults and the Recent Surge in Activity",
            subtext: "Stablecoins have crossed the $300 billion mark. Now, curated DeFi vaults are providing the transparent, high-yield infrastructure that traditional finance can no longer ignore.",
            url: "https://medium.com/@agora4xyz/agora-explorer-defi-vaults-and-the-recent-surge-in-activity-d3f14930fad1"
        },
        {
            title: "How Institutions Adopting Crypto is Changing the Hiring Landscape",
            subtext: "As Vanguard and other TradFi dinosaurs pivot toward crypto ETFs, the real battle isn't just for market share—it’s for talent. Discover how the bridge between Wall Street and Web3 is rewriting the corporate playbook and forcing a total rethink of institutional culture.",
            url: "https://medium.com/@agora4xyz/agora-explorer-more-etfs-dinosaurs-less-nfts-crypto-bros-how-institutions-adopting-crypto-1f93de767e2a"
        },
        {
            title: "H1 2025 Fundraising and Investment Trends",
            subtext: "Despite a multi-year low in deal count, the first half of 2025 was the strongest for Web3 fundraising since 2022. Explore the data behind the infrastructure boom and the rise of late-stage conviction capital.",
            url: "https://medium.com/@agora4xyz/h1-2025-fundraising-and-investment-trends-1aedf9a9b2dd"
        }
    ];

    return (
        <section className="w-full max-w-7xl mx-auto px-4 py-24">
            {/* Header */}
            <div className="mb-16">
                <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 font-outfit tracking-tight">Our research</h2>
                <p className="text-gray-400/80 font-sans text-lg max-w-2xl">High-fidelity data on the state of Web3 human capital.</p>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {reports.map((report, idx) => (
                    <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: idx * 0.1, duration: 0.5 }}
                        className="group relative p-8 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-[25px] hover:border-white/20 transition-all duration-300 flex flex-col justify-between h-full hover:shadow-[0_0_30px_rgba(0,0,0,0.5)]"
                    >
                        {/* Tag */}
                        <div className="flex items-center gap-2 mb-6">
                            <CheckCircle2 className="text-emerald-400 group-hover:drop-shadow-[0_0_8px_rgba(52,211,153,0.8)] transition-all duration-300" size={16} />
                            <span className="text-xs font-mono text-emerald-400/80 uppercase tracking-wider">Intelligence Report</span>
                        </div>

                        {/* Content */}
                        <div className="flex-grow">
                            <div className="absolute top-8 right-8 text-white/20 group-hover:text-white/40 transition-colors">
                                <FileText size={24} />
                            </div>

                            <h3 className="text-xl font-bold text-white mb-4 font-outfit leading-tight pr-8">{report.title}</h3>
                            <p className="text-gray-400 text-sm leading-relaxed mb-8">{report.subtext}</p>
                        </div>

                        {/* CTA */}
                        <a
                            href={report.url || "#"}
                            target={report.url ? "_blank" : "_self"}
                            rel={report.url ? "noopener noreferrer" : ""}
                            className="flex items-center text-xs font-mono text-white/60 group-hover:text-white transition-colors uppercase tracking-widest mt-auto"
                        >
                            READ_REPORT
                            <ArrowRight size={14} className="ml-2 group-hover:translate-x-1 transition-transform" />
                        </a>
                    </motion.div>
                ))}
            </div>
        </section>
    );
};

export default ResearchLayer;
