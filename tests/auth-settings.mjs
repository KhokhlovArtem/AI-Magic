// Read-only integration check; prints no keys or tokens.
import { supabaseUrl, supabasePublishableKey } from '../auth-config.js';

if (!supabaseUrl || !supabasePublishableKey) throw new Error('Configure Supabase URL and publishable key first.');
const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
  headers: { apikey: supabasePublishableKey }
});
if (!response.ok) throw new Error(`Supabase settings request failed: HTTP ${response.status}`);
const settings = await response.json();
for (const provider of ['github', 'google']) {
  if (!settings.external?.[provider]) throw new Error(`${provider} is not enabled in Supabase Auth.`);
  console.log(`${provider}: enabled`);
  const url = new URL(`${supabaseUrl}/auth/v1/authorize`);
  url.searchParams.set('provider', provider);
  url.searchParams.set('redirect_to', 'http://localhost:8000/');
  const authorization = await fetch(url, { headers: { apikey: supabasePublishableKey }, redirect: 'manual' });
  const destination = authorization.headers.get('location');
  const expectedHost = provider === 'github' ? 'github.com' : 'accounts.google.com';
  if (authorization.status !== 302 || !destination || new URL(destination).hostname !== expectedHost) {
    throw new Error(`${provider} did not redirect to the expected authorization host (HTTP ${authorization.status}).`);
  }
  console.log(`${provider}: authorization redirect OK`);
}
