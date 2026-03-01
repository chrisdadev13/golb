import type { RPCSchema } from "electrobun/bun";

export type AppRPC = {
  bun: RPCSchema<{
    requests: {
      openFolder: {
        params: {};
        response: { paths: string[] } | null;
      };
    };
    messages: {};
  }>;
  webview: RPCSchema<{
    requests: {};
    messages: {};
  }>;
};
