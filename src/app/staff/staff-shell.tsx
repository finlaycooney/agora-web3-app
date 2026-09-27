'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
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
    UserCog,
    Users,
} from 'lucide-react';

import { Button } from '@/components/staff-ui/button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/staff-ui/popover';
import { Separator } from '@/components/staff-ui/separator';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/staff-ui/sheet';
import { cn } from '@/lib/utils';

export interface StaffNotification {
    id: string;
    title: string;
    description: string;
    href: string;
    count: number;
}

const NAV_ITEMS = [
    { href: '/staff', label: 'Overview', icon: LayoutDashboard, exact: true },
    { href: '/staff/applications', label: 'Applications', icon: Briefcase },
    { href: '/staff/candidates', label: 'Candidates', icon: Users },
    { href: '/staff/jobs', label: 'Jobs', icon: BriefcaseBusiness },
    { href: '/staff/clients', label: 'Clients', icon: Building2 },
    { href: '/staff/members', label: 'Members', icon: UserCog },
];

const SECTION_LABELS: Record<string, string> = {
    applications: 'Applications',
    candidates: 'Candidates',
    jobs: 'Jobs',
    clients: 'Clients',
    members: 'Members',
};

function useSection(pathname: string) {
    const segments = pathname.split('/').filter(Boolean).slice(1);
    const section = segments[0] ?? null;
    const detail = segments.slice(1);
    return { section, detail };
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
    return (
        <nav aria-label="Main navigation" className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = item.exact
                    ? pathname === item.href
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                    <Link
                        key={item.href}
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
                    </Link>
                );
            })}
        </nav>
    );
}

function NotificationsBell({ notifications }: { notifications: StaffNotification[] }) {
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
                    {notifications.map((item) => (
                        <li key={item.id}>
                            <Link
                                href={item.href}
                                onClick={() => setOpen(false)}
                                className="flex flex-col gap-0.5 px-4 py-3 outline-none transition-colors hover:bg-hover focus-visible:bg-hover"
                            >
                                <span className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-medium text-foreground">
                                        {item.title}
                                    </span>
                                    {item.count > 0 ? (
                                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-attention/20 px-1.5 text-[11px] font-semibold text-attention-foreground">
                                            {item.count}
                                        </span>
                                    ) : (
                                        <span className="text-[11px] text-muted-foreground">
                                            None
                                        </span>
                                    )}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {item.description}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            </PopoverContent>
        </Popover>
    );
}

function Initials({ name }: { name: string }) {
    const initials = name
        .split(/[\s@.]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('') || 'A';
    return (
        <span
            aria-hidden="true"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
        >
            {initials}
        </span>
    );
}

export function StaffShell({
    userName,
    userEmail,
    notifications,
    children,
}: {
    userName: string;
    userEmail: string;
    notifications: StaffNotification[];
    children: ReactNode;
}) {
    const pathname = usePathname();
    const [sheetOpen, setSheetOpen] = useState(false);
    const { section, detail } = useSection(pathname);
    const sectionLabel = section ? SECTION_LABELS[section] : null;
    const isDetail = detail.length > 0;

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
                <NavLinks pathname={pathname} onNavigate={onNavigate} />
            </div>
            <div className="flex flex-col gap-3 px-4 pb-5">
                <Separator />
                <div className="flex items-center gap-3 px-1 pt-2">
                    <Initials name={userName} />
                    <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium text-foreground">
                            {userName}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                            {userEmail}
                        </span>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: '/staff/sign-in' })}
                    className="px-1 text-left text-[11px] font-medium text-muted-foreground underline-offset-2 outline-none transition-colors hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                    Sign out
                </button>
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

                    {isDetail ? (
                        <Link
                            href={`/staff/${section}`}
                            aria-label={`Back to ${sectionLabel ?? 'list'}`}
                            className="-ml-1 flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                            <span className="hidden sm:inline">Back</span>
                        </Link>
                    ) : null}

                    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
                        <Link
                            href="/staff"
                            aria-label="Workspace home"
                            className="hidden rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:inline"
                        >
                            Workspace
                        </Link>
                        {sectionLabel ? (
                            <>
                                <ChevronRight
                                    className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:inline"
                                    aria-hidden="true"
                                />
                                {isDetail ? (
                                    <>
                                        <Link
                                            href={`/staff/${section}`}
                                            className="truncate rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            {sectionLabel}
                                        </Link>
                                        <ChevronRight
                                            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                                            aria-hidden="true"
                                        />
                                        <span
                                            aria-current="page"
                                            className="truncate font-medium text-foreground"
                                        >
                                            {detail[detail.length - 1] === 'new'
                                                ? `New ${sectionLabel.slice(0, -1)}`
                                                : detail[detail.length - 1] === 'edit'
                                                  ? 'Edit'
                                                  : 'Details'}
                                        </span>
                                    </>
                                ) : (
                                    <span
                                        aria-current="page"
                                        className="truncate font-medium text-foreground"
                                    >
                                        {sectionLabel}
                                    </span>
                                )}
                            </>
                        ) : (
                            <span
                                aria-current="page"
                                className="truncate font-medium text-foreground sm:font-normal sm:text-muted-foreground"
                            >
                                Overview
                            </span>
                        )}
                    </nav>

                    <div className="ml-auto flex shrink-0 items-center gap-2">
                        <NotificationsBell notifications={notifications} />
                    </div>
                </header>

                <main className="min-w-0 flex-1">{children}</main>
            </div>
        </div>
    );
}
