'use client';

import { useEffect, useRef, useState } from 'react';
import { Briefcase, ChevronsUpDown, Plus, X } from 'lucide-react';

import { Badge } from '@/components/staff-ui/badge';
import { Button } from '@/components/staff-ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/staff-ui/card';
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/staff-ui/select';
import {
    ClientJobContractError,
    EMPTY_JOB_DOCUMENT,
    normalizeJobDocument,
    validateJobDraftInput,
    validateJobReadyInput,
} from '@/lib/client-job-contracts.js';
import {
    LOCATION_OPTIONS,
    canonicalLocationLabel,
} from '@/lib/location-options.js';

import { FieldError, formatFieldError, type EditorGuard } from './client-editor';
import {
    BONUS_TYPE_LABELS,
    EMPLOYMENT_TYPE_LABELS,
    PAY_PERIOD_LABELS,
    WORKPLACE_MODE_LABELS,
    employmentTypeLabel,
    jobCompensationLabel,
    jobLocationLabel,
} from './demo-data';
import { canonicalJobDocument, JobDocumentView } from './job-document';
import { RichTextEditor } from './rich-text-editor';
import { EmptyState, PageHeader, RequiredMark, StatusBadge, TagPill } from './shared';
import type {
    BonusType,
    DemoClient,
    DemoJob,
    EmploymentType,
    JobBonus,
    JobDocument,
    JobFields,
    PayPeriod,
    WorkplaceMode,
} from './types';

const NONE = '__none__';

interface FormState {
    clientId: string;
    title: string;
    employmentType: EmploymentType | '';
    workplaceMode: WorkplaceMode | '';
    locations: string[];
    remoteRegions: string[];
    compensationMin: string;
    compensationMax: string;
    currency: string;
    payPeriod: PayPeriod | '';
    bonuses: JobBonus[];
}

function formFromSource(source: {
    clientId: string;
} & JobFields): FormState {
    return {
        clientId: source.clientId,
        title: source.title,
        employmentType: source.employmentType ?? '',
        workplaceMode: source.workplaceMode ?? '',
        locations: [...source.locations],
        remoteRegions: [...source.remoteRegions],
        compensationMin: source.compensationMin ?? '',
        compensationMax: source.compensationMax ?? '',
        currency: source.currency ?? '',
        payPeriod: source.payPeriod ?? '',
        bonuses: source.bonuses.map((bonus) => ({ ...bonus })),
    };
}

function fingerprint(
    clientId: string,
    form: FormState,
    document: unknown,
): string {
    const canonicalDoc = canonicalJobDocument(document) ?? document;
    return JSON.stringify({
        clientId,
        title: form.title.trim(),
        employmentType: form.employmentType || null,
        workplaceMode: form.workplaceMode || null,
        locations: form.locations.map((entry) => entry.trim()).filter(Boolean),
        remoteRegions: form.remoteRegions.map((entry) => entry.trim()).filter(Boolean),
        compensationMin: form.compensationMin.trim() || null,
        compensationMax: form.compensationMax.trim() || null,
        currency: form.currency.trim().toUpperCase() || null,
        payPeriod: form.payPeriod || null,
        bonuses: form.bonuses
            .filter((bonus) => bonus.details.trim() !== '')
            .map((bonus) => ({ type: bonus.type, details: bonus.details.trim() })),
        descriptionDocument: canonicalDoc,
    });
}

