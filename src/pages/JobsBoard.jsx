import React from 'react';
import { Link } from 'react-router-dom';
import './JobsBoard.css';
// 1. Import the data from your new file
// (Change '../data/jobs' to './data/jobs' if the folder is in the same directory)
import { JOBS } from '../data/jobs';

const JobsBoard = () => {
    return (
        <main className="min-h-screen text-white p-8 pt-24"
            style={{
                backgroundImage: "url('/for_employers_background.png')",
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundAttachment: "fixed"
            }}>
            {/* Header */}
            <div className="max-w-6xl mx-auto mb-12 text-center">
                <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                    Open Positions
                </h1>
                <p className="text-gray-400 text-lg">
                    Join the team building the future of Web3.
                </p>
            </div>

            {/* The Bento Grid using imported JOBS data */}
            <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
                {JOBS.map((job) => (
                    <div
                        key={job.id}
                        className={`
                            ${job.className} 
                            bg-gray-900 border border-gray-800 rounded-2xl p-6 
                            hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/20 
                            transition-all duration-300 group
                        `}
                    >
                        {/* Job Header */}
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-xl font-bold text-white group-hover:text-blue-300 transition-colors">
                                    {job.title}
                                </h3>
                                <span className="text-sm text-gray-500 font-mono mt-1 block">
                                    {job.location} • {job.salary}
                                </span>
                            </div>
                            <span className="px-3 py-1 text-xs font-semibold bg-blue-900/30 text-blue-400 rounded-full border border-blue-900">
                                {job.type}
                            </span>
                        </div>

                        {/* Description */}
                        <p className="text-gray-400 mb-6 line-clamp-2">
                            {job.description}
                        </p>

                        {/* Footer: Tags & Apply Button */}
                        <div className="flex justify-between items-center mt-auto">
                            <div className="flex gap-2">
                                {job.tags.map(tag => (
                                    <span key={tag} className="text-xs text-gray-600 bg-gray-800 px-2 py-1 rounded">
                                        {tag}
                                    </span>
                                ))}
                            </div>

                            <Link
                                to={`/jobs/${job.id}`} // Takes them to details page
                                className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg transition-colors"
                            >
                                Apply &rarr;
                            </Link>
                        </div>
                    </div>
                ))}
            </div>
        </main>
    );
};

export default JobsBoard;