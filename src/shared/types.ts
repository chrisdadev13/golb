import type { RPCSchema } from "electrobun/bun";

export type AppRPC = {
  bun: RPCSchema<{
    requests: {
      openFolder: {
        params: Record<string, never>;
        response: { paths: string[] } | null;
      };
      listFiles: {
        params: { projectPath: string; relativePath?: string };
        response: {
          files: { name: string; path: string; isDirectory: boolean }[];
        };
      };
      getGitBranches: {
        params: { projectPath: string };
        response: {
          branches: { name: string; current: boolean }[];
        };
      };
      getGitStatus: {
        params: { projectPath: string };
        response: {
          changes: { file: string; status: string }[];
        };
      };
      getGitFileDiffs: {
        params: { projectPath: string; staged?: boolean };
        response: {
          files: {
            file: string;
            status: string;
            oldPath?: string;
            additions: number;
            deletions: number;
          }[];
        };
      };
      getGitFileDiffContents: {
        params: {
          projectPath: string;
          file: string;
          status: string;
          oldPath?: string;
          staged?: boolean;
        };
        response: {
          oldContents: string;
          newContents: string;
        };
      };
      gitStageChanges: {
        params: {
          projectPath: string;
          scope: "file" | "all";
          stage: boolean;
          file?: string;
        };
        response: { ok: true };
      };
      gitDiscardChanges: {
        params: {
          projectPath: string;
          scope: "file" | "all";
          file?: string;
          status?: string;
          staged: boolean;
        };
        response: { ok: true };
      };
      searchFiles: {
        params: { projectPath: string; query: string };
        response: {
          files: { name: string; path: string; isDirectory: boolean }[];
        };
      };
      terminalCreate: {
        params: { cols: number; rows: number; cwd?: string };
        response: { terminalId: string };
      };
      terminalWrite: {
        params: { terminalId: string; data: string };
        response: { ok: true };
      };
      terminalResize: {
        params: { terminalId: string; cols: number; rows: number };
        response: { ok: true };
      };
      terminalKill: {
        params: { terminalId: string };
        response: { ok: true };
      };
    };
    messages: Record<string, never>;
  }>;
  webview: RPCSchema<{
    requests: Record<string, never>;
    messages: {
      terminalData: {
        terminalId: string;
        data: string;
      };
      terminalExit: {
        terminalId: string;
        exitCode: number | null;
      };
    };
  }>;
};