export function JobEditor({
    jobId,
    presetClientId,
    clients,
    jobs,
    onSaveDraft,
    onPublish,
    onDuplicate,
    onNavigate,
    registerGuard,
}: {
    jobId: string | null;
    presetClientId: string | null;
    clients: DemoClient[];
    jobs: DemoJob[];
    onSaveDraft: (jobId: string | null, clientId: string, fields: JobFields) => string;
    onPublish: (jobId: string | null, clientId: string, fields: JobFields) => string;
    onDuplicate: (jobId: string) => string | null;
    onNavigate: (hash: string) => void;
    registerGuard: (guard: EditorGuard | null) => void;
}) {
    const [createdId, setCreatedId] = useState<string | null>(null);
    const persistedId = jobId ?? createdId;
    const persisted = persistedId ? (jobs.find((entry) => entry.id === persistedId) ?? null) : null;
    const activeClients = clients.filter((entry) => entry.status === 'active');
    const presetClient = activeClients.find((entry) => entry.id === presetClientId) ?? null;
    const source = persisted?.draft ?? persisted;
    const [form, setForm] = useState<FormState>(() =>
        formFromSource(
            source ?? {
                clientId: presetClient?.id ?? '',
                title: '',
                employmentType: null,
                workplaceMode: null,
                locations: [],
                remoteRegions: [],
                compensationMin: null,
                compensationMax: null,
                currency: null,
                payPeriod: null,
                bonuses: [],
                descriptionDocument: EMPTY_JOB_DOCUMENT as JobDocument,
            },
        ),
    );
    const [document, setDocument] = useState<unknown>(
        source?.descriptionDocument ?? EMPTY_JOB_DOCUMENT,
    );
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>(
        persisted ? 'saved' : 'idle',
    );
    const [reviewOpen, setReviewOpen] = useState(false);
    const [reviewFields, setReviewFields] = useState<JobFields | null>(null);
    const [reviewClient, setReviewClient] = useState<DemoClient | null>(null);

    const isPublished = persisted?.publicationState === 'published';
    const hasDraftChanges = Boolean(persisted?.draft);
    const clientFixed = persisted !== null || presetClient !== null;

    const [savedFingerprint, setSavedFingerprint] = useState(() =>
        fingerprint(form.clientId, form, document),
    );
    const currentFingerprint = fingerprint(form.clientId, form, document);
    const dirty = currentFingerprint !== savedFingerprint;
    const dirtyRef = useRef(dirty);
    useEffect(() => {
        dirtyRef.current = dirty;
    });

    const collectInput = () => ({
        title: form.title,
        employmentType: (form.employmentType || null) as EmploymentType | null,
        workplaceMode: (form.workplaceMode || null) as WorkplaceMode | null,
        locations: form.locations.map((entry) => entry.trim()).filter(Boolean),
        remoteRegions: form.remoteRegions.map((entry) => entry.trim()).filter(Boolean),
        compensationMin: form.compensationMin.trim() || null,
        compensationMax: form.compensationMax.trim() || null,
        currency: form.currency.trim().toUpperCase() || null,
        payPeriod: (form.payPeriod || null) as PayPeriod | null,
        bonuses: form.bonuses
            .filter((bonus) => bonus.details.trim() !== '')
            .map((bonus) => ({ type: bonus.type, details: bonus.details.trim() })),
        descriptionDocument: normalizeJobDocument(document) as JobDocument,
    });

    const saveDraft = (): boolean => {
        const nextErrors: Record<string, string> = {};
        if (!activeClients.some((client) => client.id === form.clientId)) {
            nextErrors.clientId = 'select an active client';
        }
        let canonical: JobFields | null = null;
        try {
            canonical = validateJobDraftInput(collectInput()) as JobFields;
        } catch (error) {
            if (error instanceof ClientJobContractError) {
                Object.assign(nextErrors, error.fieldErrors);
            } else {
                throw error;
            }
        }
        if (Object.keys(nextErrors).length > 0 || !canonical) {
            setErrors(nextErrors);
            return false;
        }
        const id = onSaveDraft(persistedId, form.clientId, canonical);
        if (!persistedId) setCreatedId(id);
        setSavedFingerprint(
            fingerprint(form.clientId, form, canonical.descriptionDocument),
        );
        dirtyRef.current = false;
        setErrors({});
        setSaveStatus('saved');
        return true;
    };

    const saveDraftRef = useRef(saveDraft);
    useEffect(() => {
        saveDraftRef.current = saveDraft;
    });

    useEffect(() => {
        registerGuard({
            isDirty: () => dirtyRef.current,
            saveDraft: () => saveDraftRef.current(),
        });
        return () => registerGuard(null);
    }, [registerGuard]);

    // Autosave only once a draft revision exists (draft job, or a working
    // revision on a published job). New/published records need an explicit save.
    const canAutosave = Boolean(
        persisted && (persisted.publicationState === 'draft' || persisted.draft),
    );
    useEffect(() => {
        if (!dirty || !canAutosave) return;
        const timer = setTimeout(() => {
            setSaveStatus('saving');
            const ok = saveDraftRef.current();
            setSaveStatus(ok ? 'saved' : 'idle');
        }, 700);
        return () => clearTimeout(timer);
    }, [dirty, canAutosave, currentFingerprint]);

    const update = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }));
    const fieldError = (field: string) => errors[field];
    const rowError = (field: 'locations' | 'remoteRegions', index: number) =>
        errors[`${field}[${index}]`];
    const bonusError = (index: number) =>
        errors[`bonuses[${index}].details`]
        ?? errors[`bonuses[${index}].type`]
        ?? errors[`bonuses[${index}]`];

    const reviewPublish = () => {
        const nextErrors: Record<string, string> = {};
        if (!activeClients.some((client) => client.id === form.clientId)) {
            nextErrors.clientId = 'select an active client';
        }
        let canonical: JobFields | null = null;
        try {
            canonical = validateJobReadyInput(collectInput()) as JobFields;
        } catch (error) {
            if (error instanceof ClientJobContractError) {
                Object.assign(nextErrors, error.fieldErrors);
            } else {
                throw error;
            }
        }
        if (Object.keys(nextErrors).length > 0 || !canonical) {
            setErrors(nextErrors);
            return;
        }
        setErrors({});
        setReviewFields(canonical);
        setReviewClient(clients.find((client) => client.id === form.clientId) ?? null);
        setReviewOpen(true);
    };

    const confirmPublish = () => {
        if (!reviewFields) return;
        const id = onPublish(persistedId, form.clientId, reviewFields);
        if (!persistedId) setCreatedId(id);
        setSavedFingerprint(
            fingerprint(form.clientId, form, reviewFields.descriptionDocument),
        );
        dirtyRef.current = false;
        setReviewOpen(false);
        setReviewFields(null);
        setReviewClient(null);
        onNavigate(`#/jobs/${id}`);
    };

    const duplicate = () => {
        if (!persistedId) return;
        const newId = onDuplicate(persistedId);
        if (newId) onNavigate(`#/jobs/${newId}/edit`);
    };

    if (jobId && !persisted) {
        return (
            <EmptyState
                icon={Briefcase}
                title="Job not found"
                description="This job is not part of the sample data."
                action={
                    <Button variant="outline" asChild>
                        <a href="#/jobs">All jobs</a>
                    </Button>
                }
            />
        );
    }

    const client = clients.find((entry) => entry.id === form.clientId);
    const statusText =
        saveStatus === 'saving'
            ? 'Saving…'
            : dirty
              ? 'Unsaved changes'
              : saveStatus === 'saved'
                ? 'Saved'
                : 'Not saved yet';

    const editorKey = persistedId ?? 'new';

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                eyebrow="Jobs"
                title={persisted ? `Edit ${persisted.title || 'job'}` : 'New job'}
                description="Drafts are checked against the job contract and stored only in this preview session."
                actions={
                    persistedId ? (
                        <>
                            <Button variant="outline" asChild>
                                <a href={`#/jobs/${persistedId}`}>View job</a>
                            </Button>
                            <Button variant="outline" onClick={duplicate}>
                                Duplicate job
                            </Button>
                        </>
                    ) : null
                }
            />

            <div className="flex flex-wrap items-center gap-2">
                {persisted ? (
                    <>
                        <StatusBadge tone={isPublished ? 'success' : 'secondary'}>
                            {isPublished ? 'Published' : 'Draft'}
                        </StatusBadge>
                        {hasDraftChanges ? <TagPill>Draft changes</TagPill> : null}
                        <TagPill>
                            Job v{persisted.jobVersion} · revision v
                            {persisted.draft?.revisionVersion ?? persisted.revisionVersion}
                        </TagPill>
                    </>
                ) : null}
                {statusText ? (
                    <span role="status" className="text-xs text-muted-foreground">
                        {statusText}
                    </span>
                ) : null}
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Role</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="job-client">Client <RequiredMark /></Label>
                        {clientFixed ? (
                            <div
                                id="job-client"
                                className="flex h-9 items-center gap-2 rounded-lg border border-input bg-secondary/40 px-3 text-sm text-foreground"
                            >
                                <span>{client?.name ?? presetClient?.name ?? 'Client'}</span>
                                {client?.isStealth ? (
                                    <Badge variant="outline">Identity hidden externally</Badge>
                                ) : null}
                            </div>
                        ) : (
                            <Select
                                value={form.clientId}
                                onValueChange={(value) => update({ clientId: value })}
                            >
                                <SelectTrigger
                                    id="job-client"
                                    aria-label="Client"
                                    aria-required="true"
                                    aria-invalid={fieldError('clientId') ? 'true' : undefined}
                                >
                                    <SelectValue placeholder="Select a client" />
                                </SelectTrigger>
                                <SelectContent>
                                    {activeClients.map((entry) => (
                                        <SelectItem key={entry.id} value={entry.id}>
                                            {entry.name}
                                            {entry.isStealth ? ' (identity hidden)' : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        <FieldError id="job-client-error" message={fieldError('clientId')} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="job-title">Job title <RequiredMark /></Label>
                        <Input
                            id="job-title"
                            required
                            aria-required="true"
                            value={form.title}
                            onChange={(event) => update({ title: event.target.value })}
                            aria-invalid={fieldError('title') ? 'true' : undefined}
                            aria-describedby={fieldError('title') ? 'job-title-error' : undefined}
                        />
                        <FieldError id="job-title-error" message={fieldError('title')} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="job-employment-type">
                            Employment type <RequiredMark />
                        </Label>
                        <Select
                            value={form.employmentType || NONE}
                            onValueChange={(value) =>
                                update({
                                    employmentType:
                                        value === NONE ? '' : (value as EmploymentType),
                                })
                            }
                        >
                            <SelectTrigger
                                id="job-employment-type"
                                aria-required="true"
                                aria-invalid={fieldError('employmentType') ? 'true' : undefined}
                            >
                                <SelectValue placeholder="Not specified" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NONE}>Not specified</SelectItem>
                                {Object.entries(EMPLOYMENT_TYPE_LABELS).map(([value, label]) => (
                                    <SelectItem key={value} value={value}>
                                        {label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FieldError
                            id="job-employment-type-error"
                            message={fieldError('employmentType')}
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="job-workplace-mode">
                            Workplace mode <RequiredMark />
                        </Label>
                        <Select
                            value={form.workplaceMode || NONE}
                            onValueChange={(value) =>
                                update({
                                    workplaceMode:
                                        value === NONE ? '' : (value as WorkplaceMode),
                                })
                            }
                        >
                            <SelectTrigger
                                id="job-workplace-mode"
                                aria-required="true"
                                aria-invalid={fieldError('workplaceMode') ? 'true' : undefined}
                            >
                                <SelectValue placeholder="Not specified" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NONE}>Not specified</SelectItem>
                                {Object.entries(WORKPLACE_MODE_LABELS).map(([value, label]) => (
                                    <SelectItem key={value} value={value}>
                                        {label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FieldError
                            id="job-workplace-mode-error"
                            message={fieldError('workplaceMode')}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Locations and remote eligibility</CardTitle>
                    <p className="text-xs text-muted-foreground">
                        Choose supported cities, countries or regions from the suggestions; Worldwide
                        is supported. Locations are required to publish on-site or hybrid jobs;
                        remote regions are required for remote jobs and must be empty for on-site jobs.
                    </p>
                </CardHeader>
                <CardContent className="grid gap-6 sm:grid-cols-2">
                    <LabelledList
                        legend="Locations"
                        addLabel="Add location"
                        placeholder="City or office…"
                        entries={form.locations}
                        onChange={(locations) => update({ locations })}
                        rowError={(index) => rowError('locations', index)}
                        groupError={fieldError('locations')}
                        required={form.workplaceMode === 'onsite' || form.workplaceMode === 'hybrid'}
                    />
                    <LabelledList
                        legend="Remote regions"
                        addLabel="Add remote region"
                        placeholder="e.g. UK, EU, Worldwide…"
                        entries={form.remoteRegions}
                        onChange={(remoteRegions) => update({ remoteRegions })}
                        rowError={(index) => rowError('remoteRegions', index)}
                        groupError={fieldError('remoteRegions')}
                        required={form.workplaceMode === 'remote'}
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                        Job description <RequiredMark />
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                        Required to publish. Saved as a canonical document; links must be http(s).
                    </p>
                </CardHeader>
                <CardContent className="flex flex-col gap-1.5">
                    <RichTextEditor
                        key={editorKey}
                        initialDocument={source?.descriptionDocument ?? EMPTY_JOB_DOCUMENT}
                        onDocumentChange={setDocument}
                        invalid={Boolean(fieldError('descriptionDocument'))}
                    />
                    <FieldError
                        id="job-description-error"
                        message={fieldError('descriptionDocument')}
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Compensation</CardTitle>
                    <p className="text-xs text-muted-foreground">
                        Base pay fields are required to publish; bonuses are optional.
                    </p>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="job-comp-min">Minimum <RequiredMark /></Label>
                            <Input
                                id="job-comp-min"
                                required
                                aria-required="true"
                                inputMode="decimal"
                                value={form.compensationMin}
                                onChange={(event) =>
                                    update({ compensationMin: event.target.value })
                                }
                                placeholder="e.g. 80000"
                                aria-invalid={fieldError('compensationMin') ? 'true' : undefined}
                                aria-describedby={
                                    fieldError('compensationMin') ? 'job-comp-min-error' : undefined
                                }
                            />
                            <FieldError
                                id="job-comp-min-error"
                                message={fieldError('compensationMin')}
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="job-comp-max">Maximum <RequiredMark /></Label>
                            <Input
                                id="job-comp-max"
                                required
                                aria-required="true"
                                inputMode="decimal"
                                value={form.compensationMax}
                                onChange={(event) =>
                                    update({ compensationMax: event.target.value })
                                }
                                placeholder="e.g. 100000"
                                aria-invalid={fieldError('compensationMax') ? 'true' : undefined}
                                aria-describedby={
                                    fieldError('compensationMax') ? 'job-comp-max-error' : undefined
                                }
                            />
                            <FieldError
                                id="job-comp-max-error"
                                message={fieldError('compensationMax')}
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="job-currency">Currency <RequiredMark /></Label>
                            <Input
                                id="job-currency"
                                required
                                aria-required="true"
                                value={form.currency}
                                onChange={(event) =>
                                    update({ currency: event.target.value.toUpperCase() })
                                }
                                placeholder="GBP"
                                maxLength={3}
                                aria-invalid={fieldError('currency') ? 'true' : undefined}
                                aria-describedby={
                                    fieldError('currency') ? 'job-currency-error' : undefined
                                }
                            />
                            <FieldError id="job-currency-error" message={fieldError('currency')} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="job-pay-period">
                                Pay period <RequiredMark />
                            </Label>
                            <Select
                                value={form.payPeriod || NONE}
                                onValueChange={(value) =>
                                    update({
                                        payPeriod: value === NONE ? '' : (value as PayPeriod),
                                    })
                                }
                            >
                                <SelectTrigger
                                    id="job-pay-period"
                                    aria-required="true"
                                    aria-invalid={fieldError('payPeriod') ? 'true' : undefined}
                                >
                                    <SelectValue placeholder="Not specified" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NONE}>Not specified</SelectItem>
                                    {Object.entries(PAY_PERIOD_LABELS).map(([value, label]) => (
                                        <SelectItem key={value} value={value}>
                                            Per {label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FieldError
                                id="job-pay-period-error"
                                message={fieldError('payPeriod')}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium text-foreground">Bonuses</span>
                            <span className="text-xs text-muted-foreground">
                                Up to 5 entries, one per type.
                            </span>
                        </div>
                        {form.bonuses.map((bonus, index) => (
                            <div key={index} className="flex flex-col gap-1.5">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                                    <div className="flex flex-col gap-1.5 sm:w-44">
                                        <Label htmlFor={`bonus-type-${index}`}>
                                            Type <RequiredMark />
                                        </Label>
                                        <Select
                                            value={bonus.type}
                                            onValueChange={(value) =>
                                                update({
                                                    bonuses: form.bonuses.map((entry, i) =>
                                                        i === index
                                                            ? {
                                                                  ...entry,
                                                                  type: value as BonusType,
                                                              }
                                                            : entry,
                                                    ),
                                                })
                                            }
                                        >
                                            <SelectTrigger
                                                id={`bonus-type-${index}`}
                                                aria-required="true"
                                            >
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {Object.entries(BONUS_TYPE_LABELS).map(
                                                    ([value, label]) => (
                                                        <SelectItem key={value} value={value}>
                                                            {label}
                                                        </SelectItem>
                                                    ),
                                                )}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex flex-1 flex-col gap-1.5">
                                        <Label htmlFor={`bonus-details-${index}`}>
                                            Details <RequiredMark />
                                        </Label>
                                        <Input
                                            id={`bonus-details-${index}`}
                                            required
                                            aria-required="true"
                                            value={bonus.details}
                                            onChange={(event) =>
                                                update({
                                                    bonuses: form.bonuses.map((entry, i) =>
                                                        i === index
                                                            ? {
                                                                  ...entry,
                                                                  details: event.target.value,
                                                              }
                                                            : entry,
                                                    ),
                                                })
                                            }
                                            placeholder="e.g. Annual bonus up to 10%"
                                            aria-invalid={bonusError(index) ? 'true' : undefined}
                                            aria-describedby={
                                                bonusError(index)
                                                    ? `bonus-details-${index}-error`
                                                    : undefined
                                            }
                                        />
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label={`Remove bonus ${index + 1}`}
                                        onClick={() =>
                                            update({
                                                bonuses: form.bonuses.filter(
                                                    (_, i) => i !== index,
                                                ),
                                            })
                                        }
                                    >
                                        <X aria-hidden="true" />
                                    </Button>
                                </div>
                                <FieldError
                                    id={`bonus-details-${index}-error`}
                                    message={bonusError(index)}
                                />
                            </div>
                        ))}
                        {fieldError('bonuses') ? (
                            <p role="alert" className="text-xs text-destructive">
                                {formatFieldError(fieldError('bonuses') ?? '')}
                            </p>
                        ) : null}
                        <div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={form.bonuses.length >= 5}
                                onClick={() =>
                                    update({
                                        bonuses: [
                                            ...form.bonuses,
                                            { type: 'cash', details: '' },
                                        ],
                                    })
                                }
                            >
                                <Plus aria-hidden="true" />
                                Add bonus
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="outline" onClick={saveDraft}>
                    Save draft
                </Button>
                <Button type="button" onClick={reviewPublish}>
                    Review public post
                </Button>
                {persistedId ? null : (
                    <Button variant="ghost" asChild>
                        <a href="#/jobs">Cancel</a>
                    </Button>
                )}
            </div>

            <Dialog
                open={reviewOpen}
                onOpenChange={(open) => {
                    if (!open) {
                        setReviewOpen(false);
                        setReviewFields(null);
                        setReviewClient(null);
                    }
                }}
            >
                <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Public post preview</DialogTitle>
                        <DialogDescription>
                            This is exactly what candidates will see on the external job board.
                        </DialogDescription>
                    </DialogHeader>
                    {reviewFields ? (
                        <PublicPostPreview fields={reviewFields} client={reviewClient} />
                    ) : null}
                    <p role="note" className="rounded-lg bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
                        This synthetic preview validates stored structured fields only. Review the
                        free-text job description for internal names, contacts or links before
                        publishing.
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setReviewOpen(false)}>
                            Back to editing
                        </Button>
                        <Button onClick={confirmPublish}>
                            {isPublished ? 'Publish changes' : 'Publish job'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

const MAX_LOCATION_SUGGESTIONS = 12;

function locationSuggestions(value: string): string[] {
    const query = value.trim().toLowerCase();
    const matches = query
        ? LOCATION_OPTIONS.filter((option) => option.toLowerCase().includes(query))
        : LOCATION_OPTIONS;
    return matches
        .slice()
        .sort((left, right) => {
            const leftStarts = left.toLowerCase().startsWith(query) ? 0 : 1;
            const rightStarts = right.toLowerCase().startsWith(query) ? 0 : 1;
            return leftStarts - rightStarts || left.localeCompare(right);
        })
        .slice(0, MAX_LOCATION_SUGGESTIONS);
}

function LocationInput({
    id,
    value,
    placeholder,
    required,
    invalid,
    describedBy,
    onValueChange,
}: {
    id: string;
    value: string;
    placeholder: string;
    required: boolean;
    invalid: boolean;
    describedBy?: string;
    onValueChange: (value: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [highlighted, setHighlighted] = useState(0);
    const suggestions = locationSuggestions(value);
    const listboxId = `${id}-suggestions`;

    const selectSuggestion = (option: string) => {
        onValueChange(option);
        setOpen(false);
        setHighlighted(0);
    };

    return (
        <div className="relative">
            <Input
                id={id}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={open}
                aria-controls={listboxId}
                aria-activedescendant={
                    open && suggestions[highlighted]
                        ? `${listboxId}-${highlighted}`
                        : undefined
                }
                value={value}
                placeholder={placeholder}
                className="pr-9"
                onFocus={() => setOpen(true)}
                onChange={(event) => {
                    onValueChange(event.target.value);
                    setOpen(true);
                    setHighlighted(0);
                }}
                onBlur={(event) => {
                    const canonical = canonicalLocationLabel(event.target.value);
                    if (canonical && canonical !== value) onValueChange(canonical);
                    setOpen(false);
                }}
                onKeyDown={(event) => {
                    if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        setOpen(true);
                        setHighlighted((index) =>
                            suggestions.length ? (index + 1) % suggestions.length : 0,
                        );
                    } else if (event.key === 'ArrowUp') {
                        event.preventDefault();
                        setOpen(true);
                        setHighlighted((index) =>
                            suggestions.length
                                ? (index - 1 + suggestions.length) % suggestions.length
                                : 0,
                        );
                    } else if (event.key === 'Enter' && open && suggestions[highlighted]) {
                        event.preventDefault();
                        selectSuggestion(suggestions[highlighted]);
                    } else if (event.key === 'Escape') {
                        setOpen(false);
                    }
                }}
                required={required}
                aria-required={required ? 'true' : undefined}
                aria-invalid={invalid ? 'true' : undefined}
                aria-describedby={describedBy}
            />
            <ChevronsUpDown
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            {open ? (
                <div
                    id={listboxId}
                    role="listbox"
                    aria-label={`${id} suggestions`}
                    className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
                >
                    {suggestions.length > 0 ? (
                        suggestions.map((option, index) => (
                            <button
                                key={option}
                                id={`${listboxId}-${index}`}
                                type="button"
                                role="option"
                                aria-selected={index === highlighted}
                                tabIndex={-1}
                                className={
                                    index === highlighted
                                        ? 'flex w-full rounded-md bg-accent px-3 py-2 text-left text-sm text-foreground outline-none'
                                        : 'flex w-full rounded-md px-3 py-2 text-left text-sm text-foreground outline-none hover:bg-hover'
                                }
                                onMouseDown={(event) => event.preventDefault()}
                                onMouseEnter={() => setHighlighted(index)}
                                onClick={() => selectSuggestion(option)}
                            >
                                {option}
                            </button>
                        ))
                    ) : (
                        <p className="px-3 py-2 text-sm text-muted-foreground">
                            No supported locations found.
                        </p>
                    )}
                </div>
            ) : null}
        </div>
    );
}

function LabelledList({
    legend,
    addLabel,
    placeholder,
    entries,
    onChange,
    rowError,
    groupError,
    required = false,
}: {
    legend: string;
    addLabel: string;
    placeholder: string;
    entries: string[];
    onChange: (entries: string[]) => void;
    rowError: (index: number) => string | undefined;
    groupError?: string;
    required?: boolean;
}) {
    return (
        <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium text-foreground">
                {legend} {required ? <RequiredMark /> : null}
            </legend>
            {entries.map((entry, index) => (
                <div key={index} className="flex flex-col gap-1.5">
                    <div className="flex items-end gap-2">
                        <div className="flex flex-1 flex-col gap-1.5">
                            <Label htmlFor={`${legend}-${index}`} className="sr-only">
                                {legend} {index + 1}
                            </Label>
                            <LocationInput
                                id={`${legend}-${index}`}
                                value={entry}
                                placeholder={placeholder}
                                required={required}
                                invalid={Boolean(rowError(index))}
                                describedBy={
                                    rowError(index) ? `${legend}-${index}-error` : undefined
                                }
                                onValueChange={(value) =>
                                    onChange(
                                        entries.map((entryValue, i) =>
                                            i === index ? value : entryValue,
                                        ),
                                    )
                                }
                            />
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${legend.toLowerCase()} ${index + 1}`}
                            onClick={() => onChange(entries.filter((_, i) => i !== index))}
                        >
                            <X aria-hidden="true" />
                        </Button>
                    </div>
                    <FieldError id={`${legend}-${index}-error`} message={rowError(index)} />
                </div>
            ))}
            {groupError ? (
                <p role="alert" className="text-xs text-destructive">
                    {formatFieldError(groupError)}
                </p>
            ) : null}
            <div>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onChange([...entries, ''])}
                >
                    <Plus aria-hidden="true" />
                    {addLabel}
                </Button>
            </div>
        </fieldset>
    );
}

export function PublicPostPreview({
    fields,
    client,
}: {
    fields: JobFields;
    client: DemoClient | null;
}) {
    const compensation = jobCompensationLabel(fields);
    return (
        <div
            className="flex flex-col gap-4 rounded-lg border border-border bg-background p-4"
            data-testid="public-post-preview"
        >
            <div className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold text-foreground">
                    {fields.title || 'Untitled job'}
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                    <TagPill>{employmentTypeLabel(fields.employmentType)}</TagPill>
                    {fields.workplaceMode ? (
                        <TagPill>{WORKPLACE_MODE_LABELS[fields.workplaceMode]}</TagPill>
                    ) : null}
                    <TagPill>{jobLocationLabel(fields)}</TagPill>
                    {compensation ? <TagPill>{compensation}</TagPill> : null}
                </div>
            </div>

            <div className="flex flex-col gap-1">
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Company
                </span>
                {client?.isStealth ? (
                    <>
                        <span className="text-sm font-semibold text-foreground">
                            Stealth company
                        </span>
                        <p className="text-sm text-muted-foreground">
                            {client.anonymousDescription}
                        </p>
                    </>
                ) : (
                    <span className="text-sm font-semibold text-foreground">
                        {client?.name ?? 'Client'}
                    </span>
                )}
            </div>

            {fields.bonuses.length > 0 ? (
                <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        Bonuses
                    </span>
                    <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
                        {fields.bonuses.map((bonus, index) => (
                            <li key={index}>
                                <span className="font-medium text-foreground">
                                    {BONUS_TYPE_LABELS[bonus.type]}:
                                </span>{' '}
                                {bonus.details}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            <JobDocumentView document={fields.descriptionDocument} />
        </div>
    );
}
