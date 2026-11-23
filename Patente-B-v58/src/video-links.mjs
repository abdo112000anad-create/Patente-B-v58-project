export const VIDEO_MANIFEST_CACHE_KEY = 'patente-b-video-manifest-v1';

export function normalizeYouTubeVideoUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    let id = '';
    if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] || '';
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
      else if (/^\/(shorts|embed)\/[A-Za-z0-9_-]{11}$/u.test(url.pathname)) id = url.pathname.split('/').at(-1);
    }
    return /^[A-Za-z0-9_-]{11}$/u.test(id) ? `https://youtu.be/${id}` : null;
  } catch {
    return null;
  }
}

export function parseVideoManifest(input) {
  if (!input || input.schemaVersion !== 1 || !Array.isArray(input.lessons) || input.lessons.length > 100) {
    throw new TypeError('Invalid video manifest schema');
  }
  const result = new Map();
  for (const row of input.lessons) {
    const moduleId = String(row?.moduleId || '').trim();
    const lessonIndex = Number(row?.lessonIndex);
    if (!/^[a-z0-9-]{1,80}$/u.test(moduleId) || !Number.isInteger(lessonIndex) || lessonIndex < 0 || lessonIndex > 49) {
      throw new TypeError('Invalid video manifest lesson key');
    }
    const key = `${moduleId}.${lessonIndex}`;
    if (result.has(key)) throw new TypeError('Duplicate video manifest lesson key');
    const videoUrl = row.videoUrl === null || row.videoUrl === '' ? null : normalizeYouTubeVideoUrl(row.videoUrl);
    if (row.videoUrl !== null && row.videoUrl !== '' && !videoUrl) throw new TypeError('Invalid YouTube URL in video manifest');
    result.set(key, videoUrl);
  }
  return result;
}

export function lessonVideoDestination(lesson, lessonKey, overrides = new Map()) {
  const value = overrides instanceof Map && overrides.has(lessonKey) ? overrides.get(lessonKey) : lesson?.videoUrl;
  const url = normalizeYouTubeVideoUrl(value);
  return url ? {kind: 'video', url} : {kind: 'upcoming', url: null};
}

function readCachedManifest(storage) {
  try {
    const raw = storage?.getItem(VIDEO_MANIFEST_CACHE_KEY);
    return raw ? parseVideoManifest(JSON.parse(raw)) : new Map();
  } catch {
    return new Map();
  }
}

export async function loadVideoManifest({endpoint = globalThis.PATENTEB_CONFIG?.videoManifestEndpoint || '', fetchImpl = globalThis.fetch, storage = globalThis.localStorage, timeoutMs = 3500} = {}) {
  const cached = readCachedManifest(storage);
  const source = String(endpoint || '').trim();
  if (!source) return cached;
  let url;
  try {
    url = new URL(source, globalThis.location?.href || 'https://localhost/');
  } catch {
    return cached;
  }
  const localDevelopment = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(localDevelopment && url.protocol === 'http:')) return cached;
  if (typeof fetchImpl !== 'function') return cached;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(url.href, {method: 'GET', cache: 'no-store', redirect: 'error', headers: {Accept: 'application/json'}, ...(controller ? {signal: controller.signal} : {})});
    if (!response.ok) return cached;
    const payload = await response.json();
    const parsed = parseVideoManifest(payload);
    try { storage?.setItem(VIDEO_MANIFEST_CACHE_KEY, JSON.stringify(payload)); } catch {}
    return parsed;
  } catch {
    return cached;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
