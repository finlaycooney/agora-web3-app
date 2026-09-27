export const metadata = {
    title: 'Agora Staff',
};

export default function StaffLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="staff-scope min-h-screen bg-background font-sans text-sm text-foreground antialiased">
            {children}
        </div>
    );
}
