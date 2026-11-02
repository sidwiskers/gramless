import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const distDir = path.join(rootDir, 'dist');

// Topological order of files
const orderedFiles = [
  'errors.js',
  'filters.js',
  'format.js',
  'init_data.js',
  'pacer.js',
  'stateless_question.js',
  'cleaner.js',
  'auto_retry.js',
  'media_group.js',
  'payments.js',
  'menu.js',
  'i18n.js',
  'ratelimit.js',
  'endpoint.js',
  'session.js',
  'context.js',
  'router.js',
  'deeplink.js',
  'fsm.js',
];

let bundle = `/**
 * Gramless Standalone Single-File Bundle
 * 
 * Zero-dependency, single-file distribution engineered for pure V8 isolates (TGCloud).
 * Drop directly into tgcloud/lib/gramless.js and import:
 *   import { createBot, Filter, session } from './lib/gramless.js';
 * 
 * Version: ${JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')).version}
 * License: MIT
 */\n\n`;

for (const file of orderedFiles) {
  const filePath = path.join(srcDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Strip internal relative imports (e.g. import { ... } from './....js';)
  content = content.replace(/^import\s+[\s\S]*?from\s+['"]\.\/.*?['"];?\s*$/gm, '');

  // Strip intermediate export default object declarations
  content = content.replace(/export\s+default\s+\{[\s\S]*?\};?/g, '');
  content = content.replace(/export\s+default\s+.*?;/g, '');

  bundle += `// --- Module: ${file} ---\n`;
  bundle += content.trim() + '\n\n';
}

// Add index helpers
bundle += `// --- Main Entrypoint ---\n`;
bundle += `export function createBot(options = {}) {\n  return new GramlessRouter(options);\n}\n\n`;
bundle += `export function webhookCallback(bot, options = {}) {\n  return bot.webhookCallback(options);\n}\n\n`;
bundle += `export default createBot;\n`;

fs.mkdirSync(distDir, { recursive: true });
const targetPath = path.join(distDir, 'gramless.js');
fs.writeFileSync(targetPath, bundle, 'utf8');

console.log(`Successfully generated standalone bundle: ${targetPath} (${Buffer.byteLength(bundle, 'utf8')} bytes)`);
