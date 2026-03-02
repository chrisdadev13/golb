import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
	Bug,
	CircleDashed,
	FlaskConical,
	FolderOpen,
	GitBranch,
	Loader2,
	PencilLine,
} from "lucide-react";
import { nanoid } from "nanoid";
import { codeToHtml } from "shiki";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import {
	Select,
	SelectItem,
	SelectPopup,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { ContextItem } from "@/lib/context-types";
import {
	getActiveSession,
	getGitBranches,
	getGitStatus,
	getSessionPlan,
	getSessionMessages,
	getSessions,
} from "@/lib/rpc";
import { useSidebarOpen } from "@/lib/sidebar-state";
import { cn } from "@/lib/utils";
import {
	ContextPopover,
	type ContextPopoverHandle,
} from "../components/ai-elements/context-popover";
import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
} from "../components/ai-elements/conversation";
import {
	MentionInput,
	type MentionInputHandle,
} from "../components/ai-elements/mention-input";
import {
	Message,
	MessageContent,
	MessageResponse,
} from "../components/ai-elements/message";
import {
	PromptInput,
	PromptInputButton,
	PromptInputFooter,
	PromptInputSubmit,
	PromptInputTools,
} from "../components/ai-elements/prompt-input";
import { WorkspaceSidebar } from "../components/workspace-sidebar";

const promptModeItems: Array<{
	label: string;
	value: "build" | "plan" | "debug" | "experiment";
	icon: React.ComponentType<{ className?: string }>;
}> = [
	{ label: "Build", value: "build", icon: CircleDashed },
	{ label: "Plan", value: "plan", icon: PencilLine },
	{ label: "Experiment", value: "experiment", icon: FlaskConical },
	{ label: "Debug", value: "debug", icon: Bug },
];

type ChatHeaderTab = "chat" | "plan" | "experiments";

type PlanPreview = {
	title: string;
	summary: string;
	items: string[];
	remainingCount: number;
};

