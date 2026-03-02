import {
	convertToModelMessages,
	stepCountIs,
	streamText,
	type UIMessage,
} from "ai";
import { createBashTool } from "bash-tool";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { getMistralClient } from "./chat-server";

const BUILD_SYSTEM_PROMPT = `You are Golb Build Mode, a senior software engineer working directly in the user's repository.

You can read files, modify files, and run shell commands to implement requested changes.

Operating rules:
- Explore relevant code before editing.
- Keep changes minimal and scoped to the user request.
- Follow existing code style and patterns.
- Validate with targeted commands when useful.
- Avoid destructive commands (for example: rm -rf, git reset --hard, force pushes) unless user explicitly asks.
- Show progress as you work:
  - Before tool calls, briefly state what you will do next.
  - After each meaningful tool step, report outcome in plain language.
  - End with a concise final summary of files changed and verification run.
`;

type GenerateBuildResponseParams = {
	projectPath: string;
	messages: UIMessage[];
};

type LocalFileWrite = {
	path: string;
	content: string | Buffer;
};

function createLocalSandbox(projectPath: string) {
	function resolveProjectPath(pathLike: string): string {
		const resolved = resolve(projectPath, pathLike);
		if (resolved !== projectPath && !resolved.startsWith(`${projectPath}/`)) {
			throw new Error(`Path is outside project root: ${pathLike}`);
		}
		return resolved;
	}

	return {
		async executeCommand(command: string) {
			const proc = Bun.spawn(["/bin/zsh", "-lc", command], {
				cwd: projectPath,
				stdout: "pipe",
				stderr: "pipe",
			});
			const stdout = await new Response(proc.stdout).text();
			const stderr = await new Response(proc.stderr).text();
			const exitCode = await proc.exited;
			return { stdout, stderr, exitCode };
		},
		async readFile(pathLike: string) {
			const absolutePath = resolveProjectPath(pathLike);
			return readFile(absolutePath, "utf8");
		},
		async writeFiles(files: LocalFileWrite[]) {
			for (const file of files) {
				const absolutePath = resolveProjectPath(file.path);
				await mkdir(dirname(absolutePath), { recursive: true });
				await writeFile(absolutePath, file.content);
			}
		},
	};
}

export async function generateBuildResponse({
	projectPath,
	messages,
}: GenerateBuildResponseParams) {
	const normalizedProjectPath = projectPath.trim();
	if (!normalizedProjectPath) {
		throw new Error("Builder agent requires a valid projectPath.");
	}

	let toolsConfig: Awaited<ReturnType<typeof createBashTool>>;
	try {
		toolsConfig = await createBashTool({
			destination: normalizedProjectPath,
			sandbox: createLocalSandbox(normalizedProjectPath),
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		throw new Error(`Failed to initialize builder tools: ${message}`);
	}

	const mistral = await getMistralClient(false);

	return streamText({
		model: mistral("codestral-latest"),
		system: BUILD_SYSTEM_PROMPT,
		messages: await convertToModelMessages(messages),
		tools: toolsConfig.tools,
		stopWhen: stepCountIs(20),
	});
}
