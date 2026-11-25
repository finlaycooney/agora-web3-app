"use client";

import { signIn, signOut } from "next-auth/react";

export function StaffSignInButton() {
    return (
        <button
            type="button"
            onClick={() => signIn('google', { callbackUrl: '/staff' })}
            className="rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-80"
        >
            Sign in with Google
        </button>
    );
}

export function StaffSignOutButton() {
    return (
        <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/staff/sign-in' })}
            className="rounded-md border border-foreground/20 px-4 py-2 text-sm transition-opacity hover:opacity-70"
        >
            Sign out
        </button>
    );
}
