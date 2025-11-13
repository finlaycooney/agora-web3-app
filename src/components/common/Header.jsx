// src/components/common/Header.jsx

import React from 'react';
import { Link } from 'react-router-dom';

const Header = ({ isVisible }) => {

    return (
        <header className={`fixed top-0.5 left-0 right-0 z-50 transition-opacity duration-300 ease-in-out ${isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <div className="px-6 py-1 flex justify-between items-center">

                <div>
                    <img src="/agora4logo.png" alt="Agora Web3 Logo" className="h-20 w-auto" />
                </div>


                {/* Navigation */}
                <nav className="flex space-x-12">
                    {/* Home Link */}
                    <Link to="#" className="nav-link text-white hover:text-[#99ffff] transition duration-500">Home</Link>

                    {/* "For Employers" Link */}
                    <div className="button-tooltip-wrapper">
                        <Link
                            to="#"
                            onClick={(e) => e.preventDefault()}
                            aria-disabled="true"
                            className="nav-link text-white hover:text-[#99ffff] transition duration-500"
                            style={{ opacity: 1, cursor: 'not-allowed' }}
                        >
                            For Employers
                        </Link>
                        <span className="tooltip-tag">
                            Coming soon!
                        </span>
                    </div>


                    {/* "For Candidates" Link (NOW UPDATED) */}
                    <div className="button-tooltip-wrapper">
                        <a
                            href="#" // Changed from "/"
                            onClick={(e) => e.preventDefault()} // Added
                            aria-disabled="true" // Added
                            className="nav-link text-white hover:text-[#99ffff] transition duration-500"
                            style={{ opacity: 1, cursor: 'not-allowed' }} // Added
                        >
                            For Candidates
                        </a>
                        {/* Added the tag */}
                        <span className="tooltip-tag">
                            Coming soon!
                        </span>
                    </div>
                </nav>

                {/* Mobile menu button */}
                <div className="md:hidden">
                    <button className="text-white focus:outline-none">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7"></path>
                        </svg>
                    </button>
                </div>
            </div>
        </header>
    );
};

export default Header;