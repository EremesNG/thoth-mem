import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Read and cache the version from package.json at runtime.
 * Works in both src/ (dev) and dist/ (compiled) contexts.
 */
function readPackageVersion(): string {
  try {
    // Get the directory of this file
    const currentDir = dirname(fileURLToPath(import.meta.url));
    
    // Try to read from dist/package.json (compiled context)
    // or src/../package.json (dev context)
    const packagePath = join(currentDir, '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
    
    if (typeof packageJson.version === 'string') {
      return packageJson.version;
    }
  } catch {
    // Fallback if package.json cannot be read
  }
  
  return '0.0.0';
}

export const VERSION = readPackageVersion();

export function getVersion(): string {
  return VERSION;
}
