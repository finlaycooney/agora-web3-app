import React from 'react';

// This is the Footer component for your application.
// It's a self-contained block of JSX that can be imported into any page.
const Footer = () => (
    <footer id="contact" className="bg-black bg-opacity-50 text-center py-8">
        <div className="container mx-auto px-6">
            <div className="flex justify-center space-x-6 mb-4">
                {/* LinkedIn Icon */}
                <a href="#" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors duration-300">
                    <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                    </svg>
                </a>
                {/* X (Twitter) Icon */}
                <a href="https://x.com/Agora4xyz" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors duration-300">
                    <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.627l-5.21-6.817-6.044 6.817h-3.308l7.73-8.835-7.73-8.835h6.74l4.75 6.255 5.73-6.255zm-2.705 16.25h1.59l-8.79-11.79h-1.68l8.88 11.79z" />
                    </svg>
                </a>
            </div>
            <p className="footer-copyright">&copy; 2025 Agora4, part of Agora Group Limited. All Rights Reserved.</p>
            <p className="text-sm text-gray-400 mt-2">Building the teams of the future.</p>
        </div>
    </footer>
);

// The 'export default' line makes this component available to be imported in other files,
// like your main App.jsx file.
export default Footer;