## Why

<!-- Describe the user-facing or maintainer-facing problem and why this change is needed. -->

## What Changed

<!-- Summarize the net change. Keep generated files and user documents out of the PR. -->

## Architecture and Security

- [ ] Production PDF jobs still follow Website → Supabase Edge Functions → `build-pdf-api.yml` → private Supabase Storage.
- [ ] No user Markdown, ZIP, image, PDF, signed URL, secret, runtime state, or generated output is committed.
- [ ] Authentication, RLS, CORS, Storage paths, task ownership, and signed downloads were reviewed where relevant.
- [ ] Cloudflare Pages remains frontend-only and uses no server credential in a `VITE_*` variable.
- [ ] Database and Edge Function changes are backward-compatible or include an explicit rollout plan.

## Verification

<!-- List targeted behavioral evidence and relevant commands/results. Use "Not run" with a reason when necessary. -->

## Deployment and Rollback

<!-- Describe deployment order, migrations/functions affected, monitoring, rollback, and any known limitations. -->
