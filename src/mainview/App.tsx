import { TitleBar } from "./components/title-bar";
import { XtermTerminalPanel } from "./components/xterm-terminal-panel";
import {
	Sheet,
	SheetPopup,
} from "./components/ui/sheet";
import { TabsProvider, useTabsContext } from "./lib/tabs-context";
import { TerminalPanelProvider, useTerminalPanel } from "./lib/terminal-panel-context";
import Home from "./pages/home";
import IndexPage from "./pages/index";

function AppContent() {
	const { tabs, activeTabId } = useTabsContext();
	const { open: terminalOpen, setOpen: setTerminalOpen } = useTerminalPanel();

	return (
		<div className="flex flex-col h-full">
			<TitleBar />
			<main className="flex-1 overflow-auto">
				{tabs.map((tab) => (
					<div
						key={tab.id}
						className={tab.id === activeTabId ? "h-full" : "hidden"}
					>
						{tab.type === "new-tab" || !tab.projectPath ? (
							<IndexPage />
						) : (
							<Home projectPath={tab.projectPath} tabId={tab.id} />
						)}
					</div>
				))}
			</main>
			<Sheet open={terminalOpen} onOpenChange={setTerminalOpen}>
				<SheetPopup side="bottom" showCloseButton={true}>
					<div className="flex flex-col h-64 min-h-0">
						<XtermTerminalPanel />
					</div>
				</SheetPopup>
			</Sheet>
		</div>
	);
}

function App() {
	return (
		<TabsProvider>
			<TerminalPanelProvider>
				<AppContent />
			</TerminalPanelProvider>
		</TabsProvider>
	);
}

export default App;
