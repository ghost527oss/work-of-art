// @node: F5.2
// What a source scan returns. Specifiers, addresses, names, and line numbers only: never source text.
export interface ScanImport {
  spec: string;
  line: number;
  /** Python: number of leading dots (0 for absolute imports). */
  dots?: number;
  /** Python `from a import b, c`: the imported names. */
  names?: string[];
  py?: boolean;
}
export interface ScanLoad { target: string; line: number }
export interface ScanRoute { method?: string; path: string; line: number; owner?: string }
export interface ScanMount { prefix: string; ident: string; line: number }
export interface ScanBinding { name: string; spec?: string; line: number; prefix?: string; router?: boolean }
export interface ScanCall { method?: string; address: string; line: number; unknown: boolean; external: boolean }
export interface ScanEnv { name: string; line: number }

export interface ScanResult {
  language: 'js' | 'html' | 'css' | 'py' | 'none';
  imports: ScanImport[];
  loads: ScanLoad[];
  routes: ScanRoute[];
  mounts: ScanMount[];
  bindings: ScanBinding[];
  calls: ScanCall[];
  env: ScanEnv[];
  patterns: { dom: boolean; handler: boolean; handlerMethods: string[] };
  aliasImports: number;
  truncated: boolean;
  djangoUrls: boolean;
}

export function emptyScan(language: ScanResult['language'] = 'none'): ScanResult {
  return {
    language, imports: [], loads: [], routes: [], mounts: [], bindings: [], calls: [], env: [],
    patterns: { dom: false, handler: false, handlerMethods: [] }, aliasImports: 0, truncated: false, djangoUrls: false,
  };
}
