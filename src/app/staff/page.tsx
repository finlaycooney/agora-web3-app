import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { staffGate } from '@/lib/staff-gate.server';
import {
    STAFF_MFA_COOKIE,
    readStaffMfaProof,
} from '@/lib/staff-mfa-cookie';
import { StaffSignOutButton } from './staff-auth-buttons';

export const dynamic = 'force-dynamic';

export default async function StaffHomePage() {
    const gate = await staffGate();
    if (gate.stage === 'signed-out') {
        redirect('/staff/sign-in');
    }
    if (gate.stage === 'unresolved') {
        redirect('/staff/no-access');
    }

    const totp = gate.totp;
    if (!totp || totp.status === 'pending') {
        redirect('/staff/mfa/enroll');
    }

    const cookieStore = await cookies();
    const proof = readStaffMfaProof(
        process.env.NEXTAUTH_SECRET!,
        cookieStore.get(STAFF_MFA_COOKIE)?.value,
        {
            subject: gate.identity.subject,
            userId: gate.principal.user_id,
            credentialId: totp.credentialId,
        },
    );
    if (!proof) {
        redirect('/staff/mfa/verify');
    }

    return (
        <section className="mx-auto max-w-3xl px-6 py-16">
            <p className="text-sm uppercase tracking-widest text-foreground/50">Agora staff workspace</p>
            <h1 className="mt-3 text-3xl font-semibold">Welcome back</h1>
            <dl className="mt-8 space-y-3 text-sm">
                <div className="flex gap-3">
                    <dt className="w-28 text-foreground/50">Account</dt>
                    <dd>{gate.session?.user?.email ?? gate.session?.user?.name ?? 'Signed in'}</dd>
                </div>
                <div className="flex gap-3">
                    <dt className="w-28 text-foreground/50">Role</dt>
                    <dd className="font-mono text-xs leading-5">{gate.principal.role_id}</dd>
                </div>
            </dl>
            <div className="mt-10">
                <StaffSignOutButton />
            </div>
        </section>
    );
}
