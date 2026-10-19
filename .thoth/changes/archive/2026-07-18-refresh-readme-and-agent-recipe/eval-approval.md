# Eval Approval Evidence

- Change: `refresh-readme-and-agent-recipe`
- Approved artifact: `skills/thoth-mem/evals/evals.json`
- SHA-256: `08330BFFA205488D8C0C3E1F33573E31D678B8A4820DE62D11CF893AD5E85AF0`
- Approved inventory: three evals with IDs `1`, `2`, and `3`
- Root user decision: `Ejecutar A/B completo`
- Recorded decision time: `2026-07-18 03:03:23 UTC`
- Root session: `019f72ae-8157-7352-a423-4feea4e5508e`

The exact parsed prompts, expected outputs, and assertion lists from the artifact
above were presented before the root user selected `Ejecutar A/B completo`.
Executor and grader dispatch began only after that decision. The final artifact
still has the recorded SHA-256 and the same three eval IDs.

The timestamp and decision text were recovered from the root-owned thoth-mem
recent-prompt context for this session. That surface exposed the prompt text and
timestamp but not a prompt record ID; this limitation is preserved here rather
than inventing stronger provenance.

Reproduce the artifact anchor with:

```powershell
Get-FileHash -Algorithm SHA256 skills/thoth-mem/evals/evals.json
```
