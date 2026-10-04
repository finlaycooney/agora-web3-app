import { requireStaffVerified } from '@/lib/staff-gate.server';
import { BackupCodesGenerateForm } from '../mfa-forms';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Backup codes · Agora staff' };

export default async function BackupCodesPage() {
    await requireStaffVerified();
    return <section className="mx-auto flex max-w-lg flex-col items-center px-6 py-12 text-center">
        <h1 className="text-2xl font-semibold">Backup codes</h1>
        <p className="mt-4 text-sm text-muted-foreground">Generate a set if you have not saved backup codes, or replace an old set. Enter a fresh code from your authenticator. Generating a new set invalidates every previous backup code.</p>
        <BackupCodesGenerateForm />
    </section>;
}
