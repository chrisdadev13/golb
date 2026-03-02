import { existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import os from "node:os";
import { join, resolve } from "node:path";
import { type IPty, spawn as ptySpawn } from "bun-pty";
import { BrowserView, BrowserWindow, Updater, Utils } from "electrobun/bun";
import { eq, desc } from "drizzle-orm";
import type { AppRPC } from "../shared/types";
import { getDb, migrateDb } from "./db";
import {
  intents as intentsTable,
  tasks as tasksTable,
  sessions as sessionsTable,
  messages as messagesTable,
  projects as projectsTable,
} from "./db/schema";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

type TerminalSession = {
  ptyProcess: IPty;
};

const terminalSessions = new Map<string, TerminalSession>();
let nextTerminalId = 1;

function createTerminalId() {
  return `terminal-${nextTerminalId++}`;
}

function resolveShellPath() {
  if (process.platform === "win32") {
    return "powershell.exe";
  }
  return process.env.SHELL ?? "/bin/zsh";
}

function canUseDir(path: string) {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function resolveWorkingDirectory(preferredCwd?: string) {
  const candidates = [
    preferredCwd,
    process.cwd(),
    process.env.HOME,
    os.homedir(),
    "/tmp",
    "/",
  ];
  for (const candidate of candidates) {
    if (candidate && canUseDir(candidate)) {
      return candidate;
    }
  }
  return "/";
}

function getSanitizedEnv() {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      env[key] = value;
    }
  }
  if (!env.PATH || env.PATH.trim().length === 0) {
    env.PATH = "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin";
  }
  if (!env.HOME || env.HOME.trim().length === 0) {
    env.HOME = os.homedir();
  }
  if (!env.TERM || env.TERM.trim().length === 0) {
    env.TERM = "xterm-256color";
  }
  return env;
}

function broadcastTerminalData(payload: { terminalId: string; data: string }) {
  for (const view of BrowserView.getAll()) {
    view.rpc.send.terminalData(payload);
  }
}

function broadcastTerminalExit(payload: {
  terminalId: string;
  exitCode: number | null;
}) {
  for (const view of BrowserView.getAll()) {
    view.rpc.send.terminalExit(payload);
  }
}

// Check if Vite dev server is running for HMR
async function getMainViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel();
  if (channel === "dev") {
    try {
      await fetch(DEV_SERVER_URL, { method: "HEAD" });
      console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
      return DEV_SERVER_URL;
    } catch {
      console.log(
        "Vite dev server not running. Run 'bun run dev:hmr' for HMR support.",
      );
    }
  }
  return "views://mainview/index.html";
}

type GitNameStatusEntry = {
  status: string;
  path: string;
  oldPath?: string;
};

function parseGitNameStatus(output: string): GitNameStatusEntry[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t");
      const status = parts[0] ?? "";
      if ((status.startsWith("R") || status.startsWith("C")) && parts.length >= 3) {
        return { status, oldPath: parts[1], path: parts[2] };
      }
      return { status, path: parts[1] ?? "" };
    })
    .filter((entry) => entry.path.length > 0);
}

function parseGitNumstat(output: string): Map<string, { additions: number; deletions: number }> {
  const result = new Map<string, { additions: number; deletions: number }>();
  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    const parts = line.split("\t");
    if (parts.length < 3) {
      continue;
    }
    const additions = Number.parseInt(parts[0], 10);
    const deletions = Number.parseInt(parts[1], 10);
    const path = parts.slice(2).join("\t");
    result.set(path, {
      additions: Number.isFinite(additions) ? additions : 0,
      deletions: Number.isFinite(deletions) ? deletions : 0,
    });
  }
  return result;
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `git ${args.join(" ")} failed`);
  }
  return stdout;
}

async function readWorkingTreeFile(projectPath: string, filePath: string): Promise<string> {
  try {
    return await Bun.file(join(projectPath, filePath)).text();
  } catch {
    return "";
  }
}

