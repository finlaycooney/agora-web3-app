"use client";

import React, { useState, useEffect } from 'react';
import {
    CheckCircle2,
    ArrowRight,
    Scroll,
    Send,
    Briefcase,
    Image as ImageIcon,
    Radio,
    Zap
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import DecryptedText from '../magicui/DecryptedText';

// --- UTILITY ---
function cn(...inputs) {
    return twMerge(clsx(inputs));
}

// --- STATIC CONFIGURATION ---
const INITIAL_COUNT = 100;

const FEATURES = [
    "Technical Expertise — we’ve been in the space since 2019 and have built bleeding edge teams working on the worlds hardest problems",
    "Lighting Fast Delivery — recieve vetted candidates moments after contact",
    "Working through uncertainty — we know things can change quickly and we're here to adapt with you",
];

// --- SIMULATION DATA GENERATORS ---
const EVENT_TYPES = [
    {
        type: 'transfer',
        subtitle: 'RESUME UPLOAD',
        icon: <Scroll className="text-cyan-400" size={20} />,
        templates: [
            { title: 'George just uploaded his resume', extra: '�' },
            { title: 'Anna just uploaded her resume', extra: '📝' },
            { title: 'Kosta just uploaded his resume', extra: '👨‍💻' }
        ]
    },
    {
        type: 'swap',
        subtitle: 'NEW APPLICATION',
        icon: <Send className="text-blue-400" size={20} />,
        templates: [
            { title: 'Michael just applied for Senior Rust Dev', extraIcons: ['🦀'] },
            { title: 'Sarah applied for Solidity Engineer', extraIcons: ['⛓️'] },
            { title: 'David applied for Frontend Lead', extraIcons: ['⚛️'] },
            { title: 'Selwyn just applied for Senior Protocol Engineer', extraIcons: ['🔧'] },
            { title: 'James applied for Lead Security Engineer', extraIcons: ['🛡️'] },
            { title: 'Nick applied for Frontend Lead', extraIcons: ['🎨'] }
        ]
    },
    {
        type: 'nft',
        subtitle: 'OFFER ACCEPTED',
        icon: <Briefcase className="text-green-500" size={20} />,
        templates: [
            { title: 'Alex accepted an offer at [REDACTED]', extraIcons: '🎉' },
            { title: 'Maria joined [REDACTED]', extraIcons: '🍾' },
            { title: 'James is now working at [REDACTED]', extraIcons: '🎉' }
        ]
    }
];

import CountUp from '../magicui/CountUp';
import { AnimatedList, AnimatedListItem } from '../magicui/animated-list';

const LaserStreamSection = () => {
    const [mounted, setMounted] = useState(false);
    // Initial state to ensure the list isn't empty on first render
    const [events, setEvents] = useState([
        {
            id: 'init-1',
            title: 'Anna just applied for the Rust role',
            subtitle: 'APPLICATION',
            time: 'Just now',
            icon: EVENT_TYPES[0].icon,
            extraIcon: '🔥'
        },
        {
            id: 'init-2',
            title: 'A React Engineer just applied for..',
            subtitle: 'APPLICATION',
            time: 'Just now',
            icon: EVENT_TYPES[1].icon,
            extraIcons: ['💲', '🅿️']
        },
        {
            id: 'init-3',
            title: 'George just uploaded his resume',
            subtitle: 'RESUME UPLOAD',
            time: 'Just now',
            icon: EVENT_TYPES[0].icon,
            extraIcon: ''
        },
        {
            id: 'init-4',
            title: 'Frontend Lead role filled',
            subtitle: 'OFFER ACCEPTED',
            time: 'Just now',
            icon: EVENT_TYPES[2].icon,
            extraIcons: ['👨‍💻']
        },
        {
            id: 'init-5',
            title: 'Maria just uploaded her resume',
            subtitle: 'RESUME UPLOAD',
            time: 'Just now',
            icon: EVENT_TYPES[0].icon,
            extraIcon: ''
        }
    ]);

    // --- SIMULATION ENGINE ---
    useEffect(() => {
        setMounted(true);
        // Event Stream: Injects a new random event every 2.5s
        const eventInterval = setInterval(() => {
            const randomType = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
            const randomTemplate = randomType.templates[Math.floor(Math.random() * randomType.templates.length)];

            const newEvent = {
                id: Date.now(),
                title: randomTemplate.title,
                subtitle: randomType.subtitle,
                time: 'Just now',
                icon: randomType.icon,
                extraIcon: randomTemplate.extra,
                extraIcons: randomTemplate.extraIcons,
                userImage: randomTemplate.img
            };

            setEvents(prev => [newEvent, ...prev].slice(0, 5)); // Keep only top 5 items
        }, 5000);

        return () => {
            clearInterval(eventInterval);
        };
    }, []);

    return (
        <section className="w-full bg-transparent text-white py-24 px-6 md:px-12 border-t border-white/10 overflow-hidden font-sans">
            <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">

                {/* ----- LEFT COLUMN: Copy & CTA ----- */}
                <div className="space-y-10 relative z-10">

                    {/* Eyebrow Label */}
                    <div className="flex items-center space-x-2 text-cyan-300 font-mono text-xs md:text-sm tracking-widest uppercase font-semibold">
                        <Zap size={16} className="fill-cyan-300" />
                        {mounted ? (
                            <DecryptedText
                                text="Ultra low friction recruitment"
                                animateOn="view"
                                revealDirection="center"
                                interval={7500}
                            />
                        ) : (
                            <span>Ultra low friction recruitment</span>
                        )}
                    </div>

                    {/* Main Heading */}
                    <h2 className="text-5xl md:text-6xl font-bold tracking-tight leading-[1.1]">
                        Hiring with us
                    </h2>

                    {/* Subtext */}
                    <p className="text-gray-400 text-lg md:text-xl leading-relaxed max-w-lg">
                        Hiring in the nascent tech space doesn't have to be painful. Our hyper-efficient hiring platform connects you with the best talent on the globe.
                    </p>

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-6">
                        <button className="font-mono text-sm md:text-base text-white px-8 py-3 bg-white/[0.05] border border-white/10 rounded backdrop-blur-md hover:bg-white/10 hover:border-cyan-500/50 transition-all duration-300 group">
                            [ <span className="text-cyan-400 group-hover:text-cyan-300">Access Talent</span> ]
                        </button>
                        <button className="group flex items-center text-white font-semibold hover:text-cyan-300 transition-colors">
                            Learn more
                            <ArrowRight size={18} className="ml-2 group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>

                    {/* Feature List */}
                    <ul className="space-y-5 text-gray-300 pt-2">
                        {FEATURES.map((feat, i) => (
                            <FeatureItem key={i} text={feat} />
                        ))}
                    </ul>

                    {/* 'See Also' Bottom Card */}
                    <div className="pt-8 border-t border-gray-800/50 mt-8">
                        <h4 className="text-[10px] text-gray-500 uppercase tracking-[0.2em] mb-4 font-mono font-bold">See Also</h4>
                        <div className="group border border-gray-800 bg-gray-900/30 p-4 rounded-xl flex items-center justify-between cursor-pointer hover:border-gray-700 hover:bg-gray-900/50 transition-all">
                            <div className="flex items-center">
                                <div className="bg-gray-800/50 p-2 rounded-lg mr-4 text-cyan-300 group-hover:scale-110 transition-transform">
                                    <Radio size={20} />
                                </div>
                                <div>
                                    <h5 className="font-semibold text-gray-200 group-hover:text-white">Hiring Blog</h5>
                                    <p className="text-sm text-gray-500">Read about our latest insights on the future of hiring</p>
                                </div>
                            </div>
                            <ArrowRight size={18} className="text-gray-600 group-hover:text-white transition-colors" />
                        </div>
                    </div>
                </div>

                {/* ----- RIGHT COLUMN: Live Data Feed ----- */}
                <div className="flex flex-col space-y-6 lg:pt-4 relative">

                    {/* Big Counter Card */}
                    <div className="relative group w-full">
                        {/* Glow Background Effect */}
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>

                        <div className="relative bg-blue-900/20 backdrop-blur-md rounded-2xl p-8 border border-white/10 shadow-2xl overflow-hidden">
                            {/* Noise Texture Overlay */}
                            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>

                            <div className="relative z-10">
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="text-xs text-cyan-300 uppercase tracking-widest font-mono font-semibold">Clients we've worked with</h3>
                                    <div className="flex items-center space-x-2">
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                        </span>

                                    </div>
                                </div>
                                <div className="text-3xl sm:text-4xl md:text-5xl font-mono font-bold text-white tracking-tight tabular-nums drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]">
                                    {mounted ? (
                                        <CountUp
                                            from={0}
                                            to={INITIAL_COUNT}
                                            separator=","
                                            direction="up"
                                            duration={1}
                                            className="count-up-text text-white"
                                        />
                                    ) : (
                                        <span className="text-white">{INITIAL_COUNT}</span>
                                    )}&lt;
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Event Stream List */}
                    <div className="space-y-3 relative [mask-image:linear-gradient(to_bottom,black_10%,transparent_80%)]">
                        {mounted && (
                            <AnimatedList>
                                {events.map((event) => (
                                    <EventCard key={event.id} event={event} />
                                ))}
                            </AnimatedList>
                        )}
                    </div>

                </div>
            </div>
        </section>
    );
};

