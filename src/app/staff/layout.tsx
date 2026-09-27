import { listApplications } from '@/lib/pipeline-operations';
import { getStaffDirectory } from '@/lib/staff-operations';
import { staffGate } from '@/lib/staff-gate.server';
import { StaffShell, type StaffNotification } from './staff-shell';

export const metadata = {
    title: 'Agora Staff',
};

// Every staff route renders inside the token scope. Verified members get the
// workspace chrome (sidebar, header, notifications); sign-in/no-access/MFA
// stages render bare so pre-access pages never show navigation.
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
    const gate = await staffGate();
    if (gate.stage !== 'verified') {
        return (
            <div className="staff-scope min-h-screen bg-background font-sans text-sm text-foreground antialiased">
                {children}
            </div>
        );
    }

    const notifications: StaffNotification[] = [];
    try {
        const listing = await listApplications(
            gate.pool, gate.identity, gate.organizationId, {});
        const open = (listing?.applications ?? [])
            .filter((application: any) => application.stageKind === 'active').length;
        notifications.push({
            id: 'open-applications',
            title: 'Applications',
            description: 'Open applications in the review pipeline',
            href: '/staff/applications',
            count: open,
        });
    } catch {
        // applications.read not granted — omit the entry.
    }
    try {
        const directory = await getStaffDirectory(
            gate.pool, gate.identity, gate.organizationId, {});
        const pending = (directory?.members ?? [])
            .filter((member: any) => member.status === 'invited').length;
        notifications.push({
            id: 'pending-invites',
            title: 'Pending invites',
            description: 'Staff invitations awaiting sign-in',
            href: '/staff/members',
            count: pending,
        });
    } catch {
        // staff.manage not granted — omit the entry.
    }

    return (
        <div className="staff-scope font-sans text-sm antialiased">
            <StaffShell
                userName={gate.session?.user?.name ?? gate.session?.user?.email ?? 'Staff'}
                userEmail={gate.session?.user?.email ?? ''}
                notifications={notifications}
            >
                {children}
            </StaffShell>
        </div>
    );
}
