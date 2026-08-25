# Native lifecycle and delivery

`src/integration/adapters/v2.ts` maps OpenCode, Codex, and Claude Code evidence to six host-neutral intents. Delegated or unverifiable identity fails closed. `MemoryService.lifecycle` owns receipts and state changes; adapters never access SQLite.

`integrations/inventory.json` is canonical. Each harness owns hooks, one MCP descriptor, a portable runner, a Skill, one host reference, manifest metadata, and a managed receipt. Setup installs only the selected bundle into an explicit target and preserves unrelated user files.

Hook execution, memory confirmation, context delivery, and model consumption are different facts. Automatic capture is limited to verified root prompts and checkpoints; arbitrary tool/subagent streams are excluded.

`integration:smoke` installs the actual tarball in a disposable directory and executes each packaged runner with a native-shaped lifecycle fixture, proving asset resolution and truthful receipt output without touching real homes. It cannot prove that installed OpenCode, Codex, or Claude Code binaries invoke those assets or that a host model consumes returned guidance; that residual requires a real-host acceptance lane and remains explicitly outside the fixture claim.
