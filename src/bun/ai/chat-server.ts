import { createMistral } from "@ai-sdk/mistral";
import {
	UI_MESSAGE_STREAM_HEADERS,
	generateText,
	type UIMessage,
} from "ai";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

import { and, desc, eq, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../db";
import { generateBuildResponse } from "./build-agent";
import { generatePlan } from "./plan-agent";
import {
	historyEvents as historyEventsTable,
	messages as messagesTable,
	projects as projectsTable,
	sessions as sessionsTable,
} from "../db/schema";

const CHAT_PORT = 3141;
const DEBUG_SYSTEM_INSTRUCTION = `You are in Debug Mode.
Prioritize root-cause analysis, reproduction steps, and minimal safe fixes.
When proposing changes, focus on regressions, failure modes, and concrete verification steps.`;
const PLAN_EXECUTION_SYSTEM_PREFIX = `Use the approved implementation plan below as mandatory context for this build execution.

Execute the steps in order, keep changes scoped to the plan, and call out any blockers immediately.

Approved plan:`;

type ActiveStream = {
	chunks: string[];
	done: boolean;
	onChunk: Set<(chunk: string) => void>;
	onDone: Set<() => void>;
};

const activeStreams = new Map<string, ActiveStream>();
const MISTRAL_API_KEY_ENV_VAR = "MISTRAL_API_KEY";
const CONFIG_DIRECTORY = ".golb";
const CONFIG_FILE_NAME = "config.json";

type GolbConfig = {
	mistralApiKey?: string;
};

let cachedMistralApiKey: string | null = null;
let cachedMistralClient: ReturnType<typeof createMistral> | null = null;
let mistralClientPromise: Promise<ReturnType<typeof createMistral>> | null = null;

function normalizeApiKey(value: string | null | undefined): string | null {
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : null;
}

function isMissingMistralApiKeyError(error: unknown): boolean {
	return (
		error instanceof Error &&
		error.message.toLowerCase().includes("mistral api key is required")
	);
}

function getConfigFilePath(): string {
	const homeDirectory = Bun.env.HOME ?? process.env.HOME;
	if (!homeDirectory || homeDirectory.trim().length === 0) {
		throw new Error(
			"Unable to resolve HOME directory for Mistral API key storage.",
		);
	}
	return join(homeDirectory, CONFIG_DIRECTORY, CONFIG_FILE_NAME);
}

async function loadSavedMistralApiKey(): Promise<string | null> {
	try {
		const raw = await readFile(getConfigFilePath(), "utf8");
		const parsed = JSON.parse(raw) as GolbConfig;
		return normalizeApiKey(parsed.mistralApiKey);
	} catch {
		return null;
	}
}

async function saveMistralApiKey(apiKey: string): Promise<void> {
	const configFilePath = getConfigFilePath();
	let nextConfig: GolbConfig = {};

	try {
		const existingRaw = await readFile(configFilePath, "utf8");
		const parsed = JSON.parse(existingRaw);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			nextConfig = parsed as GolbConfig;
		}
	} catch {
		// If config doesn't exist or is invalid, overwrite with a minimal valid config.
	}

	nextConfig.mistralApiKey = apiKey;
	await mkdir(dirname(configFilePath), { recursive: true });
	await writeFile(configFilePath, `${JSON.stringify(nextConfig, null, 2)}\n`);
}

async function promptForMistralApiKey(): Promise<string> {
	if (!input.isTTY || !output.isTTY) {
		throw new Error(
			"Mistral API key is required. Set MISTRAL_API_KEY or start Golb from an interactive terminal once to save it.",
		);
	}

	const readline = createInterface({ input, output });
	try {
		const answer = await readline.question("Enter your Mistral API key: ");
		const apiKey = normalizeApiKey(answer);
		if (!apiKey) {
			throw new Error("Mistral API key cannot be empty.");
		}
		return apiKey;
	} finally {
		readline.close();
	}
}

