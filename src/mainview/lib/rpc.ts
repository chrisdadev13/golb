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

export async function listFiles(
  projectPath: string,
  relativePath?: string,
): Promise<{ name: string; path: string; isDirectory: boolean }[]> {
  const result = await electroview.rpc!.request.listFiles({
    projectPath,
    relativePath,
  });
  return result.files;
}

export async function getGitBranches(
  projectPath: string,
): Promise<{ name: string; current: boolean }[]> {
  const result = await electroview.rpc!.request.getGitBranches({ projectPath });
  return result.branches;
}

export async function searchFiles(
  projectPath: string,
  query: string,
): Promise<{ name: string; path: string; isDirectory: boolean }[]> {
  const result = await electroview.rpc!.request.searchFiles({
    projectPath,
    query,
  });
  return result.files;
}

export async function getGitStatus(
  projectPath: string,
): Promise<{ file: string; status: string }[]> {
  const result = await electroview.rpc!.request.getGitStatus({ projectPath });
  return result.changes;
}
