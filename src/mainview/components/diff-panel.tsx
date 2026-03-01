import { MultiFileDiff, WorkerPoolContextProvider } from "@pierre/diffs/react";
import { Check, ChevronRight, Loader2, X } from "lucide-react";
import {
	type CSSProperties,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useDiffPanel } from "@/lib/diff-panel-context";
import { diffsWorkerFactory } from "@/lib/diffs-worker-factory";
import {
	type GitFileDiffContents,
	type GitFileDiffSummary,
	getGitFileDiffContents,
	getGitFileDiffs,
	gitDiscardChanges,
	gitStageChanges,
} from "@/lib/rpc";
import { useTabsContext } from "@/lib/tabs-context";
import { Button } from "./ui/button";
import { ButtonGroup } from "./ui/button-group";
import { Checkbox } from "./ui/checkbox";

type DiffPanelMode = "unstaged" | "staged";

function formatError(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

const DIFF_STYLE: CSSProperties = {
	"--diffs-font-size": "11px",
	"--diffs-line-height": "1.35",
	"--diffs-gap-block": "4px",
	"--diffs-gap-inline": "6px",
	"--diffs-font-family":
		"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
	"--diffs-header-font-family":
		"Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
	"--diffs-addition-color-override": "rgba(22, 163, 74, 0.5)",
	"--diffs-deletion-color-override": "rgba(220, 38, 38, 0.5)",
	"--diffs-modified-color-override": "rgba(59, 130, 246, 0.5)",
} as CSSProperties;

export function DiffPanel() {
	const { activeTab } = useTabsContext();
	const { open, setOpen } = useDiffPanel();
	const [mode, setMode] = useState<DiffPanelMode>("unstaged");
	const [files, setFiles] = useState<GitFileDiffSummary[]>([]);
	const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>(
		{},
	);
	const [reviewedFiles, setReviewedFiles] = useState<Record<string, boolean>>(
		{},
	);
	const [fileContents, setFileContents] = useState<
		Record<string, GitFileDiffContents>
	>({});
	const [loadingContents, setLoadingContents] = useState<
		Record<string, boolean>
	>({});
	const [contentErrors, setContentErrors] = useState<Record<string, string>>(
		{},
	);
	const [loading, setLoading] = useState(false);
	const [runningFileActionKey, setRunningFileActionKey] = useState<
		string | null
	>(null);
	const [runningAllAction, setRunningAllAction] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const isWorkspace = activeTab.type === "workspace";
	const projectPath = isWorkspace ? activeTab.projectPath : undefined;

	const refreshDiffs = useCallback(async () => {
		if (!projectPath) {
			return;
		}
		setLoading(true);
		setError(null);
		try {
			const nextFiles = await getGitFileDiffs(projectPath, mode === "staged");
			setFiles(nextFiles);
			setExpandedFiles({});
			setReviewedFiles((prev) => {
				const next: Record<string, boolean> = {};
				for (const file of nextFiles) {
					const key = `${file.status}:${file.file}`;
					if (prev[key]) {
						next[key] = true;
					}
				}
				return next;
			});
			setFileContents({});
			setLoadingContents({});
			setContentErrors({});
		} catch (fetchError: unknown) {
			setFiles([]);
			setError(formatError(fetchError));
		} finally {
			setLoading(false);
		}
	}, [mode, projectPath]);

	useEffect(() => {
		if (!open || !projectPath) {
			return;
		}
		void refreshDiffs();
	}, [open, projectPath, refreshDiffs]);

	const getFileKey = (file: { status: string; file: string }) =>
		`${file.status}:${file.file}`;

	const loadFileContents = async (file: GitFileDiffSummary) => {
		if (!projectPath) return;
		const key = getFileKey(file);
		if (fileContents[key] || loadingContents[key]) {
			return;
		}

		setLoadingContents((prev) => ({ ...prev, [key]: true }));
		setContentErrors((prev) => {
			const next = { ...prev };
			delete next[key];
			return next;
		});
		try {
			const contents = await getGitFileDiffContents({
				projectPath,
				file: file.file,
				status: file.status,
				oldPath: file.oldPath,
				staged: mode === "staged",
			});
			setFileContents((prev) => ({ ...prev, [key]: contents }));
		} catch (loadError: unknown) {
			setContentErrors((prev) => ({ ...prev, [key]: formatError(loadError) }));
		} finally {
			setLoadingContents((prev) => ({ ...prev, [key]: false }));
		}
	};

	const toggleExpanded = (file: GitFileDiffSummary) => {
		const fileKey = getFileKey(file);
		const nextOpen = !expandedFiles[fileKey];
		setExpandedFiles(nextOpen ? { [fileKey]: true } : {});
		if (nextOpen) {
			void loadFileContents(file);
		}
	};

	const toggleReviewed = (file: GitFileDiffSummary, checked: boolean) => {
		const fileKey = getFileKey(file);
		setReviewedFiles((prev) => {
			if (!checked) {
				const next = { ...prev };
				delete next[fileKey];
				return next;
			}
			return { ...prev, [fileKey]: true };
		});
	};

	const runFileStageAction = async (file: GitFileDiffSummary) => {
		if (!projectPath) return;
		const fileKey = getFileKey(file);
		setRunningFileActionKey(fileKey);
		setError(null);
		try {
			await gitStageChanges({
				projectPath,
				scope: "file",
				file: file.file,
				stage: mode !== "staged",
			});
			await refreshDiffs();
		} catch (actionError: unknown) {
			setError(formatError(actionError));
		} finally {
			setRunningFileActionKey(null);
		}
	};

	const runFileDiscardAction = async (file: GitFileDiffSummary) => {
		if (!projectPath) return;
		const fileKey = getFileKey(file);
		setRunningFileActionKey(fileKey);
		setError(null);
		try {
			await gitDiscardChanges({
				projectPath,
				scope: "file",
				file: file.file,
				status: file.status,
				staged: mode === "staged",
			});
			await refreshDiffs();
		} catch (actionError: unknown) {
			setError(formatError(actionError));
		} finally {
			setRunningFileActionKey(null);
		}
	};

	const runStageAllAction = async () => {
		if (!projectPath) return;
		setRunningAllAction(true);
		setError(null);
		try {
			await gitStageChanges({
				projectPath,
				scope: "all",
				stage: mode !== "staged",
			});
			await refreshDiffs();
		} catch (actionError: unknown) {
			setError(formatError(actionError));
		} finally {
			setRunningAllAction(false);
		}
	};

	const runDiscardAllAction = async () => {
		if (!projectPath) return;
		setRunningAllAction(true);
		setError(null);
		try {
			await gitDiscardChanges({
				projectPath,
				scope: "all",
				staged: mode === "staged",
			});
			await refreshDiffs();
		} catch (actionError: unknown) {
			setError(formatError(actionError));
		} finally {
			setRunningAllAction(false);
		}
	};

	const totals = useMemo(
		() =>
			files.reduce(
				(acc, file) => {
					acc.additions += file.additions;
					acc.deletions += file.deletions;
					return acc;
				},
				{ additions: 0, deletions: 0 },
			),
		[files],
	);

	const poolOptions = useMemo(
		() => ({
			workerFactory: diffsWorkerFactory,
			poolSize:
				typeof navigator !== "undefined" && navigator.hardwareConcurrency > 0
					? Math.max(
							2,
							Math.min(4, Math.floor(navigator.hardwareConcurrency / 2)),
						)
					: 2,
		}),
		[],
	);

	const highlighterOptions = useMemo(
		() => ({
			theme: { light: "github-light", dark: "github-light" } as const,
			tokenizeMaxLineLength: 700,
			lineDiffType: "word-alt" as const,
		}),
		[],
	);

	const emptyState = useMemo(
		() =>
			mode === "staged"
				? {
						title: "No staged changes",
						description:
							"Stage files in the Unstaged view to review them here.",
					}
				: {
						title: "Working tree clean",
						description: "Edit files to see unstaged diffs here.",
					},
		[mode],
	);

	return (
		<WorkerPoolContextProvider
			poolOptions={poolOptions}
			highlighterOptions={highlighterOptions}
		>
			<div className="h-full flex flex-col bg-white border-l-px ">
				<div className="h-9 shrink-0 px-3 border-b flex items-center justify-between">
					<div className="text-xs font-medium">Uncommitted changes</div>
					<Button size="icon-xs" variant="ghost" onClick={() => setOpen(false)}>
						<X className="size-3.5" />
					</Button>
				</div>

				<div className="h-10 shrink-0 px-3 border-b flex items-center justify-between">
					<ButtonGroup>
						<Button
							size="xs"
							variant={mode === "unstaged" ? "secondary" : "outline"}
							onClick={() => setMode("unstaged")}
						>
							Unstaged
						</Button>
						<Button
							size="xs"
							variant={mode === "staged" ? "secondary" : "outline"}
							onClick={() => setMode("staged")}
						>
							Staged
						</Button>
					</ButtonGroup>
					<span className="text-xs">
						<span className="text-emerald-600">+{totals.additions}</span>{" "}
						<span className="text-red-600">-{totals.deletions}</span>
					</span>
				</div>

				<div className="flex-1 min-h-0 overflow-auto px-3 py-2 space-y-3">
					{!isWorkspace && (
						<div className="text-xs text-muted-foreground">
							Open a workspace tab to view file diffs.
						</div>
					)}
					{isWorkspace && loading && (
						<div className="h-full flex items-center justify-center text-muted-foreground">
							<Loader2 className="size-4 animate-spin" />
						</div>
					)}
					{isWorkspace && !loading && error && (
						<div className="text-xs text-red-600">{error}</div>
					)}
					{isWorkspace && !loading && !error && files.length === 0 && (
						<div className="h-full flex items-center justify-center">
							<div className="w-full max-w-[320px] rounded-lg border border-zinc-200 bg-zinc-50/70 px-4 py-6 text-center">
								<div className="mx-auto mb-2 inline-flex size-7 items-center justify-center rounded-full border border-zinc-300 bg-white">
									<Check className="size-3.5 text-zinc-500" />
								</div>
								<div className="text-xs font-medium text-zinc-700">
									{emptyState.title}
								</div>
								<div className="mt-1 text-[11px] text-zinc-500">
									{emptyState.description}
								</div>
							</div>
						</div>
					)}
					{isWorkspace &&
						!loading &&
						!error &&
						files.map((file) => (
							<div
								key={getFileKey(file)}
								className="border rounded-md overflow-hidden"
							>
								<div className="h-8 w-full px-2 border-b flex items-center justify-between bg-zinc-50">
									<div className="flex items-center min-w-0 gap-1.5">
										<button
											type="button"
											className="text-[11px] font-medium truncate flex items-center gap-1 min-w-0 text-left text-zinc-700 hover:text-zinc-900"
											onClick={() => toggleExpanded(file)}
										>
											<span
												className={
													reviewedFiles[getFileKey(file)]
														? "line-through text-zinc-400"
														: ""
												}
											>
												{file.file}
											</span>
										</button>
									</div>
									<div className="flex items-center gap-2 shrink-0">
										<div className="flex items-center gap-1">
											<Button
												size="xs"
												variant="outline"
												className="h-5 px-1.5 text-[10px]"
												disabled={
													Boolean(runningFileActionKey) || runningAllAction
												}
												onClick={() => void runFileDiscardAction(file)}
											>
												Discard
											</Button>
											<Button
												size="xs"
												variant="secondary"
												className="h-5 px-1.5 text-[10px]"
												disabled={
													Boolean(runningFileActionKey) || runningAllAction
												}
												onClick={() => void runFileStageAction(file)}
											>
												{runningFileActionKey === getFileKey(file) ? (
													<Loader2 className="size-3 animate-spin" />
												) : mode === "staged" ? (
													"Unstage"
												) : (
													"Stage"
												)}
											</Button>
										</div>
										<span className="text-[11px]">
											<span className="text-emerald-600">
												+{file.additions}
											</span>{" "}
											<span className="text-red-600">-{file.deletions}</span>
										</span>
										<div className="flex items-center gap-2">
											<Checkbox
												aria-label={`Mark ${file.file} as reviewed`}
												checked={Boolean(reviewedFiles[getFileKey(file)])}
												onCheckedChange={(checked) =>
													toggleReviewed(file, checked === true)
												}
												className="size-3.5 sm:size-3.5 border-zinc-300 bg-white"
											/>
										</div>
										{reviewedFiles[getFileKey(file)] && (
											<span className="inline-flex items-center gap-1 rounded-sm border border-zinc-300 bg-white px-1.5 py-0.5 text-[10px] text-zinc-600">
												<Check className="size-2.5" />
												Reviewed
											</span>
										)}
										<button
											type="button"
											aria-label={
												expandedFiles[getFileKey(file)]
													? `Collapse ${file.file}`
													: `Expand ${file.file}`
											}
											className="inline-flex items-center justify-center size-5 rounded-sm border border-zinc-300 bg-white text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
											onClick={() => toggleExpanded(file)}
										>
											<ChevronRight
												className={`size-3 shrink-0 transition-transform ${
													expandedFiles[getFileKey(file)]
														? "rotate-90"
														: "rotate-0"
												}`}
											/>
										</button>
									</div>
								</div>
								{expandedFiles[getFileKey(file)] && (
									<div className="bg-white">
										{loadingContents[getFileKey(file)] && (
											<div className="h-14 flex items-center justify-center text-muted-foreground">
												<Loader2 className="size-4 animate-spin" />
											</div>
										)}
										{!loadingContents[getFileKey(file)] &&
											contentErrors[getFileKey(file)] && (
												<div className="px-3 py-2 text-xs text-red-600">
													{contentErrors[getFileKey(file)]}
												</div>
											)}
										{!loadingContents[getFileKey(file)] &&
											!contentErrors[getFileKey(file)] &&
											fileContents[getFileKey(file)] && (
												<MultiFileDiff
													oldFile={{
														name: file.file,
														contents:
															fileContents[getFileKey(file)].oldContents,
													}}
													newFile={{
														name: file.file,
														contents:
															fileContents[getFileKey(file)].newContents,
													}}
													options={{
														themeType: "light",
														theme: "github-light",
														diffStyle: "unified",
														hunkSeparators: "line-info",
														disableFileHeader: true,
														expandUnchanged: false,
													}}
													style={DIFF_STYLE}
												/>
											)}
									</div>
								)}
							</div>
						))}
				</div>

				<div className="h-10 shrink-0 px-3 border-t flex items-center justify-end gap-1.5">
					<Button
						size="xs"
						variant="ghost"
						disabled={files.length === 0 || runningAllAction}
						onClick={() => void runDiscardAllAction()}
					>
						{runningAllAction ? (
							<Loader2 className="size-3.5 animate-spin" />
						) : (
							"Discard all"
						)}
					</Button>
					<Button
						size="xs"
						variant="secondary"
						disabled={files.length === 0 || runningAllAction}
						onClick={() => void runStageAllAction()}
					>
						{mode === "staged" ? "Unstage all" : "Stage all"}
					</Button>
				</div>
			</div>
		</WorkerPoolContextProvider>
	);
}
