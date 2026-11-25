'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
    Briefcase,
    CircleAlert,
    FileText,
    Lock,
    Pencil,
    Plus,
    ShieldAlert,
    UserRound,
} from 'lucide-react';

import { Badge } from '@/components/staff-ui/badge';
import { Button } from '@/components/staff-ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/staff-ui/card';
import { Checkbox } from '@/components/staff-ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/staff-ui/dialog';
import { Input } from '@/components/staff-ui/input';
import { Label } from '@/components/staff-ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/staff-ui/popover';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/staff-ui/tabs';

import { STAGE_TONES } from './application-model';
import {
    DEMO_USER,
    OWNERS,
    TAG_VOCABULARY,
    formatReceivedDate,
    isJobOpen,
} from './demo-data';
import { CandidateDocuments } from './candidate-documents';
import { NoteComposer, NotesList } from './candidate-notes';
import { CandidateNotesPreview } from './candidate-notes-preview';
import { CandidateSummary } from './candidate-summary';
import type { CandidateTab } from './preview-navigation';
import { EmptyState, FieldLabel, InitialsAvatar, RequiredMark, StatusBadge, TagPill } from './shared';
import type {
    ApplicationStage,
    Candidate,
    CandidateApplication,
    DemoClient,
    DemoJob,
    PrivacyCase,
} from './types';

function stageLabel(stage: ApplicationStage): string {
    return stage;
}

