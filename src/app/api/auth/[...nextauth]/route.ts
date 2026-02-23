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
    // This secret is used to encrypt the user's session cookie
    secret: process.env.NEXTAUTH_SECRET,
    callbacks: {
        async jwt({ token, account, profile }) {
            // Persist the OAuth profile info to the token right after signin
            if (account) {
                token.accessToken = account.access_token;
                token.id = profile?.id;
            }
            return token;
        },
        async session({ session, token }) {
            // We pass the GitHub username to the session so the modal can grab it
            if (session.user) {
                (session.user as any).username = token.name;
                // session.accessToken = token.accessToken; // If needed
            }
            return session;
        },
    },
});

export { handler as GET, handler as POST };