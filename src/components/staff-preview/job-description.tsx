'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/staff-ui/card';

import { JobDocumentView, canonicalJobDocument } from './job-document';
import type { DemoJob } from './types';

export function JobDescription({ job }: { job: DemoJob }) {
    const canonical = canonicalJobDocument(job.descriptionDocument);
    return (
        <Card>
            <CardHeader className="gap-1">
                <CardTitle>Job description</CardTitle>
                <p className="text-xs text-muted-foreground">
                    Sample job description · synthetic design preview
                </p>
            </CardHeader>
            <CardContent>
                {canonical ? (
                    <JobDocumentView document={canonical} />
                ) : (
                    <p className="text-sm leading-6 text-muted-foreground">{job.summary}</p>
                )}
            </CardContent>
        </Card>
    );
}
