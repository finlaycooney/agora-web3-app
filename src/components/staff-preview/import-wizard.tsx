'use client';

import { useMemo, useRef, useState } from 'react';
import {
    ArrowLeft,
    ArrowRight,
    Check,
    CheckCircle2,
    CircleAlert,
    FileSpreadsheet,
    ListChecks,
    Upload,
} from 'lucide-react';

import { Button } from '@/components/staff-ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/staff-ui/card';
import { Checkbox } from '@/components/staff-ui/checkbox';
import { Label } from '@/components/staff-ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/staff-ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/staff-ui/table';
import { cn } from '@/lib/utils';

import {
    OWNERS,
    SAMPLE_CSV_COLUMNS,
    SAMPLE_CSV_RECORDS,
    TAG_VOCABULARY,
    type SampleCsvRecord,
} from './demo-data';
import { PageHeader, RequiredMark, StatusBadge, TagPill } from './shared';
import type { Candidate } from './types';

const STEPS = ['Choose data', 'Map fields', 'Review', 'Results'] as const;

const TARGET_FIELDS = ['Do not import', 'Name', 'Role', 'Email', 'Tags', 'Notes'] as const;

type TargetField = (typeof TARGET_FIELDS)[number];

const SEED_MAPPINGS: Record<string, TargetField> = {
    'Full name': 'Name',
    'Job title': 'Role',
    Email: 'Email',
    Skills: 'Tags',
    Notes: 'Notes',
};

interface MappedRecord {
    name: string;
    role: string;
    email: string;
    tags: string[];
    notes: string;
}

interface ReviewRow {
    key: number;
    mapped: MappedRecord;
    status: 'ready' | 'possible-match';
}

interface ImportResult {
    added: number;
    skipped: number;
}

function rawValues(record: SampleCsvRecord): Record<string, string> {
    return {
        'Full name': record.name,
        'Job title': record.role,
        Email: record.email,
        Skills: record.skills.join('; '),
        Notes: record.notes,
    };
}

function mapRecord(record: SampleCsvRecord, mappings: Record<string, TargetField>): MappedRecord {
    const raw = rawValues(record);
    const mapped: MappedRecord = { name: '', role: '', email: '', tags: [], notes: '' };
    for (const column of SAMPLE_CSV_COLUMNS) {
        const target = mappings[column];
        const value = raw[column] ?? '';
        if (target === 'Name') mapped.name = value;
        else if (target === 'Role') mapped.role = value;
        else if (target === 'Email') mapped.email = value;
        else if (target === 'Notes') mapped.notes = value;
        else if (target === 'Tags') {
            mapped.tags = value
                .split(';')
                .map((tag) => tag.trim())
                .filter((tag) => TAG_VOCABULARY.includes(tag));
        }
    }
    return mapped;
}

