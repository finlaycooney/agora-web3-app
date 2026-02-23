import NextAuth from "next-auth";
import GithubProvider from "next-auth/providers/github";

const handler = NextAuth({
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
    ],
    // 1. Secret Protocol
    secret: process.env.NEXTAUTH_SECRET,

    // 2. Trust Host & Proxy Logic (Crucial for Vercel)
    // Note: 'trustHost' is an Auth.js v5 property. For v4, NextAuth 
    // automatically trusts Vercel if NEXTAUTH_URL is set correctly.

    // 3. Security Settings
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
            // Persist the OAuth profile info to the token right after signin
            if (account) {
                token.accessToken = account.access_token;
                // NextAuth's default Profile type doesn't contain an explicit 'id'
                // We cast to any, or we could also use account.providerAccountId
                token.id = (profile as any)?.id;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                (session.user as any).username = token.name;
            }
            return session;
        },
    },
    // Add debugging for production deployment phase
    debug: process.env.NODE_ENV === 'development',
});

export { handler as GET, handler as POST };