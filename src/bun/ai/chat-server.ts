import { createMistral } from "@ai-sdk/mistral";
import {
	UI_MESSAGE_STREAM_HEADERS,
	convertToModelMessages,
	generateText,
	streamText,
	type UIMessage,
} from "ai";

const mistral = createMistral({
	apiKey: "m4bRvDtPFUztCe1oGKtYZ20kBw204Iud",
});

import { and, desc, eq, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../db";
import { generatePlan } from "./plan-agent";
import {
	historyEvents as historyEventsTable,
	messages as messagesTable,
	projects as projectsTable,
	sessions as sessionsTable,
} from "../db/schema";

const CHAT_PORT = 3141;

type ActiveStream = {
	chunks: string[];
	done: boolean;
	onChunk: Set<(chunk: string) => void>;
	onDone: Set<() => void>;
};

const activeStreams = new Map<string, ActiveStream>();

const SYSTEM_PROMPT = `You are Golb, an expert AI coding assistant embedded in a desktop IDE. You help developers write, debug, and understand code. Be concise, direct, and technically accurate. When writing code, use best practices and explain your reasoning briefly.`;

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
	}: {
		messages: UIMessage[];
		sessionId: string;
		projectPath: string;
	} = body;

	const projectId = await ensureProject(projectPath);
	await ensureSession(sessionId, projectId);

	const result = streamText({
		model: mistral("mistral-medium-latest"),
		system: SYSTEM_PROMPT,
		messages: await convertToModelMessages(messages),
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
				await saveMessages(sessionId, finalMessages);

				const firstUserMsg = finalMessages.find((m) => m.role === "user");
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

			return new Response("Not found", {
				status: 404,
				headers: corsHeaders(),
			});
		},
	});

	console.log(`Chat server running on http://localhost:${CHAT_PORT}`);
}
