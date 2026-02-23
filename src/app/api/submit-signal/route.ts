import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // Use Service Role for backend writes
);

export async function POST(req: Request) {
    try {
        const formData = await req.formData();

        // 1. THE HONEYPOT DEFENSE 🍯
        // If a bot fills out this hidden field, we return a fake success.
        const botShield = formData.get('protocol_token');
        if (botShield) {
            console.log("🛡️ Bot signal intercepted via Honeypot.");
            return NextResponse.json({ success: true, message: "Signal received." });
        }

        // 2. EXTRACT DATA
        const fullName = formData.get('fullName') as string;
        const email = formData.get('email') as string;
        const cvFile = formData.get('cvFile') as File;
        const refId = `AG-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

        // 3. STRICT FILE VALIDATION 🛑
        if (!cvFile || cvFile.size === 0) {
            return NextResponse.json({ error: "MISSING_CV" }, { status: 400 });
        }

        // Limit to 5MB
        if (cvFile.size > 5 * 1024 * 1024) {
            return NextResponse.json({ error: "FILE_TOO_LARGE" }, { status: 400 });
        }

        // Only allow PDFs
        if (cvFile.type !== 'application/pdf') {
            return NextResponse.json({ error: "INVALID_FORMAT_PDF_ONLY" }, { status: 400 });
        }

        // 4. FILENAME SANITIZATION 🧼
        const timestamp = Date.now();
        const cleanName = cvFile.name.replace(/[^a-zA-Z0-9.]/g, '_');
        const fileName = `${timestamp}-${cleanName}`;
        const filePath = `cvs/${fileName}`;

        // 5. THE VAULT HANDSHAKE (STORAGE)
        const { error: uploadError } = await supabase.storage
            .from('cv-submissions')
            .upload(filePath, cvFile);

        if (uploadError) {
            console.error("❌ STORAGE_FAILURE:", uploadError);
            return NextResponse.json({ error: "VAULT_UPLOAD_FAILED" }, { status: 500 });
        }

        // 6. DATABASE INGESTION
        const { error: dbError } = await supabase
            .from('applicants')
            .insert([{
                full_name: fullName,
                email: email,
                cv_url: filePath,
                ref_id: refId,
                status: 'pending'
            }]);

        if (dbError) {
            console.error("❌ DB_FAILURE:", dbError);
            return NextResponse.json({ error: "DATABASE_WRITE_FAILURE" }, { status: 500 });
        }

        return NextResponse.json({ success: true, refId });

    } catch (error) {
        console.error("💥 CRITICAL_FAILURE:", error);
        return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
    }
}