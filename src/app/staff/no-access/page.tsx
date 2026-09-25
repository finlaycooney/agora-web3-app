import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { staffIdentityFromSession } from '@/lib/staff-identity';
import { StaffSignOutButton } from '../staff-auth-buttons';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'No staff access · Agora',
};

export default async function StaffNoAccessPage() {
    const session = await getServerSession(authOptions);
    const identity = staffIdentityFromSession(session);
    if (!identity) {
        redirect('/staff/sign-in');
    }

    return (
        <section className="mx-auto max-w-xl px-6 py-24">
            <p className="text-sm uppercase tracking-widest text-foreground/50">Agora staff</p>
            <h1 className="mt-3 text-2xl font-semibold">No workspace access</h1>
            <p className="mt-4 text-sm leading-6 text-foreground/60">
                Your Google account is not linked to an Agora staff membership.
                Send the identity details below to a workspace administrator.
            </p>
            <dl className="mt-8 space-y-3 rounded-lg border border-foreground/10 p-4 font-mono text-xs">
                <div className="flex gap-3">
                    <dt className="w-24 text-foreground/50">email</dt>
                    <dd>{session?.user?.email ?? '—'}</dd>
                </div>
                <div className="flex gap-3">
                    <dt className="w-24 text-foreground/50">provider</dt>
                    <dd>{identity.provider}</dd>
                </div>
                <div className="flex gap-3">
                    <dt className="w-24 text-foreground/50">issuer</dt>
                    <dd>{identity.issuer}</dd>
                </div>
                <div className="flex gap-3">
                    <dt className="w-24 text-foreground/50">subject</dt>
                    <dd>{identity.subject}</dd>
                </div>
            </dl>
            <div className="mt-8">
                <StaffSignOutButton />
            </div>
        </section>
    );
}
