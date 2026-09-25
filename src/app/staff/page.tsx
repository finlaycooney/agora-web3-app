import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { staffIdentityFromSession } from '@/lib/staff-identity';
import { getStaffPool, resolveStaffPrincipal } from '@/lib/staff-db.server';
import { StaffSignOutButton } from './staff-auth-buttons';

export const dynamic = 'force-dynamic';

export default async function StaffHomePage() {
    const session = await getServerSession(authOptions);
    const identity = staffIdentityFromSession(session);
    if (!identity) {
        redirect('/staff/sign-in');
    }

    const pool = getStaffPool();
    const organizationId = process.env.STAFF_ORGANIZATION_ID;

    let principal = null;
    if (pool && organizationId) {
        try {
            principal = await resolveStaffPrincipal(pool, identity, organizationId);
        } catch (error) {
            // Fail closed: an unreachable database must never look like access.
            console.error('staff principal resolution failed', error);
        }
    }
    if (!principal) {
        redirect('/staff/no-access');
    }

    return (
        <section className="mx-auto max-w-3xl px-6 py-16">
            <p className="text-sm uppercase tracking-widest text-foreground/50">Agora staff workspace</p>
            <h1 className="mt-3 text-3xl font-semibold">Welcome back</h1>
            <dl className="mt-8 space-y-3 text-sm">
                <div className="flex gap-3">
                    <dt className="w-28 text-foreground/50">Account</dt>
                    <dd>{session?.user?.email ?? session?.user?.name ?? 'Signed in'}</dd>
                </div>
                <div className="flex gap-3">
                    <dt className="w-28 text-foreground/50">Role</dt>
                    <dd className="font-mono text-xs leading-5">{principal.role_id}</dd>
                </div>
            </dl>
            <div className="mt-10">
                <StaffSignOutButton />
            </div>
        </section>
    );
}
