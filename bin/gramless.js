#!/usr/bin/env node

/**
 * Gramless CLI tool
 * 
 * Provides utilities such as standalone isolate vendoring:
 *   npx gramless vendor [target_dir]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === '--help' || command === '-h' || command === 'help') {
  console.log(`
Gramless CLI

Usage:
  npx gramless vendor [target_directory]   Copy zero-dependency standalone bundle to target directory
  npx gramless --version                   Print installed version
  npx gramless --help                      Show this help message

Examples:
  npx gramless vendor                      # Copies to ./tgcloud/lib/gramless.js
  npx gramless vendor ./src/lib            # Copies to ./src/lib/gramless.js
`);
  process.exit(0);
}

if (command === '--version' || command === '-v' || command === 'version') {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  console.log(`gramless v${pkg.version}`);
  process.exit(0);
}

if (command === 'vendor') {
  const targetDir = args[1] || path.join(process.cwd(), 'tgcloud', 'lib');
  const sourceBundle = path.join(rootDir, 'dist', 'gramless.js');

  if (!fs.existsSync(sourceBundle)) {
    console.error('Error: Standalone bundle dist/gramless.js not found in package.');
    process.exit(1);
  }

  fs.mkdirSync(targetDir, { recursive: true });
  const destination = path.join(targetDir, 'gramless.js');
  fs.copyFileSync(sourceBundle, destination);

  const sourceDts = path.join(rootDir, 'dist', 'gramless.d.ts');
  if (fs.existsSync(sourceDts)) {
    fs.copyFileSync(sourceDts, path.join(targetDir, 'gramless.d.ts'));
  }

  const relDest = path.relative(process.cwd(), destination) || destination;
  console.log(`✔ Successfully vendored Gramless to ${relDest}`);
  console.log(`\nYou can now import natively in Telegram Serverless without node_modules:`);
  console.log(`  import { createBot, Filter, session } from '../lib/gramless.js';\n`);
  process.exit(0);
}

console.error(`Unknown command: ${command}`);
console.error(`Run 'npx gramless --help' for available commands.`);
process.exit(1);