async function readGitRefFile(projectPath: string, refPath: string): Promise<string> {
  try {
    return await runGit(projectPath, ["show", refPath]);
  } catch {
    return "";
  }
}

async function getGitDiffFileContents(options: {
  projectPath: string;
  file: string;
  status: string;
  oldPath?: string;
  staged?: boolean;
}) {
  const { projectPath, file, status, oldPath, staged } = options;
  const statusCode = status.slice(0, 1);
  let oldContents = "";
  let newContents = "";

  if (statusCode === "A" || status === "??") {
    newContents = staged
      ? await readGitRefFile(projectPath, `:${file}`)
      : await readWorkingTreeFile(projectPath, file);
  } else if (statusCode === "D") {
    const oldRefPath = oldPath ?? file;
    oldContents = staged
      ? await readGitRefFile(projectPath, `HEAD:${oldRefPath}`)
      : await readGitRefFile(projectPath, `:${oldRefPath}`);
  } else if (statusCode === "R" || statusCode === "C") {
    const oldRefPath = oldPath ?? file;
    oldContents = staged
      ? await readGitRefFile(projectPath, `HEAD:${oldRefPath}`)
      : await readGitRefFile(projectPath, `:${oldRefPath}`);
    newContents = staged
      ? await readGitRefFile(projectPath, `:${file}`)
      : await readWorkingTreeFile(projectPath, file);
  } else {
    oldContents = staged
      ? await readGitRefFile(projectPath, `HEAD:${file}`)
      : await readGitRefFile(projectPath, `:${file}`);
    newContents = staged
      ? await readGitRefFile(projectPath, `:${file}`)
      : await readWorkingTreeFile(projectPath, file);
  }

  return { oldContents, newContents };
}

async function applyGitStageChanges(options: {
  projectPath: string;
  scope: "file" | "all";
  stage: boolean;
  file?: string;
}) {
  const { projectPath, scope, stage, file } = options;
  if (scope === "all") {
    if (stage) {
      await runGit(projectPath, ["add", "-A"]);
    } else {
      await runGit(projectPath, ["restore", "--staged", "--", "."]);
    }
    return;
  }

  if (!file) {
    throw new Error("File path is required for file-scoped stage changes.");
  }

  if (stage) {
    await runGit(projectPath, ["add", "-A", "--", file]);
  } else {
    await runGit(projectPath, ["restore", "--staged", "--", file]);
  }
}

async function applyGitDiscardChanges(options: {
  projectPath: string;
  scope: "file" | "all";
  file?: string;
  status?: string;
  staged: boolean;
}) {
  const { projectPath, scope, file, status, staged } = options;
  if (scope === "all") {
    if (staged) {
      await runGit(projectPath, ["restore", "--source=HEAD", "--staged", "--worktree", "--", "."]);
      return;
    }
    await runGit(projectPath, ["restore", "--worktree", "--", "."]);
    await runGit(projectPath, ["clean", "-fd"]);
    return;
  }

  if (!file) {
    throw new Error("File path is required for file-scoped discard changes.");
  }

  if (staged) {
    await runGit(projectPath, [
      "restore",
      "--source=HEAD",
      "--staged",
      "--worktree",
      "--",
      file,
    ]);
    return;
  }

  if (status === "??") {
    await runGit(projectPath, ["clean", "-f", "--", file]);
    return;
  }

  await runGit(projectPath, ["restore", "--worktree", "--", file]);
}

