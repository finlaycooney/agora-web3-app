import './HomePage.css';
import GifCarousel from '../components/common/GifCarousel.jsx';
import Testimonials from '../components/common/Testimonials.jsx';
import Carousel from '../components/common/Carousel.jsx';

import Accordion from '../components/common/Accordion.jsx';

import BeamsWrapper from '../components/common/BeamsWrapper';
import Link from 'next/link';
import { cn } from "@/lib/utils";
import Marquee from "@/components/magicui/marquee";
import { BentoGrid, BentoCard } from "@/components/magicui/bento-grid";
import { BorderBeam } from "@/components/magicui/border-beam";
import dynamic from 'next/dynamic';

const LaserStreamSection = dynamic(() => import('../components/common/LaserStreamSection'));
const FlowingHub = dynamic(() => import('../components/common/FlowingHub'));
const TalentPortal = dynamic(() => import('../components/common/TalentPortal'));
const CapitalLayer = dynamic(() => import('../components/common/CapitalLayer'));
const ActiveNetworkQueries = dynamic(() => import('../components/common/ActiveNetworkQueries'));
const ResearchLayer = dynamic(() => import('../components/common/ResearchLayer'));
const TheHandshake = dynamic(() => import('../components/common/TheHandshake'));

// --- Data for the Split Cards ---
const features = [
    {
        name: "For Companies",
        description: "Post a job to Hirechain. Only review qualified candidates. Cheaper and quicker than agencies.",
        href: "#", // Add your link here
        cta: "Hire Talent",
        Icon: BriefcaseIcon,
        className: "col-span-1",

        // Custom Glow Colors for this card
        beamColorFrom: "#67bed9", // Blue
        beamColorTo: "#00244b",   // Cyan

        // Background Effect (Subtle gradient overlay)
        background: (
            <div className="absolute inset-0 bg-gradient-to-br from-#00244b via-transparent to-transparent opacity-50" />
        ),
    },
    {
        name: "For Referrers",
        description: "Refer talent from your network. Earn for every candidate who gets hired. Bounties from $5-50k.",
        href: "#", // Add your link here
        cta: "Refer Talent",
        Icon: UsersIcon,
        className: "col-span-1",

        // Custom Glow Colors for this card
        beamColorFrom: "#a855f7", // Purple
        beamColorTo: "#6366f1",   // Indigo

        // Background Effect
        background: (
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 via-transparent to-transparent opacity-10" />
        ),
    },
];

