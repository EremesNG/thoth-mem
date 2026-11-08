import type { Plugin } from '@opencode/plugin';

import { createThothMemPlugin } from './plugin.js';

export default createThothMemPlugin() satisfies Plugin.Plugin;
