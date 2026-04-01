import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client (no cookies needed, read-only public data)
export function createServerSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
