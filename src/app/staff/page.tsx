import Link from 'next/link';
import { requireStaffVerified } from '@/lib/staff-gate.server';
import { StaffSignOutButton } from './staff-auth-buttons';

export const dynamic = 'force-dynamic';

export default async function StaffHomePage() {
    const gate = await requireStaffVerified();

    return (
        <section className="mx-auto max-w-3xl px-6 py-16">
            <p className="text-sm uppercase tracking-widest text-foreground/50">Agora staff workspace</p>
            <h1 className="mt-3 text-3xl font-semibold">Welcome back</h1>
            <dl className="mt-8 space-y-3 text-sm">
                <div className="flex gap-3">
                    <dt className="w-28 text-foreground/50">Account</dt>
                    <dd>{gate.session?.user?.email ?? gate.session?.user?.name ?? 'Signed in'}</dd>
                </div>
            </dl>
            <nav className="mt-10 flex gap-4 text-sm">
                <Link href="/staff/clients" className="underline underline-offset-4 hover:opacity-70">Clients</Link>
                <Link href="/staff/jobs" className="underline underline-offset-4 hover:opacity-70">Jobs</Link>
                <Link href="/staff/members" className="underline underline-offset-4 hover:opacity-70">Members</Link>
            </nav>
            <div className="mt-10">
                <StaffSignOutButton />
            </div>
        </section>
    );
}
