"use client";

import { useState } from 'react';

async function postCode(url: string, code: string) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
    });
    return response.ok;
}

function CodeForm({ onSubmit, label }: { onSubmit: (code: string) => Promise<boolean>; label: string }) {
    const [code, setCode] = useState('');
    const [error, setError] = useState(false);
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        setBusy(true);
        setError(false);
        try {
            const ok = await onSubmit(code);
            if (!ok) {
                setError(true);
            }
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
            {error && <p className="text-sm text-red-400">Invalid code — try again.</p>}
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
            onSubmit={async (code) => {
                const ok = await postCode('/api/staff/mfa/verify', code);
                if (ok) {
                    window.location.assign('/staff');
                }
                return ok;
            }}
        />
    );
}
