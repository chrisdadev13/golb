import { TitleBar } from "./components/title-bar";
import { TabsProvider, useTabsContext } from "./lib/tabs-context";
import Home from "./pages/home";
import IndexPage from "./pages/index";

function AppContent() {
	const { tabs, activeTabId } = useTabsContext();

	return (
		<div className="flex flex-col h-full">
			<TitleBar />
			<main className="flex-1 overflow-auto">
				{tabs.map((tab) => (
					<div
						key={tab.id}
						className={tab.id === activeTabId ? "h-full" : "hidden"}
					>
						{tab.type === "new-tab" ? (
							<IndexPage />
						) : (
							<Home projectPath={tab.projectPath!} tabId={tab.id} />
						)}
					</div>
				))}
			</main>
		</div>
	);
}

function App() {
	return (
		<TabsProvider>
			<AppContent />
		</TabsProvider>
	);
}

export default App;
