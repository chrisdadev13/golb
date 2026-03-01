import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DiffPanel } from "./components/diff-panel";
import { TitleBar } from "./components/title-bar";
import { Button } from "./components/ui/button";
import { XtermTerminalPanel } from "./components/xterm-terminal-panel";
import { DiffPanelProvider, useDiffPanel } from "./lib/diff-panel-context";
import { TabsProvider, useTabsContext } from "./lib/tabs-context";
import {
	TerminalPanelProvider,
	useTerminalPanel,
} from "./lib/terminal-panel-context";
import Home from "./pages/home";
import IndexPage from "./pages/index";

const HEADER_HEIGHT = 36;

function DiffResizeHandle() {
	const { width, setWidth, minWidth, maxWidth, setIsResizing } = useDiffPanel();
	const startX = useRef(0);
	const startWidth = useRef(0);

	const onMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			startX.current = e.clientX;
			startWidth.current = width;
			setIsResizing(true);

			let raf = 0;
			const onMouseMove = (ev: MouseEvent) => {
				cancelAnimationFrame(raf);
				raf = requestAnimationFrame(() => {
					const delta = startX.current - ev.clientX;
					setWidth(startWidth.current + delta);
				});
			};

			const onMouseUp = () => {
				cancelAnimationFrame(raf);
				document.removeEventListener("mousemove", onMouseMove);
				document.removeEventListener("mouseup", onMouseUp);
				document.body.style.cursor = "";
				document.body.style.userSelect = "";
				setIsResizing(false);
			};

			document.body.style.cursor = "col-resize";
			document.body.style.userSelect = "none";
			document.addEventListener("mousemove", onMouseMove);
			document.addEventListener("mouseup", onMouseUp);
		},
		[setIsResizing, setWidth, width],
	);

	return (
		<hr
			aria-orientation="vertical"
			aria-valuemin={minWidth}
			aria-valuemax={maxWidth}
			aria-valuenow={width}
			tabIndex={0}
			className="w-px border-none cursor-col-resize bg-border hover:bg-primary/30 transition-colors shrink-0 h-full"
			onMouseDown={onMouseDown}
		/>
	);
}

function ResizeHandle() {
	const { height, setHeight, minHeight, maxHeight, setIsResizing } =
		useTerminalPanel();
	const startY = useRef(0);
	const startHeight = useRef(0);

	const onMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			startY.current = e.clientY;
			startHeight.current = height;
			setIsResizing(true);

			let raf = 0;
			const onMouseMove = (ev: MouseEvent) => {
				cancelAnimationFrame(raf);
				raf = requestAnimationFrame(() => {
					const delta = startY.current - ev.clientY;
					setHeight(startHeight.current + delta);
				});
			};

			const onMouseUp = () => {
				cancelAnimationFrame(raf);
				document.removeEventListener("mousemove", onMouseMove);
				document.removeEventListener("mouseup", onMouseUp);
				document.body.style.cursor = "";
				document.body.style.userSelect = "";
				setIsResizing(false);
			};

			document.body.style.cursor = "row-resize";
			document.body.style.userSelect = "none";
			document.addEventListener("mousemove", onMouseMove);
			document.addEventListener("mouseup", onMouseUp);
		},
		[height, setHeight, setIsResizing],
	);

	return (
		<hr
			aria-orientation="horizontal"
			aria-valuemin={minHeight}
			aria-valuemax={maxHeight}
			aria-valuenow={height}
			tabIndex={0}
			className="h-px border-none cursor-row-resize bg-border hover:bg-primary/30 transition-colors shrink-0"
			onMouseDown={onMouseDown}
		/>
	);
}

function TerminalHeader({ onClose }: { onClose: () => void }) {
	return (
		<div
			className="flex items-center justify-between px-3 shrink-0"
			style={{ height: HEADER_HEIGHT }}
		>
			<div className="flex items-center gap-2 text-xs">
				<span className="font-medium">Terminal</span>
			</div>
			<Button size="icon-xs" variant="ghost" onClick={onClose}>
				<X className="size-3.5" />
			</Button>
		</div>
	);
}

function TerminalSection() {
	const { open, setOpen, height, isResizing } = useTerminalPanel();
	const [mounted, setMounted] = useState(false);
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		if (open) {
			setMounted(true);
			requestAnimationFrame(() => {
				requestAnimationFrame(() => setVisible(true));
			});
		} else {
			setVisible(false);
		}
	}, [open]);

	const handleTransitionEnd = () => {
		if (!open) {
			setMounted(false);
		}
	};

	if (!mounted) return null;

	const totalHeight = visible ? height : 0;

	return (
		<>
			<ResizeHandle />
			<div
				className={`shrink-0 overflow-hidden flex flex-col bg-white ${isResizing ? "" : "transition-[height] duration-200 ease-out"}`}
				style={{ height: totalHeight, willChange: isResizing ? "height" : undefined }}
				onTransitionEnd={handleTransitionEnd}
			>
				<TerminalHeader onClose={() => setOpen(false)} />
				<div className="flex-1 min-h-0">
					<XtermTerminalPanel />
				</div>
			</div>
		</>
	);
}

function DiffSection() {
	const { open, width, isResizing } = useDiffPanel();
	const [mounted, setMounted] = useState(false);
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		if (open) {
			setMounted(true);
			requestAnimationFrame(() => {
				requestAnimationFrame(() => setVisible(true));
			});
		} else {
			setVisible(false);
		}
	}, [open]);

	const handleTransitionEnd = () => {
		if (!open) {
			setMounted(false);
		}
	};

	if (!mounted) return null;

	const totalWidth = visible ? width : 0;

	return (
		<>
			<DiffResizeHandle />
			<div
				className={`shrink-0 overflow-hidden bg-white ${isResizing ? "" : "transition-[width] duration-200 ease-out"}`}
				style={{ width: totalWidth, willChange: isResizing ? "width" : undefined }}
				onTransitionEnd={handleTransitionEnd}
			>
				<DiffPanel />
			</div>
		</>
	);
}

function AppContent() {
	const { tabs, activeTabId } = useTabsContext();

	return (
		<div className="flex flex-col h-full">
			<TitleBar />
			<div className="flex-1 min-h-0 flex overflow-hidden">
				<main className="flex-1 overflow-auto min-h-0 min-w-0">
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
				<DiffSection />
			</div>
			<TerminalSection />
		</div>
	);
}

function App() {
	return (
		<TabsProvider>
			<TerminalPanelProvider>
				<DiffPanelProvider>
					<AppContent />
				</DiffPanelProvider>
			</TerminalPanelProvider>
		</TabsProvider>
	);
}

export default App;
