import { getStaffDirectory } from '@/lib/staff-operations';
import { StaffAuthorizationError } from '@/lib/staff-authorization';
import { requireStaffVerified } from '@/lib/staff-gate.server';
import {
    InviteDomainsForm,
    MemberInviteForm,
    MemberRevokeButton,
} from '../workspace-forms';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Members · Agora staff' };

const th = 'px-3 py-2 text-left text-xs uppercase tracking-widest text-foreground/50';
const td = 'px-3 py-2.5 text-sm border-t border-foreground/10';

export default async function StaffMembersPage() {
    const gate = await requireStaffVerified();
    let directory: {
        members: any[];
        roles: any[];
        inviteDomains?: string[];
    } | null = null;
    try {
        directory = await getStaffDirectory(
            gate.pool, gate.identity, gate.organizationId, {});
    } catch (error) {
        if (!(error instanceof StaffAuthorizationError && error.code === 'FORBIDDEN')) {
            throw error;
        }
    }
    const inviteDomains = directory?.inviteDomains ?? [];

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
                                <th className={th}></th>
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
                                    <td className={td}>
                                        {member.status !== 'revoked' && (
                                            <MemberRevokeButton
                                                membershipId={member.membershipId}
                                                roleId={member.roleId}
                                                version={member.version}
                                            />
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <h2 className="mt-12 text-lg font-semibold">Invite member</h2>
                    <p className="mt-2 text-sm text-foreground/60">
                        The invite is bound to this email — the person signs in with that
                        Google account and is linked automatically on first sign-in.
                    </p>
                    <MemberInviteForm
                        roles={directory.roles}
                        inviteDomains={inviteDomains}
                    />
                    <h2 className="mt-12 text-lg font-semibold">Invite domains</h2>
                    <p className="mt-2 text-sm text-foreground/60">
                        When set, only these email domains can be invited. Pending invites
                        on other domains stop working the moment this changes.
                    </p>
                    <InviteDomainsForm domains={inviteDomains} />
                </>
            )}
        </section>
    );
}