// --- SUB-COMPONENTS ---

const FeatureItem = ({ text }) => {
    const [bold, ...rest] = text.split('—');
    return (
        <li className="flex items-start text-sm md:text-base leading-relaxed group">
            <CheckCircle2 className="text-cyan-300 mt-1 mr-3 flex-shrink-0 fill-cyan-300/10 group-hover:scale-110 transition-transform" size={18} />
            <span className="text-gray-400">
                <strong className="text-gray-200 font-semibold">{bold} —</strong>
                {rest.join('—')}
            </span>
        </li>
    );
};

const EventCard = ({ event }) => (
    <div className="group animate-in fade-in slide-in-from-top-4 duration-500 bg-blue-900/40 backdrop-blur-md border border-white/5 rounded-2xl p-4 flex items-center justify-between hover:border-white/10 hover:bg-blue-900/50 transition-all">
        <div className="flex items-center space-x-4 overflow-hidden">
            <div className="bg-gray-800/50 p-2.5 rounded-xl flex-shrink-0 group-hover:scale-105 transition-transform border border-white/5">
                {event.icon}
            </div>
            <div className="min-w-0">
                <div className="flex items-center font-mono text-sm md:text-base text-gray-200 truncate">
                    <span className="truncate">{event.title}</span>
                    {event.extraIcon && <span className="ml-2">{event.extraIcon}</span>}
                    {event.userImage && <img src={event.userImage} alt="user" className="w-5 h-5 rounded-full ml-2 border border-gray-600" />}
                    {event.extraIcons && (
                        Array.isArray(event.extraIcons)
                            ? event.extraIcons.map((icon, i) => <span key={i} className="ml-1 text-xs">{icon}</span>)
                            : <span className="ml-1 text-xs">{event.extraIcons}</span>
                    )}
                </div>
                <div className="text-gray-600 text-[10px] uppercase tracking-wider font-bold mt-1">
                    {event.subtitle}
                </div>
            </div>
        </div>
        <div className="text-gray-600 text-xs font-medium pl-2 whitespace-nowrap font-mono">
            {event.time}
        </div>
    </div>
);

export default LaserStreamSection;
