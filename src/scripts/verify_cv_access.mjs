import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// 1. Load the Identity Secrets
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function verifyProtocol() {
    console.log("─── STARTING_VAULT_DIAGNOSTIC (SECURE MODE) ───");

    // 2. Fetch the latest Signal
    const { data: applicant, error: dbError } = await supabase
        .from('applicants')
        .select('full_name, cv_url')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (dbError) {
        console.error("❌ DB_FETCH_FAILURE:", dbError.message);
        return;
    }

    console.log(`> FOUND_SIGNAL: ${applicant.full_name}`);
    console.log(`> PATH_IN_DB  : ${applicant.cv_url}`);

    if (!applicant.cv_url) {
        console.log("⚠️ NO_CV_URL_FOUND: The latest applicant does not have a CV URL.");
        return;
    }

    // 3. Generate the Signed URL (Expires in 1 hour)
    const { data, error } = await supabase.storage
        .from('cv-submissions')
        .createSignedUrl(applicant.cv_url, 3600);

    if (error) {
        console.error("❌ SIGNED_URL_GENERATION_FAILED:", error.message);
        return;
    }

    console.log(`\n> GENERATED_SIGNED_URL (Valid for 1 hour):\n  ${data.signedUrl}\n`);

    // 4. Test the Uplink
    try {
        const response = await fetch(data.signedUrl, { method: 'HEAD' });
        if (response.ok) {
            console.log("✅ SECURE_UPLINK_SUCCESS: File is accessible via signed URL.");
        } else {
            console.error(`❌ SECURE_UPLINK_FAILURE: Status ${response.status}`);
            console.log("HINT: Ensure the file exists and the token is valid.");
        }
    } catch (err) {
        console.error("❌ NETWORK_ERROR:", err.message);
    }
}

verifyProtocol();
