import React, { useState } from 'react';
import { Link } from 'react-router-dom'

/**
 * A reusable button component with a customizable gradient, styled with inline CSS.
 *
 * @param {object} props - The component props.
 * @param {function} props.onClick - The click event handler.
 * @param {React.ReactNode} props.children - The content inside the button (e.g., text).
 * @param {string} [props.fromColor='#06b6d4'] - The starting color (hex) of the gradient.
 * @param {string} [props.toColor='#3b82f6'] - The ending color (hex) of the gradient.
 */
const GradientButton = ({
    children,
    to,
    onClick,
    fromColor = '#015F8B',
    toColor = '#015F8A',
}) => {

    const [isHovered, setIsHovered] = useState(false);
    const [isFocused, setIsFocused] = useState(false);

    // Base styles
    const baseStyle = {
        padding: '0.6rem 2rem',
        fontWeight: '450',
        color: 'white',
        fontFamily: 'montserrat',
        borderRadius: '9999px', // This creates the fully rounded/oval shape
        background: `linear-gradient(to right, ${fromColor}, ${toColor})`,
        border: 'none',
        cursor: 'pointer',
        transition: 'all 0.2s ease-in-out',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    };

    // Styles to add when hovered
    const hoverStyle = {
        opacity: 0.9,
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    };

    // Styles to add when focused
    // This replicates a "ring" effect. You might need to change the first color
    // ('#111827') to match your page's background color for the ring to look right.
    const focusStyle = {
        outline: 'none',
        boxShadow: '0 0 0 2px #111827, 0 0 0 4px #06b6d4',
    };

    // Combine all styles based on the component's state
    const combinedStyle = {
        ...baseStyle,
        ...(isHovered ? hoverStyle : {}),
        ...(isFocused ? focusStyle : {}),
    };

    return (

        <Link
            to={to}

            style={combinedStyle}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
        >
            {children}
        </Link>

    );
};

// Make the button the default export so it can be imported elsewhere
export default GradientButton;