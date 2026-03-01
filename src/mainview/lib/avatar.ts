export const AVATAR_COLORS = [
	"bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400",
	"bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
	"bg-violet-100 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400",
	"bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400",
	"bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
	"bg-cyan-100 text-cyan-600 dark:bg-cyan-950/50 dark:text-cyan-400",
] as const;

export function getAvatarColor(id: string): (typeof AVATAR_COLORS)[number] {
	let hash = 0;
	for (let i = 0; i < id.length; i++) {
		hash = (hash << 5) - hash + id.charCodeAt(i);
		hash |= 0;
	}
	return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