const HomePage = () => {
    const images = [
        "/logos/backpack.png",
        "/logos/bagel.png",
        "/logos/helius.png",
        "/logos/jupiter.png",
        "/logos/maven11.png",
        "/logos/monkey_tilt.png",
        "/logos/perena.png",
        "/logos/orca.png",
        "/logos/axiom.png",
        "/logos/reya.png",
    ];

    const handleHomepageClick = () => {
        console.log('Hero button clicked!');
    };

    return (
        <main className="overflow-x-hidden w-full relative bg-[#00244b] min-h-screen">
            {/* Global Ripple Background */}
            <div className="fixed inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#006d9630] via-[#00244b] to-[#00244b] pointer-events-none -z-50" />
            <div className="fixed inset-0 bg-[radial-gradient(800px_circle_at_top_center,_#67bed915,_transparent)] pointer-events-none -z-50" />
            <div className="fixed inset-0 bg-[radial-gradient(800px_circle_at_bottom_center,_#67bed915,_transparent)] pointer-events-none -z-50" />

            {/* --- Hero Section --- */}
            <section id="home" className="w-full h-screen min-h-[800px] flex flex-col items-center justify-center relative overflow-hidden bg-[#00244b]">

                {/* 1. The Terminal Engine Background */}
                {/* Applied linear-gradient mask for burn-in fade at bottom */}
                <div className="absolute inset-0 z-0 h-screen w-full overflow-hidden">
                    <div className="absolute inset-0 w-full h-full z-0 [mask-image:linear-gradient(to_bottom,black_70%,transparent_100%)] transform-gpu will-change-transform">
                        <BeamsWrapper
                            beamWidth={1.6}
                        />
                    </div>
                </div>

                {/* Content Container - Dead Center */}
                <div className="relative z-10 flex flex-col items-center text-center gap-8 px-4 max-w-5xl mx-auto mt-[-5vh]">

                    {/* 2. Centered Layout Overhaul */}
                    <h1 className="font-outfit font-extrabold text-5xl md:text-7xl tracking-tight text-white leading-[1.1]">
                        High-Fidelity<br />
                        Talent Infrastructure
                    </h1>

                    <p className="font-outfit text-blue-100/80 text-lg md:text-xl max-w-2xl font-medium">
                        Gain access to the elite crypto engineering talent that job boards miss.
                        We leverage deep, niche networks to secure top 1% developers for Tier 1 projects
                    </p>

                    {/* 3. Command CTAs */}
                    <div className="flex flex-col sm:flex-row items-center gap-6 mt-4">
                        <button className="font-mono text-sm md:text-base text-white px-8 py-3 bg-white/[0.05] border border-white/10 rounded backdrop-blur-md hover:bg-white/10 hover:border-emerald-500/50 transition-all duration-300 group relative overflow-hidden">
                            <div className="transition-transform duration-300 group-hover:-translate-y-[150%]">
                                [ <span className="text-emerald-400 group-hover:text-emerald-300">ACCESS_TALENT</span> ]
                            </div>
                            <div className="absolute inset-0 flex items-center justify-center transition-transform duration-300 translate-y-full group-hover:translate-y-0">
                                [&nbsp;<span className="text-gray-400">COMING_SOON</span>&nbsp;]
                            </div>
                        </button>
                        <Link href="/jobs" className="font-mono text-sm md:text-base text-white px-8 py-3 bg-white/[0.05] border border-white/10 rounded backdrop-blur-md hover:bg-white/10 hover:border-cyan-500/50 transition-all duration-300 group flex items-center justify-center">
                            [&nbsp;<span className="text-cyan-400 group-hover:text-cyan-300">VIEW_JOBS</span>&nbsp;]
                        </Link>
                    </div>

                </div>

                {/* System Metadata Removed by User Request */}


                {/* 5. Vertical Signal Line (Handover) - Removed due to user feedback */}
                {/* <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[1px] h-24 bg-gradient-to-b from-transparent via-emerald-500/50 to-emerald-500/0"></div> */}
            </section>

            {/* --- Marquee Section --- */}
            <div className="relative flex w-full flex-col items-center justify-center overflow-hidden mt-32 mb-0">
                <Marquee
                    className="[--duration:20s] [--gap:2rem] [mask-image:linear-gradient(to_right,transparent,white_30%,white_90%)]"
                >
                    {images.map((src, index) => (
                        <div key={index} className="mx-4">
                            <img
                                src={src}
                                alt={`Partner ${index}`}
                                className="h-48 w-40 object-contain opacity-70 grayscale hover:opacity-100 hover:grayscale-0 transition-all duration-300"
                            />
                        </div>
                    ))}
                </Marquee>
            </div>

            {/* --- FlowingHub Section --- */}
            <div className="mb-20">
                <FlowingHub />
            </div>

            {/* --- LaserStream Section --- */}
            <LaserStreamSection />

            {/* --- Talent Portal Section --- */}
            <TalentPortal />

            {/* --- Capital Layer Section (Refactored Verticals) --- */}
            <CapitalLayer />

            {/* --- Active Network Queries Section --- */}
            <ActiveNetworkQueries />

            {/* --- Research Layer Section --- */}
            <ResearchLayer />

            {/* --- Text Section ---
            <section className="section fade-in-section w-full pt-0 p-0 mt-10 max-w-7xl mx-auto">
                <div>
                    <h2 className="section-heading">We place first rate talent at tier 1 projects</h2>
                    <p className="section-text">
                        We have a collective ethos which is to bring together the best minds in software engineering, research and strategy to incubate leading edge teams in nascent technology. This is underpinned by our extensive background in matching tier 1 projects with first class talent.
                    </p>
                </div>
            </section> */}




            {/* --- The Handshake Section --- */}
            <TheHandshake />

            {/* --- FAQs Section --- */}
            <section id="faqs2" className="section fade-in-section">
                <div className="content-container">
                    <h2 className="section-heading">FAQs</h2>
                    <Accordion />
                </div>
            </section>
        </main >
    );
}

export default HomePage;

// --- Icons (No external library needed) ---

function BriefcaseIcon(props) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            <rect width="20" height="14" x="2" y="6" rx="2" />
        </svg>
    );
}

function UsersIcon(props) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
    );
}