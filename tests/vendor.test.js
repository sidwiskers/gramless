import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const cliBin = path.join(rootDir, 'bin/gramless.js');

test('CLI Vendor: npx gramless vendor copies standalone bundle into target directory', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gramless-vendor-test-'));
  try {
    const targetDir = path.join(tmpDir, 'tgcloud/lib');
    execFileSync(process.execPath, [cliBin, 'vendor', targetDir]);

    const vendoredFile = path.join(targetDir, 'gramless.js');
    assert.ok(fs.existsSync(vendoredFile), 'Vendored gramless.js must exist');

    const content = fs.readFileSync(vendoredFile, 'utf8');
    assert.ok(content.includes('Gramless Standalone Single-File Bundle'));
    assert.ok(content.includes('export function createBot'));
    assert.ok(content.includes('export class GramlessRouter'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
