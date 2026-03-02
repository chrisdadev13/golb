import {
	Check,
	ChevronDown,
	ChevronRight,
	Circle,
	CircleDashed,
	Loader2,
	MessageSquare,
	PencilLine,
	Plus,
	X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	SidebarProvider,
} from "@/components/ui/sidebar";
import { getIntents, getSessions, type SidebarIntent, type SidebarSession } from "@/lib/rpc";

type IntentItemProps = {
	intent: SidebarIntent;
	isSelected: boolean;
	onSelect: (intentId: string) => void;
};

function TaskStatusIcon({ status }: { status: string }) {
	if (status === "completed") {
		return <Check className="size-3.5 text-emerald-500 shrink-0" strokeWidth={2} />;
	}
	if (status === "in_progress") {
		return (
			<div className="size-3.5 rounded-full border-[1.5px] border-blue-500 flex items-center justify-center shrink-0">
				<div className="size-1 rounded-full bg-blue-500" />
			</div>
		);
	}
	if (status === "blocked") {
		return (
			<div className="size-3.5 rounded-full border-[1.5px] border-amber-500 flex items-center justify-center shrink-0">
				<div className="size-1 rounded-sm bg-amber-500" />
			</div>
		);
	}
	return <div className="size-3.5 rounded-full border-[1.5px] border-border shrink-0" />;
}

function IntentStatusIcon({ intent }: { intent: SidebarIntent }) {
	if (intent.status === "completed") {
		return <Check className="size-3.5 text-emerald-500 shrink-0" strokeWidth={2} />;
	}
	if (intent.status === "killed") {
		return <X className="size-3.5 text-red-500 shrink-0" strokeWidth={2} />;
	}
	if (intent.type === "experiment") {
		if (intent.experimentVerdict === "kept") {
			return <Check className="size-3.5 text-emerald-500 shrink-0" strokeWidth={2} />;
		}
		if (intent.experimentVerdict === "killed") {
			return <X className="size-3.5 text-red-500 shrink-0" strokeWidth={2} />;
		}
		return (
			<div className="size-3.5 rounded-full border-[1.5px] border-blue-500 flex items-center justify-center shrink-0">
				<div className="size-1 rounded-full bg-blue-500" />
			</div>
		);
	}
	if (intent.status === "active" || intent.status === "blocked") {
		const hasProgress = intent.completedTaskCount > 0;
		return (
			<div className="size-3.5 rounded-full border-[1.5px] border-blue-500 flex items-center justify-center shrink-0">
				{hasProgress && <div className="size-[5px] rounded-full bg-blue-500" />}
			</div>
		);
	}
	return <Circle className="size-3.5 text-muted-foreground/40 shrink-0" strokeWidth={1.5} />;
}

function ExperimentBadge({ intent }: { intent: SidebarIntent }) {
	if (intent.experimentVerdict === "kept") {
		return <span className="text-[11px] text-emerald-600">kept</span>;
	}
	if (intent.experimentVerdict === "killed") {
		return null;
	}
	if (intent.status === "active") {
		return <span className="text-[11px] text-blue-500">testing</span>;
	}
	return null;
}

function ActiveIntentMenuItem({ intent, isSelected, onSelect }: IntentItemProps) {
	const [expanded, setExpanded] = useState(isSelected);
	const hasTasks = intent.taskCount > 0;

	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				size="sm"
				isActive={isSelected}
				onClick={() => {
					onSelect(intent.id);
					if (hasTasks) setExpanded((prev) => !prev);
				}}
			>
				{hasTasks && (
					expanded
						? <ChevronDown className="size-3" strokeWidth={2} />
						: <ChevronRight className="size-3" strokeWidth={2} />
				)}
				<IntentStatusIcon intent={intent} />
				<span>{intent.title}</span>
			</SidebarMenuButton>
			{hasTasks && (
				<SidebarMenuBadge>
					{intent.completedTaskCount}/{intent.taskCount}
				</SidebarMenuBadge>
			)}
			{expanded && hasTasks && (
				<SidebarMenuSub>
					{intent.tasks.map((task) => (
						<SidebarMenuSubItem key={task.id}>
							<SidebarMenuSubButton
								size="sm"
								isActive={task.status === "in_progress"}
								render={<button type="button" />}
							>
								<TaskStatusIcon status={task.status} />
								<span className={task.status === "completed" ? "text-muted-foreground" : ""}>
									{task.title}
								</span>
							</SidebarMenuSubButton>
						</SidebarMenuSubItem>
					))}
				</SidebarMenuSub>
			)}
		</SidebarMenuItem>
	);
}

function ChatStatusIcon({
	sessionId,
	streamingSessions,
}: {
	sessionId: string;
	streamingSessions: Set<string>;
}) {
	if (streamingSessions.has(sessionId)) {
		return (
			<div className="size-3.5 rounded-full border-[1.5px] border-blue-500 flex items-center justify-center shrink-0">
				<div className="size-1.5 rounded-full bg-blue-500 animate-pulse" />
			</div>
		);
	}
	return <CircleDashed className="size-3.5 text-muted-foreground/40 shrink-0" strokeWidth={1.5} />;
}

function EmptyState() {
	return (
		<div className="flex flex-col items-center justify-center py-8 px-4 text-center">
			<MessageSquare className="size-8 text-muted-foreground/20 mb-3" strokeWidth={1.5} />
			<p className="text-sm text-muted-foreground/60 mb-1">No sessions yet</p>
			<p className="text-xs text-muted-foreground/40">
				Start a conversation to create your first session
			</p>
		</div>
	);
}

