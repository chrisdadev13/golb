import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
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
	canGoBack: boolean;
	canGoForward: boolean;
	goBack: () => void;
	goForward: () => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);

let nextId = 1;
function generateId() {
	return `tab-${nextId++}`;
}

function createNewTab(): Tab {
	return { id: generateId(), type: "new-tab" };
}

type NavState = { tabs: Tab[]; activeTabId: string; navIndex: number };

export function TabsProvider({ children }: { children: ReactNode }) {
	const [tabs, setTabs] = useState<Tab[]>(() => [createNewTab()]);
	const [activeTabId, setActiveTabId] = useState(() => tabs[0].id);
	const [canGoBack, setCanGoBack] = useState(false);
	const [canGoForward, setCanGoForward] = useState(false);

	const tabsRef = useRef(tabs);
	tabsRef.current = tabs;
	const activeTabIdRef = useRef(activeTabId);
	activeTabIdRef.current = activeTabId;

	const navRef = useRef({ index: 0, length: 1, restoringFromHistory: false });

	const activeTab = useMemo(
		() => tabs.find((t) => t.id === activeTabId) ?? tabs[0],
		[tabs, activeTabId],
	);

	const pushNavState = useCallback((newTabs: Tab[], newActiveTabId: string) => {
		if (navRef.current.restoringFromHistory) return;
		const nav = navRef.current;
		nav.index++;
		nav.length = nav.index + 1;
		const state: NavState = { tabs: newTabs, activeTabId: newActiveTabId, navIndex: nav.index };
		history.pushState(state, "");
		setCanGoBack(true);
		setCanGoForward(false);
	}, []);

	useEffect(() => {
		const state: NavState = {
			tabs: tabsRef.current,
			activeTabId: activeTabIdRef.current,
			navIndex: 0,
		};
		history.replaceState(state, "");
	}, []);

	useEffect(() => {
		const handlePopstate = (event: PopStateEvent) => {
			const state = event.state as NavState | null;
			if (!state?.tabs) return;

			const nav = navRef.current;
			nav.restoringFromHistory = true;
			nav.index = state.navIndex;

			setTabs(state.tabs);
			setActiveTabId(state.activeTabId);
			setCanGoBack(state.navIndex > 0);
			setCanGoForward(state.navIndex < nav.length - 1);

			nav.restoringFromHistory = false;
		};

		window.addEventListener("popstate", handlePopstate);
		return () => window.removeEventListener("popstate", handlePopstate);
	}, []);

	const goBack = useCallback(() => { history.back(); }, []);
	const goForward = useCallback(() => { history.forward(); }, []);

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

				if (activeTabIdRef.current === tabId) {
					const newIdx = Math.min(idx, next.length - 1);
					setActiveTabId(next[newIdx].id);
				}

				return next;
			});
		},
		[],
	);

	const switchTab = useCallback((tabId: string) => {
		if (tabId === activeTabIdRef.current) return;
		setActiveTabId(tabId);
		pushNavState(tabsRef.current, tabId);
	}, [pushNavState]);

	const openProject = useCallback(
		(projectPath: string) => {
			const currentTabs = tabsRef.current;
			const currentActiveId = activeTabIdRef.current;
			const projectName = projectPath.split("/").pop() || "project";

			const existing = currentTabs.find(
				(t) => t.type === "workspace" && t.projectPath === projectPath,
			);
			if (existing) {
				if (existing.id !== currentActiveId) {
					setActiveTabId(existing.id);
					pushNavState(currentTabs, existing.id);
				}
				return;
			}

			const active = currentTabs.find((t) => t.id === currentActiveId);
			if (active?.type === "new-tab") {
				const newTabs = currentTabs.map((t) =>
					t.id === currentActiveId
						? { ...t, type: "workspace" as const, projectPath, projectName }
						: t,
				);
				setTabs(newTabs);
				pushNavState(newTabs, currentActiveId);
				return;
			}

			const tab: Tab = {
				id: generateId(),
				type: "workspace",
				projectPath,
				projectName,
			};
			const newTabs = [...currentTabs, tab];
			setTabs(newTabs);
			setActiveTabId(tab.id);
			pushNavState(newTabs, tab.id);
		},
		[pushNavState],
	);

	const value = useMemo(
		() => ({ tabs, activeTabId, activeTab, addTab, closeTab, switchTab, openProject, canGoBack, canGoForward, goBack, goForward }),
		[tabs, activeTabId, activeTab, addTab, closeTab, switchTab, openProject, canGoBack, canGoForward, goBack, goForward],
	);

	return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}

export function useTabsContext() {
	const ctx = useContext(TabsContext);
	if (!ctx) throw new Error("useTabsContext must be used within TabsProvider");
	return ctx;
}
