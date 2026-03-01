import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useState,
	type ReactNode,
} from "react";

export type Tab = {
	id: string;
	type: "new-tab" | "workspace";
	projectPath?: string;
	projectName?: string;
};

type TabsContextValue = {
	tabs: Tab[];
	activeTabId: string;
	activeTab: Tab;
	addTab: (options?: { type?: Tab["type"]; projectPath?: string; projectName?: string }) => void;
	closeTab: (tabId: string) => void;
	switchTab: (tabId: string) => void;
	openProject: (projectPath: string) => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);

let nextId = 1;
function generateId() {
	return `tab-${nextId++}`;
}

function createNewTab(): Tab {
	return { id: generateId(), type: "new-tab" };
}

export function TabsProvider({ children }: { children: ReactNode }) {
	const [tabs, setTabs] = useState<Tab[]>(() => [createNewTab()]);
	const [activeTabId, setActiveTabId] = useState(() => tabs[0].id);

	const activeTab = useMemo(
		() => tabs.find((t) => t.id === activeTabId) ?? tabs[0],
		[tabs, activeTabId],
	);

	const addTab = useCallback(
		(options?: { type?: Tab["type"]; projectPath?: string; projectName?: string }) => {
			const tab: Tab = {
				id: generateId(),
				type: options?.type ?? "new-tab",
				projectPath: options?.projectPath,
				projectName: options?.projectName,
			};
			setTabs((prev) => [...prev, tab]);
			setActiveTabId(tab.id);
		},
		[],
	);

	const closeTab = useCallback(
		(tabId: string) => {
			setTabs((prev) => {
				const idx = prev.findIndex((t) => t.id === tabId);
				if (idx === -1) return prev;

				const next = prev.filter((t) => t.id !== tabId);

				if (next.length === 0) {
					const fresh = createNewTab();
					setActiveTabId(fresh.id);
					return [fresh];
				}

				if (activeTabId === tabId) {
					const newIdx = Math.min(idx, next.length - 1);
					setActiveTabId(next[newIdx].id);
				}

				return next;
			});
		},
		[activeTabId],
	);

	const switchTab = useCallback((tabId: string) => {
		setActiveTabId(tabId);
	}, []);

	const openProject = useCallback(
		(projectPath: string) => {
			const projectName = projectPath.split("/").pop() || "project";

			// If project is already open in a tab, switch to it
			const existing = tabs.find(
				(t) => t.type === "workspace" && t.projectPath === projectPath,
			);
			if (existing) {
				setActiveTabId(existing.id);
				return;
			}

			// If the active tab is a new-tab, convert it in-place
			const active = tabs.find((t) => t.id === activeTabId);
			if (active?.type === "new-tab") {
				setTabs((prev) =>
					prev.map((t) =>
						t.id === activeTabId
							? { ...t, type: "workspace" as const, projectPath, projectName }
							: t,
					),
				);
				return;
			}

			// Otherwise create a new workspace tab
			addTab({ type: "workspace", projectPath, projectName });
		},
		[tabs, activeTabId, addTab],
	);

	const value = useMemo(
		() => ({ tabs, activeTabId, activeTab, addTab, closeTab, switchTab, openProject }),
		[tabs, activeTabId, activeTab, addTab, closeTab, switchTab, openProject],
	);

	return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}

export function useTabsContext() {
	const ctx = useContext(TabsContext);
	if (!ctx) throw new Error("useTabsContext must be used within TabsProvider");
	return ctx;
}
