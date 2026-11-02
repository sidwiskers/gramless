# AI Assistant & IDE Configuration

Configure AI coding assistants (Cursor, GitHub Copilot, Windsurf, Claude, ChatGPT) to write idiomatic, zero-dependency Gramless code without hallucinating third-party dependencies.

---

## 1. Standard Documentation Endpoints (`llms.txt`)

Gramless publishes machine-readable documentation compliant with the [`/llms.txt`](https://llmstxt.org) standard for AI models and search indexers:

| Resource | URL | Purpose |
| :--- | :--- | :--- |
| **Index (`llms.txt`)** | `https://sidwiskers.github.io/gramless/llms.txt` | Clean markdown summary and structured directory of all guides, references, and recipes. |
| **Consolidated Docs (`llms-full.txt`)** | `https://sidwiskers.github.io/gramless/llms-full.txt` | Full concatenated documentation (52 KB) designed for direct context window ingestion. |

### Adding to Cursor or Windsurf Docs
In Cursor (`Settings > Features > Docs`) or Windsurf, add `https://sidwiskers.github.io/gramless/llms.txt` as a custom documentation source. The editor will automatically index Gramless APIs for contextual queries (`@docs`).

---

## 2. Cursor Configuration (`.cursorrules`)

Add a `.cursorrules` file to your project root to ensure Cursor completions adhere to Gramless conventions:

```markdown
# Gramless Development Guidelines

You are an expert Telegram Bot developer using Gramless (`gramless`).

## Rules & Constraints
- **Zero External Dependencies:** Do not import `axios`, `node-fetch`, `grammy`, or `telegraf`. Rely exclusively on `gramless`, native Web APIs (`fetch`, `crypto`), and Node.js built-ins.
- **Context Helpers:** Use `ctx.reply()`, `ctx.replyWithPhoto()`, and `ctx.replyWithKeyboard()` (the `chat_id` is inferred automatically).
- **Escape Hatch:** Use `await ctx.call(method, params)` for any Telegram Bot API method not covered by convenience helpers.
- **Callback Queries:** Always call `await ctx.answerCallbackQuery()` to dismiss client loading spinners.
- **Safe Formatting:** Always import `html`, `md`, or `fmt` from `gramless/format` when formatting messages with user variables to prevent injection attacks.
- **Offline Hermetic Testing:** Use `GramlessLab` from `gramless/testkit` with `node:test` for testing without network requests or bot tokens.
```

---

## 3. GitHub Copilot Configuration (`.github/copilot-instructions.md`)

GitHub Copilot and Copilot Workspace read instructions from `.github/copilot-instructions.md`:

```markdown
# GitHub Copilot Instructions

When generating code for Telegram bots in this repository:
- Use `gramless` for all routing, session management, and Bot API calls.
- Do not introduce external HTTP client or Telegram framework dependencies.
- In serverless handlers (TGCloud), export `bot.handler()`.
- In Cloudflare Workers, export `bot.fetch(request, env, ctx)`.
- In Node.js environments, use `bot.start()` for long polling.
- Write tests using `GramlessLab` from `gramless/testkit`.
```

---

## 4. Context Prompts for LLMs (Claude, ChatGPT, Gemini)

When asking an LLM to generate or refactor a Gramless bot, provide the consolidated documentation link:

```text
Please write a Telegram bot using the Gramless framework. 
Documentation is available at: https://sidwiskers.github.io/gramless/llms-full.txt
Do not use any third-party dependencies.
```
