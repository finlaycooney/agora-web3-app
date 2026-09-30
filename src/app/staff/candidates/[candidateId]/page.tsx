import { notFound, redirect } from 'next/navigation';
import { getCandidateProfile, resolveCandidateRedirect } from '@/lib/candidate-profile-read';
import { StaffAuthorizationError } from '@/lib/staff-authorization';
import { requireStaffVerified } from '@/lib/staff-gate.server';
import { PageHeader } from '@/components/staff-preview/shared';
import { Card, CardContent } from '@/components/staff-ui/card';
import { CandidateDetail } from './candidate-detail';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Candidate · Agora staff' };

export default async function StaffCandidatePage({
    params,
}: {
    params: Promise<{ candidateId: string }>;
}) {
    const gate = await requireStaffVerified();
    const { candidateId } = await params;
    let workspace = null;
    try {
        workspace = await getCandidateProfile(
            gate.pool, gate.identity, gate.organizationId, { candidateId });
    } catch (error) {
        if (error instanceof StaffAuthorizationError && error.code === 'FORBIDDEN') {
            return (
                <section className="mx-auto w-full max-w-5xl">
                    <PageHeader
                        eyebrow="Workspace"
                        title="Candidate"
                        description="Applications, documents and staff notes."
                    />
                    <Card className="mt-6">
                        <CardContent className="py-8 text-center">
                            <p className="text-sm text-muted-foreground">
                                Candidate access requires the candidates.read permission.
                            </p>
                        </CardContent>
                    </Card>
                </section>
            );
        }
        if ((error as { code?: string })?.code === 'P0002') {
            const target = await resolveCandidateRedirect(
                gate.pool, gate.identity, gate.organizationId, candidateId);
            if (target) redirect(`/staff/candidates/${target}`);
            notFound();
        }
        throw error;
    }

    return (
        <section className="mx-auto w-full max-w-7xl">
            <CandidateDetail workspace={workspace} />
        </section>
    );
}
