import React from 'react';

const ModernGrid = () => {
    const items = [
        {
            title: "Hiring",
            desc: "Our main focus is to help you find the best talent for your company, so that you can focus on growing your enterprise."
        },
        {
            title: "Advisory",
            desc: "We have successfully been lead advisors to a number of successful projects on fund raising, hiring, team structuring and incubation."

        },
        {
            title: "Fundraising",
            desc: "With a network of VCs we work closely with our projects to connect them with top tier VCs to secure long term strategic partnerships and fundin."

        },
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mt-8">
            {items.map((item, index) => (
                <div
                    key={index}
                    className="
            group relative overflow-hidden rounded-xl
            
            /* --- NEW GRADIENT BACKGROUND --- */
            /* A subtle diagonal fade from deep blue to transparent */
            bg-gradient-to-br from-blue-950/50 to-transparent
            
            /* Adjusted borders to match the blue theme */
            border border-blue-900/30 hover:border-blue-500/50
            
            p-8 
            transition-all duration-300 hover:-translate-y-1
          "
                >
                    {/* Keep the existing subtle glow effect */}
                    <div className="
            absolute -right-10 -top-10 h-32 w-32 
            rounded-full bg-blue-500/10 blur-3xl 
            group-hover:bg-blue-500/20 transition-all duration-500
          " />

                    <h3 className="relative z-10 mb-3 text-lg font-semibold text-white">
                        {item.title}
                    </h3>
                    <p className="relative z-10 text-neutral-300 text-sm leading-relaxed">
                        {item.desc}
                    </p>
                </div>
            ))}
        </div>
    );
};

export default ModernGrid;