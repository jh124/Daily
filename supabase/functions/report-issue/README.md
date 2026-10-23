# Deploy issue reports

1. Save `BREVO_API_KEY` in Supabase Edge Functions Secrets.
2. Save `REPORT_TO_EMAIL` with the report recipient address. Also save `BREVO_SENDER_EMAIL`: the verified sender address currently used for Daily's login emails (Supabase Authentication email SMTP settings). This is the sender, not necessarily the Brevo login or report destination.
3. Run the contents of `supabase/issue-report.sql` in SQL Editor.
4. In Edge Functions, deploy a new function via Editor named `report-issue`. Replace its index.ts with the contents of this folder's index.ts. Disable Verify JWT for this function so guests can report sign-in problems.
5. Test a report in Daily and confirm receipt at the configured recipient address. A successful response means Brevo accepted the message; inbox delivery must be checked separately.

Secrets stay server-side. Recipients, sender and subject cannot be changed by the caller. Only description and version are sent; no account session, food logs or weigh-ins. Description is plain text. Requests are limited to 20 KB and descriptions to 4,000 characters. Database limits enforce 3 attempts per IP-derived hash/hour and 50 attempts total per UTC day. The total cap limits email abuse even if the IP limit is bypassed; an attacker could exhaust it and temporarily block reports. CORS is not authentication. For a larger public rollout, add a verified CAPTCHA before increasing quotas. Failed delivery attempts also consume quota. No automatic retries.

The SQL counters store only expiring hashes and counts; reports live in the recipient mailbox/Brevo email logs. Brevo rejections log only their HTTP status, an allowlisted error code and a fixed reason category under `report_issue_brevo_error`. The function does not log provider messages, report text, addresses or credentials. Platform request logging is managed by Supabase.

## Troubleshoot a 502

Replace the deployed function with this version, deploy, submit one report, then open **Edge Functions → report-issue → Logs**. Find `report_issue_brevo_error` and read its `status`, `code` and `reason`. For example, `sending_server_ip_not_authorized` points to Brevo's Authorized IPs settings; `sender_configuration_rejected` points to the verified sender. These are diagnoses from the provider response, not inbox delivery confirmations. A malformed address produces `report_issue_config_error` before consuming report quota. Leading/trailing whitespace in secrets is trimmed.

Sender and recipient may be the same address. Changing the recipient is a delivery test, not a fix for a sender's SPF/DKIM authentication failure. Sender verification alone does not authenticate a public email provider's domain. Use a domain you own and authenticate it in Brevo for reliable delivery.
