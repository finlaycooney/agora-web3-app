import React, { useState } from 'react';
import '@/components/common/Testimonials.css'; // This is the stylesheet we'll create next

// --- Your Testimonial Data ---
// You can easily add, remove, or change these quotes
const testimonialsData = [
    {
        quote: "Working with them has been a game-changer for our development pipeline. Their service is reliable, fast, and exactly what our team needed.",
        author: "Jane Doe",
        title: "Founder, TechCo",
    },
    {
        quote: "As an engineer, I appreciate the robust documentation and seamless integration. It cut our team's integration time in half.",
        author: "John Smith",
        title: "Lead Engineer, Innovate Solutions",
    },
    {
        quote: "The insights we get are invaluable. We're building better products faster because of them. Highly recommended for any engineering-first company.",
        author: "Alex Johnson",
        title: "CTO, FutureBuilds",
    },
];
// ------------------------------

function Testimonials() {
    const [currentIndex, setCurrentIndex] = useState(0);

    const goToPrevious = () => {
        // This logic wraps around to the last slide if you're on the first
        const isFirstSlide = currentIndex === 0;
        const newIndex = isFirstSlide ? testimonialsData.length - 1 : currentIndex - 1;
        setCurrentIndex(newIndex);
    };

    const goToNext = () => {
        // This logic wraps around to the first slide if you're on the last
        const isLastSlide = currentIndex === testimonialsData.length - 1;
        const newIndex = isLastSlide ? 0 : currentIndex + 1;
        setCurrentIndex(newIndex);
    };

    const goToSlide = (slideIndex) => {
        setCurrentIndex(slideIndex);
    };

    return (
        <section className="testimonials-section">
            <h2 className="testimonials-title">What people are saying about us</h2>

            <div className="testimonial-slider">
                {/* Previous Button */}
                <button onClick={goToPrevious} className="slider-btn prev-btn">
                    &larr; {/* Left arrow */}
                </button>

                {/* Slider Content */}
                <div className="testimonial-slider-content">
                    {/* This is the inner container that moves */}
                    <div
                        className="testimonial-slide-container"
                        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
                    >
                        {/* We map over the data to create each slide */}
                        {testimonialsData.map((testimonial, index) => (
                            <div className="testimonial-slide" key={index}>
                                <blockquote className="testimonial-quote">
                                    "{testimonial.quote}"
                                </blockquote>
                                <p className="testimonial-author">{testimonial.author}</p>
                                <p className="testimonial-title">{testimonial.title}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Next Button */}
                <button onClick={goToNext} className="slider-btn next-btn">
                    &rarr; {/* Right arrow */}
                </button>

                {/* Dot Navigation */}
                <div className="testimonial-dots">
                    {testimonialsData.map((_, slideIndex) => (
                        <button
                            key={slideIndex}
                            className={`dot ${currentIndex === slideIndex ? 'active' : ''}`}
                            onClick={() => goToSlide(slideIndex)}
                            aria-label={`Go to slide ${slideIndex + 1}`}
                        ></button>
                    ))}
                </div>
            </div>
        </section>
    );
}

export default Testimonials;


