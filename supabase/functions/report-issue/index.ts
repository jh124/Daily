// Public, guest-accessible endpoint. Rate limits are enforced in Postgres.
const origin = 'https://jh124.github.io';
const cors = {'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin'};
const reply = (status, message, diagnostic) => new Response(JSON.stringify({message, ...(diagnostic ? {diagnostic} : {})}), {status, headers: {...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store'}});
// Log only fixed categories. Provider messages can contain private addresses/IPs.
async function logBrevoFailure(response) {
  let error; try {error = await response.json();} catch {}
  const codes = ['invalid_parameter', 'missing_parameter', 'out_of_range', 'unauthorized', 'document_not_found', 'method_not_allowed', 'not_enough_credits', 'duplicate_parameter', 'duplicate_request', 'account_under_validation', 'permission_denied', 'bad_request'];
  const code = codes.includes(error?.code) ? error.code : 'unknown';
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  let reason = 'see_provider_status_and_code';
  if (/\bip\b/.test(message) && /unauthori|unrecogni|not authori|allow.?list|white.?list|block/.test(message)) reason = 'sending_server_ip_not_authorized';
  else if (/sender/.test(message)) reason = 'sender_configuration_rejected';
  else if (/api[ -]?key/.test(message)) reason = 'api_key_rejected';
  else if (/credit|quota/.test(message)) reason = 'email_quota_or_credits';
  else if (/validat|activat|suspend/.test(message)) reason = 'account_activation_or_review';
  else if (/recipient|\bto\b/.test(message)) reason = 'recipient_rejected';
  console.error(JSON.stringify({event: 'report_issue_brevo_error', status: response.status, code, reason}));
  const category = {sending_server_ip_not_authorized:'IP', sender_configuration_rejected:'SENDER', api_key_rejected:'KEY', email_quota_or_credits:'QUOTA', account_activation_or_review:'ACCOUNT', recipient_rejected:'RECIPIENT'}[reason] || 'OTHER';
  return 'BREVO_' + response.status + '_' + code.toUpperCase() + '_' + category;
}
Deno.serve(async req => {
  if (req.headers.get('origin') !== origin) return reply(403, 'Request not allowed.');
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
  if (req.method !== 'POST') return reply(405, 'Use POST.');
  const key = Deno.env.get('BREVO_API_KEY')?.trim();
  const sender = Deno.env.get('BREVO_SENDER_EMAIL')?.trim();
  const recipient = Deno.env.get('REPORT_TO_EMAIL')?.trim();
  const url = Deno.env.get('SUPABASE_URL');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key || !sender || !recipient || !url || !service) return reply(503, 'Issue reporting is not available yet. Please try again later.', 'CONFIG_MISSING');
  for (const [name, value] of [['BREVO_SENDER_EMAIL', sender], ['REPORT_TO_EMAIL', recipient]]) {
    if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value)) {
      console.error(JSON.stringify({event: 'report_issue_config_error', setting: name, reason: 'enter_bare_email_address'}));
      return reply(503, 'Issue reporting is not available yet. Please try again later.', name === 'BREVO_SENDER_EMAIL' ? 'CONFIG_SENDER_FORMAT' : 'CONFIG_RECIPIENT_FORMAT');
    }
  }
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
  let stage = 'RATE_SERVICE';
  try {
    // Daily salted hash: no raw IP addresses or report text stored in the database.
    // The global cap remains effective even if an attacker rotates/spoofs IPs.
    const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim().slice(0,100);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key + new Date().toISOString().slice(0,10) + ip));
    const client = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('');
    const limit = await fetch(url + '/rest/v1/rpc/daily_issue_allow', {method:'POST', headers:{apikey:service, Authorization:'Bearer '+service, 'Content-Type':'application/json'}, body:JSON.stringify({client_hash:client}), signal:AbortSignal.timeout(10000)});
    if (!limit.ok) return reply(503, 'Issue reporting is temporarily unavailable. Please try again later.', 'RATE_SERVICE_' + limit.status);
    if (await limit.json() !== true) return reply(429, 'Too many reports have been submitted. Please try again later.', 'REPORT_LIMIT');
    stage = 'BREVO';
    const result = await fetch('https://api.brevo.com/v3/smtp/email', {method:'POST', headers:{'api-key':key, 'Content-Type':'application/json', accept:'application/json'}, body:JSON.stringify({sender:{name:'Daily',email:sender},to:[{email:recipient}],subject:'Daily issue report',textContent:'Daily version: '+version+'\n\n'+description}), signal:AbortSignal.timeout(15000)});
    if (!result.ok) {
      const diagnostic = await logBrevoFailure(result);
      return reply(502, 'Your report could not be sent. Please try again later.', diagnostic);
    }
    return reply(200, 'Report sent. Thank you!');
  } catch {return reply(503, 'Sending could not be confirmed. Please try again later.', 'NETWORK_' + stage);}
});
