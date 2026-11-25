'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';

import { Button } from '@/components/staff-ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/staff-ui/card';
import { Checkbox } from '@/components/staff-ui/checkbox';
import { Input } from '@/components/staff-ui/input';
import { Label } from '@/components/staff-ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/staff-ui/select';
import { Textarea } from '@/components/staff-ui/textarea';
import {
    ClientJobContractError,
    validateClientDraftInput,
    validateClientInput,
} from '@/lib/client-job-contracts.js';

import { SOCIAL_PLATFORM_LABELS } from './demo-data';
import { PageHeader, RequiredMark, TagPill } from './shared';
import type { DemoClient, SocialLink, SocialPlatform } from './types';

export interface EditorGuard {
    isDirty: () => boolean;
    saveDraft: () => boolean;
}

export interface ClientInput {
    name: string;
    contactName: string;
    contactEmail: string;
    telegramUsername: string | null;
    website: string | null;
    socialLinks: SocialLink[];
    isStealth: boolean;
    anonymousDescription: string | null;
}

export interface ClientDraftInput {
    name: string;
    contactName: string | null;
    contactEmail: string | null;
    telegramUsername: string | null;
    website: string | null;
    socialLinks: SocialLink[];
    isStealth: boolean | null;
    anonymousDescription: string | null;
}

export function formatFieldError(reason: string): string {
    return reason.charAt(0).toUpperCase() + reason.slice(1) + '.';
}

export function FieldError({ id, message }: { id: string; message?: string }) {
    if (!message) return null;
    return (
        <p id={id} role="alert" className="text-xs text-destructive">
            {formatFieldError(message)}
        </p>
    );
}

const SOCIAL_PLATFORMS = Object.keys(SOCIAL_PLATFORM_LABELS) as SocialPlatform[];

