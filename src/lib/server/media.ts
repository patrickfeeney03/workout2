import { bind, first, type Db } from './db';

/**
 * R2 media helpers. Object keys mirror the legacy `file_path` column values
 * with the `data/uploads/` prefix stripped, e.g.
 * `data/uploads/exercises/12_1781217364_6a2b.png` -> `exercises/12_1781217364_6a2b.png`.
 */

export type MediaType = 'exercise_image' | 'workout_set_media';

export interface MediaResolved {
	readonly rowId: number;
	readonly key: string;
	readonly contentType: string;
}

export function r2Key(filePath: string): string {
	return filePath.replace(/^data\/uploads\//, '').replace(/^\/+/, '');
}

const MIME_BY_EXTENSION: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	webp: 'image/webp',
	gif: 'image/gif',
	avif: 'image/avif',
	mp4: 'video/mp4',
	webm: 'video/webm',
	mov: 'video/quicktime'
};

export function contentTypeFor(filePath: string): string {
	const extension = filePath.split('.').pop()?.toLowerCase() ?? '';
	return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

export async function resolveMedia(
	db: Db,
	type: MediaType,
	id: number,
	userId: number
): Promise<MediaResolved | null> {
	if (type === 'exercise_image') {
		const row = await first<{ file_path: string }>(
			bind(
				db,
				`SELECT ei.file_path
				 FROM exercise_images ei
				 JOIN exercises e ON e.id = ei.exercise_id
				 WHERE ei.id = ? AND e.user_id = ?`,
				[id, userId]
			)
		);
		if (!row) return null;
		return { rowId: id, key: r2Key(row.file_path), contentType: contentTypeFor(row.file_path) };
	}

	const row = await first<{ file_path: string; media_type: string }>(
		bind(
			db,
			`SELECT wsm.file_path, wsm.media_type
			 FROM workout_set_media wsm
			 JOIN workout_sets ws ON ws.id = wsm.workout_set_id
			 JOIN workout_exercises we ON we.id = ws.workout_exercise_id
			 JOIN workouts w ON w.id = we.workout_id
			 WHERE wsm.id = ? AND w.user_id = ?`,
			[id, userId]
		)
	);
	if (!row) return null;
	return { rowId: id, key: r2Key(row.file_path), contentType: contentTypeFor(row.file_path) };
}

function randomToken(): string {
	return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

function extensionFor(fileName: string): string {
	const parts = fileName.split('.');
	if (parts.length < 2) return 'bin';
	return parts.pop()!.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
}

/** Store an uploaded File in R2 and return the legacy-style file_path value. */
export async function storeUpload(
	bucket: R2Bucket,
	file: File,
	folder: 'exercises' | 'sets',
	ownerId: number
): Promise<string> {
	const key = `${folder}/${ownerId}_${Date.now()}_${randomToken()}.${extensionFor(file.name)}`;
	const bytes = await file.arrayBuffer();
	await bucket.put(key, bytes, {
		httpMetadata: {
			contentType: file.type || contentTypeFor(key),
			cacheControl: 'private, max-age=31536000, immutable'
		}
	});
	return `data/uploads/${key}`;
}

export async function deleteStored(bucket: R2Bucket, filePath: string): Promise<void> {
	try {
		await bucket.delete(r2Key(filePath));
	} catch {
		// Best effort: the DB row is the source of truth.
	}
}
