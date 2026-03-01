import type { RPCSchema } from "electrobun/bun";

export type AppRPC = {
  bun: RPCSchema<{
    requests: {
      openFolder: {
        params: {};
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
      searchFiles: {
        params: { projectPath: string; query: string };
        response: {
          files: { name: string; path: string; isDirectory: boolean }[];
        };
      };
    };
    messages: {};
  }>;
  webview: RPCSchema<{
    requests: {};
    messages: {};
  }>;
};
