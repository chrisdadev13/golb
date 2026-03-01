import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useState,
} from "react";

const DEFAULT_HEIGHT = 256;
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 400;

type TerminalPanelContextValue = {
	open: boolean;
	setOpen: (open: boolean) => void;
	toggle: () => void;
	height: number;
	setHeight: (height: number) => void;
	minHeight: number;
	maxHeight: number;
	isResizing: boolean;
	setIsResizing: (resizing: boolean) => void;
};

const TerminalPanelContext = createContext<TerminalPanelContextValue | null>(
	null,
);

export function TerminalPanelProvider({ children }: { children: ReactNode }) {
	const [open, setOpen] = useState(false);
	const [height, setHeightRaw] = useState(DEFAULT_HEIGHT);
	const [isResizing, setIsResizing] = useState(false);
	const toggle = useCallback(() => setOpen((prev) => !prev), []);
	const setHeight = useCallback(
		(h: number) =>
			setHeightRaw(Math.round(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, h)))),
		[],
	);

	const value: TerminalPanelContextValue = {
		open,
		setOpen,
		toggle,
		height,
		setHeight,
		minHeight: MIN_HEIGHT,
		maxHeight: MAX_HEIGHT,
		isResizing,
		setIsResizing,
	};

	return (
		<TerminalPanelContext.Provider value={value}>
			{children}
		</TerminalPanelContext.Provider>
	);
}

export function useTerminalPanel() {
	const ctx = useContext(TerminalPanelContext);
	if (!ctx)
		throw new Error(
			"useTerminalPanel must be used within TerminalPanelProvider",
		);
	return ctx;
}
