import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const docsDir = path.join(rootDir, 'docs');
const outputDir = path.join(docsDir, 'public');

const filesToInclude = [
  'guide/what-is-gramless.md',
  'guide/getting-started.md',
  'guide/architecture.md',
  'guide/routing.md',
  'guide/context.md',
  'guide/filters.md',
  'guide/sessions.md',
  'guide/fsm.md',
  'guide/endpoints.md',
  'guide/ai-assistants.md',
  'reference/context-api.md',
  'reference/filter-api.md',
  'reference/testkit.md',
  'reference/benchmarks.md',
  'cookbook/01-minimal-bot.md',
  'cookbook/02-database-crud.md',
  'cookbook/03-onboarding-wizard.md',
  'cookbook/04-mini-app-rpc.md',
  'cookbook/05-telegram-stars.md',
  'cookbook/06-group-moderation.md',
  'cookbook/07-lab-testing.md',
  'cookbook/08-migration-guide.md',
];

function stripFrontmatter(content) {
  if (content.startsWith('---')) {
    const endIdx = content.indexOf('---', 3);
    if (endIdx !== -1) {
      return content.slice(endIdx + 3).trim();
    }
  }
  return content.trim();
}

let fullContent = `# Gramless — Consolidated Documentation (llms-full.txt)

> Zero-dependency, transactional Telegram framework for Telegram Serverless (TGCloud), edge V8 isolates (Cloudflare Workers, Vercel), and Node.js.
> Source repository: https://github.com/sidwiskers/gramless
> Online documentation: https://sidwiskers.github.io/gramless/

---

`;

for (const relPath of filesToInclude) {
  const filePath = path.join(docsDir, relPath);
  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const cleaned = stripFrontmatter(raw);
    fullContent += `\n\n<!-- ========================================== -->\n<!-- SECTION: ${relPath} -->\n<!-- ========================================== -->\n\n`;
    fullContent += cleaned + '\n\n---\n';
  }
}

fs.mkdirSync(outputDir, { recursive: true });
const targetFile = path.join(outputDir, 'llms-full.txt');
fs.writeFileSync(targetFile, fullContent.trim() + '\n', 'utf8');

console.log(`Successfully generated ${targetFile} (${Buffer.byteLength(fullContent, 'utf8')} bytes)`);
