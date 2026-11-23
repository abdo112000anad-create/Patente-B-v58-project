const CACHE_NAME = 'patente-ar-v58-learning-path-1';
const FETCH_TIMEOUT_MS = 10000;
const SHELL = [
  '/',
  '/index.html','/runtime-config.js',
  '/src/app.js',
  '/src/progress-backup.mjs',
  '/src/session-recovery.mjs',
  '/src/styles.css',
  '/src/rebuild.css',
  '/src/v24.css',
  '/src/account-ui.css',
  '/src/theme-dark.css',
  '/src/refactor-v38.css',
  '/src/v40-audio.css',
  '/src/v50-contrast.css',
  '/src/v52-dark-overhaul.css',
  '/src/v53-mobile-nav.css',
  '/src/v57-learning-path.css',
  '/app.bundle.js',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/fonts/Cairo-Variable.ttf',
  '/fonts/OFL.txt',
  '/app-icon-192.png',
  '/app-icon-512.png',
  '/app-icon-maskable-512.png',
  '/lessons/lesson-road-basics.webp',
  '/lessons/lesson-vehicle-safety.webp',
  '/lessons/lesson-documents.webp',
  '/lessons/lesson-driver-safety.webp',
  '/lessons/lesson-vulnerable-road-users.svg'
];
const OFFLINE_DATA = [
  '/data/lessons.json',
  '/data/lesson-support.json',
  '/data/questions.json',
  '/data/topic-labels.json',
  '/data/similar-groups.json',
  '/data/italian_arabic_dictionary_lookup.json',
  '/offline-assets.json'
];
const NETWORK_FIRST = new Set([
  '/',
  '/index.html','/runtime-config.js',
  '/src/app.js',
  '/src/progress-backup.mjs',
  '/src/session-recovery.mjs',
  '/src/styles.css',
  '/src/rebuild.css',
  '/src/v24.css',
  '/src/account-ui.css',
  '/src/theme-dark.css',
  '/app.bundle.js',
  '/manifest.webmanifest',
  '/data/lessons.json',
  '/data/lesson-support.json',
  '/data/questions.json',
  '/data/topic-labels.json',
  '/data/similar-groups.json',
  '/data/italian_arabic_dictionary_lookup.json'
]);

async function cachedResponse(cache, request) {
  const current = await cache.match(request, { ignoreSearch: true });
  if (current) return current;
  const older = (await caches.keys())
    .filter(key => key.startsWith('patente-ar-') && key !== CACHE_NAME)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const key of older) {
    const response = await (await caches.open(key)).match(request, { ignoreSearch: true });
    if (response) return response;
  }
  return undefined;
}

async function cacheUrl(cache, url) {
  const pathname = new URL(url, self.location.origin).pathname;
  const existing = await cache.match(url);
  if (existing && await safeToCache(existing, pathname)) return true;
  if (existing) await cache.delete(url).catch(() => {});
  try {
    const response = await boundedFetch(url, { cache: 'no-store' });
    if (!await safeToCache(response, pathname)) return false;
    await cache.put(url, response.clone());
    return true;
  } catch {
    return false;
  }
}

function boundedFetch(request, options = {}) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('Service worker fetch timed out'));
    }, FETCH_TIMEOUT_MS);
  });
  return Promise.race([
    fetch(request, { ...options, signal: controller.signal }),
    timeout
  ]).finally(() => clearTimeout(timer));
}

