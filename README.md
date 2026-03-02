# Golb

Golb is a desktop AI coding workspace built with Electrobun, Bun, React, Vite, and Tailwind.

It combines:
- a desktop shell and app RPC layer (`src/bun`)
- an AI/chat server running locally on port `3141` (`src/bun/ai/chat-server.ts`)
- a React UI for project selection, chat, planning/debug modes, diffs, and terminal tools (`src/mainview`)

## Tech Stack

- Bun runtime and package manager
- Electrobun desktop runtime
- React + Vite + Tailwind for UI
- AI SDK + Mistral provider
- Drizzle ORM with local SQLite storage

## Prerequisites

- Bun installed (`bun --version`)
- macOS/Linux/Windows environment supported by Electrobun
- A Mistral API key (either:
  - `MISTRAL_API_KEY` in your shell, or
  - set once in-app and it will be saved to `~/.golb/config.json`)

## Setup

```bash
bun install
```

## Run The App

### Recommended: Development with HMR

```bash
bun run dev:hmr
```

This starts:
- Vite dev server on `http://localhost:5173`
- Electrobun app process

When Vite is available, the app uses the HMR URL automatically.

### Development without HMR

```bash
bun run start
```

This first builds the frontend (`vite build`) and then runs `electrobun dev`.

### Watch mode (advanced)

```bash
bun run dev
```

Runs `electrobun dev --watch`. Use this when you intentionally want Electrobun watch behavior without the `start` prebuild step.

## Build

Project script for canary builds:

```bash
bun run build:canary
```

If you need other channels/targets, run Electrobun directly with the desired flags.

## Data and Local State

- App data directory: `~/.golb/`
- SQLite database: `~/.golb/data.db`
- Saved API key config: `~/.golb/config.json`

## Project Layout

```text
src/
  bun/
    index.ts               # Desktop main process + RPC handlers
    ai/chat-server.ts      # Local AI/chat + plan endpoints (:3141)
    db/                    # Drizzle schema, migrations, DB bootstrap
  mainview/
    App.tsx                # Root UI shell
    pages/index.tsx        # Project picker / landing page
    pages/home.tsx         # Main project workspace/chat UI
electrobun.config.ts       # Bundle/copy rules for desktop app
vite.config.ts             # Frontend build + dev server config
drizzle.config.ts          # Drizzle kit config
```

## Troubleshooting

- If AI responses fail, verify your Mistral key is configured.
- If HMR does not activate, ensure port `5173` is free and `bun run dev:hmr` is running.
- If app state seems corrupted, inspect `~/.golb/` (DB and config live there).
