import { notFound } from 'next/navigation';
import { getClient } from '@/lib/client-job-operations';
import { requireStaffVerified } from '@/lib/staff-gate.server';
import { ClientForm } from '../../workspace-forms';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Client · Agora staff' };

export default async function StaffClientPage(
    { params }: { params: Promise<{ clientId: string }> },
) {
    const gate = await requireStaffVerified();
    const { clientId } = await params;

    let client = null;
    try {
        const result = await getClient(gate.pool, gate.identity, gate.organizationId, { clientId });
        client = result?.client ?? result;
    } catch {
        client = null;
    }
    if (!client) {
        notFound();
    }

    return (
        <section className="mx-auto max-w-3xl px-6 py-12">
            <div className="flex items-baseline justify-between">
                <h1 className="text-2xl font-semibold">{client.name}</h1>
                <span className="text-xs uppercase tracking-widest text-foreground/50">
                    {client.status}{client.isStealth ? ' · stealth' : ''}
                </span>
            </div>
            <ClientForm clientId={client.id} initial={client} />
        </section>
    );
}
