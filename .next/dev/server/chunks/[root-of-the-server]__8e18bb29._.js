module.exports = [
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[project]/src/lib/supabase.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "supabase",
    ()=>supabase
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$supabase$2d$js$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/@supabase/supabase-js/dist/index.mjs [app-route] (ecmascript) <locals>");
;
// Access the environment variables from your root .env.local file
const supabaseUrl = ("TURBOPACK compile-time value", "https://opyjtolduziqrrltxgcx.supabase.co");
const supabaseAnonKey = ("TURBOPACK compile-time value", "sb_publishable_uLqSuFJI_93ICthvpuhX7g_-YeZNTFH");
const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$supabase$2d$js$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["createClient"])(supabaseUrl, supabaseAnonKey);
}),
"[externals]/node:crypto [external] (node:crypto, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:crypto", () => require("node:crypto"));

module.exports = mod;
}),
"[project]/src/lib/resend.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "resend",
    ()=>resend
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$resend$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/resend/dist/index.mjs [app-route] (ecmascript)");
;
const resend = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$resend$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__["Resend"](process.env.RESEND_API_KEY);
}),
"[project]/src/app/api/submit-signal/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "POST",
    ()=>POST
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/supabase.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$resend$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/resend.ts [app-route] (ecmascript)");
;
;
;
async function POST(request) {
    try {
        const formData = await request.formData();
        // Debug Log
        const debugPayload = {};
        formData.forEach((value, key)=>{
            debugPayload[key] = value;
        });
        // Remove file content from debug log to avoid clutter
        if (debugPayload.cvFile) debugPayload.cvFile = `(File Object) Name: ${debugPayload.cvFile.name}`;
        console.log("Handshake Payload:", debugPayload);
        // 1. Extract Variables
        const fullName = formData.get('fullName');
        const email = formData.get('email');
        const professionalUrl = formData.get('professionalUrl');
        const technicalAchievement = formData.get('technicalAchievement');
        const githubHandle = formData.get('githubHandle');
        const cvFile = formData.get('cvFile');
        // Generate Protocol ID
        const refId = Math.random().toString(36).substring(7).toUpperCase();
        const timestamp = new Date().toISOString();
        // 2. Upload CV to Supabase Storage (if exists)
        let cvUrl = null;
        if (cvFile) {
            const fileExt = cvFile.name.split('.').pop();
            const fileName = `${refId}-${Math.random().toString(36).substring(7)}.${fileExt}`;
            const filePath = `cvs/${fileName}`;
            const { error: uploadError } = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["supabase"].storage.from('cv-submissions').upload(filePath, cvFile);
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
        const { error: dbError } = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["supabase"].from('applicants').insert({
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
            console.error("CODE    :", dbError.code); // Postgres error code
            console.error("MESSAGE :", dbError.message); // Human-readable failure
            console.error("DETAILS :", dbError.details); // Extra context from the vault
            console.error("HINT    :", dbError.hint); // Guidance on how to fix it
            console.error("─────────────────────────────");
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                message: "DATABASE_WRITE_FAILURE",
                details: dbError.message
            }, {
                status: 500
            });
        }
        // 3. Send Email via Resend
        try {
            await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$resend$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["resend"].emails.send({
                from: 'Agora4 Signal <onboarding@resend.dev>',
                to: [
                    email,
                    'finlay.cooney@gmail.com'
                ],
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
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            success: true,
            refId: refId
        });
    } catch (error) {
        console.error('API Route Error:', error);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            message: 'INTERNAL_SERVER_ERROR'
        }, {
            status: 500
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__8e18bb29._.js.map