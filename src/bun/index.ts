import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { BrowserView, BrowserWindow, Updater, Utils } from "electrobun/bun";
import type { AppRPC } from "../shared/types";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

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
				const filtered = entries.filter((e) => !hidden.has(e.name) && !e.name.startsWith("."));
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

			getGitBranches: async ({
				projectPath,
			}: {
				projectPath: string;
			}) => {
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
							if (entry.name.toLowerCase().includes(q)) {
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

			getGitStatus: async ({
				projectPath,
			}: {
				projectPath: string;
			}) => {
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
		},
		messages: {},
	},
});

// Create the main application window
const url = await getMainViewUrl();

new BrowserWindow({
	title: "Golb",
	url,
	rpc,
	frame: {
		width: 1200,
		height: 800,
		x: 200,
		y: 200,
	},
	titleBarStyle: "hiddenInset",
});

console.log("Golb started!");
