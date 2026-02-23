import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Github, CheckCircle, Upload, Check } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useSession, signIn } from "next-auth/react";

interface SignalSubmissionModalProps {
    isOpen: boolean;
    onClose: () => void;
    jobTitle?: string;
}

const SignalSubmissionModal: React.FC<SignalSubmissionModalProps> = ({ isOpen, onClose, jobTitle }) => {
    const { data: session, status } = useSession();
    const [step, setStep] = useState<'initial' | 'submitting' | 'success'>('initial');

    // User requested "loadingState" to be defined
    const [loadingState, setLoadingState] = useState<string>('');

    const [data, setData] = useState({
        fullName: '',
        email: '',
        professionalUrl: '',
        technicalAchievement: ''
    });
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [terminalLines, setTerminalLines] = useState<string[]>([]);

    useEffect(() => {
        if (isOpen) {
            setStep('initial');
            setTerminalLines([]);
            document.body.style.overflow = 'hidden';

            // Pre-fill form if session exists
            if (session?.user) {
                setData(prev => ({
                    ...prev,
                    fullName: session.user?.name || prev.fullName,
                    email: session.user?.email || prev.email
                }));
            }
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
            // Reset state
            setLoadingState('');
        };
    }, [isOpen, session]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setData(prev => ({ ...prev, [name]: value }));
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) {
                alert("File too large. Max 5MB.");
                return;
            }
            setSelectedFile(file);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStep('submitting');
        setLoadingState('INITIALIZING_SECURE_HANDSHAKE...');

        // 1. Simulate terminal sequence
        const lines = [
            "> INITIALIZING_SECURE_HANDSHAKE...",
            "> VERIFYING_IDENTITY_TOKENS...",
            "> ENCRYPTING_SIGNAL_PACKET...",
            "> UPLOADING_TO_AGORA_NODES...",
        ];

        for (let i = 0; i < lines.length; i++) {
            setLoadingState(lines[i]);
            await new Promise(resolve => setTimeout(resolve, 600));
            setTerminalLines(prev => [...prev, lines[i]]);
        }

        // 2. Submit Data
        const formData = new FormData();
        formData.append('fullName', data.fullName);
        formData.append('email', data.email);
        formData.append('professionalUrl', data.professionalUrl);
        formData.append('technicalAchievement', data.technicalAchievement);

        // GitHub Sync Logic Fix
        if (session?.user) {
            // Safe cast as requested
            formData.append('githubHandle', (session.user as any).username || '');
        }

        if (selectedFile) {
            formData.append('cvFile', selectedFile);
        }

        try {
            const response = await fetch('/api/submit-signal', {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                setLoadingState('HANDSHAKE_COMPLETE');
                setTerminalLines(prev => [...prev, "> SIGNAL_RECEIVED.", "> HANDSHAKE_COMPLETE."]);

                await new Promise(resolve => setTimeout(resolve, 500));
                setStep('success');
                confetti({
                    particleCount: 100,
                    spread: 70,
                    origin: { y: 0.6 },
                    colors: ['#22d3ee', '#34d399', '#ffffff']
                });
            } else {
                const error = await response.json();
                setTerminalLines(prev => [...prev, `> ERROR: ${error.message}`]);
                setLoadingState('PROTOCOL_FAILURE');
            }

        } catch (error: any) {
            setTerminalLines(prev => [...prev, `> ERROR: ${error.message}`]);
            setLoadingState('CONNECTION_LOST');
        }
    };

    if (!isOpen) return null;

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
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-[#020b1a] border border-teal-500/30 w-full max-w-lg rounded-2xl shadow-[0_0_40px_rgba(20,184,166,0.1)] overflow-hidden relative"
                        >
                            {/* Close Button */}
                            <button
                                onClick={onClose}
                                className="absolute top-4 right-4 text-teal-500/50 hover:text-teal-400 transition-colors"
                            >
                                <X size={20} />
                            </button>

                            {/* Header */}
                            <div className="p-8 pb-0">
                                <div className="flex items-center space-x-3 mb-2">
                                    <h2 className="text-2xl font-bold text-white font-outfit">Signal Submission</h2>
                                    <CheckCircle className="text-blue-500 fill-blue-500/20" size={20} />
                                </div>
                                <p className="text-gray-400 text-sm font-outfit">
                                    Applying for: <span className="text-teal-400">{jobTitle || 'Position'}</span>
                                </p>
                            </div>

                            <div className="p-8 pt-6">
                                {step === 'initial' && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="space-y-6"
                                    >
                                        {/* Sync GitHub - Primary Action */}
                                        <button
                                            type="button"
                                            onClick={() => !session && signIn('github')}
                                            disabled={status === 'loading' || status === 'authenticated'}
                                            className="w-full group relative overflow-hidden rounded-xl bg-emerald-900/20 border border-emerald-500/30 p-4 hover:bg-emerald-900/30 transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed"
                                        >
                                            <div className="flex items-center justify-center space-x-3 relative z-10">
                                                <Github className="text-emerald-400" size={20} />
                                                <span className="font-mono font-bold text-emerald-100">
                                                    {status === 'loading' ? 'VERIFYING_SIGNAL...' :
                                                        status === 'authenticated' ? `IDENTITY_SYNCED: @${(session.user as any)?.username || session.user?.name}` :
                                                            'SYNC_GITHUB_IDENTITY'}
                                                </span>
                                            </div>
                                            <div className="absolute inset-0 bg-emerald-500/10 blur-xl group-hover:bg-emerald-500/20 transition-all duration-500" />
                                            {status !== 'authenticated' && (
                                                <p className="text-[10px] text-emerald-400/60 font-mono mt-1 text-center uppercase tracking-wider">
                                                    Verify technical signal to bypass manual form
                                                </p>
                                            )}
                                        </button>

                                        <div className="flex items-center space-x-4">
                                            <div className="h-px bg-white/10 flex-1" />
                                            <span className="text-gray-500 text-xs font-mono">OR</span>
                                            <div className="h-px bg-white/10 flex-1" />
                                        </div>

                                        {/* Minimalist Form */}
                                        <form onSubmit={handleSubmit} className="space-y-4">
                                            <div className="space-y-4">
                                                <input
                                                    type="text"
                                                    name="fullName"
                                                    placeholder="Full Name"
                                                    required
                                                    className="w-full bg-transparent border-b border-white/10 focus:border-teal-500 text-white p-3 outline-none transition-colors placeholder:text-gray-600 font-outfit"
                                                    value={data.fullName}
                                                    onChange={handleInputChange}
                                                />
                                                <input
                                                    type="email"
                                                    name="email"
                                                    placeholder="Email Address"
                                                    required
                                                    className="w-full bg-transparent border-b border-white/10 focus:border-teal-500 text-white p-3 outline-none transition-colors placeholder:text-gray-600 font-outfit"
                                                    value={data.email}
                                                    onChange={handleInputChange}
                                                />
                                                <input
                                                    type="url"
                                                    name="portfolioUrl"
                                                    placeholder="Professional URL (LinkedIn/GitHub)"
                                                    className="w-full bg-transparent border-b border-white/10 focus:border-teal-500 text-white p-3 outline-none transition-colors placeholder:text-gray-600 font-outfit"
                                                    value={data.professionalUrl}
                                                    onChange={handleInputChange}
                                                />
                                                <textarea
                                                    name="technicalAchievement"
                                                    placeholder="Briefly describe your core contribution to a Tier 1 protocol..."
                                                    rows={3}
                                                    className="w-full bg-transparent border-b border-white/10 focus:border-teal-500 text-white p-3 outline-none transition-colors placeholder:text-gray-600 font-outfit resize-none"
                                                    value={data.technicalAchievement}
                                                    onChange={handleInputChange}
                                                />
                                            </div>

                                            {/* CV Upload */}
                                            <div className="border border-dashed border-teal-500/30 rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-teal-500/5 transition-colors group relative">
                                                <Upload className="text-teal-500/50 group-hover:text-teal-400 mb-2 transition-colors" size={24} />
                                                <p className="text-xs text-gray-400 font-mono group-hover:text-teal-200 transition-colors">
                                                    {selectedFile ? `SELECTED: ${selectedFile.name}` : 'DROP_CV_HERE_OR_CLICK_TO_UPLOAD'}
                                                </p>
                                                <input
                                                    type="file"
                                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                                    accept=".pdf,.docx"
                                                    onChange={handleFileChange}
                                                />
                                            </div>

                                            {/* Submit Button */}
                                            <button
                                                type="submit"
                                                className="w-full bg-teal-500 hover:bg-teal-400 text-[#020b1a] font-mono font-bold py-3 rounded-xl transition-all duration-300 mt-4 flex items-center justify-center space-x-2"
                                            >
                                                <span>SUBMIT_SIGNAL</span>
                                            </button>
                                        </form>
                                    </motion.div>
                                )}

                                {(step === 'submitting' || step === 'success') && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="font-mono text-xs space-y-2 h-[400px] flex flex-col justify-end pb-8"
                                    >
                                        {terminalLines.map((line, i) => (
                                            <motion.div
                                                key={i}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                className="text-teal-400"
                                            >
                                                {line}
                                            </motion.div>
                                        ))}
                                        {step === 'success' && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.9 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                transition={{ delay: 0.2 }}
                                                className="mt-6 border border-teal-500/30 bg-teal-500/10 rounded-lg p-4 flex items-center space-x-3 text-teal-300"
                                            >
                                                <div className="bg-teal-500 text-[#020b1a] rounded-full p-1">
                                                    <Check size={16} strokeWidth={3} />
                                                </div>
                                                <div>
                                                    <p className="font-bold">SIGNAL_VERIFIED</p>
                                                    <p className="opacity-70">We will be in touch shortly.</p>
                                                </div>
                                            </motion.div>
                                        )}
                                    </motion.div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default SignalSubmissionModal;
