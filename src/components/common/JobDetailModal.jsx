import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Briefcase, MapPin, DollarSign, Calendar, Clock, ArrowRight } from 'lucide-react';

const JobDetailModal = ({ job, isOpen, onClose, onApply }) => {

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    if (!isOpen || !job) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-[#020b1a]/80 backdrop-blur-[20px] z-50 flex items-center justify-center p-4"
                    >
                        {/* Modal Container */}
                        <motion.div
                            layoutId={`job-card-${job.id}`} // For potential shared layout animation later
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            transition={{ type: "spring", duration: 0.5 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-[#020b1a] border border-white/10 w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl overflow-y-auto relative flex flex-col md:flex-row"
                        >
                            {/* Close Button */}
                            <button
                                onClick={onClose}
                                className="absolute top-4 right-4 z-20 p-2 bg-white/5 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors"
                            >
                                <X size={20} />
                            </button>

                            {/* Sidebar / Header Section */}
                            <div className="md:w-1/3 bg-white/[0.02] border-r border-white/5 p-8 flex flex-col relative overflow-hidden">
                                {/* Decorative Gradients */}
                                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-cyan-500/5 to-transparent pointer-events-none" />

                                <div className="relative z-10">
                                    <div className="inline-flex items-center space-x-2 text-cyan-400 mb-4 bg-cyan-900/20 px-3 py-1 rounded-full border border-cyan-500/20">
                                        <Briefcase size={14} />
                                        <span className="text-[10px] font-mono uppercase tracking-wider">{job.type}</span>
                                    </div>

                                    <h2 className="text-3xl font-bold text-white mb-6 leading-tight">{job.title}</h2>

                                    <div className="space-y-4 mb-8">
                                        <div className="flex items-center space-x-3 text-gray-400 text-sm font-mono">
                                            <MapPin size={16} className="text-gray-500" />
                                            <span>{job.location}</span>
                                        </div>
                                        <div className="flex items-center space-x-3 text-gray-400 text-sm font-mono">
                                            <DollarSign size={16} className="text-gray-500" />
                                            <span>{job.salary}</span>
                                        </div>
                                        <div className="flex items-center space-x-3 text-gray-400 text-sm font-mono">
                                            <Clock size={16} className="text-gray-500" />
                                            <span>Posted 2 days ago</span>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2 mt-auto">
                                        {job.tags && job.tags.map(tag => (
                                            <span key={tag} className="text-[10px] font-mono text-cyan-200/60 bg-white/5 border border-white/10 px-2 py-1 rounded-md uppercase tracking-tighter">
                                                #{tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Main Content Section */}
                            <div className="md:w-2/3 p-8 md:p-10 flex flex-col">
                                <div className="prose prose-invert max-w-none mb-10 overflow-y-auto custom-scrollbar flex-grow">
                                    <h3 className="text-xl font-semibold mb-4 text-white">Role Overview</h3>
                                    <p className="text-gray-300 leading-relaxed mb-6 font-light">
                                        {job.description}
                                    </p>

                                    <h3 className="text-xl font-semibold mb-4 text-white">Key Responsibilities</h3>
                                    <ul className="list-disc list-outside ml-4 space-y-2 text-gray-300 font-light marker:text-cyan-500">
                                        <li>Architect and build scalable smart contracts.</li>
                                        <li>Collaborate with cross-functional teams to define, design, and ship new features.</li>
                                        <li>Unit-test code for robustness, including edge cases, usability, and general reliability.</li>
                                        <li>Work on bug fixing and improving application performance.</li>
                                    </ul>
                                </div>

                                <div className="pt-6 border-t border-white/10 mt-auto flex justify-end">
                                    <button
                                        onClick={() => {
                                            onClose(); // Close details
                                            onApply(job); // Open apply modal
                                        }}
                                        className="font-mono text-sm text-[#020b1a] bg-cyan-400 hover:bg-cyan-300 px-8 py-3 rounded-xl transition-all duration-300 font-bold flex items-center gap-2 shadow-[0_0_20px_rgba(34,211,238,0.3)] hover:shadow-[0_0_30px_rgba(34,211,238,0.5)]"
                                    >
                                        <span>APPLY NOW</span>
                                        <ArrowRight size={18} />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default JobDetailModal;
