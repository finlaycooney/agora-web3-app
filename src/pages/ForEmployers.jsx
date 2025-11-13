import React from 'react';
import './ForEmployers.css';

const ForEmployersPage = () => (
    <>

        <main>
            {/* --- Hero Section --- */}
            <section
                id="for-employers-hero"
                className="section hero-section-employers fade-in-section"
            // The background image is set in the CSS file
            >
                <div className="hero-content-employers">
                    <h1 className="hero-heading-employers">
                        Build Your Vision with Elite Web3 Talent
                    </h1>
                    <p className="hero-subheading-employers">
                        We connect innovative companies with the world's leading blockchain
                        engineers, protocol researchers, and DeFi specialists.
                    </p>
                    <a href="#contact" className="cta-button">
                        Request a Consultation
                    </a>
                </div>
            </section>

            {/* --- Our Services Section --- */}
            <section id="services" className="section fade-in-section">
                <div className="content-container-employers">
                    <h2 className="section-heading-employers">Our Recruitment Services</h2>
                    <div className="services-grid">
                        <div className="service-card">
                            <h3 className="service-title">Expert Sourcing</h3>
                            <p className="service-description">
                                We go beyond job boards, tapping into our exclusive network of
                                vetted Web3 professionals to find candidates you won't see
                                anywhere else.
                            </p>
                        </div>
                        <div className="service-card">
                            <h3 className="service-title">Rigorous Vetting</h3>
                            <p className="service-description">
                                Our technical screening process is designed by Web3 engineers to
                                validate on-chain experience, smart contract expertise, and
                                protocol-level knowledge.
                            </p>
                        </div>
                        <div className="service-card">
                            <h3 className="service-title">Strategic Partnership</h3>
                            <p className="service-description">
                                We act as an extension of your team, providing market insights,
                                compensation analysis, and strategic guidance to help you build
                                a world-class team.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* --- Why Partner With Us Section --- */}
            <section id="why-us" className="section fade-in-section benefits-section">
                <div className="content-container-employers two-column-layout-employers">
                    <div className="text-column-employers">
                        <h2 className="section-heading-employers">The Agora Advantage</h2>
                        <p className="section-text-employers">
                            Finding exceptional talent in the Web3 space is uniquely
                            challenging. We bridge the gap between ambitious projects and the
                            highly specialized expertise required to build them.
                        </p>
                        <ul className="benefits-list">
                            <li>
                                <strong>Access to Top-Tier Talent:</strong> Our network is our
                                greatest asset, built on years of trust and contribution to the
                                Web3 ecosystem.
                            </li>
                            <li>
                                <strong>Faster Hiring Cycles:</strong> We streamline the process,
                                presenting you with only the most qualified, pre-vetted
                                candidates, saving you valuable time.
                            </li>
                            <li>
                                <strong>Cultural Fit:</strong> We understand the unique culture of
                                decentralized teams and prioritize candidates who will thrive in
                                a remote-first, autonomous environment.
                            </li>
                        </ul>
                    </div>
                    <div className="image-column-employers">
                        <img
                            src="/why-partner-with-us.png" // Replace with a relevant image
                            alt="Two professionals shaking hands in a modern office"
                            className="section-image-employers"
                        />
                    </div>
                </div>
            </section>
        </main>
    </>
);

export default ForEmployersPage;