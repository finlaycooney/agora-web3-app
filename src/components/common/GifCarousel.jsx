import React from "react";

// --- FINAL FIX ---
// This code now expects your `carousel.gif` file to be inside the `/public` folder.
// This is the simplest way to resolve the path errors you were seeing.
// No import is needed.
const gifs = [
    "/carousel.gif",
];

// No other changes are needed in the rest of the file.

function GifCarousel() {
    const [currentIndex, setCurrentIndex] = React.useState(0);

    const goToPrevious = () => {
        const isFirstSlide = currentIndex === 0;
        const newIndex = isFirstSlide ? gifs.length - 1 : currentIndex - 1;
        setCurrentIndex(newIndex);
    };

    const goToNext = () => {
        const isLastSlide = currentIndex === gifs.length - 1;
        const newIndex = isLastSlide ? 0 : currentIndex + 1;
        setCurrentIndex(newIndex);
    };

    React.useEffect(() => {
        if (gifs.length > 1) {
            const timer = setTimeout(goToNext, 3000);
            return () => clearTimeout(timer);
        }
    }, [currentIndex, gifs.length]);


    const carouselStyles = {
        height: "100%",
        position: "relative",
        overflow: "hidden",
        borderRadius: "10px",

    };

    const sliderStyles = {
        width: `${gifs.length * 100}%`,
        display: "flex",
        height: "100%",
        transform: `translateX(-${(currentIndex / gifs.length) * 100}%)`,
        transition: "transform 0.5s ease-in-out",
    };

    const slideStyles = {
        width: `${100 / gifs.length}%`,
        height: "100%",
    };

    const imageStyles = {
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block",
    };

    const arrowStyles = {
        position: "absolute",
        top: "50%",
        transform: "translateY(-50%)",
        fontSize: "2rem",
        color: "white",
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        border: "none",
        borderRadius: "50%",
        cursor: "pointer",
        width: "40px",
        height: "40px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1,
    };

    const leftArrowStyles = { ...arrowStyles, left: "10px" };
    const rightArrowStyles = { ...arrowStyles, right: "10px" };

    return (
        <div style={carouselStyles}>
            {gifs.length > 1 && (
                <>
                    <button onClick={goToPrevious} style={leftArrowStyles}>&#10094;</button>
                    <button onClick={goToNext} style={rightArrowStyles}>&#10095;</button>
                </>
            )}
            <div style={sliderStyles}>
                {gifs.map((gifSrc, index) => (
                    <div key={index} style={slideStyles}>
                        <img
                            src={gifSrc}
                            alt={`Carousel slide ${index + 1}`}
                            style={imageStyles}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}

export default GifCarousel;
