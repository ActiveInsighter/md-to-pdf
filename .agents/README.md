# Project skills

This directory vendors the Codex skills used to develop `md-to-pdf` so that
local and cloud development environments use the same guidance.

Codex discovers project-scoped skills from `.agents/skills/`. Each child
directory is a self-contained skill with a `SKILL.md` entry point and any
supporting references, scripts, or assets required by that skill.

## Included skills

| Skill | Source | Purpose |
| --- | --- | --- |
| `find-skills` | `vercel-labs/skills` | Discover additional skills from the public ecosystem. |
| `frontend-design` | `anthropics/skills` | Build polished, production-grade frontend interfaces. |
| `ui-ux-pro-max` | `nextlevelbuilder/ui-ux-pro-max-skill` | UI/UX patterns, accessibility, layouts, and design systems. |
| `shadcn` | `shadcn-ui/ui` | Official shadcn component, registry, composition, and styling workflow. |
| `vercel-react-best-practices` | `vercel-labs/agent-skills` | React performance and architecture guidance from Vercel Engineering. |
| `supabase-postgres-best-practices` | `supabase/agent-skills` | Official Supabase Postgres schema, query, RLS, and performance guidance. |
| `cloudflare-deploy` | `openai/skills` | Cloudflare Pages and Workers deployment workflows. |
| `playwright` | `openai/skills` | Browser automation, UI debugging, and end-to-end verification. |
| `pdf` | `openai/skills` | PDF creation, inspection, rendering, and visual verification. |
| `security-best-practices` | `openai/skills` | JavaScript and TypeScript security reviews. |
| `security-threat-model` | `openai/skills` | Repository-grounded application threat modeling. |
| `gh-address-comments` | `openai/skills` | Address actionable GitHub pull request review feedback. |
| `gh-fix-ci` | `openai/skills` | Diagnose and fix failing GitHub Actions checks. |
| `yeet` | `openai/skills` | Commit, push, and open a draft pull request when explicitly requested. |

## Maintenance

- Treat each vendored skill as third-party content and review changes before
  updating it.
- Keep complete skill directories; references in `SKILL.md` may depend on
  sibling files.
- Do not vendor user credentials, tool caches, `.git` directories, or Codex
  `.system` skills.
- Update skills in a dedicated branch and validate every directory contains a
  readable `SKILL.md` before merging.

The source snapshot metadata for ecosystem-installed skills is recorded in
[`skill-lock.json`](./skill-lock.json). OpenAI curated skills are sourced from
the `openai/skills` curated collection and retain their bundled `LICENSE.txt`.
