'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Plus, Search, Tag, Upload, UserRound, X } from 'lucide-react';

import { Button } from '@/components/staff-ui/button';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/staff-ui/tabs';
import { cn } from '@/lib/utils';

import { CandidatePreviewLink } from './candidate-preview';
import { DEMO_USER, OWNERS, TAG_VOCABULARY } from './demo-data';
import { CountChip, EmptyState, InitialsAvatar, PageHeader, RequiredMark, StatusBadge, TagPill } from './shared';
import type { BadgeTone, Candidate } from './types';

export interface CandidateFilters {
    query: string;
    owner: string;
    tag: string;
    tab: 'all' | 'mine' | 'recent';
    page: number;
}

const PAGE_SIZE = 6;

function documentTone(candidate: Candidate): { label: string; tone: BadgeTone } {
    if (candidate.restricted) return { label: 'Restricted', tone: 'restriction' };
    if (candidate.documents.some((d) => d.state === 'Scanning')) {
        return { label: 'Scanning', tone: 'warning' };
    }
    if (candidate.documents.some((d) => d.state === 'Available')) {
        return { label: 'CV on file', tone: 'success' };
    }
    if (candidate.documents.length > 0) {
        return { label: 'Unavailable', tone: 'secondary' };
    }
    return { label: 'No documents', tone: 'secondary' };
}

function matchesFilters(candidate: Candidate, filters: CandidateFilters): boolean {
    if (candidate.restricted) {
        if (filters.tab !== 'all' || filters.owner !== 'all' || filters.tag !== 'all') {
            return false;
        }
        const query = filters.query.trim().toLowerCase();
        if (!query) return true;
        return `${candidate.name} ${candidate.id}`.toLowerCase().includes(query);
    }
    if (filters.tab === 'mine' && candidate.owner !== DEMO_USER) return false;
    if (filters.tab === 'recent' && candidate.addedDaysAgo > 7) return false;
    if (filters.owner !== 'all' && candidate.owner !== filters.owner) return false;
    if (filters.tag !== 'all' && !candidate.tags.includes(filters.tag)) return false;
    const query = filters.query.trim().toLowerCase();
    if (query) {
        const haystack = `${candidate.name} ${candidate.headline} ${candidate.location} ${candidate.tags.join(' ')}`.toLowerCase();
        if (!haystack.includes(query)) return false;
    }
    return true;
}

function filtersActive(filters: CandidateFilters): boolean {
    return filters.query.trim() !== '' || filters.owner !== 'all' || filters.tag !== 'all';
}

interface AddCandidateForm {
    name: string;
    headline: string;
    location: string;
    email: string;
    owner: string;
    tag: string;
}

const EMPTY_FORM: AddCandidateForm = {
    name: '',
    headline: '',
    location: '',
    email: '',
    owner: DEMO_USER,
    tag: 'none',
};

