import {
	Bug,
	CircleDashed,
	FlaskConical,
	FolderOpen,
	GitBranch,
	PencilLine,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	Select,
	SelectItem,
	SelectPopup,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { ContextItem } from "@/lib/context-types";
import { getGitBranches, getGitStatus } from "@/lib/rpc";
import {
	ContextPopover,
	type ContextPopoverHandle,
} from "../components/ai-elements/context-popover";
import {
	MentionInput,
	type MentionInputHandle,
} from "../components/ai-elements/mention-input";
import {
	PromptInput,
	PromptInputButton,
	PromptInputFooter,
	PromptInputSubmit,
	PromptInputTools,
} from "../components/ai-elements/prompt-input";

export default function Home({
	projectPath,
}: {
	projectPath: string;
	tabId: string;
}) {
	const projectName = projectPath.split("/").pop() || "project";

	const [branches, setBranches] = useState<
		{ name: string; current: boolean }[]
	>([]);
	const [currentBranch, setCurrentBranch] = useState<string | null>(null);
	const [changesCount, setChangesCount] = useState(0);

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

	const [promptMode, setPromptMode] = useState<
		"agent" | "plan" | "debug" | "experiment"
	>("agent");

	const [popoverOpen, setPopoverOpen] = useState(false);
	const [popoverAnchor, setPopoverAnchor] = useState<Element | DOMRect | null>(
		null,
	);
	const [atQuery, setAtQuery] = useState("");
	const mentionInputRef = useRef<MentionInputHandle>(null);
	const popoverHandleRef = useRef<ContextPopoverHandle>(null);
	const contextButtonRef = useRef<Element | null>(null);

	const handleSubmit = useCallback(({ text: formText }: { text: string }) => {
		const text =
			formText.trim() || mentionInputRef.current?.getText()?.trim() || "";
		if (!text) return;
		const contextItems = mentionInputRef.current?.getContextItems() ?? [];
		console.log("Submit:", { text, contextItems });
		mentionInputRef.current?.clear();
	}, []);

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

	const promptModeItems: Array<{
		label: string;
		value: "agent" | "plan" | "debug" | "experiment";
		icon: React.ComponentType<{ className?: string }>;
	}> = [
		{ label: "Agent", value: "agent", icon: CircleDashed },
		{ label: "Plan", value: "plan", icon: PencilLine },
		{ label: "Experiment", value: "experiment", icon: FlaskConical },
		{ label: "Debug", value: "debug", icon: Bug },
	];

	return (
		<div className="flex h-full flex-col">
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
										v === "agent" ||
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
							onValueChange={setCurrentBranch}
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
