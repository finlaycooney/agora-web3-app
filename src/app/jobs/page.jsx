"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { JOBS } from '../../data/jobs';
import DecryptedText from '../../components/magicui/DecryptedText';
import { motion, AnimatePresence } from 'framer-motion';
import { Briefcase, MapPin, DollarSign, ArrowRight, Zap } from 'lucide-react';
import Beams from '@/components/common/Beams';
import SignalSubmissionModal from '@/components/common/SignalSubmissionModal';
import JobDetailModal from '@/components/common/JobDetailModal';

const JobsBoard = () => {
    const [mounted, setMounted] = useState(false);
    const [selectedJob, setSelectedJob] = useState(null);
    const [expandedJob, setExpandedJob] = useState(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    return (
        <main className="min-h-screen text-white p-8 pt-24 font-outfit relative overflow-hidden bg-[#00244b]">
            {/* Global Ripple Background */}
            <div className="fixed inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#006d9630] via-[#00244b] to-[#00244b] pointer-events-none -z-50" />
            <div className="fixed inset-0 bg-[radial-gradient(800px_circle_at_top_center,_#67bed915,_transparent)] pointer-events-none -z-50" />
            <div className="fixed inset-0 bg-[radial-gradient(800px_circle_at_bottom_center,_#67bed915,_transparent)] pointer-events-none -z-50" />

            {/* Beams Background - Customized for Jobs Page */}
            <div className="absolute inset-0 w-full h-full z-0 [mask-image:linear-gradient(to_bottom,black_20%,transparent_100%)] pointer-events-none">
                <Beams
                    beamWidth={3}
                    beamNumber={8}
                    lightColor="#00244b" // Emerald tint for growth/hiring
                    speed={0.2}
                    noiseIntensity={1.5}
                    rotation={45}
                    beamHeight={15}
                    scale={1}
                />
            </div>

            {/* Header */}
            <div className="max-w-6xl mx-auto mb-16 text-center relative z-10">
                <h1 className="font-outfit text-5xl md:text-7xl font-extrabold mb-6 tracking-tight leading-[1.1]">
                    {mounted ? (
                        <DecryptedText
                            text="Open Positions"
                            animateOn="view"
                            speed={80}
                            className="text-white"
                        />
                    ) : (
                        <span className="text-white">
                            Open Positions
                        </span>
                    )}
                </h1>
                <p className="font-outfit text-blue-100/80 text-lg md:text-xl font-medium max-w-2xl mx-auto">
                    Advance your career. Browse top openings from industry-leading web3 projects today.

                </p>
                <DecryptedText
                    text="[ OPEN_POSITIONS ]"
                    animateOn="view"
                    speed={80}
                    className="text-cyan-400 block mt-4 font-mono text-sm tracking-widest"
                />
            </div>

            {/* The Bento Grid using imported JOBS data */}
            <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
                <AnimatePresence>
                    {mounted && JOBS.map((job, index) => (
                        <motion.div
                            key={job.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            className={`
                                ${job.className} 
                                bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-3xl p-8 
                                hover:border-cyan-500/30 hover:bg-white/[0.05] hover:shadow-[0_0_30px_rgba(103,232,249,0.1)]
                                transition-all duration-500 group relative overflow-hidden flex flex-col
                            `}
                        >
                            {/* Decorative Glow */}
                            <div className="absolute -right-16 -top-16 w-32 h-32 bg-cyan-500/10 blur-3xl group-hover:bg-cyan-500/20 transition-all duration-700" />

                            {/* Job Header */}
                            <div className="flex justify-between items-start mb-6 relative z-10">
                                <div className="space-y-2">
                                    <div className="flex items-center space-x-2 text-cyan-400">
                                        <Briefcase size={16} />
                                        <span className="text-xs font-mono uppercase tracking-wider">{job.type}</span>
                                    </div>
                                    <h3 className="text-2xl font-bold text-white group-hover:text-cyan-300 transition-colors leading-tight">
                                        {job.title}
                                    </h3>
                                </div>
                                <div className="bg-white/5 p-2 rounded-xl border border-white/10 group-hover:scale-110 group-hover:bg-cyan-500/20 transition-all duration-300">
                                    <Zap size={20} className="text-cyan-400" />
                                </div>
                            </div>

                            {/* Metadata */}
                            <div className="grid grid-cols-2 gap-4 mb-8 relative z-10">
                                <div className="flex items-center space-x-2 text-gray-400 font-mono text-xs">
                                    <MapPin size={14} className="text-gray-500 group-hover:text-cyan-400/70 transition-colors" />
                                    <span>{job.location}</span>
                                </div>
                                <div className="flex items-center space-x-2 text-gray-400 font-mono text-xs">
                                    <DollarSign size={14} className="text-gray-500 group-hover:text-cyan-400/70 transition-colors" />
                                    <span>{job.salary}</span>
                                </div>
                            </div>

                            {/* Description */}
                            <p className="text-gray-400 mb-8 line-clamp-3 leading-relaxed text-sm font-light relative z-10 flex-grow">
                                {job.description}
                            </p>

                            {/* Footer: Tags & Apply Button */}
                            <div className="flex flex-col items-start gap-4 mt-auto relative z-10 w-full">
                                <div className="flex flex-wrap gap-2">
                                    {job.tags.slice(0, 3).map(tag => (
                                        <span key={tag} className="text-[10px] font-mono text-cyan-200/60 bg-white/5 border border-white/10 px-2 py-1 rounded-md uppercase tracking-tighter hover:border-cyan-500/30 transition-colors">
                                            #{tag}
                                        </span>
                                    ))}
                                </div>

                                <div className="flex items-center justify-between w-full">
                                    <button
                                        onClick={() => setSelectedJob(job)}
                                        className="font-mono text-xs text-white px-6 py-2.5 bg-white/[0.05] border border-white/10 rounded backdrop-blur-md hover:bg-white/10 hover:border-cyan-500/50 transition-all duration-300 group/btn flex items-center gap-2 cursor-pointer"
                                    >
                                        <span>[ <span className="text-cyan-400 group-hover/btn:text-cyan-300">APPLY</span> ]</span>
                                    </button>

                                    <button
                                        onClick={() => setExpandedJob(job)}
                                        className="group/link flex items-center text-white font-semibold hover:text-cyan-300 transition-colors text-sm"
                                    >
                                        Learn more
                                        <ArrowRight size={16} className="ml-2 group-hover/link:translate-x-1 transition-transform" />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
            {/* Modal */}
            <SignalSubmissionModal
                isOpen={!!selectedJob}
                onClose={() => setSelectedJob(null)}
                jobTitle={selectedJob?.title}
            />
            {/* Job Details Modal */}
            <JobDetailModal
                job={expandedJob}
                isOpen={!!expandedJob}
                onClose={() => setExpandedJob(null)}
                onApply={(job) => {
                    setExpandedJob(null);
                    setTimeout(() => setSelectedJob(job), 200); // Small delay for smooth transition
                }}
            />
        </main >
    );
};

export default JobsBoard;