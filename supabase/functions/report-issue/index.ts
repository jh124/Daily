// Public, guest-accessible endpoint. Rate limits are enforced in Postgres.
const origin = 'https://jh124.github.io';
const cors = {'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin'};
const reply = (status, message) => new Response(JSON.stringify({message}), {status, headers: {...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store'}});
Deno.serve(async req => {
  if (req.headers.get('origin') !== origin) return reply(403, 'Request not allowed.');
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
  if (req.method !== 'POST') return reply(405, 'Use POST.');
  const key = Deno.env.get('BREVO_API_KEY');
  const sender = Deno.env.get('BREVO_SENDER_EMAIL');
  const recipient = Deno.env.get('REPORT_TO_EMAIL');
  const url = Deno.env.get('SUPABASE_URL');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key || !sender || !recipient || !url || !service) return reply(503, 'Issue reporting is not available yet. Please try again later.');
  let body;
  try {
    const reader = req.body?.getReader();
    if (!reader) return reply(400, 'Describe the issue first.');
    const chunks = []; let length = 0;
    while (true) {const {done, value} = await reader.read(); if (done) break; length += value.length; if (length > 20000) {await reader.cancel(); return reply(413, 'Your report is too long.');} chunks.push(value);}
    const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.length;}
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {return reply(400, 'Invalid report.');}
  const description = typeof body?.description === 'string' ? body.description.trim() : '';
  const version = typeof body?.version === 'string' && /^v\d{1,5}$/.test(body.version) ? body.version : 'unknown';
  if (!description || description.length > 4000) return reply(400, 'Enter a description of up to 4,000 characters.');
  try {
    // Daily salted hash: no raw IP addresses or report text stored in the database.
    // The global cap remains effective even if an attacker rotates/spoofs IPs.
    const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim().slice(0,100);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key + new Date().toISOString().slice(0,10) + ip));
    const client = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('');
    const limit = await fetch(url + '/rest/v1/rpc/daily_issue_allow', {method:'POST', headers:{apikey:service, Authorization:'Bearer '+service, 'Content-Type':'application/json'}, body:JSON.stringify({client_hash:client}), signal:AbortSignal.timeout(10000)});
    if (!limit.ok) return reply(503, 'Issue reporting is temporarily unavailable. Please try again later.');
    if (await limit.json() !== true) return reply(429, 'Too many reports have been submitted. Please try again later.');
    const result = await fetch('https://api.brevo.com/v3/smtp/email', {method:'POST', headers:{'api-key':key, 'Content-Type':'application/json', accept:'application/json'}, body:JSON.stringify({sender:{name:'Daily',email:sender},to:[{email:recipient}],subject:'Daily issue report',textContent:'Daily version: '+version+'\n\n'+description}), signal:AbortSignal.timeout(15000)});
    if (!result.ok) return reply(502, 'Your report could not be sent. Please try again later.');
    return reply(200, 'Report sent. Thank you!');
  } catch {return reply(503, 'Sending could not be confirmed. Please try again later.');}
});
