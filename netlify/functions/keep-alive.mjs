// Daily keep-alive for the Supabase project.
//
// Supabase pauses free-tier projects after about a week without database
// activity, and while paused the app cannot load anyone's data. This runs one
// real query a day so that never happens.
//
// It signs in as nobody: with the public anon key every row-level security
// policy denies access, so the query returns [] and exposes nothing. The key
// is the same public browser key shipped in supabase.js, not a secret.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxcyocdwvjiyatqnaahg.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4Y3lvY2R3dmppeWF0cW5hYWhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5Nzg4NDEsImV4cCI6MjA4ODU1NDg0MX0.OTtDpyfA69rbVOTJkBh51pwj3wEkR1L04x4ouDkeWZ0';

export default async function keepAlive() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/bookings?select=id&limit=1`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    // Thrown so the failure shows up in the Netlify function log.
    throw new Error(`Supabase keep-alive failed: HTTP ${response.status} ${await response.text()}`);
  }
  console.log(`Supabase keep-alive ok (HTTP ${response.status})`);
  return new Response('ok');
}

export const config = {
  schedule: '@daily',
};