const rpc = BrowserView.defineRPC<AppRPC>({
  handlers: {
    requests: {
      openFolder: async () => {
        const paths = await Utils.openFileDialog({
          startingFolder: "~/",
          allowedFileTypes: "*",
          canChooseFiles: false,
          canChooseDirectory: true,
          allowsMultipleSelection: false,
        });

        if (!paths.length || (paths.length === 1 && paths[0] === "")) {
          return null;
        }

        return { paths };
      },

      listFiles: async ({
        projectPath,
        relativePath,
      }: {
        projectPath: string;
        relativePath?: string;
      }) => {
        const dir = relativePath
          ? resolve(projectPath, relativePath)
          : projectPath;
        const entries = await readdir(dir, { withFileTypes: true });
        const hidden = new Set([
          "node_modules",
          ".git",
          ".DS_Store",
          "dist",
          ".next",
          ".cache",
        ]);
        const filtered = entries.filter(
          (e) => !hidden.has(e.name) && !e.name.startsWith("."),
        );
        // Sort directories first, then alphabetically
        filtered.sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        });
        return {
          files: filtered.map((e) => ({
            name: e.name,
            path: relativePath ? join(relativePath, e.name) : e.name,
            isDirectory: e.isDirectory(),
          })),
        };
      },

      getGitBranches: async ({ projectPath }: { projectPath: string }) => {
        const proc = Bun.spawn(
          ["git", "branch", "--format=%(refname:short)|%(HEAD)"],
          { cwd: projectPath, stdout: "pipe", stderr: "pipe" },
        );
        const output = await new Response(proc.stdout).text();
        await proc.exited;
        const branches = output
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const [name, head] = line.split("|");
            return { name: name.trim(), current: head?.trim() === "*" };
          });
        return { branches };
      },

      searchFiles: async ({
        projectPath,
        query,
      }: {
        projectPath: string;
        query: string;
      }) => {
        const hidden = new Set([
          "node_modules",
          ".git",
          ".DS_Store",
          "dist",
          ".next",
          ".cache",
        ]);
        const results: { name: string; path: string; isDirectory: boolean }[] =
          [];
        const q = query.toLowerCase();
        const maxResults = 20;
        const maxDepth = 5;

        async function walk(dir: string, rel: string, depth: number) {
          if (depth > maxDepth || results.length >= maxResults) return;
          try {
            const entries = await readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
              if (results.length >= maxResults) break;
              if (hidden.has(entry.name) || entry.name.startsWith("."))
                continue;
              const entryRel = rel ? join(rel, entry.name) : entry.name;
              // Match against both filename and full relative path
              if (
                entry.name.toLowerCase().includes(q) ||
                entryRel.toLowerCase().includes(q)
              ) {
                results.push({
                  name: entry.name,
                  path: entryRel,
                  isDirectory: entry.isDirectory(),
                });
              }
              if (entry.isDirectory()) {
                await walk(join(dir, entry.name), entryRel, depth + 1);
              }
            }
          } catch {
            // skip unreadable directories
          }
        }

        await walk(projectPath, "", 0);
        return { files: results };
      },

      getGitStatus: async ({ projectPath }: { projectPath: string }) => {
        const proc = Bun.spawn(["git", "status", "--porcelain"], {
          cwd: projectPath,
          stdout: "pipe",
          stderr: "pipe",
        });
        const output = await new Response(proc.stdout).text();
        await proc.exited;
        const changes = output
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const status = line.slice(0, 2).trim();
            const file = line.slice(3).trim();
            return { file, status };
          });
        return { changes };
      },
      getGitFileDiffs: async ({
        projectPath,
        staged,
      }: {
        projectPath: string;
        staged?: boolean;
      }) => {
        const nameStatusOutput = await runGit(projectPath, [
          "diff",
          ...(staged ? ["--cached"] : []),
          "--name-status",
        ]);
        const numstatOutput = await runGit(projectPath, [
          "diff",
          ...(staged ? ["--cached"] : []),
          "--numstat",
        ]);

        const entries = parseGitNameStatus(nameStatusOutput);
        if (!staged) {
          const untrackedOutput = await runGit(projectPath, [
            "ls-files",
            "--others",
            "--exclude-standard",
          ]);
          const untrackedPaths = untrackedOutput
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
          for (const file of untrackedPaths) {
            entries.push({ status: "??", path: file });
          }
        }

        const numstatMap = parseGitNumstat(numstatOutput);
        const files = entries.map((entry) => {
            const summary = numstatMap.get(entry.path) ?? {
              additions: 0,
              deletions: 0,
            };

            return {
              file: entry.path,
              status: entry.status,
              oldPath: entry.oldPath,
              additions: summary.additions,
              deletions: summary.deletions,
            };
          });

        return { files };
      },
      getGitFileDiffContents: async ({
        projectPath,
        file,
        status,
        oldPath,
        staged,
      }: {
        projectPath: string;
        file: string;
        status: string;
        oldPath?: string;
        staged?: boolean;
      }) => {
        return getGitDiffFileContents({
          projectPath,
          file,
          status,
          oldPath,
          staged,
        });
      },
      gitStageChanges: async ({
        projectPath,
        scope,
        stage,
        file,
      }: {
        projectPath: string;
        scope: "file" | "all";
        stage: boolean;
        file?: string;
      }) => {
        await applyGitStageChanges({
          projectPath,
          scope,
          stage,
          file,
        });
        return { ok: true as const };
      },
      gitDiscardChanges: async ({
        projectPath,
        scope,
        file,
        status,
        staged,
      }: {
        projectPath: string;
        scope: "file" | "all";
        file?: string;
        status?: string;
        staged: boolean;
      }) => {
        await applyGitDiscardChanges({
          projectPath,
          scope,
          file,
          status,
          staged,
        });
        return { ok: true as const };
      },
      getIntents: async ({ projectPath }: { projectPath: string }) => {
        const db = getDb();
        const project = await db
          .select({ id: projectsTable.id })
          .from(projectsTable)
          .where(eq(projectsTable.path, projectPath))
          .limit(1);

        if (project.length === 0) {
          return { intents: [] };
        }

        const projectId = project[0].id;
        const allIntents = await db
          .select()
          .from(intentsTable)
          .where(eq(intentsTable.projectId, projectId))
          .orderBy(intentsTable.order);

        const allTasks = await db
          .select({
            id: tasksTable.id,
            intentId: tasksTable.intentId,
            title: tasksTable.title,
            status: tasksTable.status,
          })
          .from(tasksTable)
          .orderBy(tasksTable.order);

        const tasksByIntent = new Map<
          string,
          Array<{ id: string; title: string; status: "pending" | "in_progress" | "completed" | "blocked" }>
        >();
        for (const task of allTasks) {
          const list = tasksByIntent.get(task.intentId) ?? [];
          list.push({
            id: task.id,
            title: task.title,
            status: task.status as "pending" | "in_progress" | "completed" | "blocked",
          });
          tasksByIntent.set(task.intentId, list);
        }

        const result = allIntents.map((intent) => {
          const tasks = tasksByIntent.get(intent.id) ?? [];
          return {
            id: intent.id,
            title: intent.title,
            type: intent.type as "feature" | "experiment",
            status: intent.status as "active" | "completed" | "killed" | "blocked",
            experimentVerdict: (intent.experimentVerdict as "kept" | "killed") ?? null,
            taskCount: tasks.length,
            completedTaskCount: tasks.filter((t) => t.status === "completed").length,
            tasks,
          };
        });

        return { intents: result };
      },
      getActiveSession: async ({ projectPath }: { projectPath: string }) => {
        const db = getDb();
        const project = await db
          .select({ id: projectsTable.id })
          .from(projectsTable)
          .where(eq(projectsTable.path, projectPath))
          .limit(1);

        if (project.length === 0) return null;

        const projectId = project[0].id;
        const session = await db
          .select({ id: sessionsTable.id })
          .from(sessionsTable)
          .where(eq(sessionsTable.projectId, projectId))
          .orderBy(desc(sessionsTable.createdAt))
          .limit(1);

        if (session.length === 0) return null;

        const sessionId = session[0].id;
        const msgs = await db
          .select({
            id: messagesTable.id,
            role: messagesTable.role,
            parts: messagesTable.parts,
            createdAt: messagesTable.createdAt,
          })
          .from(messagesTable)
          .where(eq(messagesTable.sessionId, sessionId))
          .orderBy(messagesTable.createdAt);

        return {
          sessionId,
          messages: msgs.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant" | "system",
            parts: m.parts as Array<Record<string, unknown>>,
            createdAt: m.createdAt?.toISOString() ?? new Date().toISOString(),
          })),
        };
      },
      getSessions: async ({ projectPath }: { projectPath: string }) => {
        const db = getDb();
        const project = await db
          .select({ id: projectsTable.id })
          .from(projectsTable)
          .where(eq(projectsTable.path, projectPath))
          .limit(1);

        if (project.length === 0) return { sessions: [] };

        const projectId = project[0].id;
        const rows = await db
          .select({
            id: sessionsTable.id,
            title: sessionsTable.title,
            status: sessionsTable.status,
            createdAt: sessionsTable.createdAt,
          })
          .from(sessionsTable)
          .where(eq(sessionsTable.projectId, projectId))
          .orderBy(desc(sessionsTable.createdAt));

        return {
          sessions: rows.map((s) => ({
            id: s.id,
            title: s.title,
            status: s.status as "active" | "completed",
            createdAt: s.createdAt?.toISOString() ?? new Date().toISOString(),
          })),
        };
      },
      getSessionMessages: async ({ sessionId }: { sessionId: string }) => {
        const db = getDb();
        const msgs = await db
          .select({
            id: messagesTable.id,
            role: messagesTable.role,
            parts: messagesTable.parts,
            createdAt: messagesTable.createdAt,
          })
          .from(messagesTable)
          .where(eq(messagesTable.sessionId, sessionId))
          .orderBy(messagesTable.createdAt);

        return {
          messages: msgs.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant" | "system",
            parts: m.parts as Array<Record<string, unknown>>,
            createdAt: m.createdAt?.toISOString() ?? new Date().toISOString(),
          })),
        };
      },
      terminalCreate: async ({
        cols,
        rows,
        cwd,
      }: {
        cols: number;
        rows: number;
        cwd?: string;
      }) => {
        const terminalId = createTerminalId();
        const resolvedCwd = resolveWorkingDirectory(cwd);
        const shell = resolveShellPath();
        const env = getSanitizedEnv();

        const ptyProcess = ptySpawn(shell, ["-l"], {
          name: "xterm-256color",
          cols: Math.max(2, cols),
          rows: Math.max(1, rows),
          cwd: resolvedCwd,
          env,
        });

        terminalSessions.set(terminalId, { ptyProcess });

        ptyProcess.onData((data: string) => {
          broadcastTerminalData({
            terminalId,
            data,
          });
        });

        ptyProcess.onExit((event: { exitCode: number }) => {
          terminalSessions.delete(terminalId);
          broadcastTerminalExit({
            terminalId,
            exitCode: event.exitCode,
          });
        });

        return { terminalId };
      },
      terminalWrite: async ({
        terminalId,
        data,
      }: {
        terminalId: string;
        data: string;
      }) => {
        const terminalSession = terminalSessions.get(terminalId);
        if (terminalSession) {
          terminalSession.ptyProcess.write(data);
        }
        return { ok: true as const };
      },
      terminalResize: async ({
        terminalId,
        cols,
        rows,
      }: {
        terminalId: string;
        cols: number;
        rows: number;
      }) => {
        const terminalSession = terminalSessions.get(terminalId);
        if (terminalSession && cols > 0 && rows > 0) {
          terminalSession.ptyProcess.resize(cols, rows);
        }
        return { ok: true as const };
      },
      terminalKill: async ({ terminalId }: { terminalId: string }) => {
        const terminalSession = terminalSessions.get(terminalId);
        if (terminalSession) {
          terminalSession.ptyProcess.kill();
          terminalSessions.delete(terminalId);
        }
        return { ok: true as const };
      },
    },
    messages: {},
  },
});

await migrateDb();

const { startChatServer } = await import("./ai/chat-server");
startChatServer();

const url = await getMainViewUrl();

new BrowserWindow({
  title: "Golb",
  url,
  rpc,
  frame: {
    width: 1280,
    height: 820,
    x: 200,
    y: 200,
  },
  titleBarStyle: "hiddenInset",
});

console.log("Golb started!");
