import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useMemo, useRef } from "react";
import {
	subscribeTerminalData,
	subscribeTerminalExit,
	terminalCreate,
	terminalKill,
	terminalResize,
	terminalWrite,
} from "@/lib/rpc";
import { useTabsContext } from "@/lib/tabs-context";

function formatError(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

export function XtermTerminalPanel() {
	const { activeTab } = useTabsContext();
	const containerRef = useRef<HTMLDivElement | null>(null);
	const terminalIdRef = useRef<string | null>(null);
	const cwd = useMemo(
		() => (activeTab.type === "workspace" ? activeTab.projectPath : undefined),
		[activeTab],
	);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}

		const xterm = new XTerm({
			allowProposedApi: false,
			cols: 120,
			cursorBlink: true,
			fontFamily:
				"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
			fontSize: 13,
			rows: 32,
			scrollback: 10000,
			theme: {
				background: "#ffffff",
				foreground: "#18181b",
				cursor: "#18181b",
				cursorAccent: "#fafafa",
				selectionBackground: "#d4d4d8",
				selectionForeground: "#18181b",
				black: "#18181b",
				red: "#dc2626",
				green: "#16a34a",
				yellow: "#ca8a04",
				blue: "#2563eb",
				magenta: "#9333ea",
				cyan: "#0891b2",
				white: "#fafafa",
				brightBlack: "#71717a",
				brightRed: "#ef4444",
				brightGreen: "#22c55e",
				brightYellow: "#eab308",
				brightBlue: "#3b82f6",
				brightMagenta: "#a855f7",
				brightCyan: "#06b6d4",
				brightWhite: "#ffffff",
			},
		});
		const fitAddon = new FitAddon();
		xterm.loadAddon(fitAddon);
		xterm.open(container);
		fitAddon.fit();
		xterm.focus();

		let disposed = false;

		const sendResize = () => {
			fitAddon.fit();
			const terminalId = terminalIdRef.current;
			if (!terminalId) {
				return;
			}
			void terminalResize({
				terminalId,
				cols: Math.max(2, xterm.cols),
				rows: Math.max(1, xterm.rows),
			});
		};

		let resizeRaf = 0;
		const resizeObserver = new ResizeObserver(() => {
			cancelAnimationFrame(resizeRaf);
			resizeRaf = requestAnimationFrame(sendResize);
		});
		resizeObserver.observe(container);

		const inputDisposable = xterm.onData((data) => {
			const terminalId = terminalIdRef.current;
			if (!terminalId) {
				return;
			}
			void terminalWrite({ terminalId, data });
		});

		const unsubscribeData = subscribeTerminalData((payload) => {
			if (payload.terminalId === terminalIdRef.current) {
				xterm.write(payload.data);
			}
		});

		const unsubscribeExit = subscribeTerminalExit((payload) => {
			if (payload.terminalId === terminalIdRef.current) {
				const exitCode = payload.exitCode ?? 0;
				xterm.writeln(`\r\n[process exited with code ${exitCode}]`);
			}
		});

		void (async () => {
			try {
				const { terminalId } = await terminalCreate({
					cols: Math.max(2, xterm.cols),
					rows: Math.max(1, xterm.rows),
					cwd,
				});
				if (disposed) {
					await terminalKill({ terminalId });
					return;
				}
				terminalIdRef.current = terminalId;
				sendResize();
			} catch (error) {
				xterm.writeln(`[terminal start failed] ${formatError(error)}`);
			}
		})();

		return () => {
			disposed = true;
			const terminalId = terminalIdRef.current;
			terminalIdRef.current = null;
			if (terminalId) {
				void terminalKill({ terminalId });
			}
			unsubscribeData();
			unsubscribeExit();
			inputDisposable.dispose();
			resizeObserver.disconnect();
			xterm.dispose();
		};
	}, [cwd]);

	return <div className="h-full w-full" ref={containerRef} />;
}
