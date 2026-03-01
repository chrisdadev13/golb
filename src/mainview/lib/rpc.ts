import { Electroview } from "electrobun/view";
import type { AppRPC } from "../../shared/types";

const rpc = Electroview.defineRPC<AppRPC>({
  maxRequestTime: Infinity,
  handlers: {
    requests: {},
    messages: {},
  },
});

export const electroview = new Electroview({ rpc });

export async function openFolderDialog(): Promise<string[] | null> {
  const result = await electroview.rpc!.request.openFolder({});
  return result?.paths ?? null;
}
