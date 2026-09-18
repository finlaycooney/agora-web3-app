export const JOBS = [
    {
        id: "gondor-founding-engineer",
        title: "Founding Engineer",
        salary: "$140k – $200k • 0.5% – 2.0%",
        location: "New York City (In-person)",
        type: "Full-time",
        description: "Join the founding team at [REDACTED] to build the DeFi layer for prediction markets. You will work on an institutional financial primitive for borrowing against Polymarket positions, developing high-performance infrastructure and smart contracts.",
        responsibilities: [
            "Architect and build high-performance smart contracts on Solana.",
            "Design the core lending and liquidation mechanics for prediction market assets.",
            "Write secure, audited Rust code to handle institutional-grade capital.",
            "Collaborate closely with founders to shape the protocol's technical roadmap."
        ],
        tags: ["Solana", "Rust", "DeFi", "Founding Team", "TypeScript"],
        className: "md:col-span-1",
    },
    {
        id: "engineer-rust-trading",
        title: "Sr Golang Engineer",
        salary: "Competitive", // Not explicitly stated in source
        location: "Remote",
        type: "Full-time",
        description: "Build the financial logic and low-latency infrastructure for a modular Layer-2 blockchain optimized for trading. You will design and implement high-throughput order matching engines and real-time risk engines using Rust[cite: 8].",
        responsibilities: [
            "Design and implement high-throughput order matching engines.",
            "Develop real-time risk engines with extreme low-latency requirements.",
            "Build robust financial logic for a modular Layer-2 blockchain.",
            "Optimize system architecture for maximum transaction throughput."
        ],
        tags: ["Rust", "Trading Systems", "DeFi", "Remote"],
        className: "md:col-span-1",
    },
    {
        id: "marketing-lead-web3",
        title: "Marketing Lead",
        salary: "Competitive", // Not explicitly stated in source
        location: "Remote",
        type: "Full-time",
        description: "Drive marketing initiatives and establish brand presence in the rapidly evolving Web3 space. You will lead all facets of marketing, taking the effort from $0\\rightarrow1$ and building the team from scratch.",
        responsibilities: [
            "Lead all marketing initiatives from absolute 0 to 1.",
            "Establish and grow brand presence across key Web3 channels.",
            "Recruit, hire, and manage a high-performing marketing team.",
            "Develop go-to-market strategies for protocol launches and major updates."
        ],
        tags: ["Marketing", "Web3", "Growth", "Remote"],
        className: "md:col-span-1",
    },
    {
        id: "staff-rust-backend",
        title: "Staff Rust Backend Engineer",
        salary: "Competitive / Equity",
        location: "Remote / Chicago / Dubai / Tokyo",
        type: "Full-time",
        description: "Collaborate with the development team to build and implement key features for a crypto exchange and wallet. Utilize Rust to develop robust and scalable solutions and work on the platform's order book.",
        responsibilities: [
            "Build robust and scalable backend services using Rust.",
            "Develop and optimize the central limit order book for the exchange.",
            "Implement secure backend infrastructure for the native wallet integration.",
            "Mentor junior engineers and drive technical architecture decisions."
        ],
        tags: ["Rust", "Backend", "Solana", "DeFi"],
        className: "md:col-span-1",
    },
    {
        id: "quantitative-analyst",
        title: "Quantitative Analyst",
        salary: "Competitive pay + equity", // Salary range not explicitly listed in JD, but mentions "Competitive"
        location: "New York City (In-person)",
        type: "Full-time",
        description: "Join the team designing Gondor's liquidation engine and pricing oracles for illiquid Polymarket assets. You will model cross-margin rules, run simulations on historical order books, and build the math behind an institutional DeFi primitive.",
        responsibilities: [
            "Design the mathematical models for cross-margin rules and liquidations.",
            "Run extensive Monte Carlo simulations on historical Polymarket order books.",
            "Develop and refine pricing oracles for highly illiquid assets.",
            "Work closely with smart contract engineers to implement risk paramaters onchain."
        ],
        tags: ["Quant Risk", "Python", "DeFi", "Liquidation Engines", "Polymarket"],
        className: "md:col-span-1",
    },
    {
        id: "founding-rust-engineer-solana",
        title: "Founding Rust Engineer",
        salary: "Competitive / Equity",
        location: "Remote",
        type: "Full-time",
        description: "Join the founding team of a YC-backed startup building a professional-grade trading terminal for Solana. You will design and build the core high-performance trading engine, optimizing for low latency and high throughput.",
        responsibilities: [
            "Design and build the core trading engine from scratch.",
            "Optimize infrastructure for extreme low latency and high throughput on Solana.",
            "Integrate deeply with Solana RPCs and various DeFi protocols.",
            "Take ownership of critical engineering decisions as a founding team member."
        ],
        tags: ["Rust", "Solana", "Trading Systems", "Low Latency"],
        className: "md:col-span-1",
    },
    {
        id: "staff-backend-engineer-trading",
        title: "Staff Backend Engineer",
        salary: "Competitive",
        location: "Remote",
        type: "Full-time",
        description: "Lead the backend architecture for one of the largest crypto trading bots in the market. You will design scalable, microservices-based backends in TypeScript to handle massive concurrent user volume and real-time data streaming.",
        responsibilities: [
            "Design scalable, microservices-based backends in TypeScript/Node.js.",
            "Handle massive concurrent user volume and real-time data streaming.",
            "Optimize database queries and data pipelines for high-frequency updates.",
            "Lead technical initiatives and establish engineering best practices across the team."
        ],
        tags: ["TypeScript", "Node.js", "Backend", "Trading Bot"],
        className: "md:col-span-1",
    },
    {
        id: "senior-frontend-engineer-trading",
        title: "Senior Frontend Engineer",
        salary: "Competitive",
        location: "Remote",
        type: "Full-time",
        description: "Translate robust trading bot capabilities into a high-performance web application. You will build responsive user interfaces using React/NextJS and TypeScript, ensuring speed and seamless mobile performance.",
        responsibilities: [
            "Build responsive, high-performance user interfaces using React/Next.js.",
            "Ensure seamless mobile performance and sub-second interaction times.",
            "Integrate robust trading bot APIs and real-time WebSocket data feeds.",
            "Establish frontend architecture, state management, and testing standards."
        ],
        tags: ["React", "TypeScript", "Frontend", "Web3"],
        className: "md:col-span-1",
    },
    {
        id: "backend-engineer-trading-mid",
        title: "Backend Engineer",
        salary: "Competitive",
        location: "Remote",
        type: "Full-time",
        description: "Develop and maintain robust backend services using TypeScript and Rust for a high-volume trading platform. You will build optimized API endpoints and manage third-party integrations while ensuring top-tier system reliability.",
        responsibilities: [
            "Develop and maintain backend services using TypeScript and Rust.",
            "Build highly optimized API endpoints for the trading platform.",
            "Manage and maintain reliability of third-party exchange integrations.",
            "Collaborate with frontend engineers to deliver end-to-end features."
        ],
        tags: ["TypeScript", "Rust", "Backend", "Remote"],
        className: "md:col-span-1",
    },
    {
        id: "onchain-vault-manager",
        title: "Onchain Vault Manager",
        salary: "$90k Base or % of AUM",
        location: "Remote (Global)",
        type: "Full-time",
        description: "Act as both architect and operator for onchain investment strategies. You will build and deploy permissionless EVM vaults, manage yield strategies, and oversee the rebalancing and harvesting lifecycles.",
        responsibilities: [
            "Build and deploy permissionless EVM vaults using Solidity.",
            "Design, monitor, and manage complex onchain yield strategies.",
            "Oversee the operational security, rebalancing, and harvesting lifecycles.",
            "Research and integrate new DeFi primitives to optimize AUM returns."
        ],
        tags: ["Solidity", "DeFi", "Smart Contracts", "Financial Engineering"],
        className: "md:col-span-1",
    },
    {
        id: "fractional-cto-defi",
        title: "Fractional Chief Technology Officer (CTO)",
        salary: "$75 - $200/hr",
        location: "Remote (CET Timezone)",
        type: "Part-time / Full-time",
        description: "Architect the next evolution of non-custodial asset management systems for a high-growth crypto consultancy. You will design secure infrastructure for portfolio execution and wallet connectivity.",
        responsibilities: [
            "Architect non-custodial asset management systems and smart contract logic.",
            "Design secure infrastructure for automated portfolio execution.",
            "Provide technical leadership and mentorship to the engineering team.",
            "Audit architectural decisions to ensure institutional-grade security."
        ],
        tags: ["CTO", "Solidity", "Rust", "Part-time"],
        className: "md:col-span-1",
    }
];