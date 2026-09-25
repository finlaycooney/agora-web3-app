import { requireStaffVerified } from '@/lib/staff-gate.server';
import { ClientForm } from '../../workspace-forms';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'New client · Agora staff' };

export default async function StaffClientNewPage() {
    await requireStaffVerified();
    return (
        <section className="mx-auto max-w-3xl px-6 py-12">
            <h1 className="text-2xl font-semibold">New client</h1>
            <ClientForm />
        </section>
    );
}
