import { listCandidates } from '@/lib/pipeline-operations';
import { StaffAuthorizationError } from '@/lib/staff-authorization';
import { requireStaffVerified } from '@/lib/staff-gate.server';
import { CandidatesBrowser } from './candidates-browser';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Candidates · Agora staff' };

export default async function StaffCandidatesPage() {
    const gate = await requireStaffVerified();
    let candidates: any[] | null = null;
    try {
        const result = await listCandidates(
            gate.pool, gate.identity, gate.organizationId, {});
        candidates = result?.candidates ?? [];
    } catch (error) {
        if (!(error instanceof StaffAuthorizationError && error.code === 'FORBIDDEN')) {
            throw error;
        }
    }

    return (
        <section className="mx-auto max-w-6xl px-6 py-10">
            {candidates === null ? (
                <>
                    <h1 className="text-[26px] leading-8 font-medium">Candidates</h1>
                    <p className="mt-6 text-sm text-muted-foreground">
                        Candidate access requires the candidates.read permission.
                    </p>
                </>
            ) : (
                <CandidatesBrowser candidates={candidates} />
            )}
        </section>
    );
}
