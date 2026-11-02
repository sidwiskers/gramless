#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { stdin as input, stdout as output } from 'node:process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templatesDir = path.resolve(__dirname, '../templates');

const TEMPLATES = [
  {
    id: 'tgcloud',
    name: 'Telegram Serverless (TGCloud)',
    desc: 'Zero-ops V8 edge isolates with transactional SQLite',
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

const LANGUAGES = [
  { id: 'js', name: 'JavaScript (ESM)' },
  { id: 'ts', name: 'TypeScript' },
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
  --ts, --typescript     Use TypeScript
  --js, --javascript     Use JavaScript
  --install              Automatically install dependencies
  --no-install           Skip dependency installation
  --git                  Initialize a Git repository
  --no-git               Skip Git initialization
  -y, --yes              Skip prompts and use defaults
  -h, --help             Show this help message

Templates:
  tgcloud     Telegram Serverless (TGCloud)
  cloudflare  Cloudflare Workers
  polling     Node.js Long Polling
  mini-app    Fullstack Mini App + RPC backend
`);
}

function detectPackageManager() {
  const userAgent = process.env.npm_config_user_agent || '';
  if (userAgent.startsWith('pnpm')) return 'pnpm';
  if (userAgent.startsWith('yarn')) return 'yarn';
  if (userAgent.startsWith('bun')) return 'bun';
  return 'npm';
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    projectName: null,
    template: null,
    lang: null,
    install: null,
    git: null,
    yes: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    } else if (arg === '-y' || arg === '--yes') {
      options.yes = true;
    } else if (arg === '--ts' || arg === '--typescript') {
      options.lang = 'ts';
    } else if (arg === '--js' || arg === '--javascript') {
      options.lang = 'js';
    } else if (arg === '--install') {
      options.install = true;
    } else if (arg === '--no-install') {
      options.install = false;
    } else if (arg === '--git') {
      options.git = true;
    } else if (arg === '--no-git') {
      options.git = false;
    } else if (arg === '-t' || arg === '--template') {
      options.template = args[++i];
    } else if (!arg.startsWith('-') && !options.projectName) {
      options.projectName = arg;
    }
  }

  return options;
}

async function selectOption(promptText, items, defaultIdx = 0) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log(`\n\x1b[1m${promptText}\x1b[0m`);
    items.forEach((item, idx) => {
      console.log(`  \x1b[36m${idx + 1})\x1b[0m \x1b[1m${item.name}\x1b[0m${item.desc ? ` \x1b[90m— ${item.desc}\x1b[0m` : ''}`);
    });
    const rl = readline.createInterface({ input, output });
    const choice = await rl.question(`\nEnter number (1-${items.length}) [${defaultIdx + 1}]: `);
    rl.close();
    const num = parseInt(choice.trim(), 10);
    if (num >= 1 && num <= items.length) return items[num - 1];
    return items[defaultIdx];
  }

  let selected = defaultIdx;
  process.stdout.write('\x1b[?25l');

  function render() {
    process.stdout.write(`\r\x1b[K\x1b[1m${promptText}\x1b[0m\n`);
    items.forEach((item, idx) => {
      const isSelected = idx === selected;
      const prefix = isSelected ? '\x1b[36m❯\x1b[0m ' : '  ';
      const name = isSelected ? `\x1b[36m\x1b[1m${item.name}\x1b[0m` : item.name;
      const desc = item.desc ? ` \x1b[90m— ${item.desc}\x1b[0m` : '';
      process.stdout.write(`\r\x1b[K${prefix}${name}${desc}\n`);
    });
  }

  render();

  return new Promise((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
      process.stdout.write('\x1b[?25h');
    };

    const onData = (data) => {
      const s = data.toString();
      if (s === '\u0003') {
        cleanup();
        console.log('\n\x1b[90mOperation cancelled.\x1b[0m');
        process.exit(130);
      } else if (s === '\r' || s === '\n') {
        cleanup();
        process.stdout.write(`\x1b[${items.length + 1}A\r\x1b[K`);
        console.log(`\x1b[1m${promptText}\x1b[0m \x1b[36m${items[selected].name}\x1b[0m`);
        resolve(items[selected]);
      } else if (s === '\u001b[A' || s === 'k') {
        selected = (selected - 1 + items.length) % items.length;
        process.stdout.write(`\x1b[${items.length + 1}A`);
        render();
      } else if (s === '\u001b[B' || s === 'j') {
        selected = (selected + 1) % items.length;
        process.stdout.write(`\x1b[${items.length + 1}A`);
        render();
      }
    };

    process.stdin.on('data', onData);
  });
}

function copyDirRecursive(src, dest, projectName) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    let targetFileName = entry.name;

    // Rename _gitignore to .gitignore
    if (entry.name === '_gitignore') {
      targetFileName = '.gitignore';
    }

    const destPath = path.join(dest, targetFileName);

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
          // fallback
        }
      }

      fs.writeFileSync(destPath, content);
    }
  }
}

async function main() {
  const options = parseArgs();
  const pkgManager = detectPackageManager();
  printBanner();

  let targetPath = options.projectName;

  if (!targetPath) {
    if (options.yes) {
      targetPath = 'my-gramless-bot';
    } else {
      const rl = readline.createInterface({ input, output });
      const answer = await rl.question('\x1b[1m? Project name:\x1b[0m (my-gramless-bot) ');
      targetPath = answer.trim() || 'my-gramless-bot';
      rl.close();
    }
  }

  const targetDir = path.resolve(process.cwd(), targetPath);
  const projectName = path.basename(targetDir).replace(/[^a-zA-Z0-9_\-.]/g, '-');

  // Handle existing non-empty directory
  if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
    if (options.yes) {
      // proceed
    } else {
      const rl = readline.createInterface({ input, output });
      const ans = await rl.question(`\x1b[33m? Directory "${targetPath}" is not empty. Overwrite and continue? (y/N):\x1b[0m `);
      rl.close();
      if (ans.trim().toLowerCase() !== 'y') {
        console.log('\x1b[90mOperation cancelled.\x1b[0m');
        process.exit(0);
      }
    }
  }

  // 1. Template selection
  let selectedTemplate;
  if (options.template && TEMPLATES.some((t) => t.id === options.template)) {
    selectedTemplate = TEMPLATES.find((t) => t.id === options.template);
  } else if (options.yes) {
    selectedTemplate = TEMPLATES[0];
  } else {
    selectedTemplate = await selectOption('? Select a starter template:', TEMPLATES, 0);
  }

  // 2. Language selection
  let selectedLang;
  if (options.lang) {
    selectedLang = options.lang;
  } else if (options.yes) {
    selectedLang = 'js';
  } else {
    const langChoice = await selectOption('? Select language:', LANGUAGES, 0);
    selectedLang = langChoice.id;
  }

  const finalTemplateFolder = selectedLang === 'ts' ? `${selectedTemplate.id}-ts` : selectedTemplate.id;
  const templateSource = path.join(templatesDir, finalTemplateFolder);

  if (!fs.existsSync(templateSource)) {
    console.error(`\x1b[31mError: Template folder "${finalTemplateFolder}" not found.\x1b[0m`);
    process.exit(1);
  }

  console.log(`\n\x1b[32m✔\x1b[0m Scaffolding \x1b[1m${projectName}\x1b[0m using \x1b[36m${selectedTemplate.name}\x1b[0m (${selectedLang === 'ts' ? 'TypeScript' : 'JavaScript'})...`);

  copyDirRecursive(templateSource, targetDir, projectName);

  // Initialize git if requested or default in interactive
  let initGit = options.git;
  if (initGit === null && !options.yes) {
    initGit = true;
  }

  if (initGit) {
    try {
      if (!fs.existsSync(path.join(targetDir, '.git'))) {
        spawnSync('git', ['init', '-q'], { cwd: targetDir, stdio: 'ignore' });
      }
    } catch {
      // Git not available, safely ignore
    }
  }

  // Install dependencies if requested
  let shouldInstall = options.install;
  if (shouldInstall === null && !options.yes && process.stdin.isTTY) {
    const rl = readline.createInterface({ input, output });
    const ans = await rl.question(`\n\x1b[1m? Install dependencies with ${pkgManager}? (Y/n):\x1b[0m `);
    rl.close();
    shouldInstall = ans.trim().toLowerCase() !== 'n';
  }

  if (shouldInstall) {
    console.log(`\n\x1b[36mInstalling dependencies with ${pkgManager}...\x1b[0m`);
    const installRes = spawnSync(pkgManager, ['install'], { cwd: targetDir, stdio: 'inherit' });
    if (installRes.status !== 0) {
      console.log(`\x1b[33mWarning: Dependency installation returned code ${installRes.status}.\x1b[0m`);
    } else {
      console.log(`\x1b[32m✔\x1b[0m Dependencies installed successfully.`);
    }
  }

  console.log(`\n\x1b[32m✔\x1b[0m Successfully created \x1b[1m${projectName}\x1b[0m!\n`);
  console.log('\x1b[1mNext steps:\x1b[0m');
  console.log(`  \x1b[36mcd\x1b[0m ${targetPath}`);

  if (!shouldInstall) {
    const installCmd = pkgManager === 'yarn' ? 'yarn' : `${pkgManager} install`;
    console.log(`  \x1b[36m${installCmd}\x1b[0m`);
  }

  if (selectedTemplate.id === 'tgcloud' || selectedTemplate.id === 'mini-app') {
    console.log('  \x1b[36mtgcloud diff\x1b[0m');
    console.log('  \x1b[36mtgcloud push\x1b[0m\n');
  } else if (selectedTemplate.id === 'cloudflare') {
    const deployCmd = pkgManager === 'npm' ? 'npm run deploy' : `${pkgManager} deploy`;
    console.log(`  \x1b[36m${deployCmd}\x1b[0m\n`);
  } else {
    const startCmd = pkgManager === 'npm' ? 'npm start' : `${pkgManager} start`;
    console.log(`  \x1b[36m${startCmd}\x1b[0m\n`);
  }

  console.log('\x1b[90mOfficial Documentation: https://sidwiskers.github.io/gramless/\x1b[0m\n');
}

main().catch((err) => {
  console.error('\n\x1b[31mUnexpected error:\x1b[0m', err);
  process.exit(1);
});
