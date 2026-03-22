# AGENTS.md

## Scope

- This file applies to the entire repository at `C:\DEV\Proyectos\Webstorm\thoth`.
- Use it as the default operating guide for coding agents working here.
- Prefer small, focused changes over wide refactors.
- Match existing patterns in the file you touch before introducing new ones.

## Repository Snapshot

- Package manager: `npm` (`package-lock.json` is present).
- Runtime: Node.js `>=18`.
- Stack: TypeScript, ESM, `tsc`, `vitest`, SQLite via `better-sqlite3`, `zod`.

## Project Layout

- `src/index.ts` - CLI entrypoint and shutdown handling.
- `src/server.ts` / `src/config.ts` - server bootstrap and env-driven config.
- `src/store/` - SQLite schema, persistence, search, and data types.
- `src/tools/` - one MCP tool registration per file; `src/utils/` - focused helpers.
- `tests/` - Vitest suites by domain; `dist/` - compiled output, never edit directly.

## Build, Test, and Dev Commands

Use the existing npm scripts first.

```bash
npm install
npm run dev
npm run build
npm test
npm run test:watch
```

- `npm run dev` - runs `tsx watch src/index.ts` for local development.
- `npm run build` - compiles `src/` to `dist/` with TypeScript.
- `npm test` - runs the full Vitest suite once.
- `npm run test:watch` - starts Vitest in watch mode.
- `npm run prepublishOnly` - repository release gate; runs build and tests.

## Single-Test and Focused-Test Commands

There is no dedicated npm script for a single test file, so use Vitest directly or pass args through `npm test`.

Run one test file:

```bash
npm test -- tests/tools/mem-save.test.ts
```

Equivalent direct Vitest form:

```bash
npx vitest run tests/tools/mem-save.test.ts
```

Run one named test inside a file:

```bash
npx vitest run tests/tools/mem-save.test.ts -t "saves a new observation and returns created action"
```

Useful notes:

- Test discovery is `tests/**/*.test.ts`.
- Tests use a 10 second timeout from `vitest.config.ts`.
- Most storage tests instantiate `new Store(':memory:')` for isolation.

## Lint and Typecheck Reality

- There is currently no lint script in `package.json`.
- Do not invent `npm run lint` in automation unless you add and document it.
- For verification, use `npm run build` and `npm test` as the current baseline.
- If you need a type-only check without emit, prefer `npx tsc --noEmit` as an ad hoc command, but note it is not a packaged script.

## Existing Agent-Instruction Files

- No repository-level `AGENTS.md` existed before this file.
- No `.cursor/rules/` directory was found.
- No `.cursorrules` file was found.
- No `.github/copilot-instructions.md` file was found.
- If any of those files appear later, merge their repository-specific guidance into this file.

## Repository Map

A full codemap is available at `codemap.md` in the project root.

Before working on any task, read `codemap.md` to understand:
- Project architecture and entry points
- Directory responsibilities and design patterns
- Data flow and integration points between modules

For deep work on a specific folder, also read that folder's `codemap.md`.

## TypeScript and Module Rules

- The repo is ESM-first: `"type": "module"` in `package.json`.
- `tsconfig.json` uses `module: "Node16"` and `moduleResolution: "Node16"`.
- `src/` is the compiler root; `tests/` are excluded from build output.
- Keep relative TypeScript imports using explicit `.js` extensions in source files, e.g. `../store/index.js`.
- Use `import type` for type-only imports when possible.
- Prefer explicit exported interfaces and types for stable data shapes; keep nullability explicit with `| null`.
- Do not suppress type errors with `as any`, `@ts-ignore`, or `@ts-expect-error`.

## Import and File Organization Conventions

- Prefer this order when editing imports:
  1. Node built-ins via `node:`
  2. External packages
  3. Internal relative imports
- Separate type-only imports from value imports when it improves clarity.
- Tool files in `src/tools/` should stay focused on one MCP tool registration.
- Keep files small and single-purpose, especially under `src/tools/` and `src/utils/`.

## Formatting Conventions

- Use the formatting style already present in the file you touch.
- Semicolons are standard across the repository.
- Single quotes are the dominant style in `store`, `utils`, and tests.
- Some bootstrap and MCP registration files currently use double quotes; do not reformat unrelated lines just to normalize quotes.
- Keep lines readable rather than aggressively compressed.
- Add comments only when a block is non-obvious.

## Naming Conventions

- Classes: `PascalCase` (`Store`).
- Interfaces and type aliases: `PascalCase` (`ThothConfig`, `SaveObservationInput`).
- Functions and variables: `camelCase` (`getConfig`, `resolveDataDir`, `sanitizeFTS`).
- Exported constant taxonomies: `UPPER_SNAKE_CASE` (`OBSERVATION_TYPES`).
- Tool implementation files: `kebab-case` matching tool names (`mem-save.ts`, `mem-context.ts`).
- Test files: mirror the domain and end in `.test.ts`.

## Error Handling Conventions

- Throw regular `Error` objects for unrecoverable internal failures.
- Catch errors at process or tool boundaries and return clear text messages.
- MCP tool handlers commonly return `{ isError: true, content: [...] }` on failure.
- The CLI entrypoint writes fatal startup errors to `stderr` and exits with status `1`.
- Close the store on shutdown, and prefer warnings over silent content truncation.

## Data and Security Conventions

- Sanitize persisted private content before storage; see `stripPrivateTags()` behavior.
- Sanitize FTS queries before passing them to SQLite FTS5; see `sanitizeFTS()`.
- Keep schema changes idempotent and consistent with the SQL CHECK constraints and FTS triggers.
- Respect the existing observation taxonomy and preserve deduplication and topic-key upsert behavior.

## Testing Conventions

- Use Vitest APIs: `describe`, `it`, `expect`, `beforeEach`, `afterEach`.
- Prefer deterministic tests with in-memory SQLite over filesystem state when possible.
- Keep test names behavior-focused and specific.
- When adding tests, place them in the nearest matching `tests/` subdirectory.
- Mirror production import paths with `.js` extensions in test files too.
- Close stores and clean temp directories in teardown.

## Agent Working Rules for This Repo

- Read the touched file before editing it.
- Fix bugs minimally; do not refactor unrelated modules during a bugfix.
- Do not edit `dist/` directly.
- Do not claim a new lint command exists unless you also add it to `package.json`.
- When documenting commands, prefer commands already codified in `package.json`.
- Before finishing code changes, run the narrowest relevant test first, then broader verification as needed.
- If you change build behavior, test discovery, schema logic, or tool registration, run `npm run build` and `npm test`.

## Good Defaults

- Start with `npm test -- <target-file>` for the area you changed, then escalate to `npm test` for shared logic.
- Run `npm run build` for TypeScript API, module, or export changes.
- Keep docs and agent instructions aligned with actual scripts and config files.
