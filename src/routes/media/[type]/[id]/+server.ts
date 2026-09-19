import { error } from '@sveltejs/kit';
import { resolveMedia, type MediaType } from '$lib/server/media';
import { requireUser } from '$lib/server/guards';
import type { RequestHandler } from './$types';

const VALID_TYPES: MediaType[] = ['exercise_image', 'workout_set_media'];

export const GET: RequestHandler = async ({ params, locals, url, request }) => {
	const user = requireUser(locals, url);

	const type = params.type as MediaType;
	if (!VALID_TYPES.includes(type)) {
		error(400, 'Invalid media request');
	}

	const id = Number(params.id);
	if (!Number.isFinite(id) || id <= 0) {
		error(400, 'Invalid media request');
	}

	const media = await resolveMedia(locals.db, type, id, user.id);
	if (!media) {
		error(404, 'Not found');
	}

	const object = await locals.env.MEDIA.get(media.key);
	if (!object) {
		error(404, 'File missing from storage');
	}

	const etag = object.httpEtag;
	const ifNoneMatch = request.headers.get('if-none-match');
	if (ifNoneMatch && ifNoneMatch.replace(/^W\//, '') === etag) {
		return new Response(null, { status: 304, headers: { etag } });
	}

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	if (!headers.has('content-type')) {
		headers.set('content-type', media.contentType);
	}
	if (!headers.has('cache-control')) {
		headers.set('cache-control', 'private, max-age=31536000, immutable');
	}
	headers.set('etag', etag);
	headers.set('content-disposition', `inline; filename="${media.key.split('/').pop()}"`);

	return new Response(object.body, { headers });
};
