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
      getIntents: {
        params: { projectPath: string };
        response: {
          intents: Array<{
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
          }>;
        };
      };
      getActiveSession: {
        params: { projectPath: string };
        response: {
          sessionId: string;
          messages: Array<{
            id: string;
            role: "user" | "assistant" | "system";
            parts: Array<Record<string, unknown>>;
            createdAt: string;
          }>;
        } | null;
      };
      getSessions: {
        params: { projectPath: string };
        response: {
          sessions: Array<{
            id: string;
            title: string | null;
            status: "active" | "completed";
            hasPlan: boolean;
            createdAt: string;
          }>;
        };
      };
      getSessionPlan: {
        params: { sessionId: string };
        response: { plan: string | null };
      };
      getSessionMessages: {
        params: { sessionId: string };
        response: {
          messages: Array<{
            id: string;
            role: "user" | "assistant" | "system";
            parts: Array<Record<string, unknown>>;
            createdAt: string;
          }>;
        };
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
