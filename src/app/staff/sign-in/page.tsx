import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { StaffSignInButton } from '../staff-auth-buttons';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Staff sign in · Agora',
};

export default async function StaffSignInPage() {
    const session = await getServerSession(authOptions);
    const signedInWithGoogle = (session as any)?.provider === 'google';

    return (
        <section className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
            <p className="text-sm uppercase tracking-widest text-foreground/50">Agora staff</p>
            <h1 className="mt-3 text-2xl font-semibold">Sign in to the workspace</h1>
            <p className="mt-4 text-sm leading-6 text-foreground/60">
                Staff access uses Google sign-in. An administrator must link your
                account to a workspace membership before you can continue.
            </p>
            <div className="mt-8">
                <StaffSignInButton />
            </div>
            {signedInWithGoogle && (
                <a href="/staff" className="mt-6 text-sm text-foreground/60 underline underline-offset-4 hover:opacity-70">
                    Continue to the workspace
                </a>
            )}
        </section>
    );
}
