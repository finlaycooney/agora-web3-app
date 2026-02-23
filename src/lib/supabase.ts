import { createClient } from '@supabase/supabase-js';

// Access the environment variables from your root .env.local file
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Initialize the client for use across your application
// The "!" tells TypeScript that these variables will definitely exist at runtime
export const supabase = createClient(supabaseUrl, supabaseAnonKey);