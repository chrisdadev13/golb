import {
	Bug,
	CircleDashed,
	FlaskConical,
	FolderCode,
	FolderOpen,
	LayoutGrid,
	List,
	PencilLine,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectItem,
	SelectPopup,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { getAvatarColor } from "@/lib/avatar";
import {
	addRecentProject,
	formatTimeAgo,
	getRecentProjects,
	type Project,
} from "@/lib/projects";
import { openFolderDialog } from "@/lib/rpc";
import { useTabsContext } from "@/lib/tabs-context";
import {
	PromptInput,
	PromptInputButton,
	PromptInputFooter,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
} from "../components/ai-elements/prompt-input";

export default function IndexPage() {
	const tabsContext = useTabsContext();
	const [search, setSearch] = useState("");
	const [projects] = useState<Project[]>(() => getRecentProjects());
	const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
	const [promptMode, setPromptMode] = useState<
		"agent" | "plan" | "debug" | "experiment"
	>("agent");
	const [selectedProjectPath, setSelectedProjectPath] = useState<string | null>(
		() => getRecentProjects()[0]?.path ?? null,
	);

	const filtered = useMemo(() => {
		if (!search) return projects;
		const q = search.toLowerCase();
		return projects.filter(
			(p) =>
				p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q),
		);
	}, [projects, search]);

	const openProject = (projectPath: string) => {
		const name = projectPath.split("/").pop() || "project";
		addRecentProject({ name, path: projectPath });
		tabsContext.openProject(projectPath);
	};

	const handleOpenFolder = async () => {
		const paths = await openFolderDialog();
		if (!paths || paths.length === 0) return;
		openProject(paths[0]);
	};

	const handleSubmit = ({ text }: { text: string }) => {
		if (!text.trim()) return;
		// TODO: handle prompt submission
	};

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
		<div className="mx-auto max-w-3xl px-8 pt-16 pb-12">
			<h1 className="text-xl font-semibold tracking-tight">Welcome to Golb</h1>
			{projects.length > 0 && (
				<div className="mt-3 w-full max-w-xs">
					<Select
						value={selectedProjectPath}
						onValueChange={(path) => {
							if (path) {
								setSelectedProjectPath(path);
							}
						}}
					>
						<Tooltip>
							<TooltipTrigger>
								<SelectTrigger
									size="sm"
									aria-label="Select a project"
									className="w-38"
								>
									<SelectValue placeholder="Select a project…">
										{(path) =>
											path ? (
												<span className="flex items-center gap-2">
													<FolderCode className="size-4 shrink-0" />
													<span className="truncate">
														{projects.find((p) => p.path === path)?.name ??
															path}
													</span>
												</span>
											) : null
										}
									</SelectValue>
								</SelectTrigger>
							</TooltipTrigger>
							<TooltipContent>Select existing project</TooltipContent>
						</Tooltip>
						<SelectPopup>
							{projects.map((project) => (
								<SelectItem key={project.id} value={project.path}>
									<span className="flex items-center gap-2">
										<FolderCode className="size-4 shrink-0" />
										<span className="truncate">{project.name}</span>
									</span>
								</SelectItem>
							))}
						</SelectPopup>
					</Select>
				</div>
			)}
			<div className="mt-5">
				<PromptInput
					onSubmit={handleSubmit}
					className="**:data-[slot=input-group]:rounded-[13px] **:data-[slot=input-group]:border **:data-[slot=input-group]:border-gray-300 **:data-[slot=input-group]:dark:border-neutral-700 **:data-[slot=input-group]:shadow-none **:data-[slot=input-group]:py-2.25 **:data-[slot=input-group]:gap-3.25 **:data-[slot=input-group]:ring-0! **:data-[slot=input-group]:has-[textarea:focus-visible]:border-gray-300 **:data-[slot=input-group]:dark:has-[textarea:focus-visible]:border-neutral-700 [&_textarea]:min-h-5.25! [&_textarea]:py-0! [&_textarea]:text-sm [&_textarea]:!max-sm:min-h-[21px] [&_textarea]:focus-visible:ring-0!"
				>
					<PromptInputTextarea placeholder="Use '@' to add context" />
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
			</div>
			<Separator className="my-8" />
			<div>
				<div className="flex items-center justify-between w-full">
					<p className="text-sm text-foreground">Open existing project</p>
					<Button onClick={handleOpenFolder} variant="outline" size="sm">
						<FolderOpen className="size-4 text-muted-foreground" />
						<span className="text-sm font-medium">Open folder</span>
					</Button>
				</div>
				<div className="mt-3 flex items-center gap-2">
					<Input
						type="search"
						placeholder="Search projects"
						size="sm"
						value={search}
						onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
							setSearch(e.target.value)
						}
						className="flex-1"
					/>
					<div className="flex items-center rounded-lg border">
						<Button
							size="icon-xs"
							variant={viewMode === "grid" ? "secondary" : "ghost"}
							tooltip="Grid view"
							onClick={() => setViewMode("grid")}
						>
							<LayoutGrid className="size-3.5" />
						</Button>
						<Button
							size="icon-xs"
							variant={viewMode === "list" ? "secondary" : "ghost"}
							tooltip="List view"
							onClick={() => setViewMode("list")}
						>
							<List className="size-3.5" />
						</Button>
					</div>
				</div>
				{filtered.length === 0 ? (
					<div className="mt-10 flex flex-col items-center text-center text-muted-foreground">
						<FolderCode className="size-10 opacity-40" />
						<p className="mt-2 text-sm">No recent projects</p>
						<p className="text-xs">Open a folder to get started</p>
					</div>
				) : (
					<AnimatePresence mode="wait">
						{viewMode === "list" ? (
							<motion.ul
								key="list"
								initial={{ opacity: 0, y: 8 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -8 }}
								transition={{ duration: 0.2, ease: "easeOut" }}
								className="mt-3"
							>
								{filtered.map((project) => (
									<li
										key={project.id}
										onClick={() => openProject(project.path)}
										className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 -mx-3 transition-colors hover:bg-accent"
									>
										<div className="flex items-center gap-3">
											<div
												className={`flex size-8 items-center justify-center rounded-md text-xs font-semibold uppercase ${getAvatarColor(project.id)}`}
											>
												{project.name.charAt(0)}
											</div>
											<div>
												<p className="text-sm font-medium">{project.name}</p>
												<p className="text-xs text-muted-foreground">
													{project.path}
												</p>
											</div>
										</div>
										<span className="text-xs text-muted-foreground">
											{formatTimeAgo(project.lastOpened)}
										</span>
									</li>
								))}
							</motion.ul>
						) : (
							<motion.div
								key="grid"
								initial={{ opacity: 0, y: 8 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -8 }}
								transition={{ duration: 0.2, ease: "easeOut" }}
								className="mt-3 grid grid-cols-2 gap-3"
							>
								{filtered.map((project) => (
									<div
										key={project.id}
										onClick={() => openProject(project.path)}
										className="flex cursor-pointer flex-col rounded-xl border p-4 transition-colors hover:bg-accent"
									>
										<div className="flex items-center gap-3">
											<div
												className={`flex size-8 items-center justify-center rounded-md text-xs font-semibold uppercase ${getAvatarColor(project.id)}`}
											>
												{project.name.charAt(0)}
											</div>
											<div className="min-w-0">
												<p className="text-sm font-medium truncate">
													{project.name}
												</p>
												<p className="text-xs text-muted-foreground truncate">
													{project.path}
												</p>
											</div>
										</div>
										<div className="mt-3 border-t pt-3 text-xs text-muted-foreground">
											{formatTimeAgo(project.lastOpened)}
										</div>
									</div>
								))}
							</motion.div>
						)}
					</AnimatePresence>
				)}
			</div>
			<footer className="mt-16 pt-8 text-center">
				<p className="text-[11px] text-muted-foreground/60">
					powered by Mistral
				</p>
			</footer>
		</div>
	);
}
