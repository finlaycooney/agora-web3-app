"use client";

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

const inputClass = 'w-full rounded-md border border-foreground/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/50';
const labelClass = 'block text-xs uppercase tracking-widest text-foreground/50 mb-1.5';
const buttonClass = 'rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-80 disabled:opacity-40';
const ghostButtonClass = 'rounded-md border border-foreground/20 px-4 py-2 text-sm transition-opacity hover:opacity-70 disabled:opacity-40';

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block">
            <span className={labelClass}>{label}</span>
            {children}
        </label>
    );
}

const parseList = (value: string) =>
    value.split(',').map((entry) => entry.trim()).filter(Boolean);

const descriptionDocument = (text: string) => ({
    type: 'doc',
    content: text.trim()
        ? [{ type: 'paragraph', content: [{ type: 'text', text }] }]
        : [{ type: 'paragraph' }],
});

export function ClientForm({
    clientId,
    initial,
}: {
    clientId?: string;
    initial?: {
        name: string;
        contactName: string | null;
        contactEmail: string | null;
        telegramUsername: string | null;
        website: string | null;
        isStealth: boolean | null;
        anonymousDescription: string | null;
        version: string;
    };
}) {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const submit = async (form: HTMLFormElement) => {
        const data = new FormData(form);
        const stealth = data.get('isStealth') === 'on';
        const fields = {
            name: String(data.get('name') ?? ''),
            contactName: String(data.get('contactName') ?? '') || null,
            contactEmail: String(data.get('contactEmail') ?? '') || null,
            telegramUsername: String(data.get('telegramUsername') ?? '') || null,
            website: String(data.get('website') ?? '') || null,
            socialLinks: [],
            isStealth: stealth,
            anonymousDescription: stealth
                ? (String(data.get('anonymousDescription') ?? '') || null)
                : null,
        };
        const url = clientId ? `/api/staff/clients/${clientId}` : '/api/staff/clients';
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                fields,
                ...(clientId ? { expectedVersion: initial?.version } : {}),
            }),
        });
        if (response.ok) {
            const payload = await response.json();
            router.push(`/staff/clients/${payload?.result?.id ?? clientId ?? ''}`);
            router.refresh();
            return;
        }
        const payload = await response.json().catch(() => ({}));
        setError(payload?.fields ? `Invalid: ${Object.keys(payload.fields).join(', ')}` : 'Save failed');
    };

    return (
        <form
            className="mt-8 max-w-xl space-y-5"
            onSubmit={(event) => {
                event.preventDefault();
                setBusy(true);
                void submit(event.currentTarget).finally(() => setBusy(false));
            }}
        >
            <Field label="Client name">
                <input name="name" required maxLength={256} defaultValue={initial?.name ?? ''} className={inputClass} />
            </Field>
            <Field label="Contact name">
                <input name="contactName" maxLength={256} defaultValue={initial?.contactName ?? ''} className={inputClass} />
            </Field>
            <Field label="Contact email">
                <input name="contactEmail" type="email" maxLength={254} defaultValue={initial?.contactEmail ?? ''} className={inputClass} />
            </Field>
            <Field label="Telegram username">
                <input name="telegramUsername" maxLength={32} defaultValue={initial?.telegramUsername ?? ''} className={inputClass} />
            </Field>
            <Field label="Website">
                <input name="website" type="url" defaultValue={initial?.website ?? ''} className={inputClass} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
                <input name="isStealth" type="checkbox" defaultChecked={initial?.isStealth ?? false} />
                Stealth client (hidden identity in public listings)
            </label>
            <Field label="Anonymous description">
                <textarea name="anonymousDescription" rows={2} defaultValue={initial?.anonymousDescription ?? ''} className={inputClass} />
            </Field>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="submit" disabled={busy} className={buttonClass}>
                {clientId ? 'Save changes' : 'Create client'}
            </button>
        </form>
    );
}