function buildPlanPreview(plan: string | null, fallbackTitle: string): PlanPreview {
	if (!plan) {
		return {
			title: fallbackTitle,
			summary: "A plan was generated for this session.",
			items: [],
			remainingCount: 0,
		};
	}

	const lines = plan
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	const headingLine = lines.find((line) => /^#{1,3}\s+/.test(line));
	const title = headingLine
		? headingLine.replace(/^#{1,3}\s+/, "").trim()
		: fallbackTitle;

	const summaryLine = lines.find(
		(line) =>
			!/^#{1,3}\s+/.test(line) &&
			!/^[-*]\s+/.test(line) &&
			!/^(\d+)\)\s+/.test(line),
	);
	const summary = summaryLine ?? "A plan was generated for this session.";

	const allItems = lines
		.filter((line) => /^[-*]\s+/.test(line))
		.map((line) => line.replace(/^[-*]\s+/, "").trim())
		.filter((line) => line.length > 0);
	const items = allItems.slice(0, 4);

	return {
		title,
		summary,
		items,
		remainingCount: Math.max(0, allItems.length - items.length),
	};
}

function extractLanguageFromClassName(className?: string): string {
	if (!className) return "plaintext";
	const match = className.match(/language-([a-zA-Z0-9_-]+)/);
	return match?.[1] ?? "plaintext";
}

function PlanCodeBlock({
	className,
	children,
}: {
	className?: string;
	children: string;
}) {
	const code = children.replace(/\n$/, "");
	const language = extractLanguageFromClassName(className);
	const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
	const [isDark, setIsDark] = useState(false);

	useEffect(() => {
		if (typeof document === "undefined") return;
		setIsDark(document.documentElement.classList.contains("dark"));
	}, []);

	useEffect(() => {
		let alive = true;
		void codeToHtml(code, {
			lang: language,
			theme: isDark ? "github-dark" : "github-light",
		})
			.then((html) => {
				if (alive) setHighlightedHtml(html);
			})
			.catch(() => {
				if (alive) setHighlightedHtml(null);
			});

		return () => {
			alive = false;
		};
	}, [code, isDark, language]);

	if (!highlightedHtml) {
		return (
			<pre className="mt-1.5 overflow-x-auto rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2 shadow-sm">
				<code className="text-[11px] leading-4">{code}</code>
			</pre>
		);
	}

	return (
		<div
			className="mt-1.5 overflow-hidden rounded-lg border border-border/60 bg-muted/20 text-[11px] shadow-sm [&_pre]:overflow-x-auto [&_pre]:px-2.5 [&_pre]:py-2 [&_code]:text-[11px] [&_code]:leading-4"
			/* biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki-generated HTML is used only for syntax highlighting. */
			dangerouslySetInnerHTML={{ __html: highlightedHtml }}
		/>
	);
}

function PlanMarkdown({ content }: { content: string }) {
	return (
		<div className="text-[13px] leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5">
			<ReactMarkdown
				remarkPlugins={[remarkGfm, remarkBreaks]}
				components={{
					h1({ children }) {
						return (
							<h3 className="my-2 text-lg font-semibold tracking-tight">{children}</h3>
						);
					},
					h2({ children }) {
						return (
							<h4 className="my-2 text-base font-semibold tracking-tight">{children}</h4>
						);
					},
					h3({ children }) {
						return (
							<h5 className="my-1.5 text-sm font-semibold tracking-tight">{children}</h5>
						);
					},
					code({ className, children }) {
						const code = String(children);
						const language = extractLanguageFromClassName(className);
						const isBlock = language !== "plaintext" || code.includes("\n");
						if (!isBlock) {
							return (
								<code className="rounded-md bg-muted/45 px-1 py-0.5 font-mono text-[11px] leading-4">
									{code}
								</code>
							);
						}
						return (
							<PlanCodeBlock className={className}>
								{code}
							</PlanCodeBlock>
						);
					},
				}}
			>
				{content}
			</ReactMarkdown>
		</div>
	);
}

function ChatHeader({
	title,
	activeTab,
	onTabChange,
}: {
	title: string;
	activeTab: ChatHeaderTab;
	onTabChange: (tab: ChatHeaderTab) => void;
}) {
	const tabs: { label: string; value: ChatHeaderTab }[] = [
		{ label: "Chat", value: "chat" },
		{ label: "Plan", value: "plan" },
		{ label: "Experiments", value: "experiments" },
	];

	return (
		<div className="shrink-0 pt-4 pb-2">
			<div className="mx-auto w-full max-w-2xl px-6 flex items-center justify-between">
				<span className="text-sm font-medium truncate text-foreground/80">
					{title}
				</span>
				<div className="shrink-0 flex items-center rounded-md border border-border overflow-hidden">
					{tabs.map((tab) => (
						<button
							key={tab.value}
							type="button"
							onClick={() => onTabChange(tab.value)}
							className={cn(
								"px-2.5 py-1 text-xs font-medium transition-colors",
								activeTab === tab.value
									? "bg-foreground/10 text-foreground"
									: "text-muted-foreground hover:text-foreground hover:bg-muted",
							)}
						>
							{tab.label}
						</button>
					))}
				</div>
			</div>
		</div>
	);
}

function ChatSession({
	sessionId,
	sessionTitle,
	projectPath,
	projectName,
	active,
	initialMessages,
	onStreamingChange,
	onFinish,
	branches,
	currentBranch,
	onBranchChange,
	changesCount,
}: {
	sessionId: string;
	sessionTitle: string;
	projectPath: string;
	projectName: string;
	active: boolean;
	initialMessages: UIMessage[] | undefined;
	onStreamingChange: (sessionId: string, streaming: boolean) => void;
	onFinish: () => void;
	branches: { name: string; current: boolean }[];
	currentBranch: string | null;
	onBranchChange: (branch: string | null) => void;
	changesCount: number;
}) {
	const openPlanHints = [
		"Open the Plan tab to review the full plan.",
		"Open the Plan tab to review the latest version.",
	];
	const transport = useMemo(
		() =>
			new DefaultChatTransport({
				api: "http://localhost:3141/api/chat",
				body: () => ({ sessionId, projectPath }),
				prepareReconnectToStreamRequest: ({ id }) => ({
					api: `http://localhost:3141/api/chat/${id}/stream`,
				}),
			}),
		[sessionId, projectPath],
	);

	const { messages, sendMessage, status } = useChat({
		id: sessionId,
		transport,
		messages: initialMessages,
		resume: true,
		onFinish: () => {
			onFinish();
		},
	});

	const prevStreamingRef = useRef(false);
	useEffect(() => {
		const isStreaming = status === "streaming" || status === "submitted";
		if (isStreaming !== prevStreamingRef.current) {
			prevStreamingRef.current = isStreaming;
			onStreamingChange(sessionId, isStreaming);
		}
	}, [status, sessionId, onStreamingChange]);

	const [promptMode, setPromptMode] = useState<
		"build" | "plan" | "debug" | "experiment"
	>("build");

	const [popoverOpen, setPopoverOpen] = useState(false);
	const [popoverAnchor, setPopoverAnchor] = useState<Element | DOMRect | null>(
		null,
	);
	const [atQuery, setAtQuery] = useState("");
	const mentionInputRef = useRef<MentionInputHandle>(null);
	const popoverHandleRef = useRef<ContextPopoverHandle>(null);
	const contextButtonRef = useRef<Element | null>(null);
	const [headerTab, setHeaderTab] = useState<ChatHeaderTab>("chat");
	const [planContent, setPlanContent] = useState<string | null>(null);
	const [planLoading, setPlanLoading] = useState(false);
	const [planChatMessages, setPlanChatMessages] = useState<UIMessage[]>([]);

	const handleSubmit = useCallback(
		({ text: formText }: { text: string }) => {
			const text =
				formText.trim() || mentionInputRef.current?.getText()?.trim() || "";
			if (!text) return;
			mentionInputRef.current?.clear();

			if (promptMode === "plan") {
				setHeaderTab("plan");
				setPlanContent(null);
				setPlanLoading(true);

				void (async () => {
					try {
						const response = await fetch("http://localhost:3141/api/plan", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ prompt: text, projectPath, sessionId }),
						});

						if (!response.ok) {
							let errorMessage = `Plan request failed with status ${response.status}`;
							try {
								const errorPayload = (await response.json()) as {
									error?: string;
								};
								if (errorPayload.error) {
									errorMessage = `${errorMessage}: ${errorPayload.error}`;
								}
							} catch {
								// Keep default status-based error when response is not JSON.
							}
							throw new Error(errorMessage);
						}

						const data = (await response.json()) as {
							plan?: string;
							mode?: "created" | "revised";
						};
						const mode = data.mode === "revised" ? "revised" : "created";
						const nextPlan = data.plan?.trim();
						setPlanContent(nextPlan && nextPlan.length > 0 ? nextPlan : "No plan generated.");
						const assistantMessage =
							mode === "revised"
								? "Plan updated. Open the Plan tab to review the latest version."
								: "Plan generated. Open the Plan tab to review the full plan.";
						setPlanChatMessages([
							{
								id: `${sessionId}-plan-user-${Date.now()}`,
								role: "user",
								parts: [{ type: "text", text }],
							},
							{
								id: `${sessionId}-plan-assistant-${Date.now()}`,
								role: "assistant",
								parts: [
									{
										type: "text",
										text: assistantMessage,
									},
								],
							},
						]);
						onFinish();
					} catch (error) {
						console.error("Failed to generate plan:", error);
						setPlanContent("Failed to generate a plan. Please try again.");
					} finally {
						setPlanLoading(false);
					}
				})();

				return;
			}

			sendMessage({ text });
		},
		[onFinish, projectPath, promptMode, sendMessage, sessionId],
	);

	const handleMentionSubmit = useCallback(
		(text: string, _contextItems: ContextItem[]) => {
			if (!text.trim()) return;
			handleSubmit({ text });
		},
		[handleSubmit],
	);

	const handleAtTrigger = useCallback((rect: DOMRect, query: string) => {
		setPopoverAnchor(rect);
		setAtQuery(query);
		setPopoverOpen(true);
	}, []);

	const handleAtDismiss = useCallback(() => {
		setPopoverOpen(false);
		setAtQuery("");
	}, []);

	const handleContextButtonClick = useCallback((e: React.MouseEvent) => {
		contextButtonRef.current = e.currentTarget as Element;
		setPopoverAnchor(e.currentTarget as Element);
		setAtQuery("");
		setPopoverOpen(true);
	}, []);

	const handleAtKeyDown = useCallback((key: string): boolean => {
		const handle = popoverHandleRef.current;
		if (!handle) return false;
		if (key === "ArrowUp" || key === "ArrowDown") {
			handle.moveHighlight(key === "ArrowUp" ? "up" : "down");
			return true;
		}
		if (key === "Enter" || key === "Tab") {
			return handle.selectHighlighted();
		}
		if (key === "ArrowRight") {
			return handle.expandHighlighted();
		}
		return false;
	}, []);

	const handleSelectContextItem = useCallback((item: ContextItem) => {
		mentionInputRef.current?.insertBadge(item);
	}, []);

	const handleUploadImage = useCallback(() => {
		const fileInput = document.querySelector<HTMLInputElement>(
			'input[type="file"][aria-label="Upload files"]',
		);
		fileInput?.click();
	}, []);

	const planPreview = useMemo(
		() => buildPlanPreview(planContent, sessionTitle),
		[planContent, sessionTitle],
	);
	const conversationMessages =
		messages.length > 0 ? messages : planChatMessages;
	const hasMessages = conversationMessages.length > 0;
	const hasPlan = planLoading || planContent !== null;

	useEffect(() => {
		let cancelled = false;
		setPlanLoading(true);
		setPlanChatMessages([]);
		getSessionPlan(sessionId)
			.then((plan) => {
				if (!cancelled) {
					setPlanContent(plan);
				}
			})
			.catch(() => {
				if (!cancelled) {
					setPlanContent(null);
				}
			})
			.finally(() => {
				if (!cancelled) {
					setPlanLoading(false);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [sessionId]);

	return (
		<div
			className="flex-1 min-w-0 flex flex-col"
			style={active ? undefined : { display: "none" }}
		>
			{(hasMessages || hasPlan) && (
				<ChatHeader
					title={sessionTitle}
					activeTab={headerTab}
					onTabChange={setHeaderTab}
				/>
			)}
			{headerTab === "plan" ? (
				<div className="flex-1 min-h-0 overflow-y-auto">
					<div className="mx-auto w-full max-w-2xl px-6 pt-6 pb-4">
						{planLoading ? (
							<div className="flex items-center gap-2 text-sm text-muted-foreground">
								<Loader2 className="size-4 animate-spin" />
								Generating plan...
							</div>
						) : planContent ? (
							<Message from="assistant">
								<MessageContent className="is-assistant">
									<PlanMarkdown content={planContent} />
								</MessageContent>
							</Message>
						) : (
							<p className="text-sm text-muted-foreground/60">
								No plan yet. Submit a prompt in Plan mode to generate one.
							</p>
						)}
					</div>
				</div>
			) : headerTab === "experiments" ? (
				<div className="flex-1 min-h-0 overflow-y-auto">
					<div className="mx-auto w-full max-w-2xl px-6 pt-6 pb-4">
						<p className="text-sm text-muted-foreground/60">
							No experiments yet for this session.
						</p>
					</div>
				</div>
			) : hasMessages ? (
				<Conversation className="flex-1 min-h-0">
					<ConversationContent className="mx-auto w-full max-w-2xl px-6 pt-6 pb-4">
						{conversationMessages.map((message) => (
							<Message key={message.id} from={message.role}>
								<MessageContent
									className={cn(
										message.role === "user"
											? "bg-white! border! w-full! ml-0! border-gray-300"
											: "is-assistant",
									)}
								>
									{message.parts.map((part) => {
										if (part.type === "text") {
											const isPlanPreview = openPlanHints.some((hint) =>
												part.text.includes(hint),
											);
											return message.role === "user" ? (
												<p key={`${message.id}-text`}>{part.text}</p>
											) : isPlanPreview ? (
												<div
													key={`${message.id}-text`}
													className="w-full max-w-[680px] rounded-xl border border-border bg-background px-3 py-2.5"
												>
													<p className="text-[11px] text-muted-foreground">
														Plan preview
													</p>
													<p className="mt-0.5 text-lg font-semibold text-foreground">
														{planPreview.title}
													</p>
													<p className="mt-1 text-[13px] text-foreground/85">
														{planPreview.summary}
													</p>
													{planPreview.items.length > 0 && (
														<div className="mt-2 rounded-lg border border-border/70 bg-muted/25 p-2.5">
															<p className="text-xs text-muted-foreground">
																{planPreview.remainingCount + planPreview.items.length} remaining to-dos
															</p>
															<div className="mt-1.5 space-y-1">
																{planPreview.items.map((item) => (
																	<div
																		key={item}
																		className="flex items-start gap-2 text-[13px] text-foreground/90"
																	>
																		<span className="mt-1 size-2 rounded-full border border-border/80" />
																		<span>{item}</span>
																	</div>
																))}
															</div>
															{planPreview.remainingCount > 0 && (
																<p className="mt-2 text-xs text-muted-foreground">
																	+ {planPreview.remainingCount} more
																</p>
															)}
														</div>
													)}
													<button
														type="button"
														onClick={() => setHeaderTab("plan")}
														className="mt-2 inline-flex h-7 items-center rounded-md border border-border bg-muted/20 px-2.5 text-xs font-medium text-foreground hover:bg-muted"
													>
														View Plan
													</button>
												</div>
											) : (
												<MessageResponse key={`${message.id}-text`}>
													{part.text}
												</MessageResponse>
											);
										}
										return null;
									})}
									{message.role === "assistant" &&
										status === "streaming" &&
										message ===
											conversationMessages[conversationMessages.length - 1] &&
										!message.parts.some(
											(p) => p.type === "text" && p.text.length > 0,
										) && (
											<Loader2 className="size-4 animate-spin text-muted-foreground" />
										)}
								</MessageContent>
							</Message>
						))}
						{status === "submitted" && (
							<Message from="assistant">
								<MessageContent>
									<Loader2 className="size-4 animate-spin text-muted-foreground" />
								</MessageContent>
							</Message>
						)}
					</ConversationContent>
					<ConversationScrollButton />
				</Conversation>
			) : (
				<div className="flex-1 flex flex-col justify-end min-h-0 overflow-y-auto">
					<div className="mx-auto w-full max-w-2xl px-6 pb-5">
						<p className="text-sm text-muted-foreground/40 font-light">
							New session
						</p>
						<div className="mt-2.5 flex items-center gap-4 text-xs text-muted-foreground/50">
							<span className="flex items-center gap-1.5">
								<FolderOpen className="size-3 shrink-0" strokeWidth={1.5} />
								{projectName}
							</span>
							{currentBranch && (
								<span className="flex items-center gap-1.5">
									<GitBranch className="size-3 shrink-0" strokeWidth={1.5} />
									{currentBranch}
								</span>
							)}
							<span className="flex items-center gap-1.5">
								<PencilLine className="size-3 shrink-0" strokeWidth={1.5} />
								just now
							</span>
						</div>
					</div>
				</div>
			)}

			<div className="shrink-0 mx-auto w-full max-w-2xl px-6 pb-4">
				<PromptInput
					onSubmit={handleSubmit}
					className="**:data-[slot=input-group]:rounded-[13px] **:data-[slot=input-group]:border **:data-[slot=input-group]:border-gray-300 **:data-[slot=input-group]:dark:border-neutral-700 **:data-[slot=input-group]:shadow-none **:data-[slot=input-group]:py-2.25 **:data-[slot=input-group]:gap-3.25 **:data-[slot=input-group]:ring-0! **:data-[slot=input-group]:has-[[data-slot=mention-input]:focus]:border-gray-300 **:data-[slot=input-group]:dark:has-[[data-slot=mention-input]:focus]:border-neutral-700 **:data-[slot=input-group]:has-[textarea:focus-visible]:border-gray-300 **:data-[slot=input-group]:dark:has-[textarea:focus-visible]:border-neutral-700 [&_textarea]:min-h-5.25! [&_textarea]:py-0! [&_textarea]:text-sm [&_textarea]:!max-sm:min-h-[21px] [&_textarea]:focus-visible:ring-0!"
				>
					<MentionInput
						handleRef={mentionInputRef}
						placeholder="Ask anything, @ to add files"
						onAtTrigger={handleAtTrigger}
						onAtDismiss={handleAtDismiss}
						onAtKeyDown={handleAtKeyDown}
						onSubmit={handleMentionSubmit}
						className="min-h-5.25 px-[calc(var(--spacing,0.25rem)*3-1px)]"
					/>
					<PromptInputFooter className="gap-1.25 pt-0 pb-0 px-2.25">
						<PromptInputTools className="gap-1.25">
							<Select
								value={promptMode}
								onValueChange={(v) => {
									if (
										v === "build" ||
										v === "plan" ||
										v === "debug" ||
										v === "experiment"
									)
										setPromptMode(v);
								}}
								aria-label="Select prompt mode"
							>
								<SelectTrigger
									size="sm"
									className="text-xs! h-6! min-h-6! w-auto! min-w-auto! border-input px-2 gap-1.5 [&_svg]:size-3"
									tooltip="Select mode (Shift + Tab)"
								>
									<SelectValue>
										{(value) => {
											const item = promptModeItems.find(
												(i) => i.value === value,
											);
											const Icon = item?.icon;
											return item && Icon ? (
												<span className="flex items-center pl-0.5 gap-1.5">
													<Icon className="size-3 shrink-0 opacity-80" />
													{item.label}
												</span>
											) : null;
										}}
									</SelectValue>
								</SelectTrigger>
								<SelectPopup alignItemWithTrigger={false}>
									{promptModeItems.map(({ label, value, icon: Icon }) => (
										<SelectItem key={value} value={value}>
											<span className="flex items-center gap-2">
												<Icon className="size-3.5 shrink-0 opacity-80" />
												{label}
											</span>
										</SelectItem>
									))}
								</SelectPopup>
							</Select>
							<PromptInputButton
								size="xs"
								variant="outline"
								className="text-xs! h-6!"
								onClick={handleContextButtonClick}
							>
								@ Context
							</PromptInputButton>
						</PromptInputTools>
						<PromptInputSubmit
							size="icon-xs"
							variant="secondary"
							className="size-6! rounded-full! before:rounded-full!"
						/>
					</PromptInputFooter>
				</PromptInput>
				<ContextPopover
					open={popoverOpen}
					onOpenChange={setPopoverOpen}
					anchor={popoverAnchor}
					projectPath={projectPath}
					query={atQuery}
					onSelectItem={handleSelectContextItem}
					onUploadImage={handleUploadImage}
					popoverRef={popoverHandleRef}
				/>
				<div className="mt-2.5 flex items-center justify-between px-1">
					<span className="text-[11px] text-muted-foreground">
						{changesCount > 0
							? `${changesCount} uncommitted change${changesCount === 1 ? "" : "s"}`
							: "Working tree clean"}
					</span>
					{branches.length > 0 && (
						<Select
							value={currentBranch ?? undefined}
							onValueChange={onBranchChange}
						>
							<SelectTrigger
								size="sm"
								className="text-[11px]! h-auto! min-h-auto! w-auto! min-w-auto! border-none shadow-none px-1.5 py-0.5 gap-1 text-muted-foreground hover:text-foreground [&_svg]:size-2.5"
							>
								<GitBranch className="size-3 shrink-0" />
								<SelectValue />
							</SelectTrigger>
							<SelectPopup>
								{branches.map((branch) => (
									<SelectItem key={branch.name} value={branch.name}>
										<span className="flex items-center gap-2">
											<GitBranch className="size-3 shrink-0 opacity-60" />
											{branch.name}
										</span>
									</SelectItem>
								))}
							</SelectPopup>
						</Select>
					)}
				</div>
			</div>
		</div>
	);
}

export default function Home({
	projectPath,
}: {
	projectPath: string;
	tabId: string;
}) {
	const sidebarOpen = useSidebarOpen();
	const projectName = projectPath.split("/").pop() || "project";

	const [branches, setBranches] = useState<
		{ name: string; current: boolean }[]
	>([]);
	const [currentBranch, setCurrentBranch] = useState<string | null>(null);
	const [changesCount, setChangesCount] = useState(0);

	const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
	const [streamingSessions, setStreamingSessions] = useState<Set<string>>(
		() => new Set(),
	);
	const sessionInitDataRef = useRef<Map<string, UIMessage[] | undefined>>(
		new Map(),
	);
	const [sidebarKey, setSidebarKey] = useState(0);
	const [sessionTitles, setSessionTitles] = useState<Record<string, string>>(
		{},
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: sidebarKey triggers refetch for title updates
	useEffect(() => {
		getSessions(projectPath).then((sessions) => {
			const titles: Record<string, string> = {};
			for (const s of sessions) {
				if (s.title) titles[s.id] = s.title;
			}
			setSessionTitles(titles);
		});
	}, [projectPath, sidebarKey]);

	useEffect(() => {
		getGitBranches(projectPath).then((b) => {
			setBranches(b);
			const active = b.find((br) => br.current);
			if (active) setCurrentBranch(active.name);
		});
		getGitStatus(projectPath).then((changes) => {
			setChangesCount(changes.length);
		});
	}, [projectPath]);

	useEffect(() => {
		getActiveSession(projectPath).then((result) => {
			if (result) {
				const msgs = result.messages.map((m) => ({
					id: m.id,
					role: m.role,
					parts: m.parts as UIMessage["parts"],
					createdAt: new Date(m.createdAt),
				}));
				sessionInitDataRef.current.set(result.sessionId, msgs);
				setActiveSessionId(result.sessionId);
			} else {
				const newId = nanoid();
				sessionInitDataRef.current.set(newId, undefined);
				setActiveSessionId(newId);
			}
		});
	}, [projectPath]);

	const mountedSessionIds = useMemo(() => {
		if (!activeSessionId) return [];
		const set = new Set(streamingSessions);
		set.add(activeSessionId);
		return Array.from(set);
	}, [activeSessionId, streamingSessions]);

	const handleStreamingChange = useCallback(
		(sessionId: string, streaming: boolean) => {
			setStreamingSessions((prev) => {
				const next = new Set(prev);
				if (streaming) {
					next.add(sessionId);
				} else {
					next.delete(sessionId);
				}
				return next;
			});
		},
		[],
	);

	const handleFinish = useCallback(() => {
		setSidebarKey((k) => k + 1);
	}, []);

	const startNewSession = useCallback(() => {
		const newId = nanoid();
		sessionInitDataRef.current.set(newId, undefined);
		setActiveSessionId(newId);
	}, []);

	const switchToSession = useCallback(
		(targetId: string) => {
			if (targetId === activeSessionId) return;

			if (streamingSessions.has(targetId)) {
				setActiveSessionId(targetId);
				return;
			}

			getSessionMessages(targetId).then((msgs) => {
				const uiMsgs = msgs.map((m) => ({
					id: m.id,
					role: m.role,
					parts: m.parts as UIMessage["parts"],
					createdAt: new Date(m.createdAt),
				}));
				sessionInitDataRef.current.set(targetId, uiMsgs);
				setActiveSessionId(targetId);
			});
		},
		[activeSessionId, streamingSessions],
	);

	if (!activeSessionId) return null;

	return (
		<div className="flex h-full">
			{sidebarOpen && (
				<WorkspaceSidebar
					projectPath={projectPath}
					activeSessionId={activeSessionId}
					streamingSessions={streamingSessions}
					refreshKey={sidebarKey}
					onNewChat={startNewSession}
					onSelectSession={switchToSession}
				/>
			)}
			{mountedSessionIds.map((sid) => (
				<ChatSession
					key={sid}
					sessionId={sid}
					sessionTitle={sessionTitles[sid] || "New chat"}
					projectPath={projectPath}
					projectName={projectName}
					active={sid === activeSessionId}
					initialMessages={sessionInitDataRef.current.get(sid)}
					onStreamingChange={handleStreamingChange}
					onFinish={handleFinish}
					branches={branches}
					currentBranch={currentBranch}
					onBranchChange={setCurrentBranch}
					changesCount={changesCount}
				/>
			))}
		</div>
	);
}