export function CandidateDetail({
    candidate,
    privacyCase,
    initialTab,
    tab,
    onTabChange,
    suppressInitialFocus,
    jobs,
    clients,
    onAddApplication,
    onUpdateCandidate,
    onAddNote,
    onSetTags,
}: {
    candidate: Candidate | undefined;
    privacyCase?: PrivacyCase;
    initialTab?: string;
    tab: CandidateTab;
    onTabChange: (tab: CandidateTab) => void;
    suppressInitialFocus?: boolean;
    jobs: DemoJob[];
    clients: DemoClient[];
    onAddApplication: (
        candidateId: string,
        jobId: string,
    ) => CandidateApplication | null;
    onUpdateCandidate: (
        id: string,
        fields: Pick<Candidate, 'name' | 'headline' | 'location' | 'email' | 'owner'>,
    ) => void;
    onAddNote: (id: string, body: string) => void;
    onSetTags: (id: string, tags: string[]) => void;
}) {
    const [editOpen, setEditOpen] = useState(false);
    const [applicationOpen, setApplicationOpen] = useState(false);
    const [applicationJobId, setApplicationJobId] = useState('');
    const [applicationError, setApplicationError] = useState('');
    const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
    const headingRef = useRef<HTMLHeadingElement>(null);
    const [editForm, setEditForm] = useState({
        name: '',
        headline: '',
        location: '',
        email: '',
        owner: DEMO_USER,
    });
    const [statusMessage, setStatusMessage] = useState('');
    const [editError, setEditError] = useState('');
    const noteRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (suppressInitialFocus) return;
        if (initialTab === 'notes') {
            noteRef.current?.focus();
        } else {
            headingRef.current?.focus();
        }
    }, [initialTab, suppressInitialFocus]);

    if (!candidate) {
        return (
            <EmptyState
                icon={UserRound}
                title="Candidate not found"
                description="This demo record does not exist. It may have been reset."
                action={
                    <Button variant="outline" asChild>
                        <a href="#/candidates">View all candidates</a>
                    </Button>
                }
            />
        );
    }

    if (candidate.restricted) {
        return (
            <div className="flex flex-col gap-6">
                <Card>
                    <CardContent className="flex flex-col gap-4 p-6">
                        <div className="flex items-center gap-4">
                            <InitialsAvatar name={candidate.name} size="lg" />
                            <div className="flex flex-col gap-1">
                                <h1 className="text-[26px] leading-8 font-medium text-foreground">
                                    {candidate.name}
                                </h1>
                                <div className="flex items-center gap-2">
                                    <StatusBadge tone="restriction">Restricted</StatusBadge>
                                    <span className="text-xs text-muted-foreground">
                                        Record {candidate.id}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-start gap-3 rounded-lg border border-restriction/60 bg-restriction/40 p-4">
                            <ShieldAlert
                                className="mt-0.5 h-4 w-4 shrink-0 text-restriction-foreground"
                                aria-hidden="true"
                            />
                            <div className="flex flex-col gap-1">
                                <p className="text-sm font-medium text-restriction-foreground">
                                    Staff access restricted
                                </p>
                                <p className="text-sm text-restriction-foreground/90">
                                    Review this record through its privacy case. Notes, contact details
                                    and documents are hidden in this preview.
                                </p>
                            </div>
                        </div>
                        {privacyCase ? (
                            <Button variant="outline" className="w-fit" asChild>
                                <a href="#/privacy">
                                    <Lock aria-hidden="true" />
                                    Open privacy case {privacyCase.reference}
                                </a>
                            </Button>
                        ) : null}
                    </CardContent>
                </Card>
            </div>
        );
    }

    const openJobs = jobs.filter((job) => isJobOpen(job));
    const selectedApplicationJob = openJobs.find((job) => job.id === applicationJobId);
    const selectedApplicationClient = selectedApplicationJob
        ? clients.find((client) => client.id === selectedApplicationJob.clientId)
        : undefined;
    const existingApplication = selectedApplicationJob
        ? candidate.applications.find(
              (application) => application.jobId === selectedApplicationJob.id,
          )
        : undefined;

    const openApplicationDialog = () => {
        setApplicationJobId('');
        setApplicationError('');
        setApplicationOpen(true);
    };

    const submitApplication = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!selectedApplicationJob) {
            setApplicationError('Choose an open job first.');
            return;
        }
        if (existingApplication) {
            setApplicationError('This candidate is already in that job’s pipeline.');
            return;
        }
        const application = onAddApplication(candidate.id, selectedApplicationJob.id);
        if (!application) {
            setApplicationError('This application could not be added.');
            return;
        }
        setApplicationOpen(false);
        setApplicationJobId('');
        setApplicationError('');
        setStatusMessage(`Demo application added for ${application.job}.`);
    };

    const openEdit = () => {
        setEditForm({
            name: candidate.name,
            headline: candidate.headline,
            location: candidate.location,
            email: candidate.email,
            owner: candidate.owner,
        });
        setEditOpen(true);
    };

    const submitEdit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (editForm.name.trim() === '') {
            setEditError('A name is required.');
            return;
        }
        onUpdateCandidate(candidate.id, {
            name: editForm.name.trim(),
            headline: editForm.headline.trim() || 'Role not specified',
            location: editForm.location.trim() || 'Location not specified',
            email: editForm.email.trim(),
            owner: editForm.owner,
        });
        setEditOpen(false);
        setEditError('');
        setStatusMessage('Demo profile updated.');
    };

    const toggleTag = (tag: string, checked: boolean | 'indeterminate') => {
        const next =
            checked === true
                ? [...candidate.tags, tag]
                : candidate.tags.filter((existing) => existing !== tag);
        onSetTags(candidate.id, next);
    };

    const goToNotes = () => {
        onTabChange('notes');
        window.setTimeout(() => noteRef.current?.focus(), 0);
    };

    return (
        <div className="flex flex-col gap-6">
            <p
                role="status"
                aria-live="polite"
                className={
                    statusMessage ? 'text-xs font-medium text-success-foreground' : 'sr-only'
                }
            >
                {statusMessage || 'Demo changes saved.'}
            </p>

            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4">
                    <InitialsAvatar name={candidate.name} size="lg" />
                    <div className="flex flex-col gap-1">
                        <h1
                            ref={headingRef}
                            tabIndex={-1}
                            className="text-[26px] leading-8 font-medium text-foreground outline-none"
                        >
                            {candidate.name}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {candidate.headline} · {candidate.location}
                        </p>
                        <div className="flex items-center gap-2">
                            <Badge variant="secondary">
                                Owner: {candidate.owner.split(' ')[0]}
                            </Badge>
                            <Badge variant="outline">{candidate.source}</Badge>
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" onClick={openApplicationDialog}>
                        <Briefcase aria-hidden="true" />
                        Add to job
                    </Button>
                    <Button variant="outline" onClick={openEdit}>
                        <Pencil aria-hidden="true" />
                        Edit profile
                    </Button>
                    <Button onClick={goToNotes}>
                        <Plus aria-hidden="true" />
                        Add note
                    </Button>
                </div>
            </div>

            <Tabs value={tab} onValueChange={(value) => onTabChange(value as CandidateTab)}>
                <TabsList aria-label="Candidate sections" className="grid grid-cols-2 sm:flex">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="applications">
                        Applications
                        <Badge variant="secondary">{candidate.applications.length}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="documents">
                        Documents
                        <Badge variant="secondary">{candidate.documents.length}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="notes">
                        Notes
                        <Badge variant="secondary">{candidate.notes.length}</Badge>
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="overview">
                    <div className="grid gap-6 lg:grid-cols-3">
                        <div className="flex flex-col gap-6 lg:col-span-2">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Candidate summary</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <CandidateSummary candidate={candidate} />
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardTitle>Applications</CardTitle>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-3">
                                    {candidate.applications.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">
                                            No applications yet for this candidate.
                                        </p>
                                    ) : (
                                        candidate.applications.map((application) => (
                                            <div
                                                key={application.id}
                                                className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                                            >
                                                <div className="flex min-w-0 flex-col">
                                                    <a
                                                        href={`#/jobs/${application.jobId}`}
                                                        className="w-fit truncate rounded-sm text-sm font-medium text-foreground outline-none hover:text-accent-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                                    >
                                                        {application.job}
                                                    </a>
                                                    <span className="text-xs text-muted-foreground">
                                                        {application.client} · Received {formatReceivedDate(application.receivedAt)}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">
                                                        Owner · {application.owner ?? candidate.owner} · Source ·{' '}
                                                        {application.source ?? candidate.source}
                                                    </span>
                                                </div>
                                                <StatusBadge tone={STAGE_TONES[application.stage]}>
                                                    {stageLabel(application.stage)}
                                                </StatusBadge>
                                            </div>
                                        ))
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                        <div className="flex flex-col gap-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Details</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <dl className="flex flex-col gap-3">
                                        <FieldLabel label="Owner">{candidate.owner}</FieldLabel>
                                        <FieldLabel label="Source">{candidate.source}</FieldLabel>
                                        <FieldLabel label="Availability">
                                            {candidate.availability}
                                        </FieldLabel>
                                        <FieldLabel label="Email">
                                            {candidate.email || 'Not provided'}
                                        </FieldLabel>
                                    </dl>
                                </CardContent>
                            </Card>
                            <CandidateNotesPreview
                                notes={candidate.notes}
                                onViewAll={() => onTabChange('notes')}
                                onAdd={goToNotes}
                            />
                            <Card>
                                <CardHeader className="flex-row items-center justify-between">
                                    <CardTitle>Tags</CardTitle>
                                    <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" size="sm">
                                                Edit tags
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent align="end" className="w-56">
                                            <div className="flex flex-col gap-2">
                                                <p className="text-xs font-medium text-muted-foreground">
                                                    Shared tag vocabulary
                                                </p>
                                                {TAG_VOCABULARY.map((tag) => (
                                                    <label
                                                        key={tag}
                                                        className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-hover"
                                                    >
                                                        <Checkbox
                                                            checked={candidate.tags.includes(tag)}
                                                            onCheckedChange={(checked) =>
                                                                toggleTag(tag, checked)
                                                            }
                                                        />
                                                        {tag}
                                                    </label>
                                                ))}
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                </CardHeader>
                                <CardContent>
                                    {candidate.tags.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">No tags yet.</p>
                                    ) : (
                                        <div className="flex flex-wrap gap-1.5">
                                            {candidate.tags.map((tag) => (
                                                <TagPill key={tag}>{tag}</TagPill>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="applications">
                    {candidate.applications.length === 0 ? (
                        <EmptyState
                            icon={FileText}
                            title="No applications"
                            description="This candidate has not applied to any jobs in the demo data."
                        />
                    ) : (
                        <div className="overflow-hidden rounded-lg border border-border bg-card">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Job</TableHead>
                                        <TableHead>Client</TableHead>
                                        <TableHead>Stage</TableHead>
                                        <TableHead>Received</TableHead>
                                        <TableHead className="hidden lg:table-cell">Owner</TableHead>
                                        <TableHead className="hidden lg:table-cell">Source</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {candidate.applications.map((application) => (
                                        <TableRow key={application.id}>
                                            <TableCell className="font-medium">
                                                <a
                                                    href={`#/jobs/${application.jobId}`}
                                                    className="rounded-sm outline-none hover:text-accent-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                                >
                                                    {application.job}
                                                </a>
                                            </TableCell>
                                            <TableCell>{application.client}</TableCell>
                                            <TableCell>
                                                <StatusBadge tone={STAGE_TONES[application.stage]}>
                                                    {stageLabel(application.stage)}
                                                </StatusBadge>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {formatReceivedDate(application.receivedAt)}
                                            </TableCell>
                                            <TableCell className="hidden text-muted-foreground lg:table-cell">
                                                {application.owner ?? candidate.owner}
                                            </TableCell>
                                            <TableCell className="hidden text-muted-foreground lg:table-cell">
                                                {application.source ?? candidate.source}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="documents">
                    <CandidateDocuments candidate={candidate} />
                </TabsContent>

                <TabsContent value="notes">
                    <div className="flex max-w-2xl flex-col gap-4">
                        <NoteComposer
                            ref={noteRef}
                            onSave={(body) => {
                                onAddNote(candidate.id, body);
                                setStatusMessage('Demo note saved.');
                            }}
                        />
                        <NotesList notes={candidate.notes} />
                    </div>
                </TabsContent>
            </Tabs>

            <Dialog open={applicationOpen} onOpenChange={setApplicationOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add candidate to a job</DialogTitle>
                        <DialogDescription>
                            Creates a separate application in the selected client pipeline.
                        </DialogDescription>
                    </DialogHeader>
                    <form className="grid gap-4" onSubmit={submitApplication}>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="application-job">
                                Open job <RequiredMark />
                            </Label>
                            <Select
                                value={applicationJobId}
                                onValueChange={(value) => {
                                    setApplicationJobId(value);
                                    setApplicationError('');
                                }}
                            >
                                <SelectTrigger
                                    id="application-job"
                                    aria-label="Open job"
                                    aria-required="true"
                                >
                                    <SelectValue placeholder="Choose a job" />
                                </SelectTrigger>
                                <SelectContent>
                                    {openJobs.map((job) => {
                                        const clientName =
                                            clients.find((client) => client.id === job.clientId)
                                                ?.name ?? job.clientId;
                                        return (
                                            <SelectItem key={job.id} value={job.id}>
                                                {job.title} · {clientName}
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                        </div>

                        {selectedApplicationJob ? (
                            <div className="rounded-lg border border-border bg-secondary/50 p-3 text-sm">
                                <p className="font-medium text-foreground">
                                    {selectedApplicationJob.title}
                                </p>
                                <p className="text-muted-foreground">
                                    {selectedApplicationClient?.name
                                        ?? selectedApplicationJob.clientId}
                                </p>
                            </div>
                        ) : null}

                        {existingApplication ? (
                            <div
                                role="alert"
                                className="flex items-start gap-3 rounded-lg border border-warning/60 bg-warning/40 p-3"
                            >
                                <CircleAlert
                                    className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground"
                                    aria-hidden="true"
                                />
                                <div className="flex flex-col gap-1 text-sm">
                                    <p className="font-medium text-warning-foreground">
                                        Already in this pipeline
                                    </p>
                                    <p className="text-warning-foreground/90">
                                        Owner · {existingApplication.owner ?? candidate.owner} ·
                                        Source · {existingApplication.source ?? candidate.source} ·
                                        Stage · {existingApplication.stage}
                                    </p>
                                </div>
                            </div>
                        ) : null}

                        {applicationError ? (
                            <p role="alert" className="text-sm text-destructive">
                                {applicationError}
                            </p>
                        ) : null}
                        <DialogFooter>
                            <Button
                                variant="outline"
                                type="button"
                                onClick={() => setApplicationOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={!selectedApplicationJob || Boolean(existingApplication)}
                            >
                                Add to pipeline
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit profile</DialogTitle>
                        <DialogDescription>
                            Updates the demo record in memory only — nothing is persisted.
                        </DialogDescription>
                    </DialogHeader>
                    <form className="grid gap-4" onSubmit={submitEdit}>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="edit-name">Name <RequiredMark /></Label>
                            <Input
                                id="edit-name"
                                required
                                aria-required="true"
                                value={editForm.name}
                                maxLength={256}
                                aria-invalid={editError !== ''}
                                aria-describedby={editError ? 'edit-candidate-error' : undefined}
                                onChange={(event) =>
                                    setEditForm({ ...editForm, name: event.target.value })
                                }
                            />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="edit-headline">Role</Label>
                                <Input
                                    id="edit-headline"
                                    value={editForm.headline}
                                    onChange={(event) =>
                                        setEditForm({ ...editForm, headline: event.target.value })
                                    }
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="edit-location">Location</Label>
                                <Input
                                    id="edit-location"
                                    value={editForm.location}
                                    onChange={(event) =>
                                        setEditForm({ ...editForm, location: event.target.value })
                                    }
                                />
                            </div>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="edit-email">Email</Label>
                            <Input
                                id="edit-email"
                                type="email"
                                maxLength={254}
                                value={editForm.email}
                                onChange={(event) =>
                                    setEditForm({ ...editForm, email: event.target.value })
                                }
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="edit-owner">Owner <RequiredMark /></Label>
                            <Select
                                value={editForm.owner}
                                onValueChange={(value) => setEditForm({ ...editForm, owner: value })}
                            >
                                <SelectTrigger id="edit-owner" aria-label="Owner" aria-required="true">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {OWNERS.map((owner) => (
                                        <SelectItem key={owner} value={owner}>
                                            {owner}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {editError ? (
                            <p
                                id="edit-candidate-error"
                                role="alert"
                                className="text-sm text-destructive"
                            >
                                {editError}
                            </p>
                        ) : null}
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setEditOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit">Save changes</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
