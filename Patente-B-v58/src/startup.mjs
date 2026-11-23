export async function loadCourseData({fetchImpl = globalThis.fetch, timeoutMs = 15000} = {}) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error('Connessione troppo lenta. Attendi la verifica del sito e riprova. / الاتصال بطيء أو عالق. انتظر انتهاء التحقق من الموقع ثم أعد المحاولة.');
      error.code = 'course_timeout';
      reject(error);
      controller.abort();
    }, timeoutMs);
  });
  const paths = ['/data/questions.json', '/data/lessons.json', '/data/topic-labels.json', '/data/similar-groups.json', '/data/lesson-support.json'];
  const requests = Promise.all(paths.map(async path => {
    const response = await fetchImpl(path, {signal: controller.signal, credentials: 'same-origin', cache: 'no-store'});
    if (response.headers.get('cf-mitigated') === 'challenge' || response.status === 403) {
      throw new Error('La protezione del sito ha bloccato un file. Completa la verifica e riprova. / حجبت حماية الموقع أحد الملفات. أكمل التحقق ثم أعد المحاولة.');
    }
    if (!response.ok) throw new Error(`File del corso non disponibile (HTTP ${response.status}). / ملف المنهج غير متاح (HTTP ${response.status}).`);
    if (!/^(application\/(?:[a-z0-9.+-]*\+)?json)(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) {
      throw new Error('Il server ha restituito una pagina invece dei dati del corso. / أعاد الخادم صفحة بدل بيانات المنهج.');
    }
    try {
      const rawText = await response.text();
      return {path, rawText, data: JSON.parse(rawText)};
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new Error('Dati del corso non validi. Riprova tra poco. / بيانات المنهج غير صالحة. أعد المحاولة بعد قليل.');
    }
  }));
  try {
    const loaded = await Promise.race([requests, timeout]);
    const [bankFile, lessonFile, labelsFile, similarFile, supportFile] = loaded;
    const bank = bankFile?.data;
    const lessons = lessonFile?.data;
    const labels = labelsFile?.data;
    const similar = similarFile?.data;
    const support = supportFile?.data;
    if (!bank || !Array.isArray(bank.questions) || bank.questions.length === 0 || bank.count !== bank.questions.length ||
        !lessons || lessons.schema_version !== 4 || !Array.isArray(lessons.modules) || lessons.module_count !== lessons.modules.length || lessons.module_count !== 11 ||
        !labels || typeof labels !== 'object' || Array.isArray(labels) || Object.keys(labels).length === 0 ||
        !similar || similar.schema_version !== 2 || !Array.isArray(similar.groups) || similar.group_count !== similar.groups.length ||
        similar.question_count !== bank.questions.length || !/^[a-f0-9]{64}$/.test(similar.question_bank_sha256 || '') ||
        !support || support.schema_version !== 1 || !support.lessons || typeof support.lessons !== 'object' || Array.isArray(support.lessons)) {
      const error = new Error('I file del corso sono incompleti o non compatibili. / ملفات المنهج ناقصة أو غير متوافقة.');
      error.code = 'course_integrity';
      throw error;
    }
    const lessonKeys = 'id,titleIt,titleAr,summaryIt,summaryAr,keyPoints,trapWord,quickCheck';
    const pointKeys = 'it,ar';
    const trapWordKeys = 'word,reasonAr';
    const quickCheckKeys = 'qIt,a,explainAr';
    const expectedIds = new Set();
    let lessonCount = 0;
    for (const module of lessons.modules) {
      if (!Number.isInteger(module?.order_hint) || !Array.isArray(module.lessons)) {
        const error = new Error('I dati delle lezioni non sono validi. / بيانات الدروس غير صالحة.');
        error.code = 'course_integrity';
        throw error;
      }
      for (let index = 0; index < module.lessons.length; index += 1) {
        const lesson = module.lessons[index];
        const expectedId = `u${module.order_hint}-l${index + 1}`;
        const validTrapWord = lesson?.trapWord === null || (lesson?.trapWord && typeof lesson.trapWord === 'object' && !Array.isArray(lesson.trapWord) && Object.keys(lesson.trapWord).join(',') === trapWordKeys && typeof lesson.trapWord.word === 'string' && lesson.trapWord.word.trim() && typeof lesson.trapWord.reasonAr === 'string' && lesson.trapWord.reasonAr.trim());
        const validQuickCheck = Array.isArray(lesson?.quickCheck) && lesson.quickCheck.length === 3 && lesson.quickCheck.every(item =>
          item && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).join(',') === quickCheckKeys &&
          typeof item.qIt === 'string' && item.qIt.trim() && ['VERO', 'FALSO'].includes(item.a) && typeof item.explainAr === 'string' && item.explainAr.trim());
        if (!lesson || Object.keys(lesson).join(',') !== lessonKeys || lesson.id !== expectedId || expectedIds.has(lesson.id) ||
            !['titleIt', 'titleAr', 'summaryIt', 'summaryAr'].every(key => typeof lesson[key] === 'string' && lesson[key].trim()) ||
            !Array.isArray(lesson.keyPoints) || lesson.keyPoints.length < 3 || lesson.keyPoints.length > 4 || !validTrapWord || !validQuickCheck ||
            !lesson.keyPoints.every(point => point && Object.keys(point).join(',') === pointKeys && typeof point.it === 'string' && point.it.trim() && typeof point.ar === 'string' && point.ar.trim())) {
          const error = new Error('Il formato di una lezione non è valido. / تنسيق أحد الدروس غير صالح.');
          error.code = 'course_integrity';
          throw error;
        }
        expectedIds.add(lesson.id);
        lessonCount += 1;
      }
    }
    if (lessonCount !== 50 || Object.keys(support.lessons).length !== lessonCount || Object.keys(support.lessons).some(id => !expectedIds.has(id))) {
      const error = new Error('Il numero delle lezioni o dei dati di supporto non coincide. / عدد الدروس أو بيانات الدعم غير متطابق.');
      error.code = 'course_integrity';
      throw error;
    }
    const runtimeCourse = {
      ...lessons,
      modules: lessons.modules.map(module => ({
        ...module,
        lessons: module.lessons.map(lesson => ({
          ...lesson,
          ...(support.lessons[lesson.id] || {}),
          heading_it: lesson.titleIt,
          heading_ar: lesson.titleAr
        }))
      }))
    };
    if (!globalThis.crypto?.subtle || typeof TextEncoder !== 'function') {
      const error = new Error('Il controllo d’integrità non è disponibile sul dispositivo. / التحقق من سلامة الملفات غير متاح على هذا الجهاز.');
      error.code = 'course_integrity';
      throw error;
    }
    const sourceBytes = new TextEncoder().encode(bankFile.rawText);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', sourceBytes);
    const fingerprint = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
    if (fingerprint !== similar.question_bank_sha256) {
      const error = new Error('إصدار بنك الأسئلة لا يطابق فهرس الصياغات القريبة. أعد تحميل الملفات وتحقق من اتصال الإنترنت.');
      error.code = 'course_integrity';
      throw error;
    }
    return [bank, runtimeCourse, labels, similar];
  }
  catch (error) {
    if (error.code === 'course_timeout' || error.code === 'course_integrity' || error.message?.includes(' / ')) throw error;
    throw new Error('Connessione interrotta. Controlla la rete e riprova. / انقطع الاتصال. تحقق من الشبكة ثم أعد المحاولة.');
  }
  finally { clearTimeout(timer); controller.abort(); }
}
