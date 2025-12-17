import './HomePage.css';
import GifCarousel from '../components/common/GifCarousel.jsx';
import Testimonials from '../components/common/Testimonials.jsx';
import Carousel from '../components/common/Carousel.jsx';
import GradientButton from '../components/common/GradientButton.jsx';
import Accordion from '../components/common/Accordion.jsx';

const HomePage = () => {
    const handleHomepageClick = () => {
        console.log('Hero button clicked!');
    };

    return (
        <main>
            {/* --- Hero Section --- */}
            <section id="home" className="section hero-section fade-in-section">
                <div className="hero-content">
                    <h1 className="hero-heading">Enterprise grade hiring
                        <br />
                        solutions for web3</h1>
                    <p className="hero-subheading">
                        The decentralized hub for community, commerce
                        <br />
                        and creation in the new digital era.
                    </p>
                </div>
            </section>

            {/* ======================================= */}
            {/* === CAROUSEL SECTION (Video/Logos) === */}
            {/* ======================================= */}
            <section className="section video-section fade-in-section">
                {/* Replaced inline style with class 'carousel-wrapper' */}
                <div className="carousel-wrapper">
                    <h2 className="section-heading">We place first rate talent at tier 1 projects</h2>
                    <p className="section-text">
                        We have a collective ethos which is to bring together the best minds in software engineering, research and strategy to incubate leading edge teams in nascent technology. This is underpinned by our extensive background in matching tier 1 projects with first class talent.
                    </p>
                    <GifCarousel />
                </div>
            </section>

            {/* --- Who We Are Section --- */}
            <section id="who-we-are" className="section fade-in-section">
                <div className="content-container two-column-layout">
                    <div className="image-column">
                        <img
                            src="/who-we-are.png"
                            alt="Illustration of a classical building on an island"
                            className="section-image"
                        />
                    </div>
                    <div className="text-column">
                        <h2 className="section-heading">Who we are</h2>
                        <p className="section-text">
                            We have a collective ethos which is to bring together the best minds in software engineering, research and strategy to incubate leading edge teams in nascent technology. This is underpinned by our extensive background in matching tier 1 projects with first class talent.
                        </p>
                        <p className="section-text">
                            We specialise in working with founding stage start ups, scaling their teams to series A and beyond.
                        </p>
                    </div>
                </div>
            </section>

            {/* --- About Us Section --- */}
            <section id="about-us" className="section fade-in-section">
                <div className="content-container two-column-layout reverse-mobile">
                    <div className="text-column">
                        <h2 className="section-heading">About us</h2>
                        <p className="section-text">
                            Inspired by the ancient agoras of Greece - the centres of artistic, spiritual, and political life - Agora4 is helping build the future of Web3. We're a small, crypto-native team that works directly with early-stage founders in DeFi, Crypto, AI and trading. Think of us less as headhunters and more as your talent partners. We’re the team you call when you need to land your first 3, 5, or 10 hires - the ones that will define your future and put you in a position to succeed.

                            <br />
                            <br />

                            We'll help projects figure out who you need and what experience aligns best, not just throw CVs at you. We work with the best talent and go degen-deep to find them through our proven methods to identify the contributors, the anon builders, and the quant wizards who live on Github and Discord, not just LinkedIn. This is all in an effort to ensure both projects and candidates can focus on the important task of building cool stuff that has the potential to change the world.
                        </p>
                    </div>
                    <div className="image-column">
                        <img
                            src="/about-us.png"
                            alt="Illustration of a classical agora with gardens and waterfalls"
                            className="section-image"
                        />
                    </div>
                </div>
            </section>

            {/* --- Meet the team --- */}
            <section id="meet-the-team" className="section fade-in-section">
                <div className="content-container">
                    <h2 className="section-heading">Meet the team</h2>

                    {/* New Structure: A grid containing individual member cards */}
                    <div className="team-grid">
                        {/* Member 1: Callum */}
                        <div className="team-member">
                            <div className="member-image-wrapper">
                                <img
                                    src="/cal_final.png"
                                    alt="Callum Alderson"
                                    className="member-image"
                                />
                            </div>
                            <div className="member-info">
                                <h3 className="member-name">Callum Alderson</h3>
                                <p className="section-text member-bio">
                                    Bringing 4 years of deep, web3-native experience, he provides unparalleled access to the ecosystem's most influential players. His background includes extensive advisory work with tier-1 founders and protocols through his first rate venture capital connections. This project is the culmination of that experience, built upon a foundation of trusted industry relationships.
                                </p>
                            </div>
                        </div>

                        {/* Member 2: Fin */}
                        <div className="team-member">
                            <div className="member-image-wrapper">
                                <img
                                    src="/fin_final.png"
                                    alt="Fin Cooney"
                                    className="member-image"
                                />
                            </div>
                            <div className="member-info">
                                <h3 className="member-name">Fin Cooney</h3>
                                <p className="section-text member-bio">
                                    Fin entered the web3 space 6 years before turning his hand to recruitment. He now specialises in finding low level software engineers that others miss. He has a strong network in the Solana ecosystem, having worked closly with many key projects.
                                </p>
                            </div>
                        </div>

                        {/* Member 3: Kareem */}
                        <div className="team-member">
                            <div className="member-image-wrapper">
                                <img
                                    src="/reem_final.png"
                                    alt="Kareem Eissa"
                                    className="member-image"
                                />
                            </div>
                            <div className="member-info">
                                <h3 className="member-name">Kareem Eissa</h3>
                                <p className="section-text member-bio">
                                    Kareem has partnered with both leading projects and top-tier candidates, successfully placing talent across a spectrum of technical and non-technical roles. This specialized recruitment insight is complemented by a competitive drive honed during his successful time in rugby.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* --- FAQs / Testimonials Section --- 
             <section id="testimonials" className="section fade-in-section">
                Replaced inline style with class 'faq-wrapper' 
                <div className="content-container faq-wrapper">
                    <h2 className="section-heading">FAQs</h2>
                    <Carousel
                        baseWidth={300}
                        autoplay={true}
                        autoplayDelay={3000}
                        pauseOnHover={true}
                        loop={true}
                        round={false}
                    />
                </div>
            // </section> */}

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