async function resolveMistralApiKey(allowPrompt = true): Promise<string> {
	if (cachedMistralApiKey) {
		return cachedMistralApiKey;
	}

	const fromEnv = normalizeApiKey(
		Bun.env[MISTRAL_API_KEY_ENV_VAR] ?? process.env[MISTRAL_API_KEY_ENV_VAR],
	);
	if (fromEnv) {
		cachedMistralApiKey = fromEnv;
		return fromEnv;
	}

	const fromConfig = await loadSavedMistralApiKey();
	if (fromConfig) {
		cachedMistralApiKey = fromConfig;
		return fromConfig;
	}

	if (!allowPrompt) {
		throw new Error(
			"Mistral API key is required. Configure it from the app before continuing.",
		);
	}

	const promptedApiKey = await promptForMistralApiKey();
	await saveMistralApiKey(promptedApiKey);
	cachedMistralApiKey = promptedApiKey;
	return promptedApiKey;
}

export async function getMistralClient(
	allowPrompt = true,
): Promise<ReturnType<typeof createMistral>> {
	if (cachedMistralClient) {
		return cachedMistralClient;
	}

	if (!mistralClientPromise) {
		mistralClientPromise = (async () => {
			const apiKey = await resolveMistralApiKey(allowPrompt);
			const client = createMistral({ apiKey });
			cachedMistralClient = client;
			return client;
		})().finally(() => {
			mistralClientPromise = null;
		});
	}

	return mistralClientPromise;
}

async function hasConfiguredMistralApiKey(): Promise<boolean> {
	const fromEnv = normalizeApiKey(
		Bun.env[MISTRAL_API_KEY_ENV_VAR] ?? process.env[MISTRAL_API_KEY_ENV_VAR],
	);
	if (fromEnv) {
		return true;
	}
	const fromConfig = await loadSavedMistralApiKey();
	return fromConfig !== null;
}

async function setMistralApiKey(apiKey: string): Promise<void> {
	await saveMistralApiKey(apiKey);
	cachedMistralApiKey = apiKey;
	cachedMistralClient = createMistral({ apiKey });
}

function corsHeaders(): Record<string, string> {
	return {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "POST, GET, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, User-Agent",
	};
}

async function ensureProject(projectPath: string): Promise<string> {
	const db = getDb();
	const existing = await db
		.select({ id: projectsTable.id })
		.from(projectsTable)
		.where(eq(projectsTable.path, projectPath))
		.limit(1);

	if (existing.length > 0) {
		return existing[0].id;
	}

	const name = projectPath.split("/").pop() ?? "project";
	const id = nanoid();
	await db.insert(projectsTable).values({
		id,
		name,
		path: projectPath,
		createdAt: new Date(),
	});
	return id;
}

async function ensureSession(
	sessionId: string,
	projectId: string,
): Promise<void> {
	const db = getDb();
	const existing = await db
		.select({ id: sessionsTable.id })
		.from(sessionsTable)
		.where(eq(sessionsTable.id, sessionId))
		.limit(1);

	if (existing.length > 0) return;

	await db.insert(sessionsTable).values({
		id: sessionId,
		projectId,
		createdAt: new Date(),
	});
}

async function saveMessages(
	sessionId: string,
	finalMessages: UIMessage[],
): Promise<void> {
	const db = getDb();

	const existingIds = new Set(
		(
			await db
				.select({ id: messagesTable.id })
				.from(messagesTable)
				.where(eq(messagesTable.sessionId, sessionId))
		).map((r) => r.id),
	);

	for (const m of finalMessages) {
		const id = m.id || nanoid();
		if (existingIds.has(id)) continue;

		await db
			.insert(messagesTable)
			.values({
				id,
				sessionId,
				role: m.role as "user" | "assistant" | "system",
				parts: m.parts,
				createdAt: new Date(),
			})
			.onConflictDoNothing();

		existingIds.add(id);
	}
}

