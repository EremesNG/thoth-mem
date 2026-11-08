import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { SkillEditor } from '@opencode/plugin/promise/skill';

type SkillInfo = Parameters<SkillEditor['add']>[0];

/** Strict YAML subset for our controlled asset: scalars and folded >- text only. */
function metadata(source: string): { name: string; description: string; content: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/u.exec(source);
  if (!match) throw new Error('invalid_frontmatter');
  const values: Record<string, string> = {};
  const lines = match[1]!.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const line = /^([a-z]+):[ \t]*(.+)$/u.exec(lines[index]!);
    if (!line || !['name', 'description'].includes(line[1]!) || Object.hasOwn(values, line[1]!)) {
      throw new Error('invalid_frontmatter');
    }
    let value = line[2]!;
    if (value === '>-') {
      const folded: string[] = [];
      while (lines[index + 1]?.startsWith('  ')) folded.push(lines[++index]!.slice(2).trim());
      if (!folded.length || folded.some((part) => !part)) throw new Error('invalid_frontmatter');
      value = folded.join(' ');
    } else if (value.startsWith('"')) {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed !== 'string') throw new Error('invalid_frontmatter');
      value = parsed;
    } else if (value.startsWith("'")) {
      if (!/^'(?:[^']|'')*'$/u.test(value)) throw new Error('invalid_frontmatter');
      value = value.slice(1, -1).replaceAll("''", "'");
    } else if (/^(?:null|true|false|yes|no|on|off)$/iu.test(value) || !/^[a-zA-Z][a-zA-Z0-9 .,/()_-]*$/u.test(value)) {
      throw new Error('invalid_frontmatter');
    }
    values[line[1]!] = value;
  }
  if (values.name !== 'thoth-mem' || !values.description?.trim() || !match[2]!.trim()) {
    throw new Error('invalid_frontmatter');
  }
  return { name: values.name, description: values.description, content: match[2]!.trim() };
}

export async function loadPackagedSkill(packageRoot: string): Promise<SkillInfo> {
  const path = resolve(packageRoot, 'integrations/opencode/skills/thoth-mem/SKILL.md');
  const parsed = metadata(await readFile(path, 'utf8'));
  // Skill.Info.path is the Markdown file, not its directory. Relative references
  // (references/observation-review.md and references/opencode.md) are assumed to
  // resolve from dirname(path), following OpenCode's file-backed Skill contract.
  return {
    ...parsed, id: 'thoth-mem' as SkillInfo['id'],
    name: parsed.name as SkillInfo['name'], path: path as SkillInfo['path'],
  };
}
