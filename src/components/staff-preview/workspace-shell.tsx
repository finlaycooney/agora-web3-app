'use client';

import { useState, type ReactNode } from 'react';
import {
    ArrowLeft,
    Bell,
    Briefcase,
    BriefcaseBusiness,
    Building2,
    ChevronRight,
    LayoutDashboard,
    Menu,
    RotateCcw,
    Users,
} from 'lucide-react';

import { Button } from '@/components/staff-ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/staff-ui/dialog';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/staff-ui/popover';
import { Separator } from '@/components/staff-ui/separator';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/staff-ui/sheet';
import { cn } from '@/lib/utils';

import { InitialsAvatar } from './shared';
import type { PreviewScreen } from './types';

export interface NotificationItem {
    id: string;
    title: string;
    description: string;
    href: string;
    count: number;
}

interface NavItem {
    screen: PreviewScreen;
    href: string;
    label: string;
    icon: typeof Users;
}

const NAV_ITEMS: NavItem[] = [
    { screen: 'overview', href: '#/overview', label: 'Overview', icon: LayoutDashboard },
    { screen: 'applications', href: '#/applications', label: 'Applications', icon: Briefcase },
    { screen: 'candidates', href: '#/candidates', label: 'Candidates', icon: Users },
    { screen: 'jobs', href: '#/jobs', label: 'Jobs', icon: BriefcaseBusiness },
    { screen: 'clients', href: '#/clients', label: 'Clients', icon: Building2 },
];

const SCREEN_LABELS: Record<PreviewScreen, string> = {
    overview: 'Overview',
    applications: 'Applications',
    candidates: 'Candidates',
    candidate: 'Candidates',
    jobs: 'Jobs',
    job: 'Jobs',
    jobEditor: 'Jobs',
    clients: 'Clients',
    client: 'Clients',
    clientEditor: 'Clients',
    import: 'Import CSV',
    privacy: 'Candidate data requests',
};

function isActive(item: NavItem, screen: PreviewScreen): boolean {
    if (item.screen === 'candidates') {
        return screen === 'candidates' || screen === 'candidate' || screen === 'import';
    }
    if (item.screen === 'clients') {
        return screen === 'clients' || screen === 'client' || screen === 'clientEditor';
    }
    if (item.screen === 'jobs') {
        return screen === 'jobs' || screen === 'job' || screen === 'jobEditor';
    }
    return item.screen === screen;
}

function NavLinks({
    screen,
    onNavigate,
}: {
    screen: PreviewScreen;
    onNavigate?: () => void;
}) {
    return (
        <nav aria-label="Main navigation" className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = isActive(item, screen);
                return (
                    <a
                        key={item.screen}
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                            active
                                ? 'border-l-2 border-ring bg-nav-active font-semibold text-foreground'
                                : 'border-l-2 border-transparent text-muted-foreground hover:bg-hover hover:text-foreground',
                        )}
                    >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {item.label}
                    </a>
                );
            })}
        </nav>
    );
}

