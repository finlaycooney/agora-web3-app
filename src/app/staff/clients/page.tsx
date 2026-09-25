import Link from 'next/link';
import { listClients } from '@/lib/client-job-operations';
import { requireStaffVerified } from '@/lib/staff-gate.server';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Clients · Agora staff' };

const th = 'px-3 py-2 text-left text-xs uppercase tracking-widest text-foreground/50';
const td = 'px-3 py-2.5 text-sm border-t border-foreground/10';

export default async function StaffClientsPage() {
    const gate = await requireStaffVerified();
    const clients = await listClients(gate.pool, gate.identity, gate.organizationId, {});

    return (
        <section className="mx-auto max-w-4xl px-6 py-12">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold">Clients</h1>
                <Link
                    href="/staff/clients/new"
                    className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-80"
                >
                    New client
                </Link>
            </div>
            {clients.length === 0 ? (
                <p className="mt-10 text-sm text-foreground/60">No clients yet.</p>
            ) : (
                <table className="mt-8 w-full border-collapse">
                    <thead>
                        <tr>
                            <th className={th}>Name</th>
                            <th className={th}>Status</th>
                            <th className={th}>Jobs</th>
                            <th className={th}>Version</th>
                        </tr>
                    </thead>
                    <tbody>
                        {clients.map((client: any) => (
                            <tr key={client.id} className={client.status === 'draft' ? 'opacity-60' : ''}>
                                <td className={td}>
                                    <Link href={`/staff/clients/${client.id}`} className="underline underline-offset-4 hover:opacity-70">
                                        {client.name}
                                    </Link>
                                    {client.isStealth && (
                                        <span className="ml-2 rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                                            stealth
                                        </span>
                                    )}
                                </td>
                                <td className={td}>{client.status}</td>
                                <td className={td}>{client.jobCount}</td>
                                <td className={`${td} font-mono text-xs`}>{client.version}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </section>
    );
}
