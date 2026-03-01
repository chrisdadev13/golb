import {
  Box,
  // ChevronDown,
  ChevronLeft,
  ChevronRight,
  GitCommitHorizontal,
  SquareTerminal,
} from "lucide-react";
import { useEffect, useState } from "react";
import { getGitFileDiffs } from "@/lib/rpc";
import { useTabsContext } from "@/lib/tabs-context";
import { useDiffPanel } from "@/lib/diff-panel-context";
import { useTerminalPanel } from "@/lib/terminal-panel-context";
import { Button } from "./ui/button";
import { ButtonGroup } from "./ui/button-group";
import { Separator } from "./ui/separator";
import { WorkspaceTabs } from "./workspace-tabs";

export function TitleBar() {
  const { activeTab, canGoBack, canGoForward, goBack, goForward } = useTabsContext();
  const { toggle: toggleTerminal } = useTerminalPanel();
  const { toggle: toggleDiffPanel } = useDiffPanel();
  const isWorkspace = activeTab.type === "workspace";
  const projectPath = isWorkspace ? activeTab.projectPath : undefined;
  const [diffTotals, setDiffTotals] = useState({ additions: 0, deletions: 0 });

  useEffect(() => {
    if (!projectPath) {
      setDiffTotals({ additions: 0, deletions: 0 });
      return;
    }

    let cancelled = false;
    const refreshTotals = async () => {
      try {
        const files = await getGitFileDiffs(projectPath, false);
        if (cancelled) return;
        const totals = files.reduce(
          (acc, file) => {
            acc.additions += file.additions;
            acc.deletions += file.deletions;
            return acc;
          },
          { additions: 0, deletions: 0 },
        );
        setDiffTotals(totals);
      } catch {
        if (!cancelled) {
          setDiffTotals({ additions: 0, deletions: 0 });
        }
      }
    };

    void refreshTotals();
    const intervalId = window.setInterval(refreshTotals, 5000);
    const onFocus = () => {
      void refreshTotals();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, [projectPath]);

  return (
    <div className="electrobun-webkit-app-region-drag w-full flex items-center pl-18 border-b bg-muted/50 z-50 pr-2">
      <div className="electrobun-webkit-app-region-no-drag flex items-center">
        <Button
          size="icon-xs"
          variant="ghost"
          tooltip="Go back"
          disabled={!canGoBack}
          onClick={goBack}
        >
          <ChevronLeft />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          tooltip="Go forward"
          disabled={!canGoForward}
          onClick={goForward}
        >
          <ChevronRight />
        </Button>
      </div>
      <WorkspaceTabs />
      {isWorkspace && (
        <div className="electrobun-webkit-app-region-no-drag flex items-center gap-1.5">
          <ButtonGroup>
            <Button variant="outline" size="xs">
              <Box className="size-3.5" />
              Open
              {/* <ChevronDown className="size-2.5 opacity-50" /> */}
            </Button>
            <Button variant="outline" size="xs">
              <GitCommitHorizontal className="size-3.5" />
              Commit
              {/* <ChevronDown className="size-2.5 opacity-50" /> */}
            </Button>
          </ButtonGroup>
          <Separator orientation="vertical" className="h-4" />
          <Button
            size="icon-xs"
            variant="ghost"
            tooltip="Terminal"
            onClick={toggleTerminal}
          >
            <SquareTerminal />
          </Button>
          <Button size="xs" variant="ghost" tooltip="Diffs" onClick={toggleDiffPanel}>
            <Box className="size-3.5" />
            <span className="text-xs">
              <span className="text-emerald-600 dark:text-emerald-400">
                +{diffTotals.additions}
              </span>{" "}
              <span className="text-red-600 dark:text-red-400">
                -{diffTotals.deletions}
              </span>
            </span>
          </Button>
        </div>
      )}
    </div>
  );
}