async function safeToCache(response, pathname) {
  if (!response || !response.ok) return false;
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const expectsScript = /\.(?:m?js)$/.test(pathname);
  const expectsJson = /\.json$/.test(pathname);
  const expectsCss = /\.css$/.test(pathname);
  const expectsHtml = pathname === '/' || pathname === '/index.html';
  const expectsImage = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(pathname);
  if (expectsScript && contentType && !/(?:javascript|ecmascript)/.test(contentType)) return false;
  if (expectsJson && contentType && !/(?:json|\+json)/.test(contentType)) return false;
  if (expectsCss && contentType && !/text\/css/.test(contentType)) return false;
  if (expectsHtml && contentType && !/text\/html/.test(contentType)) return false;
  if (expectsImage && contentType && !/^image\//.test(contentType)) return false;
  {
    const text = await response.clone().text().catch(() => '');
    const start = text.trimStart().slice(0, 512).toLowerCase();
    if (!expectsHtml && /^(?:<!doctype\s+html|<html|<head|<body)/i.test(start)) return false;
    if (/cloudflare|cf-chl-|challenge-platform|attention required/i.test(start) && /<|challenge|blocked/.test(start)) return false;
    if (expectsJson) {
      try {
        if (!validJsonPayload(pathname, JSON.parse(text))) return false;
      } catch { return false; }
    }
  }
  return true;
}

function validJsonPayload(pathname, data) {
  if (pathname === '/offline-assets.json') {
    return Array.isArray(data) && data.length > 0 && data.every(url =>
      typeof url === 'string' && url.startsWith('/quiz-images/') && !url.includes('..')
    );
  }
  if (pathname === '/data/questions.json') {
    if (!data || !Array.isArray(data.questions) || data.count !== data.questions.length || !data.questions.length) return false;
    const ids = new Set();
    return data.questions.every(question => {
      const id = Number(question?.id);
      if (!Number.isSafeInteger(id) || id <= 0 || ids.has(id) || !question.it || !question.ar || !question.topic || !['VERO', 'FALSO'].includes(question.answer)) return false;
      ids.add(id);
      return true;
    });
  }
  if (pathname === '/data/lessons.json') {
    const lessonKeys = ['id', 'titleIt', 'titleAr', 'summaryIt', 'summaryAr', 'keyPoints', 'trapWord', 'quickCheck'].join(',');
    const pointKeys = ['it', 'ar'].join(',');
    const quickCheckKeys = ['qIt', 'a', 'explainAr'].join(',');
    const trapWordKeys = ['word', 'reasonAr'].join(',');
    return !!data && data.schema_version === 4 && Array.isArray(data.modules) && data.modules.length === 11 && data.module_count === data.modules.length &&
      data.modules.every(module => module?.title_it && module?.title_ar && Array.isArray(module.lessons) && module.lessons.length > 0 &&
        Array.isArray(module.sources) && module.sources.length > 0 && module.lessons.every((lesson, index) => lesson &&
          Object.keys(lesson).join(',') === lessonKeys && lesson.id === `u${module.order_hint}-l${index + 1}` &&
          ['titleIt', 'titleAr', 'summaryIt', 'summaryAr'].every(key => typeof lesson[key] === 'string' && lesson[key].trim()) &&
          Array.isArray(lesson.keyPoints) && lesson.keyPoints.length >= 3 && lesson.keyPoints.length <= 4 &&
          lesson.keyPoints.every(point => point && Object.keys(point).join(',') === pointKeys && typeof point.it === 'string' && point.it.trim() && typeof point.ar === 'string' && point.ar.trim()) &&
          (lesson.trapWord === null || lesson.trapWord && !Array.isArray(lesson.trapWord) && Object.keys(lesson.trapWord).join(',') === trapWordKeys && typeof lesson.trapWord.word === 'string' && lesson.trapWord.word.trim() && typeof lesson.trapWord.reasonAr === 'string' && lesson.trapWord.reasonAr.trim()) &&
          Array.isArray(lesson.quickCheck) && lesson.quickCheck.length === 3 && lesson.quickCheck.every(item => item && !Array.isArray(item) && Object.keys(item).join(',') === quickCheckKeys && typeof item.qIt === 'string' && item.qIt.trim() && ['VERO', 'FALSO'].includes(item.a) && typeof item.explainAr === 'string' && item.explainAr.trim()))) &&
      data.modules.reduce((count, module) => count + module.lessons.length, 0) === 50;
  }
  if (pathname === '/data/lesson-support.json') {
    return !!data && data.schema_version === 1 && !!data.lessons && typeof data.lessons === 'object' && !Array.isArray(data.lessons) &&
      Object.keys(data.lessons).length === 50 && Object.entries(data.lessons).every(([id, metadata]) => /^u(?:[1-9]|1[01])-l[1-9][0-9]*$/.test(id) && metadata && typeof metadata === 'object' && !Array.isArray(metadata));
  }
  if (pathname === '/data/topic-labels.json') {
    return !!data && !Array.isArray(data) && typeof data === 'object' && Object.keys(data).length > 0 &&
      Object.entries(data).every(([topic, label]) => topic && label?.it && label?.ar);
  }
  if (pathname === '/data/similar-groups.json') {
    return !!data && data.schema_version === 2 && data.method?.clustering === 'complete-link' && Array.isArray(data.groups) &&
      Number.isFinite(data.method.minimum_sequence_similarity) && Number.isInteger(data.method.maximum_changed_tokens) &&
      data.group_count === data.groups.length && data.group_count > 0 && Number.isInteger(data.question_count) && data.question_count > 0 &&
      Number.isInteger(data.grouped_question_count) && data.grouped_question_count > 0 && /^[a-f0-9]{64}$/.test(data.question_bank_sha256 || '') &&
      data.groups.every(group => group?.id && group.topic && Array.isArray(group.question_ids) && group.question_ids.length >= 2 &&
        group.member_count === group.question_ids.length && group.question_ids.includes(group.representative_id) &&
        Number.isFinite(group.minimum_pair_similarity) && group.minimum_pair_similarity >= data.method.minimum_sequence_similarity &&
        Number.isInteger(group.maximum_changed_tokens) && group.maximum_changed_tokens <= data.method.maximum_changed_tokens);
  }
  if (pathname === '/data/italian_arabic_dictionary_lookup.json') {
    if (!data || data.schema_version !== 1 || !data.metadata || !Array.isArray(data.entries) || !data.entries.length ||
        data.metadata.total_entries !== data.entries.length || data.metadata.unique_question_bank_terms !== data.entries.length || data.metadata.terms_with_lookup_entry !== data.entries.length) return false;
    const words = new Set();
    return data.entries.every(entry => {
      if (!entry || typeof entry.word !== 'string' || !entry.word || words.has(entry.word) ||
          typeof entry.source !== 'string' || !entry.source || typeof entry.provider !== 'string' || !entry.provider ||
          !['reviewed_override', 'legacy_glossary_needs_review', 'machine_draft_needs_review', 'needs_translation'].includes(entry.status) ||
          ![0, 1].includes(entry.review_required) || !(entry.confidence === null || Number.isFinite(entry.confidence)) ||
          !(entry.translation_ar === null || typeof entry.translation_ar === 'string') || !(entry.ui_fallback_ar === null || typeof entry.ui_fallback_ar === 'string') || (entry.status === 'needs_translation' && !entry.ui_fallback_ar)) return false;
      words.add(entry.word);
      return true;
    });
  }
  return data !== null && typeof data === 'object';
}

async function sha256Hex(response) {
  const digest = await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer());
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

async function hasCompatibleOfflineData(cache) {
  try {
    const [bankResponse, lessonResponse, supportResponse, labelsResponse, similarResponse, dictionaryResponse] = await Promise.all([
      cache.match('/data/questions.json'), cache.match('/data/lessons.json'),
      cache.match('/data/lesson-support.json'), cache.match('/data/topic-labels.json'), cache.match('/data/similar-groups.json'),
      cache.match('/data/italian_arabic_dictionary_lookup.json')
    ]);
    if (![bankResponse, lessonResponse, supportResponse, labelsResponse, similarResponse, dictionaryResponse].every(Boolean)) return false;
    const [bank, lessons, support, labels, similar, dictionary] = await Promise.all([
      bankResponse.clone().json(), lessonResponse.clone().json(), supportResponse.clone().json(), labelsResponse.clone().json(), similarResponse.clone().json(), dictionaryResponse.clone().json()
    ]);
    if (!validJsonPayload('/data/questions.json', bank) || !validJsonPayload('/data/lessons.json', lessons) ||
        !validJsonPayload('/data/lesson-support.json', support) ||
        !validJsonPayload('/data/topic-labels.json', labels) || !validJsonPayload('/data/similar-groups.json', similar) ||
        !validJsonPayload('/data/italian_arabic_dictionary_lookup.json', dictionary) ||
        similar.question_count !== bank.count || await sha256Hex(bankResponse) !== similar.question_bank_sha256) return false;
    const lessonIds = lessons.modules.flatMap(module => module.lessons.map(lesson => lesson.id));
    if (lessonIds.length !== 50 || new Set(lessonIds).size !== 50 || lessonIds.some(id => !Object.hasOwn(support.lessons, id))) return false;
    const byId = new Map(bank.questions.map(question => [Number(question.id), question]));
    const groupedIds = new Set();
    for (const group of similar.groups) {
      if (!labels[group.topic]) return false;
      for (const rawId of group.question_ids) {
        const id = Number(rawId), question = byId.get(id);
        if (!question || question.topic !== group.topic || groupedIds.has(id)) return false;
        groupedIds.add(id);
      }
    }
    return groupedIds.size === similar.grouped_question_count;
  } catch {
    return false;
  }
}

async function cacheQuizFigures(cache) {
  const manifestResponse = await cachedResponse(cache, '/offline-assets.json');
  if (!manifestResponse) return { imageCached: 0, imageTotal: 0, failed: 1 };
  const urls = await manifestResponse.json().catch(() => []);
  if (!Array.isArray(urls)) return { imageCached: 0, imageTotal: 0, failed: 1 };
  let imageCached = 0;
  let failed = 0;
  for (let i = 0; i < urls.length; i += 32) {
    const batch = urls.slice(i, i + 32).filter(url =>
      typeof url === 'string' && url.startsWith('/quiz-images/') && !url.includes('..')
    );
    const results = await Promise.all(batch.map(url => cacheUrl(cache, url)));
    imageCached += results.filter(Boolean).length;
    failed += results.filter(result => !result).length;
  }
  return { imageCached, imageTotal: urls.length, failed };
}

// Installation deliberately does not depend on downloading the full data bank.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));

self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('message', event => {
  if (event.data?.type !== 'CACHE_OFFLINE_CONTENT') return;
  event.waitUntil((async () => {
    let status = 'partial';
    let coreCached = 0;
    let imageCached = 0;
    let imageTotal = 0;
    try {
      const cache = await caches.open(CACHE_NAME);
      const coreResults = await Promise.all([...SHELL, ...OFFLINE_DATA].map(url => cacheUrl(cache, url)));
      coreCached = coreResults.filter(Boolean).length;
      const dataCompatible = await hasCompatibleOfflineData(cache);
      if (!dataCompatible) {
        await Promise.all(OFFLINE_DATA.map(url => cache.delete(url).catch(() => {})));
        coreCached = coreResults.slice(0, SHELL.length).filter(Boolean).length;
      }
      const figures = await cacheQuizFigures(cache);
      imageCached = figures.imageCached;
      imageTotal = figures.imageTotal;
      const complete = dataCompatible && coreCached === coreResults.length && figures.failed === 0 && imageTotal > 0 && imageCached === imageTotal;
      if (complete) {
        status = 'ready';
        const older = (await caches.keys()).filter(key => key.startsWith('patente-ar-') && key !== CACHE_NAME);
        await Promise.all(older.map(key => caches.delete(key)));
      }
    } catch {
      status = 'unavailable';
    }
    event.source?.postMessage({ type: 'OFFLINE_CACHE_STATUS', status, coreCached, coreTotal: SHELL.length + OFFLINE_DATA.length, imageCached, imageTotal });
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  const cacheable = url.pathname === '/' || url.pathname === '/index.html' ||
    url.pathname.startsWith('/data/') || url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/quiz-images/') || url.pathname.startsWith('/lessons/') ||
    url.pathname.startsWith('/app-icon-') || url.pathname.endsWith('.webmanifest') ||
    url.pathname === '/app.bundle.js' || url.pathname === '/favicon.svg' || url.pathname === '/offline-assets.json';
  if (!cacheable) return;

  if (request.mode === 'navigate' || NETWORK_FIRST.has(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await boundedFetch(request, { cache: 'no-store' });
        const validResponse = await safeToCache(response, url.pathname);
        if (validResponse) await cache.put(request, response.clone()).catch(() => {});
        if (response.ok && validResponse) return response;
        const cached = await cachedResponse(cache, request);
        if (cached) return cached;
        if (request.mode === 'navigate') return await cachedResponse(cache, '/') || Response.error();
        return response.ok ? Response.error() : response;
      } catch {
        const cached = await cachedResponse(cache, request);
        if (cached) return cached;
        return request.mode === 'navigate' ? await cachedResponse(cache, '/') || Response.error() : Response.error();
      }
    })());
    return;
  }

  const cachePromise = caches.open(CACHE_NAME);
  const network = boundedFetch(request).then(async response => {
    if (await safeToCache(response, url.pathname)) {
      const cache = await cachePromise;
      await cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  });
  event.waitUntil(network.then(() => undefined).catch(() => undefined));
  event.respondWith(cachePromise.then(async cache => {
    const cached = await cachedResponse(cache, request);
    if (cached) return cached;
    return network.catch(() => Response.error());
  }));
});
