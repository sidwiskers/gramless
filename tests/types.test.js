import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('TypeScript Subpaths: all exports in package.json define valid types files', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  assert.ok(pkg.exports, 'package.json must define exports');

  for (const [subpath, def] of Object.entries(pkg.exports)) {
    assert.ok(def.types, `Subpath ${subpath} must define a types field`);
    const typesPath = path.resolve(rootDir, def.types);
    assert.ok(
      fs.existsSync(typesPath),
      `Subpath ${subpath} types file does not exist at ${typesPath}`
    );
  }
});
