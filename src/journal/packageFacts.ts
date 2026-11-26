// @node: F9.3
// Reads only the name, the script NAMES, and the dependency NAMES from package.json. Never a command or a value.
import type { RepoFile } from '../types/contracts';

const MAX_NAMES = 50;

export interface PackageFacts { name?: string; scripts: string[]; dependencies: string[] }

export function readPackageFacts(files: readonly Pick<RepoFile, 'path' | 'content'>[]): PackageFacts {
  const pkg = files.filter((f) => /(?:^|\/)package\.json$/.test(f.path) && typeof f.content === 'string').sort((a, b) => a.path.split('/').length - b.path.split('/').length)[0];
  if (!pkg) return { scripts: [], dependencies: [] };
  try {
    const j = JSON.parse(pkg.content as string) as Record<string, unknown>;
    const keys = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v as object).filter((k) => /^[@\w./:-]{1,80}$/.test(k)) : []);
    return {
      ...(typeof j.name === 'string' && /^[@\w./-]{1,100}$/.test(j.name) ? { name: j.name } : {}),
      scripts: keys(j.scripts).sort().slice(0, MAX_NAMES),
      dependencies: [...new Set([...keys(j.dependencies), ...keys(j.devDependencies)])].sort().slice(0, MAX_NAMES),
    };
  } catch {
    return { scripts: [], dependencies: [] };
  }
}
