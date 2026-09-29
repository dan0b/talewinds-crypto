/**
 * Enforces the architecture's import boundaries. Runs in `pnpm check`.
 *
 * Why this exists: in a monorepo any package is one `import` away from any
 * other. The most important boundary — nothing but the future executor may
 * touch execution/signing code (docs/adr/0001) — must fail the build, not rely
 * on memory. pnpm already refuses to resolve undeclared dependencies, so
 * checking each package.json against the matrix below covers package imports;
 * the source scan catches relative imports that reach into another package.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const SCOPE = '@talewinds/';

/**
 * Which workspace packages each package may depend on. A package missing from
 * this table fails the check — adding a package means deciding its boundaries.
 */
const ALLOWED: Record<string, string[]> = {
  // Foundations
  core: [],
  db: ['core'],
  runtime: ['core', 'db'],
  // Capabilities
  sources: ['core', 'db'],
  ai: ['core', 'db'],
  investigation: ['core', 'db', 'sources', 'ai'],
  portfolio: ['core', 'db', 'sources', 'ai'],
  research: ['core', 'db', 'sources', 'ai', 'investigation', 'portfolio'],
  // Apps (entry points)
  api: ['core', 'db', 'runtime', 'sources', 'ai', 'investigation', 'portfolio', 'research'],
  worker: ['core', 'db', 'runtime', 'sources', 'ai', 'investigation', 'portfolio', 'research'],
  cli: ['core', 'db', 'runtime', 'sources', 'ai', 'investigation', 'portfolio', 'research'],
  // The dashboard runs in the browser: shared types + the API's route types only.
  web: ['core', 'api'],
};

/** Packages only a designated consumer may import (docs/adr/0001-execution-boundary.md). */
const RESTRICTED: Record<string, string[]> = {
  execution: ['executor'],
};

interface Pkg {
  short: string;
  dir: string;
  deps: string[];
}

const errors: string[] = [];

function loadPackages(): Pkg[] {
  const pkgs: Pkg[] = [];
  for (const group of ['apps', 'packages']) {
    for (const name of readdirSync(join(ROOT, group))) {
      const dir = join(ROOT, group, name);
      const manifest = join(dir, 'package.json');
      if (!existsSync(manifest)) continue;
      const json = JSON.parse(readFileSync(manifest, 'utf8'));
      const all = { ...json.dependencies, ...json.devDependencies, ...json.peerDependencies };
      pkgs.push({
        short: String(json.name).replace(SCOPE, ''),
        dir,
        deps: Object.keys(all)
          .filter((d) => d.startsWith(SCOPE))
          .map((d) => d.replace(SCOPE, '')),
      });
    }
  }
  return pkgs;
}

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === 'node_modules' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

const IMPORT =
  /(?:import|export)\s+(type\s+)?(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

for (const pkg of loadPackages()) {
  const allowed = ALLOWED[pkg.short];
  if (!allowed) {
    errors.push(
      `${pkg.short}: not listed in tooling/scripts/check-boundaries.ts — decide its boundaries`,
    );
    continue;
  }

  for (const dep of pkg.deps) {
    const restrictedTo = RESTRICTED[dep];
    if (restrictedTo && !restrictedTo.includes(pkg.short)) {
      errors.push(`${pkg.short} → ${dep}: only ${restrictedTo.join(', ')} may depend on ${dep}`);
    } else if (!allowed.includes(dep)) {
      errors.push(`${pkg.short} → ${dep}: not allowed (allowed: ${allowed.join(', ') || 'none'})`);
    }
  }

  for (const file of sourceFiles(join(pkg.dir, 'src'))) {
    const text = readFileSync(file, 'utf8');
    const where = relative(ROOT, file);
    for (const match of text.matchAll(IMPORT)) {
      const isTypeOnly = Boolean(match[1]);
      const spec = match[2] ?? match[3] ?? '';

      if (spec.startsWith('.')) {
        const target = resolve(dirname(file), spec);
        if (!target.startsWith(`${pkg.dir}/`)) {
          errors.push(`${where}: relative import "${spec}" reaches outside its package`);
        }
      }

      if (spec.startsWith(SCOPE)) {
        const dep = spec.slice(SCOPE.length).split('/')[0] ?? '';
        if (!pkg.deps.includes(dep)) {
          errors.push(`${where}: imports ${SCOPE}${dep} without declaring it in package.json`);
        }
        // The browser bundle may only use the API's *types*, never its code.
        if (pkg.short === 'web' && dep === 'api' && !isTypeOnly) {
          errors.push(`${where}: web must use \`import type\` from ${SCOPE}api`);
        }
      }
    }
  }
}

if (errors.length > 0) {
  console.error(`Boundary check failed (${errors.length}):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log('Boundary check passed');
