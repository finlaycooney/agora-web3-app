"use client";

import { Accordion, AccordionItem } from "@heroui/accordion";
import './Accordion.css';

const ACCORDION_ITEMS = [
    {
        title: "What kind of companies do you work with?",
        content: "We partner with a curated portfolio of high-quality, well-funded companies, including: High-Growth Startups, Established Protocols, Web2 Innovators and funds that back the best in the business."
    },
    {
        title: "Im a Web2 developer (e.g., React, Python, Go). How can my skills transfer to Web3?",
        content: "Your Web2 skills are the engine room of Web3. React developers build the dApps and wallets, while Python, Rust and Go engineers build the critical off-chain infrastructure and APIs. You genuinely have 90% of the skills needed, and we're here to help you bridge that last 10% gap."
    },
    {
        title: "How do you technically validate a candidate's real-world engineering skills?",
        content: "We go far beyond resumes. Our team has a technical background, so we conduct in-depth screenings covering real-world system design and past architectural challenges. We'd rather send you one perfectly-calibrated, technically solid candidate than five maybes, saving your team's valuable time."
    },
    {
        title: "What technologies and role specialisms do you actually cover?",
        content: "We are specialists, not generalists. We focus on three core areas: Artificial Intelligence & ML (MLOps, AI Research, LLMs), Blockchain & Web3 (Protocol Engineers, Smart Contracts, Security), and the intersection of DeFi & TradFi (HFT, HPC, Low Latency)."
    },
    {
        title: "I get plenty of recruiter spam. Why use you instead of just applying directly?",
        content: "Applying directly is like throwing your resume into a black hole—it gets fed into an Applicant Tracking System and filtered by keywords. We don't do that. We have long-standing, direct relationships with the actual engineering leaders and founders, so we bypass the HR queue and get your profile straight to the person who makes the decision. We also handle the awkward salary talk, so you can focus on what matters."
    }
];

export default function App() {
    return (
        <Accordion
            // This tells HeroUI to use your CSS classes for each part
            itemClasses={{
                base: "faq-item-base",
                title: "faq-title",
                content: "faq-content",
                indicator: "faq-indicator",
            }}
            // 'splitted' variant adds space between items, perfect for card-style
            variant="light"
            selectionMode="multiple"
        >
            {/* This automatically creates an item for every entry in your array */}
            {ACCORDION_ITEMS.map((item, index) => (
                <AccordionItem
                    key={index}
                    aria-label={item.title}
                    title={item.title}
                >
                    {item.content}
                </AccordionItem>
            ))}
        </Accordion>
    );
}