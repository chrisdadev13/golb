import { Electroview } from "electrobun/view";
import type { AppRPC } from "../../shared/types";

type TerminalDataPayload = {
  terminalId: string;
  data: string;
};

type TerminalExitPayload = {
  terminalId: string;
  exitCode: number | null;
};

export type GitFileDiffSummary = {
  file: string;
  status: string;
  oldPath?: string;
  additions: number;
  deletions: number;
};

export type GitFileDiffContents = {
  oldContents: string;
  newContents: string;
};

const terminalDataSubscribers = new Set<(payload: TerminalDataPayload) => void>();
const terminalExitSubscribers = new Set<(payload: TerminalExitPayload) => void>();

const rpc = Electroview.defineRPC<AppRPC>({
  maxRequestTime: Infinity,
  handlers: {
    requests: {},
    messages: {
      terminalData: (payload) => {
        for (const subscriber of terminalDataSubscribers) {
          subscriber(payload);
        }
      },
      terminalExit: (payload) => {
        for (const subscriber of terminalExitSubscribers) {
          subscriber(payload);
        }
      },
    },
  },
});

export const electroview = new Electroview({ rpc });

function getRpc() {
  const viewRpc = electroview.rpc;
  if (!viewRpc) {
    throw new Error("Electroview RPC is unavailable.");
  }
  return viewRpc;
}

export async function openFolderDialog(): Promise<string[] | null> {
  const result = await getRpc().request.openFolder({});
  return result?.paths ?? null;
}

export async function listFiles(
  projectPath: string,
  relativePath?: string,
): Promise<{ name: string; path: string; isDirectory: boolean }[]> {
  const result = await getRpc().request.listFiles({
    projectPath,
    relativePath,
  });
  return result.files;
}

export async function getGitBranches(
  projectPath: string,
): Promise<{ name: string; current: boolean }[]> {
  const result = await getRpc().request.getGitBranches({ projectPath });
  return result.branches;
}

export async function searchFiles(
  projectPath: string,
  query: string,
): Promise<{ name: string; path: string; isDirectory: boolean }[]> {
  const result = await getRpc().request.searchFiles({
    projectPath,
    query,
  });
  return result.files;
}

export async function getGitStatus(
  projectPath: string,
): Promise<{ file: string; status: string }[]> {
  const result = await getRpc().request.getGitStatus({ projectPath });
  return result.changes;
}

export async function getGitFileDiffs(
  projectPath: string,
  staged?: boolean,
): Promise<GitFileDiffSummary[]> {
  const result = await getRpc().request.getGitFileDiffs({ projectPath, staged });
  return result.files;
}

export async function getGitFileDiffContents(options: {
  projectPath: string;
  file: string;
  status: string;
  oldPath?: string;
  staged?: boolean;
}): Promise<GitFileDiffContents> {
  return getRpc().request.getGitFileDiffContents(options);
}

export async function gitStageChanges(options: {
  projectPath: string;
  scope: "file" | "all";
  stage: boolean;
  file?: string;
}): Promise<void> {
  await getRpc().request.gitStageChanges(options);
}

export async function gitDiscardChanges(options: {
  projectPath: string;
  scope: "file" | "all";
  file?: string;
  status?: string;
  staged: boolean;
}): Promise<void> {
  await getRpc().request.gitDiscardChanges(options);
}

export async function terminalCreate(options: {
  cols: number;
  rows: number;
  cwd?: string;
}): Promise<{ terminalId: string }> {
  return getRpc().request.terminalCreate(options);
}

export async function terminalWrite(options: {
  terminalId: string;
  data: string;
}): Promise<void> {
  await getRpc().request.terminalWrite(options);
}

export async function terminalResize(options: {
  terminalId: string;
  cols: number;
  rows: number;
}): Promise<void> {
  await getRpc().request.terminalResize(options);
}

export async function terminalKill(options: {
  terminalId: string;
}): Promise<void> {
  await getRpc().request.terminalKill(options);
}

export type SidebarIntent = {
  id: string;
  title: string;
  type: "feature" | "experiment";
  status: "active" | "completed" | "killed" | "blocked";
  experimentVerdict: "kept" | "killed" | null;
  taskCount: number;
  completedTaskCount: number;
  tasks: Array<{
    id: string;
    title: string;
    status: "pending" | "in_progress" | "completed" | "blocked";
  }>;
};

export async function getIntents(
  projectPath: string,
): Promise<SidebarIntent[]> {
  const result = await getRpc().request.getIntents({ projectPath });
  return result.intents;
}

export type SessionMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  parts: Array<Record<string, unknown>>;
  createdAt: string;
};

export async function getActiveSession(
  projectPath: string,
): Promise<{ sessionId: string; messages: SessionMessage[] } | null> {
  return getRpc().request.getActiveSession({ projectPath });
}

export type SidebarSession = {
  id: string;
  title: string | null;
  status: "active" | "completed";
  createdAt: string;
};

export async function getSessions(
  projectPath: string,
): Promise<SidebarSession[]> {
  const result = await getRpc().request.getSessions({ projectPath });
  return result.sessions;
}

export async function getSessionMessages(
  sessionId: string,
): Promise<SessionMessage[]> {
  const result = await getRpc().request.getSessionMessages({ sessionId });
  return result.messages;
}

export function subscribeTerminalData(
  subscriber: (payload: TerminalDataPayload) => void,
) {
  terminalDataSubscribers.add(subscriber);
  return () => terminalDataSubscribers.delete(subscriber);
}

export function subscribeTerminalExit(
  subscriber: (payload: TerminalExitPayload) => void,
) {
  terminalExitSubscribers.add(subscriber);
  return () => terminalExitSubscribers.delete(subscriber);
}
