import { Card, CardContent } from '@/components/staff-ui/card';
import { PageHeader } from '@/components/staff-preview/shared';
import { requireStaffVerified } from '@/lib/staff-gate.server';
import { loadStaffWorkspace } from '@/lib/workspace.server';
import { ClientsHiring, OverviewMetrics, ReviewQueue } from './overview-sections';
import { StaffTodoList } from './staff-todo-list';
import { SummaryRetry } from './summary-retry';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Overview · Agora staff' };

export default async function StaffOverviewPage() {
    await requireStaffVerified();
    const { summary } = await loadStaffWorkspace();

    if (!summary) {
        return (
            <section className="mx-auto flex w-full max-w-7xl flex-col gap-6">
                <PageHeader
                    eyebrow="Workspace"
                    title="Overview"
                    description="A snapshot of your recruiting pipeline for today."
                />
                <Card>
                    <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                        <p className="text-sm text-muted-foreground">
                            Workspace summary is temporarily unavailable.
                        </p>
                        <SummaryRetry />
                    </CardContent>
                </Card>
            </section>
        );
    }

    return (
        <section className="mx-auto flex w-full max-w-7xl flex-col gap-6">
            <PageHeader
                eyebrow="Workspace"
                title="Overview"
                description="A snapshot of your recruiting pipeline for today."
            />
            <OverviewMetrics summary={summary} />
            <div className="grid gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                    {summary.capabilities.tasks ? (
                        <StaffTodoList writeEnabled={summary.capabilities.writeTasks} />
                    ) : (
                        <Card id="tasks">
                            <CardContent className="py-8 text-center">
                                <p className="text-sm text-muted-foreground">
                                    Task tracking requires the collaboration.read permission.
                                </p>
                            </CardContent>
                        </Card>
                    )}
                    <ReviewQueue summary={summary} />
                </div>
                <ClientsHiring summary={summary} />
            </div>
        </section>
    );
}
