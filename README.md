# openbayes-user (agent skill)

Manage your own OpenBayes / HyperAI jobs, workspaces, servings and datasets via GraphQL.

This repository is an auto-published artifact of the (private) signcl/openbayes-skills
release pipeline — do not send PRs here, they will be overwritten on the next release.
It exists so that git-first ecosystems (skills.sh, `npx skills add`, gh skill)
can install the skill from a plain repo URL.

## Install

```bash
# primary channel (always current, works in China):
npx skills add https://openbayes.com/skills/openbayes-user

# this repository (mirrors each release):
npx skills add signcl/openbayes-user-skill
```

Credentials live in `~/.config/openbayes-skills/.env.*` and are never part of the
package. The runtime needs Node 18+.

## Version

v0.37.4 — published automatically from signcl/openbayes-skills releases.

## Feedback

support@openbayes.com, subject `[openbayes-skills v0.37.4] one-line summary`.
