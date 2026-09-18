import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { JOBS } from '@/data/jobs';
import {
    readApplicationFields,
    validateApplicationFields,
} from '@/lib/application';
import { validateCvFile } from '@/lib/application-file';

export const runtime = 'nodejs';

const jsonError = (code: string, message: string, status: number) => (
    NextResponse.json({ success: false, code, message }, { status })
);

export async function POST(req: Request) {
    try {
        const formData = await req.formData();

        const honeypot = formData.get('website') ?? formData.get('protocol_token');
        if (typeof honeypot === 'string' && honeypot.trim()) {
            return NextResponse.json(
                { success: true, message: 'Application received.' },
                { status: 202 },
            );
        }

        const fields = readApplicationFields(formData);
        const fieldValidation = validateApplicationFields(fields, JOBS);
        if (!fieldValidation.ok) {
            return jsonError(fieldValidation.code, fieldValidation.message, 400);
        }

        const cvFile = formData.get('cvFile');
        const fileValidation = await validateCvFile(cvFile);
        if (!fileValidation.ok) {
            return jsonError(fileValidation.code, fileValidation.message, 400);
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceRoleKey) {
            console.error('Application submission is missing Supabase configuration.');
            return jsonError(
                'SERVICE_UNAVAILABLE',
                'Applications are temporarily unavailable. Please try again later.',
                503,
            );
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        const refId = `AG-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
        const filePath = `cvs/${fieldValidation.job.id}/${refId}.${fileValidation.extension}`;

        const { error: uploadError } = await supabase.storage
            .from('cv-submissions')
            .upload(filePath, fileValidation.file, {
                contentType: fileValidation.mimeType,
                upsert: false,
            });

        if (uploadError) {
            console.error('CV upload failed:', uploadError);
            return jsonError(
                'CV_UPLOAD_FAILED',
                'Your CV could not be uploaded. Please try again.',
                500,
            );
        }

        const { error: dbError } = await supabase
            .from('applicants')
            .insert([{
                job_id: fieldValidation.job.id,
                job_title: fieldValidation.job.title,
                full_name: fieldValidation.fields.fullName,
                email: fieldValidation.fields.email,
                professional_url: fieldValidation.fields.professionalUrl || null,
                technical_achievement: fieldValidation.fields.technicalAchievement || null,
                cv_url: filePath,
                ref_id: refId,
                status: 'pending',
            }]);

        if (dbError) {
            console.error('Applicant database write failed:', dbError);
            const { error: cleanupError } = await supabase.storage
                .from('cv-submissions')
                .remove([filePath]);

            if (cleanupError) {
                console.error('Failed to clean up orphaned CV:', cleanupError);
            }

            return jsonError(
                'APPLICATION_SAVE_FAILED',
                'Your application could not be saved. Please try again.',
                500,
            );
        }

        return NextResponse.json({ success: true, refId });
    } catch (error) {
        console.error('Unexpected application submission failure:', error);
        return jsonError(
            'INTERNAL_SERVER_ERROR',
            'Applications are temporarily unavailable. Please try again later.',
            500,
        );
    }
}
