# Plan review: Refresh README and Agent Memory Recipe

## Review status

**[USER OVERRIDE] — implementation authorized for the requested documentation and skill scope**

No fresh `[OKAY]` exists. After requesting additional review, the user stopped
the review loop and explicitly redirected the session to the original outcome:
update `README.md` and `skills/thoth-mem/` without further pre-implementation
review. This records the user override and implementation authorization; it does
not rewrite either oracle verdict as approval.

## Oracle round 1

**[REJECT]** The oracle identified three blockers:

1. The benchmark orientation was reversed: the standard aggregator discovers
   `old_skill` before `with_skill`, so its raw delta was old minus revised.
2. Raw Markdown benchmark metrics were misleading because unavailable runtime
   measurements could be presented as observed values.
3. The plan implicitly relied on a transcript being created without a truthful,
   verifiable transcript contract.

## Oracle round 2

**[REJECT]** The first three blockers were confirmed closed by the oracle:

- review order and deltas are normalized as revised `with_skill` minus baseline
  `old_skill`;
- unavailable time/token measurements are represented as a capability gap and
  excluded from comparative claims;
- the plan requires a self-authored transcript rather than implying harness
  capture.

The substantive remaining blocker was transcript verification: checks could
still pass empty sections or false content/provenance. The sharpened retry was
therefore not an approval.

## Post-round-2 remediation and validation

The root added immutable per-run metadata and a stricter transcript contract.
The current proposal requires exact configuration/path/hash and prompt/assertion
digests before dispatch, and non-mutating decision-trace runs
(`proposal.md:48-73`). The tasks require exact non-empty transcript sections,
redacted-prompt equality, provenance equality against `run_metadata.json`,
decision-trace equality, private-block redaction, and no additional capture
claims (`tasks.md:17`, `tasks.md:115-123`). Benchmark normalization and the
read-only analyzer dispatch are explicit (`tasks.md:143-151`).

Current mechanical validation recorded by the root:

- 24 tasks with matching Spec, Independent Test, Verification, and Expected
  blocks;
- `git diff --check` passes for the coordination artifacts;
- proposal SHA-256:
  `7917E0E6D130380F13F28963130F78E5F4C040E435B53EE15872B6F6B3D0E43E`;
- tasks SHA-256:
  `1E235B66615B2987C50D46D49DE13461E9C38DC2E6BAADAFF30113A48C58F064`.

These are remediation and mechanical-validation facts only; they do not create
oracle approval. Implementation authority comes from the later user override
recorded above.