const NOOP = () => {};

export function WorkspaceSidebar({
	projectPath,
	activeSessionId,
	streamingSessions,
	refreshKey,
	onNewChat,
	onSelectSession,
}: {
	projectPath: string;
	activeSessionId?: string;
	streamingSessions?: Set<string>;
	refreshKey?: number;
	onNewChat?: () => void;
	onSelectSession?: (sessionId: string) => void;
}) {
	const [intents, setIntents] = useState<SidebarIntent[]>([]);
	const [sessions, setSessions] = useState<SidebarSession[]>([]);
	const [loading, setLoading] = useState(true);

	// biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey triggers refetch intentionally
	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		Promise.all([getIntents(projectPath), getSessions(projectPath)])
			.then(([intentData, sessionData]) => {
				if (!cancelled) {
					setIntents(intentData);
					setSessions(sessionData);
					setLoading(false);
				}
			})
			.catch(() => {
				if (!cancelled) setLoading(false);
			});
		return () => { cancelled = true; };
	}, [projectPath, refreshKey]);

	const [selectedIntentId, setSelectedIntentId] = useState<string | null>(null);
	const handleIntentSelect = useCallback((id: string) => {
		setSelectedIntentId((prev) => (prev === id ? null : id));
	}, []);

	const activeIntents = intents.filter(
		(i) => i.type === "feature" && (i.status === "active" || i.status === "blocked"),
	);
	const experiments = intents.filter((i) => i.type === "experiment");
	const completed = intents.filter((i) => i.status === "completed");

	const isEmpty =
		sessions.length === 0 &&
		activeIntents.length === 0 &&
		experiments.length === 0 &&
		completed.length === 0;

	return (
		<SidebarProvider
			open={true}
			onOpenChange={NOOP}
			className="min-h-0 w-auto shrink-0"
			style={{ "--sidebar-width": "240px" } as React.CSSProperties}
		>
			<Sidebar collapsible="none" className="border-r">
				<SidebarContent>
					{loading ? (
						<div className="flex items-center justify-center py-12">
							<Loader2 className="size-4 text-muted-foreground/40 animate-spin" />
						</div>
					) : isEmpty ? (
						<EmptyState />
					) : (
						<>
							{(sessions.length > 0 || activeIntents.length > 0) && (
								<SidebarGroup>
									<SidebarGroupLabel>Active Sessions</SidebarGroupLabel>
									<SidebarGroupContent>
										<SidebarMenu>
											{sessions.map((session) => (
												<SidebarMenuItem key={session.id}>
													<SidebarMenuButton
														size="sm"
														isActive={activeSessionId === session.id}
														onClick={() => onSelectSession?.(session.id)}
													>
														<ChatStatusIcon
															sessionId={session.id}
															streamingSessions={streamingSessions ?? new Set()}
														/>
														<span>{session.title || "Untitled session"}</span>
														{session.hasPlan && (
															<PencilLine className="ml-auto size-3 text-muted-foreground/70" />
														)}
													</SidebarMenuButton>
												</SidebarMenuItem>
											))}
											{activeIntents.map((intent) => (
												<ActiveIntentMenuItem
													key={intent.id}
													intent={intent}
													isSelected={selectedIntentId === intent.id}
													onSelect={handleIntentSelect}
												/>
											))}
										</SidebarMenu>
									</SidebarGroupContent>
								</SidebarGroup>
							)}
							{experiments.length > 0 && (
								<SidebarGroup>
									<SidebarGroupLabel>Experiments</SidebarGroupLabel>
									<SidebarGroupContent>
										<SidebarMenu>
											{experiments.map((intent) => {
												const isKilled = intent.experimentVerdict === "killed" || intent.status === "killed";
												return (
													<SidebarMenuItem key={intent.id}>
														<SidebarMenuButton
															size="sm"
															isActive={selectedIntentId === intent.id}
															onClick={() => handleIntentSelect(intent.id)}
															className={isKilled ? "opacity-50" : ""}
														>
															<IntentStatusIcon intent={intent} />
															<span className={isKilled ? "line-through" : ""}>
																{intent.title}
															</span>
														</SidebarMenuButton>
														<SidebarMenuBadge>
															<ExperimentBadge intent={intent} />
														</SidebarMenuBadge>
													</SidebarMenuItem>
												);
											})}
										</SidebarMenu>
									</SidebarGroupContent>
								</SidebarGroup>
							)}
							{completed.length > 0 && (
								<SidebarGroup>
									<SidebarGroupLabel>Completed</SidebarGroupLabel>
									<SidebarGroupContent>
										<SidebarMenu>
											{completed.map((intent) => (
												<SidebarMenuItem key={intent.id}>
													<SidebarMenuButton
														size="sm"
														isActive={selectedIntentId === intent.id}
														onClick={() => handleIntentSelect(intent.id)}
													>
														<Check className="size-4 text-emerald-500" strokeWidth={2} />
														<span>{intent.title}</span>
													</SidebarMenuButton>
												</SidebarMenuItem>
											))}
										</SidebarMenu>
									</SidebarGroupContent>
								</SidebarGroup>
							)}
						</>
					)}
				</SidebarContent>
				<SidebarFooter>
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton size="sm" onClick={onNewChat}>
								<Plus className="size-4" strokeWidth={2} />
								<span>New Chat</span>
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarFooter>
			</Sidebar>
		</SidebarProvider>
	);
}