export function JobForm({
    clients,
    jobId,
    revisionId,
    expectedVersion,
    initial,
}: {
    clients: { id: string; name: string }[];
    jobId?: string;
    revisionId?: string;
    expectedVersion?: string;
    initial?: {
        clientId: string;
        title: string;
        employmentType: string | null;
        workplaceMode: string | null;
        locations: string[];
        remoteRegions: string[];
        compensationMin: string | null;
        compensationMax: string | null;
        currency: string | null;
        payPeriod: string | null;
        descriptionText: string;
    };
}) {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const submit = async (form: HTMLFormElement) => {
        const data = new FormData(form);
        const nullable = (key: string) => String(data.get(key) ?? '') || null;
        const fields = {
            title: String(data.get('title') ?? ''),
            employmentType: nullable('employmentType'),
            workplaceMode: nullable('workplaceMode'),
            locations: parseList(String(data.get('locations') ?? '')),
            remoteRegions: parseList(String(data.get('remoteRegions') ?? '')),
            compensationMin: nullable('compensationMin'),
            compensationMax: nullable('compensationMax'),
            currency: nullable('currency'),
            payPeriod: nullable('payPeriod'),
            bonuses: [],
            descriptionDocument: descriptionDocument(String(data.get('description') ?? '')),
        };
        const url = jobId ? `/api/staff/jobs/${jobId}/draft` : '/api/staff/jobs';
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                fields,
                ...(jobId
                    ? { revisionId, expectedVersion }
                    : { clientId: String(data.get('clientId') ?? '') }),
            }),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.ok) {
            const targetId = jobId ?? payload?.result?.jobId;
            router.push(targetId ? `/staff/jobs/${targetId}` : '/staff/jobs');
            router.refresh();
            return;
        }
        setError(payload?.fields ? `Invalid: ${Object.keys(payload.fields).join(', ')}` : 'Save failed');
    };

    return (
        <form
            className="mt-8 max-w-xl space-y-5"
            onSubmit={(event) => {
                event.preventDefault();
                setBusy(true);
                void submit(event.currentTarget).finally(() => setBusy(false));
            }}
        >
            {!jobId && (
                <Field label="Client">
                    <select name="clientId" required className={inputClass} defaultValue="">
                        <option value="" disabled>Select a client</option>
                        {clients.map((client) => (
                            <option key={client.id} value={client.id}>{client.name}</option>
                        ))}
                    </select>
                </Field>
            )}
            <Field label="Job title">
                <input name="title" required maxLength={200} defaultValue={initial?.title ?? ''} className={inputClass} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
                <Field label="Employment type">
                    <select name="employmentType" className={inputClass} defaultValue={initial?.employmentType ?? ''}>
                        <option value="">—</option>
                        <option value="full_time">Full time</option>
                        <option value="part_time">Part time</option>
                        <option value="contract">Contract</option>
                        <option value="internship">Internship</option>
                    </select>
                </Field>
                <Field label="Workplace mode">
                    <select name="workplaceMode" className={inputClass} defaultValue={initial?.workplaceMode ?? ''}>
                        <option value="">—</option>
                        <option value="onsite">Onsite</option>
                        <option value="hybrid">Hybrid</option>
                        <option value="remote">Remote</option>
                    </select>
                </Field>
            </div>
            <Field label="Locations (comma-separated)">
                <input name="locations" defaultValue={initial?.locations?.join(', ') ?? ''} className={inputClass} />
            </Field>
            <Field label="Remote regions (comma-separated)">
                <input name="remoteRegions" defaultValue={initial?.remoteRegions?.join(', ') ?? ''} className={inputClass} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
                <Field label="Compensation min">
                    <input name="compensationMin" inputMode="decimal" defaultValue={initial?.compensationMin ?? ''} className={inputClass} />
                </Field>
                <Field label="Compensation max">
                    <input name="compensationMax" inputMode="decimal" defaultValue={initial?.compensationMax ?? ''} className={inputClass} />
                </Field>
                <Field label="Currency">
                    <input name="currency" maxLength={3} placeholder="EUR" defaultValue={initial?.currency ?? ''} className={inputClass} />
                </Field>
                <Field label="Pay period">
                    <select name="payPeriod" className={inputClass} defaultValue={initial?.payPeriod ?? ''}>
                        <option value="">—</option>
                        <option value="year">Year</option>
                        <option value="month">Month</option>
                        <option value="day">Day</option>
                        <option value="hour">Hour</option>
                    </select>
                </Field>
            </div>
            <Field label="Description">
                <textarea name="description" rows={8} defaultValue={initial?.descriptionText ?? ''} className={inputClass} />
            </Field>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="submit" disabled={busy} className={buttonClass}>
                {jobId ? 'Save draft' : 'Create job draft'}
            </button>
        </form>
    );
}

export function PublishButton({
    jobId,
    revisionId,
    expectedVersion,
    expectedClientVersion,
    reviewHash,
}: {
    jobId: string;
    revisionId: string;
    expectedVersion: string;
    expectedClientVersion: string;
    reviewHash: string;
}) {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    return (
        <div>
            <button
                type="button"
                disabled={busy}
                className={buttonClass}
                onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                        const response = await fetch(`/api/staff/jobs/${jobId}/publish`, {
                            method: 'POST',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({
                                revisionId, expectedVersion, expectedClientVersion, reviewHash,
                            }),
                        });
                        if (response.ok) {
                            router.refresh();
                            return;
                        }
                        const payload = await response.json().catch(() => ({}));
                        setError(payload?.code === '40001'
                            ? 'Something changed since this preview — reload and review again.'
                            : 'Publish failed');
                    } finally {
                        setBusy(false);
                    }
                }}
            >
                Publish this revision
            </button>
            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        </div>
    );
}