export function ClientEditor({
    client = null,
    onCreateClient,
    onSaveClientDraft,
    onNavigate,
    registerGuard,
}: {
    client?: DemoClient | null;
    onCreateClient: (input: ClientInput, clientId?: string) => string;
    onSaveClientDraft: (input: ClientDraftInput, clientId?: string) => string;
    onNavigate: (hash: string) => void;
    registerGuard: (guard: EditorGuard | null) => void;
}) {
    const [name, setName] = useState(client?.name ?? '');
    const [contactName, setContactName] = useState(client?.contactName ?? '');
    const [contactEmail, setContactEmail] = useState(client?.contactEmail ?? '');
    const [telegramUsername, setTelegramUsername] = useState(client?.telegramUsername ?? '');
    const [website, setWebsite] = useState(client?.website ?? '');
    const [socialLinks, setSocialLinks] = useState<SocialLink[]>(client?.socialLinks ?? []);
    const [isStealth, setIsStealth] = useState(client?.isStealth ?? false);
    const [anonymousDescription, setAnonymousDescription] = useState(
        client?.anonymousDescription ?? '',
    );
    const [errors, setErrors] = useState<Record<string, string>>({});

    const dirtyRef = useRef(false);
    const markDirty = () => {
        dirtyRef.current = true;
    };

    const collectInput = () => ({
        name,
        contactName,
        contactEmail,
        telegramUsername: telegramUsername.trim() || null,
        website: website.trim() || null,
        socialLinks,
        isStealth,
        anonymousDescription: anonymousDescription.trim() || null,
    });

    const submit = (): boolean => {
        try {
            const input = validateClientInput(collectInput()) as ClientInput;
            setErrors({});
            dirtyRef.current = false;
            const id = onCreateClient(input, client?.id);
            onNavigate(`#/clients/${id}`);
            return true;
        } catch (error) {
            if (error instanceof ClientJobContractError) {
                setErrors({ ...(error as ClientJobContractError).fieldErrors });
                return false;
            }
            throw error;
        }
    };

    const saveDraft = (): boolean => {
        try {
            const input = validateClientDraftInput(collectInput()) as ClientDraftInput;
            setErrors({});
            setContactName(input.contactName ?? '');
            setContactEmail(input.contactEmail ?? '');
            setTelegramUsername(input.telegramUsername ?? '');
            setWebsite(input.website ?? '');
            setSocialLinks(input.socialLinks);
            setAnonymousDescription(input.anonymousDescription ?? '');
            dirtyRef.current = false;
            const id = onSaveClientDraft(input, client?.id);
            onNavigate(`#/clients/${id}`);
            return true;
        } catch (error) {
            if (error instanceof ClientJobContractError) {
                setErrors({ ...(error as ClientJobContractError).fieldErrors });
                return false;
            }
            throw error;
        }
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

    const fieldError = (field: string) => errors[field];
    const socialError = (index: number) =>
        errors[`socialLinks[${index}].url`] ?? errors[`socialLinks[${index}].platform`];

    const updateSocialLink = (index: number, patch: Partial<SocialLink>) => {
        markDirty();
        setSocialLinks((current) =>
            current.map((link, i) => (i === index ? { ...link, ...patch } : link)),
        );
    };

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                eyebrow="Clients"
                title={client ? `Edit ${client.name}` : 'New client'}
                description={client?.status === 'draft'
                    ? 'Finish this draft or save a sanitized draft. Invalid optional links are removed.'
                    : 'Create a client record for this workspace. Synthetic preview — nothing is persisted.'}
            />

            {client?.status === 'draft' ? <TagPill>Draft client</TagPill> : null}

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Company</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="client-name">Company name <RequiredMark /></Label>
                        <Input
                            id="client-name"
                            required
                            aria-required="true"
                            value={name}
                            onChange={(event) => {
                                markDirty();
                                setName(event.target.value);
                            }}
                            aria-invalid={fieldError('name') ? 'true' : undefined}
                            aria-describedby={fieldError('name') ? 'client-name-error' : undefined}
                        />
                        <FieldError id="client-name-error" message={fieldError('name')} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="client-contact-name">Contact person <RequiredMark /></Label>
                        <Input
                            id="client-contact-name"
                            required
                            aria-required="true"
                            value={contactName}
                            onChange={(event) => {
                                markDirty();
                                setContactName(event.target.value);
                            }}
                            aria-invalid={fieldError('contactName') ? 'true' : undefined}
                            aria-describedby={
                                fieldError('contactName') ? 'client-contact-name-error' : undefined
                            }
                        />
                        <FieldError
                            id="client-contact-name-error"
                            message={fieldError('contactName')}
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="client-contact-email">Contact email <RequiredMark /></Label>
                        <Input
                            id="client-contact-email"
                            type="email"
                            required
                            aria-required="true"
                            value={contactEmail}
                            onChange={(event) => {
                                markDirty();
                                setContactEmail(event.target.value);
                            }}
                            aria-invalid={fieldError('contactEmail') ? 'true' : undefined}
                            aria-describedby={
                                fieldError('contactEmail') ? 'client-contact-email-error' : undefined
                            }
                        />
                        <FieldError
                            id="client-contact-email-error"
                            message={fieldError('contactEmail')}
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="client-telegram">Telegram username (optional)</Label>
                        <Input
                            id="client-telegram"
                            value={telegramUsername}
                            onChange={(event) => {
                                markDirty();
                                setTelegramUsername(event.target.value);
                            }}
                            placeholder="username"
                            aria-invalid={fieldError('telegramUsername') ? 'true' : undefined}
                            aria-describedby={
                                fieldError('telegramUsername')
                                    ? 'client-telegram-error'
                                    : undefined
                            }
                        />
                        <FieldError
                            id="client-telegram-error"
                            message={fieldError('telegramUsername')}
                        />
                    </div>
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <Label htmlFor="client-website">Website (optional)</Label>
                        <Input
                            id="client-website"
                            value={website}
                            onChange={(event) => {
                                markDirty();
                                setWebsite(event.target.value);
                            }}
                            placeholder="company.com"
                            aria-invalid={fieldError('website') ? 'true' : undefined}
                            aria-describedby={fieldError('website')
                                ? 'client-website-hint client-website-error'
                                : 'client-website-hint'}
                        />
                        <p id="client-website-hint" className="text-xs text-muted-foreground">
                            Enter a domain or full URL; https:// is added when omitted.
                        </p>
                        <FieldError id="client-website-error" message={fieldError('website')} />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Social links</CardTitle>
                    <p className="text-xs text-muted-foreground">
                        Up to 8 public profiles shown on external job posts for non-stealth clients.
                    </p>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                    {socialLinks.map((link, index) => (
                        <div key={index} className="flex flex-col gap-1.5">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                                <div className="flex flex-col gap-1.5 sm:w-44">
                                    <Label htmlFor={`social-platform-${index}`}>
                                        Platform <RequiredMark />
                                    </Label>
                                    <Select
                                        value={link.platform}
                                        onValueChange={(value) =>
                                            updateSocialLink(index, {
                                                platform: value as SocialPlatform,
                                            })
                                        }
                                    >
                                        <SelectTrigger id={`social-platform-${index}`}>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {SOCIAL_PLATFORMS.map((platform) => (
                                                <SelectItem key={platform} value={platform}>
                                                    {SOCIAL_PLATFORM_LABELS[platform]}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex flex-1 flex-col gap-1.5">
                                    <Label htmlFor={`social-url-${index}`}>
                                        URL <RequiredMark />
                                    </Label>
                                    <Input
                                        id={`social-url-${index}`}
                                        required
                                        aria-required="true"
                                        value={link.url}
                                        onChange={(event) =>
                                            updateSocialLink(index, {
                                                url: event.target.value,
                                            })
                                        }
                                        placeholder="linkedin.com/company/…"
                                        aria-invalid={socialError(index) ? 'true' : undefined}
                                        aria-describedby={
                                            socialError(index)
                                                ? `social-url-${index}-error`
                                                : undefined
                                        }
                                    />
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Remove social link ${index + 1}`}
                                    onClick={() => {
                                        markDirty();
                                        setSocialLinks((current) =>
                                            current.filter((_, i) => i !== index),
                                        );
                                    }}
                                >
                                    <X aria-hidden="true" />
                                </Button>
                            </div>
                            <FieldError
                                id={`social-url-${index}-error`}
                                message={socialError(index)}
                            />
                        </div>
                    ))}
                    {errors.socialLinks ? (
                        <p role="alert" className="text-xs text-destructive">
                            {formatFieldError(errors.socialLinks)}
                        </p>
                    ) : null}
                    <div>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={socialLinks.length >= 8}
                            onClick={() => {
                                markDirty();
                                setSocialLinks((current) => [
                                    ...current,
                                    { platform: 'linkedin', url: '' },
                                ]);
                            }}
                        >
                            <Plus aria-hidden="true" />
                            Add social link
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">External visibility</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    <div className="flex items-start gap-3">
                        <Checkbox
                            id="client-stealth"
                            checked={isStealth}
                            onCheckedChange={(checked) => {
                                markDirty();
                                setIsStealth(checked === true);
                            }}
                            aria-describedby="client-stealth-hint"
                        />
                        <div className="flex flex-col gap-0.5">
                            <Label htmlFor="client-stealth" className="font-normal">
                                Hide company identity in external job posts
                            </Label>
                            <p id="client-stealth-hint" className="text-xs text-muted-foreground">
                                Public posts show an anonymous description instead of the company
                                name, contact and links.
                            </p>
                        </div>
                    </div>
                    {isStealth ? (
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="client-anonymous-description">
                                Anonymous company description <RequiredMark />
                            </Label>
                            <Textarea
                                id="client-anonymous-description"
                                required
                                aria-required="true"
                                value={anonymousDescription}
                                onChange={(event) => {
                                    markDirty();
                                    setAnonymousDescription(event.target.value);
                                }}
                                placeholder="Describe the company without naming it…"
                                aria-invalid={fieldError('anonymousDescription') ? 'true' : undefined}
                                aria-describedby={
                                    fieldError('anonymousDescription')
                                        ? 'client-anonymous-description-error'
                                        : undefined
                                }
                            />
                            <FieldError
                                id="client-anonymous-description-error"
                                message={fieldError('anonymousDescription')}
                            />
                        </div>
                    ) : null}
                </CardContent>
            </Card>

            <div className="flex flex-wrap items-center gap-3">
                <Button type="button" onClick={submit}>
                    {client?.status === 'draft' ? 'Activate client' : 'Create client'}
                </Button>
                <Button type="button" variant="secondary" onClick={saveDraft}>
                    Save draft
                </Button>
                <Button variant="outline" asChild>
                    <a href="#/clients">Cancel</a>
                </Button>
                {errors.fields ? (
                    <p role="alert" className="text-xs text-destructive">
                        {formatFieldError(errors.fields)}
                    </p>
                ) : null}
            </div>
        </div>
    );
}
