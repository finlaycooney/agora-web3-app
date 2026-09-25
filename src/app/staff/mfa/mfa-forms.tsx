"use client";

import { useState } from 'react';

type MfaError = { message: string; returnToStaff?: boolean };

async function postCode(url: string, code: string): Promise<MfaError | null> {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
    });
    if (response.ok) {
        return null;
    }
    if (response.status === 409) {
        return {
            message: 'Your two-factor setup has changed or is already complete. Continue to the staff page.',
            returnToStaff: true,
        };
    }
    const body = await response.json().catch(() => null);
    if (response.status === 401 && body?.error === 'invalid code') {
        return { message: 'Invalid code — wait for a new code in your authenticator app and try again.' };
    }
    if (response.status === 401) {
        return { message: 'Your session could not be verified. Return to the staff page to sign in again.', returnToStaff: true };
    }
    return { message: 'Two-factor authentication is temporarily unavailable. Please try again.' };
}

function CodeForm({ onSubmit, label }: { onSubmit: (code: string) => Promise<MfaError | null>; label: string }) {
    const [code, setCode] = useState('');
    const [error, setError] = useState<MfaError | null>(null);
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        setBusy(true);
        setError(null);
        try {
            const failure = await onSubmit(code);
            if (failure) {
                setError(failure);
            } else {
                window.location.assign('/staff');
            }
        } catch {
            setError({ message: 'Could not connect. Check your connection and try again.' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <form
            className="mt-6 flex flex-col items-center gap-4"
            onSubmit={(event) => {
                event.preventDefault();
                void submit();
            }}
        >
            <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="w-40 rounded-md border border-foreground/20 bg-transparent px-3 py-2 text-center font-mono text-lg tracking-[0.4em] outline-none focus:border-foreground/50"
            />
            {error && (
                <div role="alert" className="text-sm text-red-400">
                    <p>{error.message}</p>
                    {error.returnToStaff && (
                        <a href="/staff" className="mt-2 inline-block text-foreground underline">
                            Continue to staff
                        </a>
                    )}
                </div>
            )}
            <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-80 disabled:opacity-40"
            >
                {label}
            </button>
        </form>
    );
}

export function MfaEnrollForm({ qrDataUrl, secret }: { qrDataUrl: string; secret: string }) {
    return (
        <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="Authenticator QR code" className="mt-8 h-48 w-48 rounded-md bg-white p-2" />
            <p className="mt-4 break-all font-mono text-xs text-foreground/50">{secret}</p>
            <CodeForm
                label="Enable two-factor"
                onSubmit={(code) => postCode('/api/staff/mfa/enroll', code)}
            />
        </>
    );
}

export function MfaVerifyForm() {
    return (
        <CodeForm
            label="Verify"
            onSubmit={(code) => postCode('/api/staff/mfa/verify', code)}
        />
    );
}
