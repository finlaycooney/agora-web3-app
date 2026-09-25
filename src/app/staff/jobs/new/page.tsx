import { listClients } from '@/lib/client-job-operations';
import { requireStaffVerified } from '@/lib/staff-gate.server';
import { JobForm } from '../../workspace-forms';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'New job · Agora staff' };

export default async function StaffJobNewPage() {
    const gate = await requireStaffVerified();
    const clients = await listClients(gate.pool, gate.identity, gate.organizationId, {});

    return (
        <section className="mx-auto max-w-3xl px-6 py-12">
            <h1 className="text-2xl font-semibold">New job draft</h1>
            {clients.length === 0 ? (
                <p className="mt-8 text-sm text-foreground/60">
                    Create a client first — jobs belong to clients.
                </p>
            ) : (
                <JobForm clients={clients.map((client: any) => ({ id: client.id, name: client.name }))} />
            )}
        </section>
    );
}