export function CandidateList({
    candidates,
    filters,
    onFiltersChange,
    selectedIds,
    onSelectedIdsChange,
    onAddCandidate,
    onAddTagToCandidates,
}: {
    candidates: Candidate[];
    filters: CandidateFilters;
    onFiltersChange: (filters: CandidateFilters) => void;
    selectedIds: string[];
    onSelectedIdsChange: (ids: string[]) => void;
    onAddCandidate: (candidate: Candidate) => void;
    onAddTagToCandidates: (ids: string[], tag: string) => void;
}) {
    const selected = selectedIds;
    const setSelected = (updater: string[] | ((current: string[]) => string[])) =>
        onSelectedIdsChange(typeof updater === 'function' ? updater(selected) : updater);
    const [addOpen, setAddOpen] = useState(false);
    const [tagDialogOpen, setTagDialogOpen] = useState(false);
    const [bulkTag, setBulkTag] = useState(TAG_VOCABULARY[0]);
    const [form, setForm] = useState<AddCandidateForm>(EMPTY_FORM);
    const [formError, setFormError] = useState('');
    const [statusMessage, setStatusMessage] = useState('');

    const filtered = useMemo(
        () => candidates.filter((c) => matchesFilters(c, filters)),
        [candidates, filters],
    );

    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const page = Math.min(filters.page, pageCount);
    const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const rangeStart = filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    const rangeEnd = Math.min(filtered.length, page * PAGE_SIZE);

    const selectableIds = pageRows.filter((c) => !c.restricted).map((c) => c.id);
    const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.includes(id));
    const someSelected = selectableIds.some((id) => selected.includes(id));

    const update = (patch: Partial<CandidateFilters>) =>
        onFiltersChange({ ...filters, page: 1, ...patch });

    const clearFilters = () => onFiltersChange({ ...filters, query: '', owner: 'all', tag: 'all', page: 1 });

    const toggleSelected = (id: string, checked: boolean | 'indeterminate') => {
        setSelected((current) =>
            checked === true ? [...current, id] : current.filter((existing) => existing !== id),
        );
    };

    const toggleAll = (checked: boolean | 'indeterminate') => {
        setSelected((current) =>
            checked === true
                ? Array.from(new Set([...current, ...selectableIds]))
                : current.filter((id) => !selectableIds.includes(id)),
        );
    };

    const submitAddCandidate = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (form.name.trim() === '') {
            setFormError('A name is required.');
            return;
        }
        const candidate: Candidate = {
            id: crypto.randomUUID(),
            name: form.name.trim(),
            headline: form.headline.trim() || 'Role not specified',
            location: form.location.trim() || 'Location not specified',
            email: form.email.trim(),
            owner: form.owner,
            source: 'Manual',
            tags: form.tag === 'none' ? [] : [form.tag],
            availability: 'Not specified',
            restricted: false,
            summary: 'Added locally in the design preview. No profile details have been recorded yet.',
            addedDaysAgo: 0,
            documents: [],
            applications: [],
            notes: [],
        };
        onAddCandidate(candidate);
        setAddOpen(false);
        setForm(EMPTY_FORM);
        setFormError('');
        setStatusMessage(`Demo candidate ${candidate.name} added.`);
    };

    const submitBulkTag = () => {
        onAddTagToCandidates(selected, bulkTag);
        setStatusMessage(`Tag ${bulkTag} added to ${selected.length} candidate${selected.length === 1 ? '' : 's'}.`);
        setTagDialogOpen(false);
        setSelected([]);
    };

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                eyebrow="Workspace"
                title="Candidates"
                description="Your talent network, in one place."
                actions={
                    <>
                        <Button variant="outline" asChild>
                            <a href="#/import">
                                <Upload aria-hidden="true" />
                                Import candidates
                            </a>
                        </Button>
                        <Button onClick={() => setAddOpen(true)}>
                            <Plus aria-hidden="true" />
                            Add candidate
                        </Button>
                    </>
                }
            />

            <div className="flex flex-wrap items-center gap-2">
                <CountChip>All {candidates.length}</CountChip>
                <CountChip>
                    With applications {candidates.filter((c) => c.applications.length > 0).length}
                </CountChip>
                <CountChip>Restricted {candidates.filter((c) => c.restricted).length}</CountChip>
            </div>

            <Tabs
                value={filters.tab}
                onValueChange={(value) =>
                    update({ tab: value as CandidateFilters['tab'] })
                }
            >
                <TabsList aria-label="Candidate segments">
                    <TabsTrigger value="all">All candidates</TabsTrigger>
                    <TabsTrigger value="mine">Assigned to me</TabsTrigger>
                    <TabsTrigger value="recent">Recently added</TabsTrigger>
                </TabsList>
            </Tabs>

            <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:flex-row md:items-end">
                <div className="flex flex-1 flex-col gap-1.5">
                    <Label htmlFor="candidate-search">Search</Label>
                    <div className="relative">
                        <Search
                            className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <Input
                            id="candidate-search"
                            className="pl-9"
                            placeholder="Search name, role or tag…"
                            value={filters.query}
                            onChange={(event) => update({ query: event.target.value })}
                        />
                    </div>
                </div>
                <div className="flex flex-col gap-1.5 md:w-44">
                    <Label htmlFor="owner-filter">Owner</Label>
                    <Select value={filters.owner} onValueChange={(value) => update({ owner: value })}>
                        <SelectTrigger id="owner-filter" aria-label="Filter by owner">
                            <SelectValue placeholder="All owners" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All owners</SelectItem>
                            {OWNERS.map((owner) => (
                                <SelectItem key={owner} value={owner}>
                                    {owner}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex flex-col gap-1.5 md:w-44">
                    <Label htmlFor="tag-filter">Tag</Label>
                    <Select value={filters.tag} onValueChange={(value) => update({ tag: value })}>
                        <SelectTrigger id="tag-filter" aria-label="Filter by tag">
                            <SelectValue placeholder="All tags" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All tags</SelectItem>
                            {TAG_VOCABULARY.map((tag) => (
                                <SelectItem key={tag} value={tag}>
                                    {tag}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                {filtersActive(filters) ? (
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                        <X aria-hidden="true" />
                        Clear filters
                    </Button>
                ) : null}
            </div>

            <p
                role="status"
                aria-live="polite"
                className={
                    statusMessage ? 'text-xs font-medium text-success-foreground' : 'sr-only'
                }
            >
                {statusMessage || 'Demo changes saved.'}
            </p>

            {selected.length > 0 ? (
                <div className="flex items-center gap-3 rounded-lg border border-accent bg-accent/40 px-4 py-2.5">
                    <span className="text-sm font-medium text-accent-foreground">
                        {selected.length} selected
                    </span>
                    <Button variant="outline" size="sm" onClick={() => setTagDialogOpen(true)}>
                        <Tag aria-hidden="true" />
                        Add tag
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
                        Clear selection
                    </Button>
                </div>
            ) : null}

            {pageRows.length === 0 ? (
                <EmptyState
                    icon={UserRound}
                    title="No candidates match these filters"
                    description="Try a different search, or clear the filters to see the whole network."
                    action={
                        <Button variant="outline" onClick={clearFilters}>
                            Clear filters
                        </Button>
                    }
                />
            ) : (
                <div className="overflow-hidden rounded-lg border border-border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-10">
                                    <Checkbox
                                        aria-label="Select all visible candidates"
                                        checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                                        onCheckedChange={toggleAll}
                                    />
                                </TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead className="hidden lg:table-cell">Role</TableHead>
                                <TableHead className="hidden md:table-cell">Tags</TableHead>
                                <TableHead>Applications</TableHead>
                                <TableHead className="hidden md:table-cell">Owner</TableHead>
                                <TableHead>Documents</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {pageRows.map((candidate) => {
                                const doc = documentTone(candidate);
                                return (
                                    <TableRow
                                        key={candidate.id}
                                        data-state={selected.includes(candidate.id) ? 'selected' : undefined}
                                    >
                                        <TableCell>
                                            <Checkbox
                                                aria-label={
                                                    candidate.restricted
                                                        ? `${candidate.name} is restricted and cannot be selected`
                                                        : `Select ${candidate.name}`
                                                }
                                                disabled={candidate.restricted}
                                                title={
                                                    candidate.restricted
                                                        ? 'Restricted — review through the privacy case'
                                                        : undefined
                                                }
                                                checked={selected.includes(candidate.id)}
                                                onCheckedChange={(checked) => toggleSelected(candidate.id, checked)}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <InitialsAvatar name={candidate.name} />
                                                <div className="flex min-w-0 flex-col">
                                                    <CandidatePreviewLink
                                                        candidateId={candidate.id}
                                                        className={cn(
                                                            'truncate rounded-sm font-medium outline-none hover:text-accent-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring',
                                                            candidate.restricted
                                                                ? 'text-muted-foreground'
                                                                : 'text-foreground',
                                                        )}
                                                    >
                                                        {candidate.name}
                                                    </CandidatePreviewLink>
                                                    <span className="truncate text-xs text-muted-foreground">
                                                        {candidate.restricted
                                                            ? 'Restricted record'
                                                            : candidate.email || 'Not provided'}
                                                    </span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="hidden lg:table-cell">
                                            {candidate.restricted ? (
                                                <span className="text-muted-foreground">—</span>
                                            ) : (
                                                <div className="flex flex-col">
                                                    <span className="text-sm">{candidate.headline}</span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {candidate.location}
                                                    </span>
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell className="hidden md:table-cell">
                                            {candidate.restricted ? (
                                                <span className="text-muted-foreground">—</span>
                                            ) : (
                                                <div className="flex flex-wrap items-center gap-1">
                                                    {candidate.tags.slice(0, 2).map((tag) => (
                                                        <TagPill key={tag}>{tag}</TagPill>
                                                    ))}
                                                    {candidate.tags.length > 2 ? (
                                                        <span className="text-xs text-muted-foreground">
                                                            +{candidate.tags.length - 2}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {candidate.restricted ? (
                                                <span className="text-muted-foreground">—</span>
                                            ) : (
                                                <span className="text-sm">
                                                    {candidate.applications.length}
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="hidden md:table-cell">
                                            {candidate.restricted ? (
                                                <span className="text-muted-foreground">—</span>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <InitialsAvatar name={candidate.owner} size="sm" />
                                                    <span className="text-sm">
                                                        {candidate.owner.split(' ')[0]}
                                                    </span>
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge tone={doc.tone}>{doc.label}</StatusBadge>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                    <div className="flex items-center justify-between border-t border-border px-4 py-3">
                        <span className="text-xs text-muted-foreground">
                            Showing {rangeStart}–{rangeEnd} of {filtered.length}
                        </span>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page <= 1}
                                onClick={() => onFiltersChange({ ...filters, page: page - 1 })}
                            >
                                Previous
                            </Button>
                            <span className="text-xs text-muted-foreground">
                                Page {page} of {pageCount}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page >= pageCount}
                                onClick={() => onFiltersChange({ ...filters, page: page + 1 })}
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add a demo candidate</DialogTitle>
                        <DialogDescription>
                            Creates a synthetic record in this preview only. Do not enter real candidate
                            data.
                        </DialogDescription>
                    </DialogHeader>
                    <form className="grid gap-4" onSubmit={submitAddCandidate}>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="add-name">Name <RequiredMark /></Label>
                            <Input
                                id="add-name"
                                required
                                aria-required="true"
                                value={form.name}
                                maxLength={256}
                                aria-invalid={formError !== ''}
                                aria-describedby={formError ? 'add-candidate-error' : undefined}
                                onChange={(event) => setForm({ ...form, name: event.target.value })}
                            />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="add-role">Role</Label>
                                <Input
                                    id="add-role"
                                    value={form.headline}
                                    onChange={(event) => setForm({ ...form, headline: event.target.value })}
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="add-location">Location</Label>
                                <Input
                                    id="add-location"
                                    value={form.location}
                                    onChange={(event) => setForm({ ...form, location: event.target.value })}
                                />
                            </div>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="add-email">Email (optional)</Label>
                            <Input
                                id="add-email"
                                type="email"
                                maxLength={254}
                                value={form.email}
                                onChange={(event) => setForm({ ...form, email: event.target.value })}
                            />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="add-owner">Owner <RequiredMark /></Label>
                                <Select
                                    value={form.owner}
                                    onValueChange={(value) => setForm({ ...form, owner: value })}
                                >
                                    <SelectTrigger id="add-owner" aria-label="Owner" aria-required="true">
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
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="add-tag">Tag (optional)</Label>
                                <Select
                                    value={form.tag}
                                    onValueChange={(value) => setForm({ ...form, tag: value })}
                                >
                                    <SelectTrigger id="add-tag" aria-label="Tag">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">No tag</SelectItem>
                                        {TAG_VOCABULARY.map((tag) => (
                                            <SelectItem key={tag} value={tag}>
                                                {tag}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        {formError ? (
                            <p id="add-candidate-error" role="alert" className="text-sm text-destructive">
                                {formError}
                            </p>
                        ) : null}
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setAddOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit">Add demo candidate</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add a tag</DialogTitle>
                        <DialogDescription>
                            Apply a tag from the shared vocabulary to {selected.length} selected
                            candidate{selected.length === 1 ? '' : 's'}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="bulk-tag">Tag <RequiredMark /></Label>
                        <Select value={bulkTag} onValueChange={setBulkTag}>
                            <SelectTrigger id="bulk-tag" aria-label="Tag to add" aria-required="true">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {TAG_VOCABULARY.map((tag) => (
                                    <SelectItem key={tag} value={tag}>
                                        {tag}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setTagDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={submitBulkTag}>Add tag</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
