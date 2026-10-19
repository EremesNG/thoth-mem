# Research: Native plugin cache topology

## Question

Does Claude Code have the same marketplace/plugin cache-segment ambiguity reproduced in Codex?

## Evidence

- The active Codex Skill catalog expands to `.../plugins/cache/thoth-mem/thoth-mem/0.4.13/skills/thoth-mem/SKILL.md`; the complete expanded path exists, while the once-collapsed path does not.
- The local Claude Code 2.1.198 installation has no thoth-mem marketplace or plugin installed, so no real local cache mutation was authorized or performed.
- Claude Code's official marketplace documentation specifies seed/cache topology as `cache/<marketplace>/<plugin>/<version>/` and qualified installation identity as `plugin@marketplace`.
- The repository descriptors currently name both Claude marketplace and plugin `thoth-mem`, which would therefore produce the same adjacent repeated segments.

## Decision

Use distinct host-specific marketplace identifiers, `thoth-mem-codex` and `thoth-mem-claude`, while retaining the public plugin and Skill name `thoth-mem`. Verify the topology deterministically from packed descriptors; reserve real-host installation evidence for a separately authorized outcome check.

## Sources

- https://code.claude.com/docs/en/plugin-marketplaces
- https://code.claude.com/docs/en/plugins-reference
