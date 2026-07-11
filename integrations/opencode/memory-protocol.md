# thoth-mem Memory Protocol

Use exactly `mem_recall`, `mem_save`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`. Do not invent a seventh or harness-specific memory tool.

The root/orchestrator owns session lifecycle, prompt capture, and continuity summaries. Subagents must not own or finalize the root session and must not save prompts. Save only real root-user intent; generated prompts must not be saved as user intent. Exclude assistant, tool, subagent, handoff, and scaffolding traffic, and remove content inside `<private>` tags before persistence.

Use stable `session_id` and `project` identity. Recall with `mem_recall(mode="compact")`, then `mem_recall(mode="context")`, and use `mem_get` only for selected records. Use `mem_context` for bounded recent continuity and `mem_project` for project navigation.

Capability states are `supported`, `degraded`, and `unsupported`. Advance lifecycle state only after confirmed MCP success. Compaction is explicit and retry-safe: checkpoint only for a verified root compaction event. Finalization is explicit and retry-safe: summarize only for a verified root terminal event. Failures remain eligible for retry.

A duplicate event is suppressed by stable event identity. Distinct intentional events remain separate effects, while byte-identical same-session prompts inside the existing 30-second window may resolve to one canonical prompt row. Manual recovery stays visible for every degraded or unsupported capability, without disabling unrelated supported operations.
