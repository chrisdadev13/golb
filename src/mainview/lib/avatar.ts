export const AVATAR_COLORS = [
	"bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
	"bg-zinc-100 text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300",
	"bg-stone-100 text-stone-700 dark:bg-stone-800/60 dark:text-stone-300",
	"bg-neutral-100 text-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-300",
	"bg-gray-100 text-gray-700 dark:bg-gray-800/60 dark:text-gray-300",
	"bg-blue-50 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
] as const;

export function getAvatarColor(id: string): (typeof AVATAR_COLORS)[number] {
	let hash = 0;
	for (let i = 0; i < id.length; i++) {
		hash = (hash << 5) - hash + id.charCodeAt(i);
		hash |= 0;
	}
	return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
