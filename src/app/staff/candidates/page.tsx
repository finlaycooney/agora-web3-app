import { getCandidateProfileOptions, listCandidateProfiles } from '@/lib/candidate-profile-read';
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
    let canReviewDuplicates = false;
    try {
        const [result, options] = await Promise.all([
            listCandidateProfiles(gate.pool, gate.identity, gate.organizationId, LIST_LIMIT),
            getCandidateProfileOptions(gate.pool, gate.identity, gate.organizationId),
        ]);
        candidates = result?.candidates ?? [];
        canReviewDuplicates = options?.canReviewDuplicates === true;
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
                        description="People who have applied or been added to the workspace."
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
                    canReviewDuplicates={canReviewDuplicates}
                />
            )}
        </section>
    );
}
