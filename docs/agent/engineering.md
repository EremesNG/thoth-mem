# Engineering overlay

Load this cross-cutting overlay when writing or reviewing TypeScript/JavaScript. Match the touched file before applying these defaults.

## TypeScript and modules

- The root package is ESM (`"type": "module"`) with strict TypeScript, `module`/`moduleResolution: "Node16"`, `src/` as `rootDir`, and tests excluded from build output.
- Keep relative TypeScript imports explicit with `.js` extensions, for example `../store/index.js`.
- Prefer `import type` for type-only imports and explicit exported interfaces/types for stable shapes. Keep nullability explicit with `| null`.
- Never use `as any`, `@ts-ignore`, or `@ts-expect-error` to suppress type failures.

## Imports, files, and formatting

- Prefer import groups in this order: Node built-ins via `node:`, external packages, internal relative imports. Separate type-only imports when it improves clarity.
- Keep tool files focused on one MCP tool registration. Keep files small and single-purpose, especially in `src/tools/` and `src/utils/`.
- Semicolons are standard. Single quotes dominate store, utilities, and tests; some bootstrap/registration files use double quotes. Do not reformat unrelated lines for quote consistency.
- Keep lines readable and comments limited to non-obvious behavior.

## Naming

- Classes: `PascalCase`; interfaces/type aliases: `PascalCase`; functions/variables: `camelCase`.
- Exported constant taxonomies: `UPPER_SNAKE_CASE`.
- MCP tool implementation files: kebab-case matching tool names. Tests mirror the domain and end in `.test.ts`.

## Error and lifecycle boundaries

- Throw regular `Error` objects for unrecoverable internal failures.
- Catch errors at process/tool boundaries and return clear messages; MCP handlers conventionally use `{ isError: true, content: [...] }` for tool failures.
- Fatal CLI startup writes to stderr and exits with status `1`.
- Close stores and other owned resources on shutdown/teardown. Prefer explicit warnings over silent content truncation.

Evidence: `package.json`, `tsconfig.json`, current `src/` and `tests/` patterns, and the prior repository guide.
