#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { stdin as input, stdout as output } from 'node:process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templatesDir = path.resolve(__dirname, '../templates');

const TEMPLATES = [
  {
    id: 'tgcloud',
    name: 'Telegram Serverless (TGCloud)',
    desc: 'Zero-ops V8 edge isolates with transactional SQLite persistence',
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare Workers',
    desc: 'Edge isolate export using bot.fetch and Web Standards',
  },
  {
    id: 'polling',
    name: 'Node.js (Long Polling)',
    desc: 'Zero-dependency standalone daemon with bot.start()',
  },
  {
    id: 'mini-app',
    name: 'Telegram Mini App (Fullstack)',
    desc: 'Static CDN frontend + serverless RPC backend',
  },
];

function printBanner() {
  console.log('\n\x1b[1m\x1b[36m⚡ create-gramless\x1b[0m \x1b[90m— Zero-dependency Telegram bot scaffolder\x1b[0m\n');
}

function printHelp() {
  console.log(`
Usage:
  npm create gramless [project-name] [options]
  npx create-gramless [project-name] [options]

Options:
  -t, --template <name>  Template: tgcloud, cloudflare, polling, mini-app
  -y, --yes              Skip prompts and use defaults
  -h, --help             Show this help message

Templates:
  tgcloud     Telegram Serverless (TGCloud)
  cloudflare  Cloudflare Workers
  polling     Node.js Long Polling
  mini-app    Fullstack Mini App + RPC backend
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    projectName: null,
    template: null,
    yes: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    } else if (arg === '-y' || arg === '--yes') {
      options.yes = true;
    } else if (arg === '-t' || arg === '--template') {
      options.template = args[++i];
    } else if (!arg.startsWith('-') && !options.projectName) {
      options.projectName = arg;
    }
  }

  return options;
}

function copyDirRecursive(src, dest, projectName) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath, projectName);
    } else {
      let content = fs.readFileSync(srcPath);

      if (entry.name === 'package.json') {
        try {
          const pkg = JSON.parse(content.toString('utf8'));
          pkg.name = projectName;
          content = Buffer.from(JSON.stringify(pkg, null, 2) + '\n', 'utf8');
        } catch {
          // fallback to raw copy
        }
      }

      fs.writeFileSync(destPath, content);
    }
  }
}

async function main() {
  const options = parseArgs();
  printBanner();

  let projectName = options.projectName;
  let templateId = options.template;

  const rl = readline.createInterface({ input, output });

  try {
    let targetPath = options.projectName;
    if (!targetPath) {
      if (options.yes) {
        targetPath = 'my-gramless-bot';
      } else {
        const answer = await rl.question('\x1b[1m? Project name:\x1b[0m (my-gramless-bot) ');
        targetPath = answer.trim() || 'my-gramless-bot';
      }
    }

    const targetDir = path.resolve(process.cwd(), targetPath);
    projectName = path.basename(targetDir).replace(/[^a-zA-Z0-9_\-.]/g, '-');

    if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
      console.error(`\x1b[31mError: Target directory "${targetPath}" already exists and is not empty.\x1b[0m`);
      process.exit(1);
    }

    if (!templateId || !TEMPLATES.some((t) => t.id === templateId)) {
      if (options.yes) {
        templateId = 'tgcloud';
      } else {
        console.log('\n\x1b[1m? Select a starter template:\x1b[0m');
        TEMPLATES.forEach((t, idx) => {
          console.log(`  \x1b[36m${idx + 1})\x1b[0m \x1b[1m${t.name}\x1b[0m \x1b[90m— ${t.desc}\x1b[0m`);
        });

        const choice = await rl.question('\n\x1b[1mEnter number:\x1b[0m (1) ');
        const num = parseInt(choice.trim(), 10);
        if (num >= 1 && num <= TEMPLATES.length) {
          templateId = TEMPLATES[num - 1].id;
        } else {
          templateId = 'tgcloud';
        }
      }
    }

    const selectedTemplate = TEMPLATES.find((t) => t.id === templateId);
    const templateSource = path.join(templatesDir, templateId);

    if (!fs.existsSync(templateSource)) {
      console.error(`\x1b[31mError: Template source not found for "${templateId}".\x1b[0m`);
      process.exit(1);
    }

    console.log(`\n\x1b[32m✔\x1b[0m Scaffolding \x1b[1m${projectName}\x1b[0m using \x1b[36m${selectedTemplate.name}\x1b[0m...`);

    copyDirRecursive(templateSource, targetDir, projectName);

    console.log(`\x1b[32m✔\x1b[0m Successfully created \x1b[1m${projectName}\x1b[0m!\n`);
    console.log('\x1b[1mNext steps:\x1b[0m');
    console.log(`  \x1b[36mcd\x1b[0m ${projectName}`);
    console.log('  \x1b[36mnpm install\x1b[0m');

    if (templateId === 'tgcloud' || templateId === 'mini-app') {
      console.log('  \x1b[36mtgcloud diff\x1b[0m');
      console.log('  \x1b[36mtgcloud push\x1b[0m\n');
    } else if (templateId === 'cloudflare') {
      console.log('  \x1b[36mnpm run deploy\x1b[0m\n');
    } else {
      console.log('  \x1b[36mnpm start\x1b[0m\n');
    }

    console.log('\x1b[90mDocumentation: https://sidwiskers.github.io/gramless/\x1b[0m\n');
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error('\n\x1b[31mUnexpected error:\x1b[0m', err);
  process.exit(1);
});
