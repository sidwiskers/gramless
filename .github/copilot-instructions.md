# GitHub Copilot Instructions for Gramless Projects

When assisting with this repository or writing code for Telegram bots using `gramless`, observe the following architectural rules:

## Technology Stack
- **Framework:** Gramless (`gramless`)
- **Runtime:** Native Node.js (v20+), Telegram Serverless (TGCloud), or edge V8 isolates (Cloudflare Workers).
- **Dependencies:** Strictly zero external dependencies. Never import `telegraf`, `grammy`, `axios`, `node-fetch`, or `lodash`.

## Key Patterns
- Always import components from `gramless`, `gramless/format`, or `gramless/testkit`.
- In handlers, `ctx` automatically infers `chat_id` for methods like `ctx.reply()`, `ctx.replyWithPhoto()`, and `ctx.replyWithKeyboard()`.
- Use `ctx.call(method, params)` to execute any method on the Telegram Bot API.
- For safe text formatting with variable interpolation, always use `html` or `md` tagged templates from `gramless/format` to prevent injection vulnerabilities.
- For testing, use `GramlessLab` from `gramless/testkit` with `node:test` and `node:assert/strict`. Never write tests that require live Telegram network connections.
