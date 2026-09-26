import type { NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";

// GitHub OAuth exists for the public applicant flow (profile prefill on the
// candidate site). It never grants staff access — staff sign-in is Google
// only, and resolution is enforced server-side by app.resolve_staff_principal_v1.
export const authOptions: NextAuthOptions = {
    providers: [
        GithubProvider({
            clientId: process.env.GITHUB_ID!,
            clientSecret: process.env.GITHUB_SECRET!,
            authorization: {
                params: {
                    scope: 'read:user',
                },
            },
        }),
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            // Offline access yields a refresh token, which the staff gate
            // re-verifies against Google so suspended accounts lose access
            // without waiting for the session to expire.
            authorization: {
                params: { access_type: 'offline', prompt: 'consent' },
            },
        }),
    ],
    secret: process.env.NEXTAUTH_SECRET,

    cookies: {
        sessionToken: {
            name: `next-auth.session-token`,
            options: {
                httpOnly: true,
                sameSite: 'lax',
                path: '/',
                secure: process.env.NODE_ENV === 'production',
            },
        },
    },

    callbacks: {
        async jwt({ token, account, profile }) {
            // Persist the OAuth provider identity so the staff gate can map it
            // onto app.auth_identities (provider + issuer + subject).
            if (account) {
                token.accessToken = account.access_token;
                token.id = (profile as any)?.id;
                token.provider = account.provider;
                token.providerAccountId = account.providerAccountId;
                // Kept in the JWT only — never copied onto the session, which
                // is readable client-side.
                if (account.provider === 'google' && account.refresh_token) {
                    token.googleRefreshToken = account.refresh_token;
                }
                // Staff invite claims only bind to Google-verified emails.
                token.emailVerified = (profile as any)?.email_verified === true;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                (session.user as any).username = token.name;
            }
            (session as any).provider = token.provider;
            (session as any).subject = token.providerAccountId;
            (session as any).emailVerified = token.emailVerified === true;
            return session;
        },
    },
    debug: process.env.NODE_ENV === 'development',
};
