import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const cliBin = path.join(rootDir, 'packages/create-gramless/bin/index.js');

const tmpBase = fs.existsSync(os.tmpdir()) ? os.tmpdir() : path.join(rootDir, 'tests');
const createdDirs = [];

function makeTempTarget(name) {
  const dir = fs.mkdtempSync(path.join(tmpBase, `gramless-test-${name}-`));
  const target = path.join(dir, name);
  createdDirs.push(dir);
  return target;
}

describe('create-gramless CLI Scaffolder', () => {
  afterEach(() => {
    while (createdDirs.length > 0) {
      const dir = createdDirs.pop();
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  test('scaffolds Telegram Serverless (tgcloud) JavaScript template', () => {
    const target = makeTempTarget('my-tgcloud-bot');
    execFileSync(process.execPath, [cliBin, target, '--template', 'tgcloud', '--js', '--yes', '--no-git', '--no-install']);

    assert.ok(fs.existsSync(path.join(target, 'package.json')));
    assert.ok(fs.existsSync(path.join(target, '.gitignore')));
    assert.ok(!fs.existsSync(path.join(target, '_gitignore')));
    assert.ok(fs.existsSync(path.join(target, 'tgcloud.jsonc')));
    assert.ok(fs.existsSync(path.join(target, 'tgcloud/lib/bot.js')));
    assert.ok(fs.existsSync(path.join(target, 'tgcloud/handlers/message.js')));

    const pkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
    assert.equal(pkg.name, 'my-tgcloud-bot');
    assert.ok(pkg.dependencies.gramless);
  });

  test('scaffolds Telegram Serverless (tgcloud) TypeScript template', () => {
    const target = makeTempTarget('my-tgcloud-ts-bot');
    execFileSync(process.execPath, [cliBin, target, '--template', 'tgcloud', '--ts', '--yes', '--no-git', '--no-install']);

    assert.ok(fs.existsSync(path.join(target, 'package.json')));
    assert.ok(fs.existsSync(path.join(target, 'tsconfig.json')));
    assert.ok(fs.existsSync(path.join(target, '.gitignore')));
    assert.ok(fs.existsSync(path.join(target, 'tgcloud/lib/bot.ts')));

    const pkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
    assert.equal(pkg.name, 'my-tgcloud-ts-bot');
    assert.ok(pkg.devDependencies.typescript);
  });

  test('scaffolds Cloudflare Workers TypeScript template', () => {
    const target = makeTempTarget('my-cf-ts-bot');
    execFileSync(process.execPath, [cliBin, target, '--template', 'cloudflare', '--ts', '--yes', '--no-git', '--no-install']);

    assert.ok(fs.existsSync(path.join(target, 'package.json')));
    assert.ok(fs.existsSync(path.join(target, 'tsconfig.json')));
    assert.ok(fs.existsSync(path.join(target, 'wrangler.jsonc')));
    assert.ok(fs.existsSync(path.join(target, 'src/index.ts')));

    const pkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
    assert.equal(pkg.name, 'my-cf-ts-bot');
    assert.ok(pkg.devDependencies['@cloudflare/workers-types']);
  });

  test('scaffolds Node.js Long Polling TypeScript template', () => {
    const target = makeTempTarget('my-polling-ts-bot');
    execFileSync(process.execPath, [cliBin, target, '--template', 'polling', '--ts', '--yes', '--no-git', '--no-install']);

    assert.ok(fs.existsSync(path.join(target, 'package.json')));
    assert.ok(fs.existsSync(path.join(target, 'tsconfig.json')));
    assert.ok(fs.existsSync(path.join(target, 'index.ts')));
    assert.ok(fs.existsSync(path.join(target, '.env.example')));

    const pkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
    assert.equal(pkg.name, 'my-polling-ts-bot');
  });

  test('scaffolds Fullstack Telegram Mini App template', () => {
    const target = makeTempTarget('my-mini-app');
    execFileSync(process.execPath, [cliBin, target, '--template', 'mini-app', '--yes', '--no-git', '--no-install']);

    assert.ok(fs.existsSync(path.join(target, 'package.json')));
    assert.ok(fs.existsSync(path.join(target, '.gitignore')));
    assert.ok(fs.existsSync(path.join(target, 'public/index.html')));
    assert.ok(fs.existsSync(path.join(target, 'public/app.js')));
    assert.ok(fs.existsSync(path.join(target, 'tgcloud/endpoints/submitScore.js')));

    const pkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
    assert.equal(pkg.name, 'my-mini-app');
  });
});
