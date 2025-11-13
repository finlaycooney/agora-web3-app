import './HomePage.css';
import GifCarousel from '../components/common/GifCarousel.jsx';
import Testimonials from '../components/common/Testimonials.jsx';
import Carousel from '../components/common/Carousel.jsx';
import GradientButton from '../components/common/GradientButton.jsx';

const HomePage = () => {
    const handleHomepageClick = () => {
        console.log('Hero button clicked!');
        // You can add navigation or other logic here
    };

    // 2. Add the explicit 'return' statement
    return (
        <main>
            {/* --- Hero Section --- */}
            <section id="home" className="section hero-section fade-in-section">
                <div>
                    <h1 className="hero-heading">Welcome to agora4</h1>
                    <p className="hero-subheading">
                        The decentralized hub for community, commerce
                        <br />
                        and creation in the
                        new digital era.
                    </p>

                    {/*--this is the button "see jobs"-- <div style={{ width: '100%', height: '80px', margin: '20px auto' }}>
                        <GradientButton to="/ForEmployers">
                            See Jobs
                        </GradientButton>
                    </div> */}

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
                        <h2 className="section-heading">Who We Are</h2>
                        <p className="section-text">
                            We have a collective ethos which is to bring together the best minds in software engineering, research and strategy to incubate leading edge teams in nascent technology. This is underpinned by our extensive background in matching tier 1 projects with first class talent.
                        </p>
                        <p className="section-text">
                            We specialise in working with founding stage start ups, scaling their teams to series A and beyond.
                        </p>
                    </div>
                </div>
            </section>

            {/* ======================================= */}
            {/* === CAROUSEL SECTION START === */}
            {/* ======================================= */}
            <section className="section video-section fade-in-section">
                <div style={{ width: '90%', height: '80px', margin: '20px auto' }}>
                    <GifCarousel /> {/* 3. Place the component here */}
                </div>
            </section>
            {/* ======================================= */}
            {/* === CAROUSEL SECTION END === */}
            {/* ======================================= */}

            {/* --- About Us Section --- */}
            <section id="about-us" className="section fade-in-section">
                <div className="content-container two-column-layout">
                    <div className="text-column">
                        <h2 className="section-heading">About Us</h2>
                        <p className="section-text">
                            Inspired by the ancient agoras of Greece — the centers of artistic,
                            spiritual, and political life — Agora is building the digital
                            commons of tomorrow. We create open-source protocols and platforms
                            that empower creators and communities to thrive.
                        </p>
                        <p className="section-text">
                            Our mission is to foster a more equitable and transparent internet
                            where individuals have true ownership of their data and digital
                            assets.
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
            {/* --- Next section --- */}
            <section id="Meet the Team" className="section fade-in-section">
                <div className="content-container">
                    {/* New container to hold the three images in a row */}
                    <div className="image-row">
                        <div className="image-column">
                            <img
                                src="/cal_final.png"
                                alt="First team member portrait"
                                className="section-image"
                            />
                        </div>
                        <div className="image-column">
                            <img
                                src="/fin_final.png"
                                alt="Second team member portrait"
                                className="section-image"
                            />
                        </div>
                        <div className="image-column">
                            <img
                                src="/reem_final.png"
                                alt="Third team member portrait"
                                className="section-image"
                            />
                        </div>
                    </div>

                    {/* Text columns now sits below the image row */}
                    <div className="text-row">
                        <div className="text-column">
                            <h2 className="section-heading">Callum Alderson</h2>
                            <p className="section-text">
                                Bringing 4 years of deep, web3-native experience, he provides unparalleled access to the ecosystem's most influential players. His background includes extensive advisory work with tier-1 founders and protocols through his first rate venture capital connections. This project is the culmination of that experience, built upon a foundation of trusted industry relationships.

                            </p>
                        </div>

                        <div className="text-column">
                            <h2 className="section-heading">Fin Cooney</h2>
                            <p className="section-text">
                                Fin entered the the web3 space 6 years before turning his had to recruitment. He now specialises in finding low level software engineers that others miss. He has a strong network in the Solana ecosystem, having worked closly with many key projects.

                            </p>
                        </div>
                        <div className="text-column">
                            <h2 className="section-heading">Kareem Eissa</h2>
                            <p className="section-text">
                                Kareem has partnered with both leading projects and top-tier candidates, successfully placing talent across a spectrum of technical and non-technical roles. This specialized recruitment insight is complemented by a competitive drive honed during his successful time in rugby.

                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* --- TESTIMONIALS SECTION --- */}
            {/* <Testimonials /> {/* <-- 2. ADD THE COMPONENT HERE */}

            <section id="testimonials" className="section fade-in-section">
                <div style={{ height: '700px', position: 'relative' }}>
                    <Carousel
                        baseWidth={300}
                        autoplay={true}
                        autoplayDelay={3000}
                        pauseOnHover={true}
                        loop={true}
                        round={false}
                    />
                </div>
            </section>
        </main >
    );
}

export default HomePage;