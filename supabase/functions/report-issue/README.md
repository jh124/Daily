# Deploy issue reports

1. Save `BREVO_API_KEY` in Supabase Edge Functions Secrets.
2. Save `REPORT_TO_EMAIL` with the report recipient address. Also save `BREVO_SENDER_EMAIL`: the verified sender address currently used for Daily's login emails (Supabase Authentication email SMTP settings). This is the sender, not necessarily the Brevo login or report destination.
3. Run the contents of `supabase/issue-report.sql` in SQL Editor.
4. In Edge Functions, deploy a new function via Editor named `report-issue`. Replace its index.ts with the contents of this folder's index.ts. Disable Verify JWT for this function so guests can report sign-in problems.
5. Test a report in Daily and confirm receipt at the configured recipient address. A successful response means Brevo accepted the message; inbox delivery must be checked separately.

Secrets stay server-side. Recipients, sender and subject cannot be changed by the caller. Only description and version are sent; no account session, food logs or weigh-ins. Description is plain text. Requests are limited to 20 KB and descriptions to 4,000 characters. Database limits enforce 3 attempts per IP-derived hash/hour and 50 attempts total per UTC day. The total cap limits email abuse even if the IP limit is bypassed; an attacker could exhaust it and temporarily block reports. CORS is not authentication. For a larger public rollout, add a verified CAPTCHA before increasing quotas. Failed delivery attempts also consume quota. No automatic retries.

The SQL counters store only expiring hashes and counts; reports live in the recipient mailbox/Brevo email logs. Brevo/API errors and report contents are not logged by the function. Platform request logging is managed by Supabase.
