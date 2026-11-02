import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const cliBin = path.join(rootDir, 'packages/create-gramless/bin/index.js');
const testScratchDir = path.join(rootDir, 'tests/.scratch-cli');

describe('create-gramless CLI Scaffolder', () => {
  afterEach(() => {
    if (fs.existsSync(testScratchDir)) {
      fs.rmSync(testScratchDir, { recursive: true, force: true });
    }
  });

  test('scaffolds Telegram Serverless (tgcloud) template', () => {
    const target = path.join(testScratchDir, 'my-tgcloud-bot');
    execFileSync(process.execPath, [cliBin, target, '--template', 'tgcloud', '--yes']);

    assert.ok(fs.existsSync(path.join(target, 'package.json')));
    assert.ok(fs.existsSync(path.join(target, 'tgcloud.jsonc')));
    assert.ok(fs.existsSync(path.join(target, 'tgcloud/lib/bot.js')));
    assert.ok(fs.existsSync(path.join(target, 'tgcloud/handlers/message.js')));

    const pkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
    assert.equal(pkg.name, 'my-tgcloud-bot');
    assert.ok(pkg.dependencies.gramless);
  });

  test('scaffolds Cloudflare Workers template', () => {
    const target = path.join(testScratchDir, 'my-cf-bot');
    execFileSync(process.execPath, [cliBin, target, '--template', 'cloudflare', '--yes']);

    assert.ok(fs.existsSync(path.join(target, 'package.json')));
    assert.ok(fs.existsSync(path.join(target, 'wrangler.jsonc')));
    assert.ok(fs.existsSync(path.join(target, 'src/index.js')));

    const pkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
    assert.equal(pkg.name, 'my-cf-bot');
  });

  test('scaffolds Node.js Long Polling template', () => {
    const target = path.join(testScratchDir, 'my-polling-bot');
    execFileSync(process.execPath, [cliBin, target, '--template', 'polling', '--yes']);

    assert.ok(fs.existsSync(path.join(target, 'package.json')));
    assert.ok(fs.existsSync(path.join(target, 'index.js')));
    assert.ok(fs.existsSync(path.join(target, '.env.example')));

    const pkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
    assert.equal(pkg.name, 'my-polling-bot');
  });

  test('scaffolds Fullstack Telegram Mini App template', () => {
    const target = path.join(testScratchDir, 'my-mini-app');
    execFileSync(process.execPath, [cliBin, target, '--template', 'mini-app', '--yes']);

    assert.ok(fs.existsSync(path.join(target, 'package.json')));
    assert.ok(fs.existsSync(path.join(target, 'public/index.html')));
    assert.ok(fs.existsSync(path.join(target, 'public/app.js')));
    assert.ok(fs.existsSync(path.join(target, 'tgcloud/endpoints/submitScore.js')));

    const pkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
    assert.equal(pkg.name, 'my-mini-app');
  });
});