function NotificationsBell({
    notifications,
    onRead,
}: {
    notifications: NotificationItem[];
    onRead: (id: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const unread = notifications.filter((item) => item.count > 0).length;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={`Notifications, ${unread} unread`}
                    className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors outline-none hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <Bell className="h-4 w-4" aria-hidden="true" />
                    {unread > 0 ? (
                        <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-attention px-1 text-[10px] font-semibold text-attention-foreground">
                            {unread}
                        </span>
                    ) : null}
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
                <p className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
                    Notifications
                </p>
                <ul className="flex flex-col divide-y divide-border">
                    {notifications.map((item) => {
                        const unreadItem = item.count > 0;
                        return (
                            <li key={item.id}>
                                <a
                                    href={item.href}
                                    onClick={() => {
                                        onRead(item.id);
                                        setOpen(false);
                                    }}
                                    className="flex flex-col gap-0.5 px-4 py-3 outline-none transition-colors hover:bg-hover focus-visible:bg-hover"
                                >
                                    <span className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-medium text-foreground">
                                            {item.title}
                                        </span>
                                        {unreadItem ? (
                                            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-attention/20 px-1.5 text-[11px] font-semibold text-attention-foreground">
                                                {item.count}
                                            </span>
                                        ) : (
                                            <span className="text-[11px] text-muted-foreground">
                                                Read
                                            </span>
                                        )}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {item.description}
                                    </span>
                                </a>
                            </li>
                        );
                    })}
                </ul>
                <a
                    href="#/privacy"
                    onClick={() => setOpen(false)}
                    className="block border-t border-border px-4 py-3 text-xs font-medium text-accent-foreground outline-none hover:bg-hover hover:underline focus-visible:bg-hover"
                >
                    View candidate data requests
                </a>
            </PopoverContent>
        </Popover>
    );
}

export function WorkspaceShell({
    screen,
    candidateName,
    clientName,
    jobName,
    notifications,
    onNotificationRead,
    onReset,
    back,
    children,
}: {
    screen: PreviewScreen;
    candidateName?: string;
    clientName?: string;
    jobName?: string;
    notifications: NotificationItem[];
    onNotificationRead: (id: string) => void;
    onReset: () => void;
    back?: { label: string; onBack: () => void } | null;
    children: ReactNode;
}) {
    const [sheetOpen, setSheetOpen] = useState(false);
    const [resetOpen, setResetOpen] = useState(false);

    const sidebar = (onNavigate?: () => void) => (
        <div className="flex h-full flex-col">
            <div className="flex items-center gap-2.5 px-4 py-5">
                <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground"
                    aria-hidden="true"
                >
                    A
                </div>
                <div className="flex flex-col">
                    <span className="text-sm font-semibold text-foreground">Agora</span>
                    <span className="text-[11px] text-muted-foreground">Staff workspace</span>
                </div>
            </div>
            <Separator />
            <div className="flex-1 px-3 py-4">
                <NavLinks screen={screen} onNavigate={onNavigate} />
            </div>
            <div className="flex flex-col gap-3 px-4 pb-5">
                <Separator />
                <div className="flex items-center gap-3 px-1 pt-2">
                    <InitialsAvatar name="Jamie Taylor" />
                    <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium text-foreground">
                            Jamie Taylor
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                            Recruiting lead
                        </span>
                    </div>
                </div>
                <p className="px-1 text-[11px] text-muted-foreground">
                    Synthetic data. Changes are not saved.
                </p>
            </div>
        </div>
    );

    return (
        <div className="flex min-h-screen bg-background">
            <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-border bg-sidebar md:block">
                {sidebar()}
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
                <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card px-4 md:px-6">
                    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                        <SheetTrigger asChild>
                            <Button
                                variant="outline"
                                size="icon"
                                className="md:hidden"
                                aria-label="Open navigation"
                            >
                                <Menu aria-hidden="true" />
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="left" className="w-72 p-0">
                            <SheetTitle className="sr-only">Navigation</SheetTitle>
                            {sidebar(() => setSheetOpen(false))}
                        </SheetContent>
                    </Sheet>

                    {back ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={back.onBack}
                            aria-label={back.label}
                            className="-ml-1 shrink-0 gap-1.5 text-muted-foreground hover:text-foreground"
                        >
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                            <span className="hidden sm:inline">{back.label}</span>
                        </Button>
                    ) : null}

                    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
                        <a
                            href="#/overview"
                            aria-label="Workspace home"
                            className="hidden rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:inline"
                        >
                            Workspace
                        </a>
                        <ChevronRight
                            className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:inline"
                            aria-hidden="true"
                        />
                        {screen === 'candidate'
                        || screen === 'client'
                        || screen === 'job'
                        || screen === 'clientEditor'
                        || screen === 'jobEditor' ? (
                            <>
                                <a
                                    href={
                                        screen === 'candidate'
                                            ? '#/candidates'
                                            : screen === 'client' || screen === 'clientEditor'
                                              ? '#/clients'
                                              : '#/jobs'
                                    }
                                    className="truncate rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    {screen === 'candidate'
                                        ? 'Candidates'
                                        : screen === 'client' || screen === 'clientEditor'
                                          ? 'Clients'
                                          : 'Jobs'}
                                </a>
                                <ChevronRight
                                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                                    aria-hidden="true"
                                />
                            </>
                        ) : null}
                        <span aria-current="page" className="truncate font-medium text-foreground">
                            {screen === 'candidate'
                                ? (candidateName ?? 'Candidate')
                                : screen === 'client'
                                  ? (clientName ?? 'Client')
                                  : screen === 'job'
                                    ? (jobName ?? 'Job')
                                    : screen === 'clientEditor'
                                      ? 'New client'
                                      : screen === 'jobEditor'
                                        ? (jobName ? `Edit ${jobName}` : 'New job')
                                        : SCREEN_LABELS[screen]}
                        </span>
                    </nav>

                    <div className="ml-auto flex shrink-0 items-center gap-2">
                        <span className="hidden rounded-full border border-border px-3 py-1 text-xs text-muted-foreground sm:inline-flex">
                            Design preview · synthetic data
                        </span>
                        <NotificationsBell
                            notifications={notifications}
                            onRead={onNotificationRead}
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            aria-label="Reset preview"
                            onClick={() => setResetOpen(true)}
                        >
                            <RotateCcw aria-hidden="true" />
                            <span className="hidden sm:inline">Reset preview</span>
                        </Button>
                    </div>
                </header>

                <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
                <footer className="border-t border-border px-4 py-3 text-center text-[11px] text-muted-foreground md:px-8">
                    Design preview only. Changes reset on refresh; do not enter real candidate data.
                </footer>
            </div>

            <Dialog open={resetOpen} onOpenChange={setResetOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Reset the preview?</DialogTitle>
                        <DialogDescription>
                            This clears every change made in this session — new candidates, notes,
                            tags, filters and imports — and restores the original demo data.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setResetOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => {
                                setResetOpen(false);
                                onReset();
                            }}
                        >
                            Reset preview
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