function StepIndicator({ step }: { step: number }) {
    return (
        <ol className="flex flex-wrap items-center gap-2" aria-label="Import progress">
            {STEPS.map((label, index) => {
                const current = index === step;
                const done = index < step;
                return (
                    <li key={label} className="flex items-center gap-2">
                        {index > 0 ? (
                            <span aria-hidden="true" className="h-px w-6 bg-border" />
                        ) : null}
                        <span
                            aria-current={current ? 'step' : undefined}
                            className={cn(
                                'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium',
                                current
                                    ? 'border-accent-foreground/40 bg-accent text-accent-foreground'
                                    : done
                                      ? 'border-transparent bg-secondary text-foreground'
                                      : 'border-border text-muted-foreground',
                            )}
                        >
                            {done ? (
                                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            ) : (
                                <span
                                    aria-hidden="true"
                                    className="flex h-4 w-4 items-center justify-center rounded-full border border-current text-[10px]"
                                >
                                    {index + 1}
                                </span>
                            )}
                            {label}
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}

export function ImportWizard({
    existingCandidates,
    onImport,
}: {
    existingCandidates: Candidate[];
    onImport: (imported: Candidate[]) => void;
}) {
    const [step, setStep] = useState(0);
    const [records, setRecords] = useState<SampleCsvRecord[]>([]);
    const [mappings, setMappings] = useState<Record<string, TargetField>>(SEED_MAPPINGS);
    const [owner, setOwner] = useState(OWNERS[0]);
    const [sharedTag, setSharedTag] = useState('none');
    const [acknowledged, setAcknowledged] = useState(false);
    const [result, setResult] = useState<ImportResult | null>(null);
    const importStarted = useRef(false);

    const sampleLoaded = records.length > 0;

    const reviewRows = useMemo<ReviewRow[]>(
        () =>
            records.map((record, index) => {
                const mapped = mapRecord(record, mappings);
                const mappedName = mapped.name.trim().toLowerCase();
                const mappedEmail = mapped.email.trim().toLowerCase();
                const isDuplicate = existingCandidates.some((candidate) => {
                    const nameMatch =
                        mappedName !== ''
                        && candidate.name.trim().toLowerCase() === mappedName;
                    const emailMatch =
                        mappedEmail !== ''
                        && candidate.email.trim().toLowerCase() === mappedEmail;
                    return nameMatch || emailMatch;
                });
                return {
                    key: index,
                    mapped,
                    status: isDuplicate ? 'possible-match' : 'ready',
                };
            }),
        [records, mappings, existingCandidates],
    );

    const readyRows = reviewRows.filter((row) => row.status === 'ready');
    const skippedRows = reviewRows.filter((row) => row.status === 'possible-match');

    const mappedTargets = SAMPLE_CSV_COLUMNS.map((column) => mappings[column]).filter(
        (target): target is TargetField => Boolean(target) && target !== 'Do not import',
    );
    const nameMapped = mappedTargets.includes('Name');
    const duplicateTargets = Array.from(new Set(mappedTargets)).length !== mappedTargets.length;
    const blankNames = reviewRows.some((row) => row.mapped.name.trim() === '');
    const mappingValid = nameMapped && !duplicateTargets && !blankNames;

    const loadSample = () => {
        setRecords(SAMPLE_CSV_RECORDS);
        setMappings(SEED_MAPPINGS);
    };

    const runImport = () => {
        if (importStarted.current || readyRows.length === 0) return;
        importStarted.current = true;
        const imported: Candidate[] = readyRows.map((row) => ({
            id: crypto.randomUUID(),
            name: row.mapped.name.trim(),
            headline: row.mapped.role.trim() || 'Role not specified',
            location: 'Not provided',
            email: row.mapped.email.trim(),
            owner,
            source: 'CSV import',
            tags: Array.from(
                new Set([...row.mapped.tags, ...(sharedTag === 'none' ? [] : [sharedTag])]),
            ),
            availability: 'Not specified',
            restricted: false,
            summary: 'Imported from sample CSV in the design preview.',
            addedDaysAgo: 0,
            documents: [],
            applications: [],
            notes:
                row.mapped.notes.trim() === ''
                    ? []
                    : [
                          {
                              id: crypto.randomUUID(),
                              body: row.mapped.notes,
                              author: 'Imported record',
                              createdLabel: 'Imported from sample CSV',
                          },
                      ],
        }));
        onImport(imported);
        setResult({ added: imported.length, skipped: skippedRows.length });
        setStep(3);
    };

    return (
        <div className="flex flex-col gap-6">
            <a
                href="#/candidates"
                className="inline-flex w-fit items-center gap-1.5 rounded-sm text-sm font-medium text-accent-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Candidates
            </a>
            <PageHeader
                eyebrow="Workspace"
                title="Import candidates"
                description="Bring your existing talent network into Agora."
            />
            <StepIndicator step={step} />

            {step === 0 ? (
                <div className="grid gap-6 lg:grid-cols-3">
                    <Card className="lg:col-span-2">
                        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
                            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent">
                                <Upload className="h-6 w-6 text-accent-foreground" aria-hidden="true" />
                            </span>
                            <div className="flex flex-col gap-1">
                                <h2 className="text-base font-semibold text-foreground">
                                    Try a sample CSV
                                </h2>
                                <p className="max-w-md text-sm text-muted-foreground">
                                    File uploads are not connected in this design preview. Use synthetic
                                    sample data.
                                </p>
                            </div>
                            {sampleLoaded ? (
                                <div className="flex w-full max-w-md flex-col gap-2 rounded-lg border border-border p-3 text-left">
                                    <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                                        <FileSpreadsheet
                                            className="h-4 w-4 text-muted-foreground"
                                            aria-hidden="true"
                                        />
                                        Sample CSV loaded — {records.length} records
                                    </p>
                                    {records.map((record) => (
                                        <p key={record.email} className="text-xs text-muted-foreground">
                                            {record.name} · {record.role} · {record.email}
                                        </p>
                                    ))}
                                </div>
                            ) : null}
                            <div className="flex items-center gap-2">
                                <Button variant={sampleLoaded ? 'outline' : 'default'} onClick={loadSample}>
                                    <FileSpreadsheet aria-hidden="true" />
                                    Use sample CSV
                                </Button>
                                <Button disabled={!sampleLoaded} onClick={() => setStep(1)}>
                                    Continue
                                    <ArrowRight aria-hidden="true" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <ListChecks className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                What you can import
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ul className="flex flex-col gap-2 text-sm text-foreground">
                                <li className="flex items-center gap-2">
                                    <Check className="h-3.5 w-3.5 text-success-foreground" aria-hidden="true" />
                                    Names
                                </li>
                                <li className="flex items-center gap-2">
                                    <Check className="h-3.5 w-3.5 text-success-foreground" aria-hidden="true" />
                                    Contact details
                                </li>
                                <li className="flex items-center gap-2">
                                    <Check className="h-3.5 w-3.5 text-success-foreground" aria-hidden="true" />
                                    Roles
                                </li>
                                <li className="flex items-center gap-2">
                                    <Check className="h-3.5 w-3.5 text-success-foreground" aria-hidden="true" />
                                    Tags
                                </li>
                                <li className="flex items-center gap-2">
                                    <Check className="h-3.5 w-3.5 text-success-foreground" aria-hidden="true" />
                                    Source
                                </li>
                            </ul>
                            <p className="mt-4 text-xs text-muted-foreground">
                                CV uploads will be a separate step.
                            </p>
                        </CardContent>
                    </Card>
                </div>
            ) : null}

            {step === 1 ? (
                <div className="grid gap-6 lg:grid-cols-3">
                    <Card className="lg:col-span-2">
                        <CardHeader>
                            <CardTitle>Map CSV columns</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>CSV column</TableHead>
                                        <TableHead>Imports as</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {SAMPLE_CSV_COLUMNS.map((column) => (
                                        <TableRow key={column}>
                                            <TableCell className="font-medium">{column}</TableCell>
                                            <TableCell>
                                                <Select
                                                    value={mappings[column]}
                                                    onValueChange={(value) =>
                                                        setMappings({
                                                            ...mappings,
                                                            [column]: value as TargetField,
                                                        })
                                                    }
                                                >
                                                    <SelectTrigger
                                                        aria-label={`Map ${column} to`}
                                                        className="w-48"
                                                    >
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {TARGET_FIELDS.map((field) => (
                                                            <SelectItem key={field} value={field}>
                                                                {field}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            {!nameMapped ? (
                                <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
                                    <CircleAlert className="h-4 w-4" aria-hidden="true" />
                                    A Name mapping is required.
                                </p>
                            ) : null}
                            {nameMapped && blankNames ? (
                                <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
                                    <CircleAlert className="h-4 w-4" aria-hidden="true" />
                                    Mapped names must not be blank.
                                </p>
                            ) : null}
                            {duplicateTargets ? (
                                <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
                                    <CircleAlert className="h-4 w-4" aria-hidden="true" />
                                    Each field can only be mapped once.
                                </p>
                            ) : null}
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Import settings</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="import-owner">Owner <RequiredMark /></Label>
                                <Select value={owner} onValueChange={setOwner}>
                                    <SelectTrigger
                                        id="import-owner"
                                        aria-label="Owner for imported candidates"
                                        aria-required="true"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {OWNERS.map((name) => (
                                            <SelectItem key={name} value={name}>
                                                {name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="import-tag">Shared tag (optional)</Label>
                                <Select value={sharedTag} onValueChange={setSharedTag}>
                                    <SelectTrigger id="import-tag" aria-label="Shared tag for imported candidates">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">No shared tag</SelectItem>
                                        {TAG_VOCABULARY.map((tag) => (
                                            <SelectItem key={tag} value={tag}>
                                                {tag}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-xs font-medium text-muted-foreground">Source</span>
                                <span className="text-sm text-foreground">CSV design sample</span>
                            </div>
                            <div className="flex items-center justify-between gap-2 pt-2">
                                <Button variant="outline" onClick={() => setStep(0)}>
                                    <ArrowLeft aria-hidden="true" />
                                    Back
                                </Button>
                                <Button disabled={!mappingValid} onClick={() => setStep(2)}>
                                    Continue
                                    <ArrowRight aria-hidden="true" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            ) : null}

            {step === 2 ? (
                <div className="grid gap-6 lg:grid-cols-3">
                    <Card className="lg:col-span-2">
                        <CardHeader>
                            <CardTitle>
                                {readyRows.length} ready · {skippedRows.length} possible match
                                {skippedRows.length === 1 ? '' : 'es'}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead className="hidden md:table-cell">Email</TableHead>
                                        <TableHead className="hidden md:table-cell">Tags</TableHead>
                                        <TableHead>Decision</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {reviewRows.map((row) => (
                                        <TableRow key={row.key}>
                                            <TableCell className="font-medium">
                                                {row.mapped.name || '—'}
                                            </TableCell>
                                            <TableCell>{row.mapped.role || '—'}</TableCell>
                                            <TableCell className="hidden md:table-cell">
                                                {row.mapped.email || 'Not provided'}
                                            </TableCell>
                                            <TableCell className="hidden md:table-cell">
                                                <div className="flex flex-wrap gap-1">
                                                    {Array.from(new Set(row.mapped.tags)).map(
                                                        (tag) => (
                                                            <TagPill key={tag}>{tag}</TagPill>
                                                        ),
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {row.status === 'ready' ? (
                                                    <StatusBadge tone="success">Ready</StatusBadge>
                                                ) : (
                                                    <StatusBadge tone="warning">
                                                        Possible match — Skip
                                                    </StatusBadge>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            {skippedRows.length > 0 ? (
                                <p className="text-xs text-muted-foreground">
                                    Possible matches are skipped by default. Nothing is merged in this
                                    preview.
                                </p>
                            ) : null}
                            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3">
                                <Checkbox
                                    checked={acknowledged}
                                    onCheckedChange={(checked) => setAcknowledged(checked === true)}
                                    className="mt-0.5"
                                />
                                <span className="text-sm text-foreground">
                                    Import only the ready records; skip the possible match
                                </span>
                            </label>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Import summary</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                            {readyRows.length === 0 ? (
                                <p className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
                                    No new records to import. Every row matches an existing
                                    candidate.
                                </p>
                            ) : (
                                readyRows.map((row) => (
                                    <div
                                        key={row.key}
                                        className="flex flex-col gap-1.5 rounded-lg border border-border p-3"
                                    >
                                        <span className="text-sm font-medium text-foreground">
                                            {row.mapped.name}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {row.mapped.role || 'Role not specified'} · Owner {owner} ·{' '}
                                            {row.mapped.email || 'Not provided'}
                                        </span>
                                        <div className="flex flex-wrap gap-1">
                                            {Array.from(
                                                new Set([
                                                    ...row.mapped.tags,
                                                    ...(sharedTag === 'none' ? [] : [sharedTag]),
                                                ]),
                                            ).map((tag) => (
                                                <TagPill key={tag}>{tag}</TagPill>
                                            ))}
                                        </div>
                                        {row.mapped.notes ? (
                                            <span className="text-xs text-muted-foreground">
                                                {row.mapped.notes}
                                            </span>
                                        ) : null}
                                        <span className="text-[11px] font-medium text-accent-foreground">
                                            Imported from sample CSV
                                        </span>
                                    </div>
                                ))
                            )}
                            <div className="flex items-center justify-between gap-2 pt-2">
                                <Button variant="outline" onClick={() => setStep(1)}>
                                    <ArrowLeft aria-hidden="true" />
                                    Back
                                </Button>
                                {readyRows.length === 0 ? (
                                    <Button variant="outline" disabled>
                                        No new records to import
                                    </Button>
                                ) : (
                                    <Button disabled={!acknowledged} onClick={runImport}>
                                        <CheckCircle2 aria-hidden="true" />
                                        Import {readyRows.length} demo candidates
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            ) : null}

            {step === 3 && result ? (
                <Card>
                    <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
                        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success">
                            <CheckCircle2 className="h-6 w-6 text-success-foreground" aria-hidden="true" />
                        </span>
                        <div className="flex flex-col gap-1">
                            <h2 className="text-base font-semibold text-foreground">Import complete</h2>
                            <p className="text-sm text-muted-foreground">
                                {result.added} added · {result.skipped} skipped
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <StatusBadge tone="success">{result.added} added</StatusBadge>
                            <StatusBadge tone="warning">{result.skipped} skipped</StatusBadge>
                        </div>
                        <Button asChild>
                            <a href="#/candidates">
                                View candidates
                                <ArrowRight aria-hidden="true" />
                            </a>
                        </Button>
                    </CardContent>
                </Card>
            ) : null}
        </div>
    );
}
