import { useSyncExternalStore } from "react";

const STORAGE_KEY = "golb-sidebar-open";
const listeners = new Set<() => void>();

function notify() {
	for (const listener of listeners) {
		listener();
	}
}

function getSnapshot(): boolean {
	return localStorage.getItem(STORAGE_KEY) !== "false";
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function toggleSidebar(): void {
	const next = !getSnapshot();
	localStorage.setItem(STORAGE_KEY, String(next));
	notify();
}

export function useSidebarOpen(): boolean {
	return useSyncExternalStore(subscribe, getSnapshot);
}
