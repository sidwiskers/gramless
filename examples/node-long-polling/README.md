# Node.js Long Polling Bot

A standalone, zero-dependency Telegram bot using long polling with **Gramless**.

## Features

- **Zero External Dependencies:** Built with native Node.js standard APIs.
- **Built-in Polling Engine:** `bot.start()` and `bot.stop()` with offset tracking and backoff on errors.
- **Graceful Shutdown:** Handles `SIGINT` / `SIGTERM` signals cleanly.

## Running

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a `.env` file with your bot token:
   ```bash
   cp .env.example .env
   # Edit .env and insert your token from @BotFather
   ```
3. Run with Node.js 20+:
   ```bash
   npm start
   ```
