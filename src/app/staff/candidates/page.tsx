import { listCandidates } from '@/lib/pipeline-operations';
import { StaffAuthorizationError } from '@/lib/staff-authorization';
import { requireStaffVerified } from '@/lib/staff-gate.server';
import { PageHeader } from '@/components/staff-preview/shared';
import { Card, CardContent } from '@/components/staff-ui/card';
import { CandidatesBrowser } from './candidates-browser';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Candidates · Agora staff' };

const LIST_LIMIT = 500;

export default async function StaffCandidatesPage() {
    const gate = await requireStaffVerified();
    let candidates: any[] | null = null;
    try {
        const result = await listCandidates(
            gate.pool, gate.identity, gate.organizationId, { limit: LIST_LIMIT });
        candidates = result?.candidates ?? [];
    } catch (error) {
        if (!(error instanceof StaffAuthorizationError && error.code === 'FORBIDDEN')) {
            throw error;
        }
    }

    return (
        <section className="mx-auto w-full max-w-7xl">
            {candidates === null ? (
                <>
                    <PageHeader
                        eyebrow="Workspace"
                        title="Candidates"
                        description="Everyone who has applied or been added, deduplicated by email."
                    />
                    <Card className="mt-6">
                        <CardContent className="py-8 text-center">
                            <p className="text-sm text-muted-foreground">
                                Candidate access requires the candidates.read permission.
                            </p>
                        </CardContent>
                    </Card>
                </>
            ) : (
                <CandidatesBrowser
                    candidates={candidates}
                    capped={candidates.length >= LIST_LIMIT}
                />
            )}
        </section>
    );
}
