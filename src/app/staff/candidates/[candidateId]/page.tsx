import { notFound } from 'next/navigation';
import { getCandidateWorkspace } from '@/lib/pipeline-operations';
import { StaffAuthorizationError } from '@/lib/staff-authorization';
import { requireStaffVerified } from '@/lib/staff-gate.server';
import { CandidateDetail } from './candidate-detail';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Candidate · Agora staff' };

export default async function StaffCandidatePage(
    { params }: { params: Promise<{ candidateId: string }> },
) {
    const gate = await requireStaffVerified();
    const { candidateId } = await params;
    let workspace = null;
    try {
        workspace = await getCandidateWorkspace(
            gate.pool, gate.identity, gate.organizationId, { candidateId });
    } catch (error) {
        if (error instanceof StaffAuthorizationError && error.code === 'FORBIDDEN') {
            return (
                <section className="mx-auto max-w-4xl px-6 py-12">
                    <h1 className="text-2xl font-semibold">Candidate</h1>
                    <p className="mt-6 text-sm text-muted-foreground">
                        Candidate access requires the candidates.read permission.
                    </p>
                </section>
            );
        }
        if ((error as { code?: string })?.code === 'P0002') {
            notFound();
        }
        throw error;
    }

    return (
        <section className="mx-auto max-w-6xl px-6 py-10">
            <CandidateDetail workspace={workspace} />
        </section>
    );
}
