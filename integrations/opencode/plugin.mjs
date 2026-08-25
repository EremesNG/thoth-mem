export default async function ThothMemory() { return { config: async (config) => { config.mcp ??= {}; config.mcp['thoth-mem'] ??= { command: ['node', 'dist/index.js', 'mcp'] }; } }; }
