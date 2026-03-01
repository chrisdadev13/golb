import {
  Box,
  // ChevronDown,
  ChevronLeft,
  ChevronRight,
  GitCommitHorizontal,
  SquareTerminal,
} from "lucide-react";
import { useTabsContext } from "@/lib/tabs-context";
import { Button } from "./ui/button";
import { ButtonGroup } from "./ui/button-group";
import { Separator } from "./ui/separator";
import { WorkspaceTabs } from "./workspace-tabs";

export function TitleBar() {
  const { activeTab } = useTabsContext();
  const isWorkspace = activeTab.type === "workspace";

  return (
    <div className="electrobun-webkit-app-region-drag w-full flex items-center pl-18 border-b bg-muted/50 z-50 pr-2">
      <div className="electrobun-webkit-app-region-no-drag flex items-center">
        <Button
          size="icon-xs"
          variant="ghost"
          tooltip="Go back"
          onClick={() => history.back()}
        >
          <ChevronLeft />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          tooltip="Go forward"
          onClick={() => history.forward()}
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
          <Button size="icon-xs" variant="ghost" tooltip="Terminal">
            <SquareTerminal />
          </Button>
          <Button size="xs" variant="ghost">
            <Box className="size-3.5" />
            <span className="text-xs">
              <span className="text-emerald-600 dark:text-emerald-400">+3</span>{" "}
              <span className="text-red-600 dark:text-red-400">-2</span>
            </span>
          </Button>
        </div>
      )}
    </div>
  );
}
