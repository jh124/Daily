# Connect Daily cloud sync

The app keeps working locally until `cloud-config.mjs` is configured. Cloud
sync is not active merely because these files are deployed.

1. Create a **Free** Supabase project at https://supabase.com/dashboard.
2. Run `supabase/schema.sql` in its SQL Editor once. The table has row-level
   security, authenticated-only reads, and atomic revision-checked writes.
3. Set the project URL and **publishable key** (or legacy anon key) in
   `cloud-config.mjs`. These are public browser configuration. Never use a
   service-role key, secret key, database password or personal access token.
4. In Authentication URL Configuration, set Site URL and allowed redirect URL
   to `https://jh124.github.io/Daily/`.
5. Enable email authentication and use the code-only email template in `supabase/login-email.html` for both
   Magic Link and Confirm signup.
   The app uses passwordless email login; the same flow creates new accounts. Configure a custom
   SMTP provider for public login emails; Supabase's default sender
   only supports project team addresses. Check that provider's free allowance
   and any domain requirements. Do not bypass email verification.
6. Deploy, then test with two real accounts: first-time email signup, returning-user login links, expired links,
   cloud isolation, offline logging/reconnect, simultaneous edits, deletion,
   signout/relogin, and deleting an account. Test Safari and the Home Screen app. Email links generally open in Safari;
   verify where the session lands, since Home Screen and Safari storage can be
   separate. Do not claim that a Safari session automatically logs in the PWA.

## Behavior

Guest and each account have separate local storage. On first login on a device,
Daily offers to copy guest history. The guest copy remains available when signed
out. Entries and foods merge by ID; weights merge by date. A saved baseline
tracks deletions without resurrecting stale records. If both devices change the
same record, the device currently syncing wins. A server revision check retries
concurrent writes. Edits made during requests remain pending rather than being
replaced. Sync runs after changes, when online, when foregrounded, and every
minute while visible. The account panel shows failures; it never claims a failed
upload was synced. Export JSON remains available for an independent backup.

Meals, calorie/protein logs and weights are synced. Display preferences stay on
the device. Deleting an account deletes its cloud row and this device's account
copy. Other offline devices can retain their local copy; deletion does not erase
already exported backups or storage on other devices.

## Free service limits

Supabase Free currently has 500 MB database space, 50,000 monthly active users,
and 5 GB egress. Inactive projects may pause after seven days. Automatic database
backups are not included. Monitor usage and regularly export database backups;
do not promise permanent free hosting or loss-proof storage.

## Validation

Run `node --test tests/*.test.mjs`. These tests cover reconciliation and a simulated cloud transport, not a
live Supabase deployment. Live authentication, database isolation and SQL must
be verified after connecting a project before opening public registration.

## Current setup

The project URL and publishable key are configured. The owner has run the SQL
and configured redirect URLs and Brevo custom SMTP. Live login email delivery,
account isolation and syncing still require verification. The client includes a
legacy meals alias on uploads to remain compatible with the installed SQL.

## Code-only email login

In Authentication > Emails > Templates, replace the bodies of both **Magic
Link** and **Confirm signup** with `supabase/login-email.html`. The template
uses `{{ .Token }}` and contains no login link. The client requests an email
code and verifies it inside Safari or the Home Screen app. No SMTP or SQL
changes are needed. Dashboard templates cannot be updated with the public key.

The user icon opens the account/settings drawer. It includes code-only signup
and login, signout, sync, account deletion, import/export, appearance and weight
units. A revised first-open explanation offers account creation or guest use.
