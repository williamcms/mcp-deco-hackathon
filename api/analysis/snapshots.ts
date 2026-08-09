/** A snapshot exists only to avoid repeating an identical Shopify analysis during one conversation. */
export interface AnalysisSnapshot<T> {
	value: T;
	createdAt: string;
	expiresAt: string;
}

export const ANALYSIS_SNAPSHOT_TTL_MS = 5 * 60 * 1000;
const MAX_SNAPSHOTS = 12;
const snapshots = new Map<string, AnalysisSnapshot<unknown>>();

function removeExpiredSnapshots(now: number): void {
	for (const [key, snapshot] of snapshots) {
		if (Date.parse(snapshot.expiresAt) <= now) snapshots.delete(key);
	}
}

/** Creates a stable key from a normalized parameter object supplied by the caller. */
export function createAnalysisSnapshotKey(
	shopDomain: string,
	parameters: Record<string, boolean | number | string>,
): string {
	return JSON.stringify({ shopDomain: shopDomain.toLowerCase(), parameters });
}

/** Returns a compatible, non-expired analysis without extending its lifetime. */
export function getAnalysisSnapshot<T>(
	key: string,
): AnalysisSnapshot<T> | null {
	const now = Date.now();
	removeExpiredSnapshots(now);
	const snapshot = snapshots.get(key) as AnalysisSnapshot<T> | undefined;
	return snapshot ?? null;
}

/** Stores only a bounded number of short-lived snapshots in process memory. */
export function storeAnalysisSnapshot<T>(
	key: string,
	value: T,
): AnalysisSnapshot<T> {
	const now = Date.now();
	removeExpiredSnapshots(now);

	while (snapshots.size >= MAX_SNAPSHOTS) {
		const oldestKey = snapshots.keys().next().value as string | undefined;
		if (!oldestKey) break;
		snapshots.delete(oldestKey);
	}

	const snapshot: AnalysisSnapshot<T> = {
		value,
		createdAt: new Date(now).toISOString(),
		expiresAt: new Date(now + ANALYSIS_SNAPSHOT_TTL_MS).toISOString(),
	};
	snapshots.set(key, snapshot);
	return snapshot;
}
