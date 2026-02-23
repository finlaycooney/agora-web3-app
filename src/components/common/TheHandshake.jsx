"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import FaultyTerminal from './FaultyTerminal';
import { useSession, signIn } from "next-auth/react";
import { track } from '@vercel/analytics';

const TheHandshake = () => {
    const { data: session, status } = useSession();

    return (
        <section className="relative w-full min-h-[600px] overflow-hidden bg-transparent text-white flex flex-col items-center justify-center py-20 px-4 md:px-8">

            {/* FaultyTerminal Background */}
            <div className="absolute inset-0 w-full h-full z-0 opacity-40 mix-blend-screen pointer-events-none">
                <FaultyTerminal
                    scale={1.5}
                    gridMul={[2, 1]}
                    digitSize={1}
                    timeScale={0.005}
                    pause={false}
                    scanlineIntensity={0.2}
                    glitchAmount={2}
                    flickerAmount={0.05}
                    noiseAmp={2}
                    chromaticAberration={0.05}
                    dither={0}
                    curvature={0}
                    tint="#a5f3fc" // Ice Blue to match theme
                    mouseReact={false}
                    pageLoadAnimation={false}
                    backgroundColor="transparent" // Allow section bg to show through
                    brightness={0.4}
                />
            </div>

            {/* Background Radar Pulse */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                {[0, 1, 2].map((i) => (
                    <motion.div
                        key={i}
                        className="absolute border border-emerald-500/10 rounded-full"
                        initial={{ width: '0%', height: '0%', opacity: 0.8 }}
                        animate={{
                            width: ['0%', '150%'],
                            height: ['0%', '150%'],
                            opacity: [0.5, 0],
                        }}
                        transition={{
                            duration: 4,
                            repeat: Infinity,
                            delay: i * 1.3,
                            ease: "linear",
                        }}
                    />
                ))}
            </div>



            <div className="relative z-10 w-full max-w-7xl mx-auto flex flex-col items-center space-y-16">

                {/* Header */}
                <div className="text-center space-y-6">
                    <h2 className="text-5xl md:text-7xl font-extrabold tracking-tighter font-outfit bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">
                        Initialize connection
                    </h2>
                    <p className="max-w-2xl mx-auto text-lg md:text-xl text-gray-400 font-light">
                        Whether you are a founder building the next primitive or an engineer with high-fidelity signal - synchronize with the layer.
                    </p>
                </div>

                {/* Network Status Dashboard */}
                <div className="w-full max-w-4xl mx-auto bg-white/[0.02] backdrop-blur-md border border-white/5 rounded-full px-8 py-4 flex flex-wrap justify-center md:justify-between items-center gap-6 md:gap-12">
                    <div className="flex items-center gap-3">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <span className="text-xs text-emerald-500 font-mono tracking-widest uppercase">Nodes_Placed: <span className="text-white font-bold ml-1">150+</span></span>
                    </div>
                    <div className="hidden md:block w-px h-4 bg-white/10" />
                    <div className="flex items-center gap-3">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <span className="text-xs text-emerald-500 font-mono tracking-widest uppercase">Network_Value: <span className="text-white font-bold ml-1">$2B+</span></span>
                    </div>
                    <div className="hidden md:block w-px h-4 bg-white/10" />
                    <div className="flex items-center gap-3">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <span className="text-xs text-emerald-500 font-mono tracking-widest uppercase">Signal_Indexed: <span className="text-white font-bold ml-1">10k+</span></span>
                    </div>
                </div>

                {/* The Two Nodes (Split CTA) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">

                    {/* Left Node: Founders */}
                    <div className="group relative p-10 rounded-3xl bg-gradient-to-br from-blue-950/30 to-transparent border border-blue-500/20 backdrop-blur-xl flex flex-col chat-bubble-left">
                        <div className="mb-6">
                            <h3 className="text-3xl font-bold text-white font-outfit mb-2">Access talent</h3>
                            <p className="text-blue-200/60 leading-relaxed">
                                Query the layer for elite engineering units and institutional support.
                            </p>
                        </div>
                        <a
                            href="https://t.me/fincooney"
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => track('Contact Clicked', { platform: 'Telegram' })}
                            className="mt-auto self-start bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 px-8 py-4 rounded-full font-mono text-sm tracking-widest uppercase transition-all duration-300 flex items-center gap-3 hover:shadow-[0_0_20px_rgba(6,182,212,0.5)] group-hover:px-10"
                        >
                            [ CONTACT_AGORA4 ] <ArrowRight size={16} />
                        </a>
                    </div>

                    {/* Right Node: Developers */}
                    <div className="group relative p-10 rounded-3xl bg-gradient-to-bl from-emerald-950/30 to-transparent border border-emerald-500/20 backdrop-blur-xl flex flex-col chat-bubble-right">
                        <div className="mb-6">
                            <h3 className="text-3xl font-bold text-white font-outfit mb-2">Sync signal</h3>
                            <p className="text-emerald-200/60 leading-relaxed">
                                Join the index and map your proof-of-work to high-conviction protocols.
                            </p>
                        </div>
                        <button
                            onClick={() => !session && signIn('github')}
                            disabled={status === 'loading' || status === 'authenticated'}
                            className="mt-auto self-start bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 px-8 py-4 rounded-full font-mono text-sm tracking-widest uppercase transition-all duration-300 flex items-center gap-3 hover:shadow-[0_0_20px_rgba(16,185,129,0.5)] group-hover:px-10 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            [ {status === 'loading' ? 'VERIFYING...' : status === 'authenticated' ? 'IDENTITY_SYNCED' : 'SYNC_GITHUB'} ] <ArrowRight size={16} />
                        </button>
                    </div>

                </div>

            </div>
        </section>
    );
};

export default TheHandshake;
