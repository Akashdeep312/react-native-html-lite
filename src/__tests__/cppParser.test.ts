/**
 * Compiles the C++ parser (with AddressSanitizer and UBSan where supported)
 * into a small CLI, then checks it against the shared fixtures and against
 * the JS parser on random input.
 *
 * Skipped when no C++ compiler is available. Set CXX to choose a compiler.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { createRandom, randomHtml } from '../__fixtures__/fuzz';
import { parserCases } from '../__fixtures__/parserCases';
import { parseHtmlJs } from '../parser/jsParser';

const root = path.resolve(__dirname, '../..');
const outDir = path.join(root, 'build/cpp-tests');
const binary = path.join(outDir, 'parser_cli');
const compiler = process.env.CXX ?? 'c++';

function compile(): boolean {
  mkdirSync(outDir, { recursive: true });
  const sources = [
    path.join(root, 'cpp/HtmlParser.cpp'),
    path.join(root, 'cpp-tests/parser_cli.cpp'),
  ];
  const base = [
    '-std=c++20',
    '-Wall',
    '-Wextra',
    '-Wpedantic',
    '-Werror',
    '-g',
    '-O1',
    `-I${path.join(root, 'cpp')}`,
    ...sources,
    '-o',
    binary,
  ];
  for (const flags of [['-fsanitize=address,undefined'], []]) {
    try {
      execFileSync(compiler, [...flags, ...base], { stdio: 'pipe' });
      return true;
    } catch (error) {
      if (flags.length === 0) {
        const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? '';
        if (/command not found|ENOENT/.test(String(error)) || !stderr) {
          return false;
        }
        throw new Error(`C++ compilation failed:\n${stderr}`);
      }
    }
  }
  return false;
}

const available = (() => {
  try {
    execFileSync(compiler, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

/** Parses many inputs with one process, since each spawn is slow under ASan. */
function parseNativeBatch(
  inputs: ReadonlyArray<{ html: string; maxDepth?: number }>
): unknown[] {
  const stdin = inputs
    .map(({ html, maxDepth }) => `${maxDepth ?? 0}\n${html}`)
    .join('\0');
  const result = spawnSync(binary, ['--batch'], {
    input: stdin,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ASAN_OPTIONS: 'detect_leaks=0' },
  });
  if (result.status !== 0) {
    throw new Error(
      `parser_cli exited with ${result.status}:\n${result.stderr}`
    );
  }
  const lines = result.stdout.trimEnd().split('\n');
  expect(lines).toHaveLength(inputs.length);
  return lines.map((line) => JSON.parse(line));
}

(available ? describe : describe.skip)('C++ parser', () => {
  beforeAll(() => {
    if (!compile()) {
      throw new Error(`Could not compile with ${compiler}`);
    }
  }, 120000);

  it('matches the shared fixtures', () => {
    const results = parseNativeBatch(parserCases);
    parserCases.forEach((c, i) => {
      expect({ name: c.name, tree: results[i] }).toEqual({
        name: c.name,
        tree: c.expected,
      });
    });
  });

  it('matches the JS parser on random input', () => {
    const random = createRandom(0xc0ffee);
    const inputs = Array.from({ length: 3000 }, () => ({
      html: randomHtml(random, 5 + Math.floor(random() * 60)),
      maxDepth: random() < 0.2 ? 1 + Math.floor(random() * 4) : undefined,
    }));
    const results = parseNativeBatch(inputs);
    inputs.forEach((input, i) => {
      const js = parseHtmlJs(input.html, input.maxDepth);
      if (JSON.stringify(results[i]) !== JSON.stringify(js)) {
        // Report the failing input, not just the diff.
        expect({ ...input, tree: results[i] }).toEqual({ ...input, tree: js });
      }
    });
  });

  it('handles deep nesting and large input', () => {
    const [deep, large] = parseNativeBatch([
      { html: '<div>'.repeat(5000) + 'x' },
      { html: '<p>Lorem <b>ipsum</b> &amp; dolor</p>'.repeat(20000) },
    ]);
    expect(deep).toEqual(parseHtmlJs('<div>'.repeat(5000) + 'x'));
    expect(large).toHaveLength(20000);
  });
});
