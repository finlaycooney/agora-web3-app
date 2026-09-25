import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { Badge } from '@/components/staff-ui/badge';
import { cn } from '@/lib/utils';

import type { BadgeTone } from './types';

const AVATAR_PALETTE = [
    'bg-[#f1f3f5] text-[#4b5563]',
    'bg-[#eef4ef] text-[#44644c]',
    'bg-[#e2f4e9] text-[#1d6b45]',
    'bg-[#f3e8f7] text-[#74408f]',
    'bg-[#f4f5f6] text-[#515760]',
    'bg-[#fbe8ec] text-[#9f2843]',
];

export function initialsFor(name: string): string {
    return name
        .split(' ')
        .map((part) => part.charAt(0))
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase();
}

export function InitialsAvatar({
    name,
    size = 'md',
    className,
}: {
    name: string;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}) {
    const palette = AVATAR_PALETTE[name.length % AVATAR_PALETTE.length];
    const sizeClass =
        size === 'lg' ? 'h-12 w-12 text-base' : size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-9 w-9 text-xs';
    return (
        <span
            aria-hidden="true"
            className={cn(
                'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
                palette,
                sizeClass,
                className,
            )}
        >
            {initialsFor(name)}
        </span>
    );
}

export function PageHeader({
    eyebrow,
    title,
    description,
    actions,
}: {
    eyebrow?: string;
    title: string;
    description?: string;
    actions?: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex flex-col gap-1.5">
                {eyebrow ? (
                    <p className="text-[11px] font-semibold tracking-[0.08em] text-accent-foreground uppercase">
                        {eyebrow}
                    </p>
                ) : null}
                <h1 className="text-[26px] leading-8 font-medium text-foreground">{title}</h1>
                {description ? (
                    <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
                ) : null}
            </div>
            {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
    );
}

export function EmptyState({
    icon: Icon,
    title,
    description,
    action,
    className,
}: {
    icon: LucideIcon;
    title: string;
    description?: string;
    action?: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center',
                className,
            )}
        >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
                <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-foreground">{title}</p>
                {description ? (
                    <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
                ) : null}
            </div>
            {action}
        </div>
    );
}

export function StatusBadge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
    return <Badge variant={tone}>{children}</Badge>;
}

export function TagPill({ children }: { children: ReactNode }) {
    return (
        <Badge variant="secondary" className="font-normal">
            {children}
        </Badge>
    );
}

export function CountChip({ children }: { children: ReactNode }) {
    return (
        <Badge variant="outline" className="bg-card font-normal text-muted-foreground">
            {children}
        </Badge>
    );
}

export function RequiredMark() {
    return (
        <span className="text-destructive">
            <span aria-hidden="true">*</span>
            <span className="sr-only">required</span>
        </span>
    );
}

export function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
            <dd className="text-sm text-foreground">{children}</dd>
        </div>
    );
}
