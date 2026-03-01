import { Plus, X } from "lucide-react";
import { useTabsContext } from "@/lib/tabs-context";
import { getAvatarColor } from "@/lib/avatar";

export function WorkspaceTabs() {
	const { tabs, activeTabId, addTab, closeTab, switchTab } = useTabsContext();

	return (
		<div className="electrobun-webkit-app-region-no-drag flex items-end gap-0 min-w-0 flex-1">
			{tabs.map((tab, i) => {
				const isActive = tab.id === activeTabId;
				const label =
					tab.type === "workspace" ? tab.projectName ?? "Project" : "New Tab";
				const initial =
					tab.type === "workspace"
						? (tab.projectName?.[0] ?? "P").toUpperCase()
						: "+";
				const avatarColor =
					tab.type === "workspace"
						? getAvatarColor(tab.projectPath ?? tab.id)
						: "";

				return (
					<button
						key={tab.id}
						type="button"
						onClick={() => switchTab(tab.id)}
						className={`group relative flex items-center gap-1.5 px-3 h-[30px] text-xs max-w-[180px] min-w-[100px] transition-colors cursor-default select-none ${
							isActive
								? "bg-background rounded-t-lg -mb-px z-10"
								: "text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-t-lg"
						}`}
					>
						{/* Separator between inactive tabs */}
						{!isActive && i > 0 && tabs[i - 1]?.id !== activeTabId && (
							<div className="absolute left-0 top-1/2 -translate-y-1/2 h-3.5 w-px bg-border" />
						)}

						{/* Avatar / icon */}
						{tab.type === "workspace" ? (
							<div
								className={`flex size-4 shrink-0 items-center justify-center rounded text-[9px] font-semibold ${avatarColor}`}
							>
								{initial}
							</div>
						) : (
							<div className="flex size-4 shrink-0 items-center justify-center rounded text-[9px] text-muted-foreground">
								<Plus className="size-3" />
							</div>
						)}

						{/* Label */}
						<span className="truncate flex-1 text-left">{label}</span>

						{/* Close button */}
						<div
							role="button"
							tabIndex={-1}
							onClick={(e) => {
								e.stopPropagation();
								closeTab(tab.id);
							}}
							className={`flex size-4 shrink-0 items-center justify-center rounded-sm transition-opacity hover:bg-foreground/10 ${
								isActive
									? "opacity-60 hover:opacity-100"
									: "opacity-0 group-hover:opacity-60 hover:!opacity-100"
							}`}
						>
							<X className="size-3" />
						</div>
					</button>
				);
			})}

			{/* Add tab button */}
			<button
				type="button"
				onClick={() => addTab()}
				className="flex size-[30px] shrink-0 items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-t-lg transition-colors"
			>
				<Plus className="size-3.5" />
			</button>
		</div>
	);
}
