import { getStaffDirectory } from '@/lib/staff-operations';
import { StaffAuthorizationError } from '@/lib/staff-authorization';
import { requireStaffVerified } from '@/lib/staff-gate.server';
import { MemberInviteForm } from '../workspace-forms';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Members · Agora staff' };

const th = 'px-3 py-2 text-left text-xs uppercase tracking-widest text-foreground/50';
const td = 'px-3 py-2.5 text-sm border-t border-foreground/10';

export default async function StaffMembersPage() {
    const gate = await requireStaffVerified();
    let directory: { members: any[]; roles: any[] } | null = null;
    try {
        directory = await getStaffDirectory(
            gate.pool, gate.identity, gate.organizationId, {});
    } catch (error) {
        if (!(error instanceof StaffAuthorizationError && error.code === 'FORBIDDEN')) {
            throw error;
        }
    }

    return (
        <section className="mx-auto max-w-4xl px-6 py-12">
            <h1 className="text-2xl font-semibold">Members</h1>
            {!directory ? (
                <p className="mt-10 text-sm text-foreground/60">
                    Member administration requires the staff.manage permission.
                </p>
            ) : (
                <>
                    <table className="mt-8 w-full border-collapse">
                        <thead>
                            <tr>
                                <th className={th}>Name</th>
                                <th className={th}>Email</th>
                                <th className={th}>Role</th>
                                <th className={th}>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {directory.members.map((member: any) => (
                                <tr
                                    key={member.membershipId}
                                    className={member.status === 'invited' ? 'opacity-60' : ''}
                                >
                                    <td className={td}>{member.displayName ?? '—'}</td>
                                    <td className={td}>{member.invitedEmail ?? '—'}</td>
                                    <td className={td}>{member.roleName ?? member.roleKey}</td>
                                    <td className={td}>{member.status}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <h2 className="mt-12 text-lg font-semibold">Invite member</h2>
                    <p className="mt-2 text-sm text-foreground/60">
                        The invite is bound to this email — the person signs in with that
                        Google account and is linked automatically on first sign-in.
                    </p>
                    <MemberInviteForm roles={directory.roles} />
                </>
            )}
        </section>
    );
}
