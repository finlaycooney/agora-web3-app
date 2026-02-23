import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { resend } from '@/lib/resend';

export async function POST(request: Request) {
    try {
        const formData = await request.formData();

        // Debug Log
        const debugPayload: Record<string, any> = {};
        formData.forEach((value, key) => {
            debugPayload[key] = value;
        });

        // Remove file content from debug log to avoid clutter
        if (debugPayload.cvFile) debugPayload.cvFile = `(File Object) Name: ${(debugPayload.cvFile as File).name}`;
        console.log("Handshake Payload:", debugPayload);

        // 1. Extract Variables
        const fullName = formData.get('fullName') as string;
        const email = formData.get('email') as string;
        const professionalUrl = formData.get('professionalUrl') as string;
        const technicalAchievement = formData.get('technicalAchievement') as string;
        const githubHandle = formData.get('githubHandle') as string;
        const cvFile = formData.get('cvFile') as File | null;

        // 1.5 Validate File
        if (cvFile) {
            const MAX_SIZE = 5 * 1024 * 1024; // 5MB
            const ALLOWED_TYPES = [
                'application/pdf',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            ];

            if (cvFile.size > MAX_SIZE || !ALLOWED_TYPES.includes(cvFile.type)) {
                return NextResponse.json(
                    { message: 'INVALID_SIGNAL_FORMAT' },
                    { status: 400 }
                );
            }
        }

        // Generate Protocol ID
        const refId = Math.random().toString(36).substring(7).toUpperCase();
        const timestamp = new Date().toISOString();

        // 2. Upload CV to Supabase Storage (if exists)
        let cvUrl = null;
        if (cvFile) {
            const fileExt = cvFile.name.split('.').pop();
            const originalNameWithoutExt = cvFile.name.substring(0, cvFile.name.lastIndexOf('.'));
            const sanitizedName = originalNameWithoutExt.replace(/[^a-zA-Z0-9]/g, '_');
            const fileName = `${refId}-${Math.random().toString(36).substring(7)}-${sanitizedName}.${fileExt}`;
            const filePath = `cvs/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('cv-submissions')
                .upload(filePath, cvFile);

            if (uploadError) {
                console.error('Supabase Storage Error:', uploadError);
                // We typically continue even if upload fails, or return error. 
                // For now, logging it and continuing without cv_url.
            } else {
                cvUrl = filePath; // Store the Path as requested
            }
        }

        // 3. Insert into Supabase
        // Note: Switched to 'applicants' table as per latest schema instruction
        const { error: dbError } = await supabase
            .from('applicants')
            .insert({
                ref_id: refId,
                full_name: fullName,
                email: email,
                professional_url: professionalUrl,
                technical_achievement: technicalAchievement,
                github_handle: githubHandle,
                cv_url: cvUrl,
                created_at: timestamp
            });

        if (dbError) {
            // LOG THE EXACT SIGNAL FAILURE IN THE TERMINAL
            console.error("─── SIGNAL_INGEST_FAILURE ───");
            console.error("CODE    :", dbError.code);    // Postgres error code
            console.error("MESSAGE :", dbError.message); // Human-readable failure
            console.error("DETAILS :", dbError.details); // Extra context from the vault
            console.error("HINT    :", dbError.hint);    // Guidance on how to fix it
            console.error("─────────────────────────────");
            return NextResponse.json({
                message: "DATABASE_WRITE_FAILURE",
                details: dbError.message
            }, { status: 500 });
        }

        // 3. Send Email via Resend
        try {
            await resend.emails.send({
                from: 'Agora4 Signal <onboarding@resend.dev>', // Update this domain in prod
                to: [email, 'finlay.cooney@gmail.com'], // Send to applicant + admin
                subject: `SIGNAL RECEIVED: ${refId} // ${fullName}`,
                html: `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');
                        body {
                            background-color: #020b1a;
                            color: #00ffc8;
                            font-family: 'JetBrains Mono', monospace;
                            padding: 40px;
                            margin: 0;
                        }
                        .container {
                            max-width: 600px;
                            margin: 0 auto;
                            border: 1px solid rgba(0, 255, 200, 0.2);
                            padding: 30px;
                            background-color: rgba(0, 255, 200, 0.02);
                        }
                        .header {
                            border-bottom: 1px solid rgba(0, 255, 200, 0.2);
                            padding-bottom: 20px;
                            margin-bottom: 30px;
                        }
                        .label {
                            color: rgba(0, 255, 200, 0.6);
                            font-size: 12px;
                            margin-bottom: 4px;
                            text-transform: uppercase;
                        }
                        .value {
                            color: #ffffff;
                            margin-bottom: 20px;
                        }
                        .footer {
                            margin-top: 40px;
                            color: rgba(0, 255, 200, 0.4);
                            font-size: 10px;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <div>> INCOMING_TRANSMISSION_DETECTED</div>
                            <div>> PROTOCOL_ID: ${refId}</div>
                            <div>> TIMESTAMP: ${timestamp}</div>
                        </div>

                        <div class="label">IDENTITY_VERIFIED</div>
                        <div class="value">${fullName} (${githubHandle || 'EXTERNAL_VERIFIED'})</div>

                        <div class="label">COMMUNICATION_LINK</div>
                        <div class="value">${email}</div>

                        <div class="label">PROFESSIONAL_NODE</div>
                        <div class="value">${professionalUrl || 'N/A'}</div>

                        <div class="label">TECHNICAL_SIGNAL_DECODED</div>
                        <div class="value" style="white-space: pre-wrap;">${technicalAchievement}</div>
                        
                        <div class="footer">
                            > END_OF_TRANSMISSION<br>
                            > AGORA4_SYSTEMS_ONLINE
                        </div>
                    </div>
                </body>
                </html>
                `
            });
        } catch (emailError) {
            console.error('Email Error:', emailError);
            // Non-blocking error, we still return success to partial failure doesn't stop UI
        }

        return NextResponse.json({
            success: true,
            refId: refId
        });

    } catch (error) {
        console.error('API Route Error:', error);
        return NextResponse.json(
            { message: 'INTERNAL_SERVER_ERROR' },
            { status: 500 }
        );
    }
}