export function NewRevisionButton({ jobId, expectedJobVersion }: { jobId: string; expectedJobVersion: string }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    return (
        <span className="inline-flex items-center gap-3">
            <button
                type="button"
                disabled={busy}
                className={ghostButtonClass}
                onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                        const response = await fetch(`/api/staff/jobs/${jobId}/revision`, {
                            method: 'POST',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({ expectedJobVersion }),
                        });
                        if (response.ok) {
                            router.push(`/staff/jobs/${jobId}/edit`);
                            router.refresh();
                            return;
                        }
                        setError('Could not start a revision');
                    } finally {
                        setBusy(false);
                    }
                }}
            >
                Start new revision
            </button>
            {error && <span className="text-sm text-red-400">{error}</span>}
        </span>
    );
}

export function MemberInviteForm({
    roles,
    inviteDomains,
}: {
    roles: { id: string; name: string; key: string }[];
    inviteDomains: string[];
}) {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const submit = async (form: HTMLFormElement) => {
        const data = new FormData(form);
        const response = await fetch('/api/staff/members', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                displayName: String(data.get('displayName') ?? ''),
                email: String(data.get('email') ?? ''),
                roleId: String(data.get('roleId') ?? ''),
            }),
        });
        if (response.ok) {
            form.reset();
            router.refresh();
            return;
        }
        const payload = await response.json().catch(() => ({}));
        setError(payload?.fields ? `Invalid: ${Object.keys(payload.fields).join(', ')}` : 'Invite failed');
    };

    return (
        <form
            className="mt-6 max-w-xl space-y-5"
            onSubmit={(event) => {
                event.preventDefault();
                setError(null);
                setBusy(true);
                void submit(event.currentTarget).finally(() => setBusy(false));
            }}
        >
            <Field label="Name">
                <input name="displayName" required maxLength={256} className={inputClass} />
            </Field>
            <Field label="Email">
                <input name="email" type="email" required maxLength={320} className={inputClass} />
                {inviteDomains.length > 0 && (
                    <span className="mt-1.5 block text-xs text-foreground/50">
                        Restricted to: {inviteDomains.map((d) => `@${d}`).join(', ')}
                    </span>
                )}
            </Field>
            <Field label="Role">
                <select name="roleId" required className={inputClass} defaultValue="">
                    <option value="" disabled>Select a role</option>
                    {roles.map((role) => (
                        <option key={role.id} value={role.id}>{role.name}</option>
                    ))}
                </select>
            </Field>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="submit" disabled={busy} className={buttonClass}>
                Send invite
            </button>
        </form>
    );
}

export function InviteDomainsForm({ domains }: { domains: string[] }) {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const submit = async (form: HTMLFormElement) => {
        const data = new FormData(form);
        const response = await fetch('/api/staff/members', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                action: 'setInviteDomains',
                domains: parseList(String(data.get('domains') ?? '')),
            }),
        });
        if (response.ok) {
            router.refresh();
            return;
        }
        const payload = await response.json().catch(() => ({}));
        setError(payload?.fields ? `Invalid: ${Object.keys(payload.fields).join(', ')}` : 'Save failed');
    };

    return (
        <form
            className="mt-4 max-w-xl"
            onSubmit={(event) => {
                event.preventDefault();
                setError(null);
                setBusy(true);
                void submit(event.currentTarget).finally(() => setBusy(false));
            }}
        >
            <Field label="Allowed invite domains (comma-separated, empty = any)">
                <input
                    name="domains"
                    defaultValue={domains.join(', ')}
                    placeholder="agora4.xyz"
                    className={inputClass}
                />
            </Field>
            {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
            <button type="submit" disabled={busy} className={`${buttonClass} mt-3`}>
                Save domains
            </button>
        </form>
    );
}

export function MemberRevokeButton({
    membershipId,
    roleId,
    version,
}: {
    membershipId: string;
    roleId: string;
    version: string;
}) {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const revoke = async () => {
        const response = await fetch('/api/staff/members', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                action: 'changeMembership',
                membershipId,
                roleId,
                status: 'revoked',
                version: Number(version),
            }),
        });
        if (response.ok) {
            router.refresh();
            return;
        }
        setError('Revoke failed');
    };

    return (
        <span className="inline-flex items-center gap-2">
            <button
                type="button"
                disabled={busy}
                className={ghostButtonClass}
                onClick={() => {
                    setBusy(true);
                    setError(null);
                    void revoke().finally(() => setBusy(false));
                }}
            >
                Revoke
            </button>
            {error && <span className="text-xs text-red-400">{error}</span>}
        </span>
    );
}
