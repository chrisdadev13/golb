import { Button } from "@/components/ui/button";
import { useTabsContext } from "@/lib/tabs-context";

export default function Home({
	projectPath,
	tabId,
}: { projectPath: string; tabId: string }) {
	const { closeTab } = useTabsContext();
	const projectName = projectPath.split("/").pop() || "project";

	return (
		<div className="flex h-full flex-col">
			<div className="border-b px-4 py-2 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium">{projectName}</span>
					<span className="text-xs text-muted-foreground">{projectPath}</span>
				</div>
				<Button size="sm" variant="ghost" onClick={() => closeTab(tabId)}>
					Close project
				</Button>
			</div>
			<div className="flex-1 flex items-center justify-center text-muted-foreground">
				<p className="text-sm">Workspace for {projectName}</p>
			</div>
		</div>
	);
}
