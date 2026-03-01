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