async function generateSessionTitle(
	sessionId: string,
	firstUserMessage: string,
): Promise<void> {
	let mistral: ReturnType<typeof createMistral>;
	try {
		mistral = await getMistralClient(false);
	} catch (error) {
		if (isMissingMistralApiKeyError(error)) {
			return;
		}
		throw error;
	}

	const { text } = await generateText({
		model: mistral("mistral-small-latest"),
		prompt: `Generate a very short title (2 to 4 words max) for a chat conversation that starts with this user message. Return ONLY the title, no quotes, no punctuation at the end.\n\nUser message: "${firstUserMessage}"`,
	});

	const title = text
		.trim()
		.replace(/^["']|["']$/g, "")
		.slice(0, 48);
	if (title) {
		await getDb()
			.update(sessionsTable)
			.set({ title })
			.where(eq(sessionsTable.id, sessionId));
	}
}

async function handleChatRequest(req: Request): Promise<Response> {
	const body = await req.json();
	const {
		messages,
		sessionId,
		projectPath,
		mode,
		planContext,
	}: {
		messages: UIMessage[];
		sessionId: string;
		projectPath: string;
		mode?: "build" | "debug";
		planContext?: string;
	} = body;

	const projectId = await ensureProject(projectPath);
	await ensureSession(sessionId, projectId);

	const requestMode = mode === "debug" ? "debug" : "build";
	const normalizedPlanContext =
		typeof planContext === "string" && planContext.trim().length > 0
			? planContext.trim()
			: null;
	const debugSystemMessage: UIMessage | null =
		requestMode === "debug"
			? {
					id: `debug-system-${sessionId}`,
					role: "system",
					parts: [{ type: "text", text: DEBUG_SYSTEM_INSTRUCTION }],
				}
			: null;
	const planSystemMessage: UIMessage | null =
		requestMode === "build" && normalizedPlanContext !== null
			? {
					id: `plan-system-${sessionId}`,
					role: "system",
					parts: [
						{
							type: "text",
							text: `${PLAN_EXECUTION_SYSTEM_PREFIX}\n${normalizedPlanContext}`,
						},
					],
				}
			: null;
	const injectedSystemMessages: UIMessage[] = [
		debugSystemMessage,
		planSystemMessage,
	].filter((message): message is UIMessage => message !== null);
	const generationMessages =
		injectedSystemMessages.length > 0
			? [...injectedSystemMessages, ...messages]
			: messages;

	const result = await generateBuildResponse({
		projectPath,
		messages: generationMessages,
	});

	return result.toUIMessageStreamResponse({
		headers: corsHeaders(),
		originalMessages: messages,
		consumeSseStream({ stream }) {
			const entry: ActiveStream = {
				chunks: [],
				done: false,
				onChunk: new Set(),
				onDone: new Set(),
			};
			activeStreams.set(sessionId, entry);

			const reader = stream.getReader();
			(async () => {
				try {
					for (;;) {
						const { done, value } = await reader.read();
						if (done) break;
						entry.chunks.push(value);
						for (const cb of entry.onChunk) cb(value);
					}
				} finally {
					entry.done = true;
					for (const cb of entry.onDone) cb();
					setTimeout(() => {
						if (activeStreams.get(sessionId) === entry) {
							activeStreams.delete(sessionId);
						}
					}, 30_000);
				}
			})();
		},
		onFinish: async ({ messages: finalMessages }) => {
			try {
				const injectedSystemMessageIds = new Set(
					injectedSystemMessages.map((message) => message.id),
				);
				const messagesToPersist =
					injectedSystemMessageIds.size > 0
						? finalMessages.filter((message) =>
								!injectedSystemMessageIds.has(message.id),
							)
						: finalMessages;
				await saveMessages(sessionId, messagesToPersist);

				const firstUserMsg = messagesToPersist.find((m) => m.role === "user");
				if (firstUserMsg) {
					const textPart = firstUserMsg.parts.find(
						(p): p is Extract<typeof p, { type: "text" }> => p.type === "text",
					);
					if (textPart) {
						const db = getDb();
						const session = await db
							.select({ title: sessionsTable.title })
							.from(sessionsTable)
							.where(eq(sessionsTable.id, sessionId))
							.limit(1);

						if (session.length > 0 && !session[0].title) {
							const fallback =
								textPart.text.length > 50
									? `${textPart.text.slice(0, 47)}...`
									: textPart.text;
							await db
								.update(sessionsTable)
								.set({ title: fallback })
								.where(eq(sessionsTable.id, sessionId));
						}

						generateSessionTitle(sessionId, textPart.text).catch((err) =>
							console.error("Failed to generate session title:", err),
						);
					}
				}
			} catch (err) {
				console.error("Failed to save messages:", err);
			}
		},
	});
}

async function handlePlanRequest(req: Request): Promise<Response> {
	const body = await req.json();
	const {
		prompt,
		projectPath,
		sessionId,
	}: { prompt: string; projectPath: string; sessionId: string } = body;
	const projectId = await ensureProject(projectPath);
	await ensureSession(sessionId, projectId);

	const latestPlanEvent = await getDb()
		.select({ metadata: historyEventsTable.metadata })
		.from(historyEventsTable)
		.where(
			and(
				eq(historyEventsTable.sessionId, sessionId),
				or(
					eq(historyEventsTable.type, "plan_created"),
					eq(historyEventsTable.type, "plan_revision"),
				),
			),
		)
		.orderBy(desc(historyEventsTable.createdAt))
		.limit(1);

	const latestMetadata = latestPlanEvent[0]?.metadata;
	const previousPlan =
		latestMetadata &&
		typeof latestMetadata === "object" &&
		!Array.isArray(latestMetadata) &&
		typeof latestMetadata.content === "string"
			? latestMetadata.content
			: undefined;
	const requestMode = previousPlan ? "refine" : "create";
	const responseMode = requestMode === "create" ? "created" : "revised";

	const plan = await generatePlan({
		prompt,
		projectPath,
		currentPlan: previousPlan,
		requestMode,
	});
	const assistantText =
		responseMode === "created"
			? "Plan generated. Open the Plan tab to review the full plan."
			: "Plan updated. Open the Plan tab to review the latest version.";

	const planMessages: UIMessage[] = [
		{
			id: nanoid(),
			role: "user",
			parts: [{ type: "text", text: prompt }],
		},
		{
			id: nanoid(),
			role: "assistant",
			parts: [
				{
					type: "text",
					text: assistantText,
				},
			],
		},
	];
	await saveMessages(sessionId, planMessages);

	const db = getDb();
	const session = await db
		.select({ title: sessionsTable.title })
		.from(sessionsTable)
		.where(eq(sessionsTable.id, sessionId))
		.limit(1);
	if (session.length > 0 && !session[0].title) {
		const fallback = prompt.length > 50 ? `${prompt.slice(0, 47)}...` : prompt;
		await db
			.update(sessionsTable)
			.set({ title: fallback })
			.where(eq(sessionsTable.id, sessionId));
	}
	generateSessionTitle(sessionId, prompt).catch((err) =>
		console.error("Failed to generate session title:", err),
	);

	await getDb().insert(historyEventsTable).values({
		id: nanoid(),
		projectId,
		sessionId,
		type: responseMode === "created" ? "plan_created" : "plan_revision",
		title: responseMode === "created" ? "Plan generated" : "Plan revised",
		metadata:
			responseMode === "created"
				? { content: plan, prompt }
				: { content: plan, previousContent: previousPlan, prompt },
		createdAt: new Date(),
	});

	return new Response(JSON.stringify({ plan, mode: responseMode }), {
		status: 200,
		headers: { ...corsHeaders(), "Content-Type": "application/json" },
	});
}

async function handleMistralKeyStatusRequest(): Promise<Response> {
	const configured = await hasConfiguredMistralApiKey();
	return new Response(JSON.stringify({ configured }), {
		status: 200,
		headers: { ...corsHeaders(), "Content-Type": "application/json" },
	});
}

async function handleMistralKeySaveRequest(req: Request): Promise<Response> {
	const body = (await req.json()) as { apiKey?: unknown };
	const normalizedApiKey =
		typeof body.apiKey === "string" ? normalizeApiKey(body.apiKey) : null;

	if (!normalizedApiKey) {
		return new Response(
			JSON.stringify({ error: "A non-empty Mistral API key is required." }),
			{
				status: 400,
				headers: { ...corsHeaders(), "Content-Type": "application/json" },
			},
		);
	}

	await setMistralApiKey(normalizedApiKey);
	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: { ...corsHeaders(), "Content-Type": "application/json" },
	});
}

