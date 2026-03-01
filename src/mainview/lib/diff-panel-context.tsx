import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useState,
} from "react";

const DEFAULT_WIDTH = 520;
const MIN_WIDTH = 360;
const MAX_WIDTH = 900;

type DiffPanelContextValue = {
	open: boolean;
	setOpen: (open: boolean) => void;
	toggle: () => void;
	width: number;
	setWidth: (width: number) => void;
	minWidth: number;
	maxWidth: number;
	isResizing: boolean;
	setIsResizing: (resizing: boolean) => void;
};

const DiffPanelContext = createContext<DiffPanelContextValue | null>(null);

export function DiffPanelProvider({ children }: { children: ReactNode }) {
	const [open, setOpen] = useState(false);
	const [width, setWidthRaw] = useState(DEFAULT_WIDTH);
	const [isResizing, setIsResizing] = useState(false);
	const toggle = useCallback(() => setOpen((prev) => !prev), []);
	const setWidth = useCallback(
		(nextWidth: number) =>
			setWidthRaw(Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, nextWidth)))),
		[],
	);

	const value: DiffPanelContextValue = {
		open,
		setOpen,
		toggle,
		width,
		setWidth,
		minWidth: MIN_WIDTH,
		maxWidth: MAX_WIDTH,
		isResizing,
		setIsResizing,
	};

	return <DiffPanelContext.Provider value={value}>{children}</DiffPanelContext.Provider>;
}

export function useDiffPanel() {
	const ctx = useContext(DiffPanelContext);
	if (!ctx) {
		throw new Error("useDiffPanel must be used within DiffPanelProvider");
	}
	return ctx;
}