export function startChatServer(): void {
	Bun.serve({
		port: CHAT_PORT,
		fetch: async (req) => {
			if (req.method === "OPTIONS") {
				return new Response(null, { status: 204, headers: corsHeaders() });
			}

			const url = new URL(req.url);

			if (
				req.method === "GET" &&
				url.pathname.startsWith("/api/chat/") &&
				url.pathname.endsWith("/stream")
			) {
				const sid = url.pathname.split("/")[3];
				const entry = activeStreams.get(sid);

				if (!entry || entry.done) {
					return new Response(null, {
						status: 204,
						headers: corsHeaders(),
					});
				}

				const encoder = new TextEncoder();
				const stream = new ReadableStream<Uint8Array>({
					start(controller) {
						for (const chunk of entry.chunks) {
							controller.enqueue(encoder.encode(chunk));
						}

						if (entry.done) {
							controller.close();
							return;
						}

						const onChunk = (chunk: string) => {
							controller.enqueue(encoder.encode(chunk));
						};
						const onDone = () => {
							entry.onChunk.delete(onChunk);
							entry.onDone.delete(onDone);
							controller.close();
						};
						entry.onChunk.add(onChunk);
						entry.onDone.add(onDone);
					},
				});

				return new Response(stream, {
					headers: {
						...corsHeaders(),
						...(UI_MESSAGE_STREAM_HEADERS as Record<string, string>),
					},
				});
			}

			if (url.pathname === "/api/chat" && req.method === "POST") {
				try {
					return await handleChatRequest(req);
				} catch (err) {
					console.error("Chat server error:", err);
					return new Response(
						JSON.stringify({ error: "Internal server error" }),
						{
							status: 500,
							headers: { ...corsHeaders(), "Content-Type": "application/json" },
						},
					);
				}
			}

			if (url.pathname === "/api/plan" && req.method === "POST") {
				try {
					return await handlePlanRequest(req);
				} catch (err) {
					console.error("Plan server error:", err);
					const errorLike = err as {
						statusCode?: unknown;
						message?: unknown;
						errors?: unknown;
					};
					let status = 500;
					let message =
						err instanceof Error ? err.message : "Unknown plan server error";

					if (typeof errorLike.statusCode === "number") {
						status = errorLike.statusCode;
					}

					if (Array.isArray(errorLike.errors)) {
						for (const nestedError of errorLike.errors) {
							if (
								nestedError &&
								typeof nestedError === "object" &&
								typeof (nestedError as { statusCode?: unknown }).statusCode ===
									"number"
							) {
								status = (nestedError as { statusCode: number }).statusCode;
								break;
							}
						}
					}

					if (message.toLowerCase().includes("rate limit")) {
						status = 429;
						message = "AI provider rate limit exceeded. Please retry shortly.";
					}

					return new Response(
						JSON.stringify({ error: message }),
						{
							status,
							headers: { ...corsHeaders(), "Content-Type": "application/json" },
						},
					);
				}
			}

			if (url.pathname === "/api/mistral-key" && req.method === "GET") {
				try {
					return await handleMistralKeyStatusRequest();
				} catch (err) {
					console.error("Mistral key status error:", err);
					return new Response(
						JSON.stringify({ error: "Failed to read Mistral key status" }),
						{
							status: 500,
							headers: { ...corsHeaders(), "Content-Type": "application/json" },
						},
					);
				}
			}

			if (url.pathname === "/api/mistral-key" && req.method === "POST") {
				try {
					return await handleMistralKeySaveRequest(req);
				} catch (err) {
					console.error("Mistral key save error:", err);
					return new Response(
						JSON.stringify({ error: "Failed to save Mistral API key" }),
						{
							status: 500,
							headers: { ...corsHeaders(), "Content-Type": "application/json" },
						},
					);
				}
			}

			return new Response("Not found", {
				status: 404,
				headers: corsHeaders(),
			});
		},
	});

	console.log(`Chat server running on http://localhost:${CHAT_PORT}`);
}
