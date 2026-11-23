export function splitSpeechText(text, maxLength = 120) {
  maxLength = Math.max(1, Math.floor(maxLength));
  const clean = String(text || '').trim();
  if (!clean) return [];
  const sentences = clean.split(/(?<=[.!?؟])\s+|\n+/u).map(part => part.trim()).filter(Boolean);
  const chunks = [];
  let current = '';
  for (const sentence of sentences) {
    let remainder = sentence;
    while (remainder.length > maxLength) {
      const space = remainder.lastIndexOf(' ', maxLength);
      const cut = space > 0 ? space + 1 : maxLength;
      const piece = remainder.slice(0, cut).trim();
      if (current) { chunks.push(current); current = ''; }
      if (piece) chunks.push(piece);
      remainder = remainder.slice(cut).trimStart();
    }
    if (!remainder) continue;
    if (!current) current = remainder;
    else if (current.length + 1 + remainder.length <= maxLength) current += ` ${remainder}`;
    else { chunks.push(current); current = remainder; }
  }
  if (current) chunks.push(current);
  return chunks;
}

export const ITALIAN_TTS_LOCALE = 'it-IT';
const VOICE_WAIT_TIMEOUT_MS = 5000;
const VOICE_POLL_INTERVAL_MS = 200;

export function buildLessonSpeechTexts(lesson = {}) {
  const headingIt = String(lesson.titleIt || lesson.heading_it || '').trim();
  const bodyIt = String(lesson.summaryIt || lesson.body_it || '').trim();
  return {italian: [headingIt, bodyIt].filter(Boolean).join('\n\n')};
}

function voiceNameFor() { return 'صوت إيطالي على الجهاز'; }

function resolveWebSpeech(injected) {
  try {
    const synthesis = injected?.synthesis ?? globalThis.speechSynthesis ?? globalThis.window?.speechSynthesis;
    const Utterance = injected?.Utterance ?? globalThis.SpeechSynthesisUtterance ?? globalThis.window?.SpeechSynthesisUtterance;
    return synthesis && typeof synthesis.speak === 'function' && typeof Utterance === 'function'
      ? {synthesis, Utterance}
      : null;
  } catch {
    return null;
  }
}

function readAvailableVoices(synthesis) {
  try {
    if (typeof synthesis?.getVoices !== 'function') return [];
    return Array.from(synthesis.getVoices() || []);
  } catch {
    return [];
  }
}

function hasItalianVoice(voices) {
  return Array.from(voices || []).some(voice => String(voice?.lang || '').toLowerCase().replace(/_/gu, '-').startsWith('it-') || String(voice?.lang || '').toLowerCase() === 'it');
}

function waitForVoices(synthesis, task, isCurrent, onWaiting) {
  const initialVoices = readAvailableVoices(synthesis);
  if (hasItalianVoice(initialVoices) || typeof synthesis?.getVoices !== 'function') return Promise.resolve(initialVoices);

  try {
    console.log('[TTS] جارٍ تجهيز الصوت الإيطالي... انتظار تحميل أصوات النظام.');
    onWaiting?.();
  } catch {}

  return new Promise(resolve => {
    let settled = false;
    let timeout = null;
    let poll = null;
    const cleanups = [];
    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      if (poll) clearInterval(poll);
      for (const removeListener of cleanups.splice(0)) {
        try { removeListener(); } catch {}
      }
      if (task.cancelVoiceWait === cancel) task.cancelVoiceWait = null;
    };
    const finish = voices => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Array.from(voices || []));
    };
    const check = () => {
      if (!isCurrent()) { finish([]); return; }
      const voices = readAvailableVoices(synthesis);
      if (hasItalianVoice(voices)) finish(voices);
    };
    const cancel = () => finish([]);
    task.cancelVoiceWait = cancel;
    timeout = setTimeout(() => finish(readAvailableVoices(synthesis)), VOICE_WAIT_TIMEOUT_MS);
    poll = setInterval(check, VOICE_POLL_INTERVAL_MS);
    try {
      if (typeof synthesis.addEventListener === 'function' && typeof synthesis.removeEventListener === 'function') {
        const remove = () => synthesis.removeEventListener('voiceschanged', check);
        cleanups.push(remove);
        synthesis.addEventListener('voiceschanged', check);
      } else {
        const previousHandler = synthesis.onvoiceschanged;
        const chainedHandler = event => {
          try { if (typeof previousHandler === 'function') previousHandler.call(synthesis, event); } catch {}
          check();
        };
        synthesis.onvoiceschanged = chainedHandler;
        cleanups.push(() => {
          if (synthesis.onvoiceschanged === chainedHandler) synthesis.onvoiceschanged = previousHandler;
        });
      }
    } catch {}
    check();
  });
}

function hasExplicitVoiceQuality(voice) {
  if (voice?.natural === true || voice?.isNatural === true || voice?.enhanced === true || voice?.isEnhanced === true) return true;
  return [voice?.quality, voice?.voiceType].some(value => ['natural', 'enhanced', 'neural', 'premium'].includes(String(value || '').toLowerCase()));
}

function hasVoiceNameQualityHint(voice) {
  return /\b(?:google|natural|premium|neural)\b/iu.test(String(voice?.name || ''));
}

function voiceRank(voice) {
  if (hasExplicitVoiceQuality(voice)) return 0;
  if (voice?.localService === false) return 1;
  if (hasVoiceNameQualityHint(voice)) return 2;
  if (voice?.default === true) return 3;
  return 4;
}

function bestVoice(voices) {
  return [...voices].sort((left, right) => voiceRank(left) - voiceRank(right))[0] || null;
}

function chooseVoice(voices, locale = ITALIAN_TTS_LOCALE) {
  try {
    const desired = String(locale || ITALIAN_TTS_LOCALE).toLowerCase().replace(/_/gu, '-');
    const matching = Array.from(voices || []).filter(voice => String(voice?.lang || '').toLowerCase().replace(/_/gu, '-').split('-')[0] === 'it');
    if (!matching.length) return null;
    const exact = matching.filter(voice => String(voice?.lang || '').toLowerCase().replace(/_/gu, '-') === desired);
    const preferred = candidates => candidates.filter(voice => voiceRank(voice) <= 2);
    return bestVoice(preferred(exact)) || bestVoice(exact) || bestVoice(preferred(matching)) || bestVoice(matching);
  } catch {
    return null;
  }
}

function voiceInstallMessage() {
  return 'لم يتوفر صوت إيطالي للنطق. فعّل أو نزّل صوت اللغة الإيطالية من إعدادات تحويل النص إلى كلام في الهاتف، ثم أعد المحاولة.';
}

function speechServiceMessage() {
  return 'خدمة النطق غير متاحة على هذا الجهاز. تأكد من تفعيل محرك تحويل النص إلى كلام في إعدادات الهاتف، ثم أعد المحاولة.';
}

function voiceMetadataForLog(voice) {
  const explicitQuality = hasExplicitVoiceQuality(voice);
  return {
    name: String(voice?.name || ''),
    lang: String(voice?.lang || ''),
    voiceURI: String(voice?.voiceURI || ''),
    localService: typeof voice?.localService === 'boolean' ? voice.localService : 'unknown',
    default: voice?.default === true,
    qualityMetadata: String(voice?.quality || voice?.voiceType || 'not reported'),
    nameQualityHint: hasVoiceNameQualityHint(voice),
    selectionEvidence: explicitQuality ? 'engine-reported-quality' : voice?.localService === false ? 'network-service' : hasVoiceNameQualityHint(voice) ? 'unverified-name-hint' : 'language-match'
  };
}

export function createSpeechController({
  webSpeech = null,
  getRate = () => 0.8,
  onStateChange = () => {},
  onProgress = () => {},
  onWordProgress = () => {}
} = {}) {
  let sequence = 0;
  let activeTask = null;
  let errorTimer = null;

  const notify = (status, task = activeTask, error = '', extra = {}) => {
    try {
      onStateChange({
        status,
        button: task?.button || null,
        locale: task?.locale || '',
        kind: task?.kind || 'speech',
        progress: task?.progress || 0,
        voiceName: task?.voiceName || '',
        voiceSource: 'browser',
        qualityHint: 'device-speech',
        error,
        ...extra
      });
    } catch {}
  };
  const setButtonState = (button, state) => {
    if (!button?.classList) return;
    button.classList.toggle?.('speaking', state === 'playing');
    button.classList.toggle?.('speech-paused', state === 'paused');
    button.classList.toggle?.('speech-error', state === 'error');
  };
  const reportProgress = (task, value) => {
    task.progress = Math.max(0, Math.min(1, Number(value) || 0));
    try {
      onProgress({progress: task.progress, locale: task.locale, voiceName: task.voiceName, voiceSource: task.voiceSource || 'browser'});
    } catch {}
  };
  const reportWordProgress = (task, index, source, charLength = 0) => {
    if (task.token !== sequence) return;
    const text = String(task.currentSegmentText || '');
    const charIndex = Math.max(0, Math.min(Math.max(0, text.length - 1), Math.floor(Number(index) || 0)));
    try {
      onWordProgress({button: task.button, locale: task.locale, kind: task.kind, text, charIndex,
        charLength: Math.max(0, Number(charLength) || 0), progress: task.progress, source,
        approximate: source !== 'web-boundary'});
    } catch {}
  };
  const rateFor = () => {
    let selected = 0.8;
    try { selected = Number(getRate()) || 0.8; } catch {}
    return Math.max(.70, Math.min(1.30, selected));
  };

  function stopBrowserSpeech() {
    try { resolveWebSpeech(webSpeech)?.synthesis.cancel?.(); } catch {}
  }

  function stop() {
    sequence += 1;
    if (errorTimer) { clearTimeout(errorTimer); errorTimer = null; }
    const previous = activeTask;
    activeTask = null;
    previous?.cancelVoiceWait?.();
    if (previous) setButtonState(previous.button, 'idle');
    stopBrowserSpeech();
    notify('idle', previous);
    return Promise.resolve();
  }

  async function waitUntilResumed(task) {
    while (task.paused && task.token === sequence) {
      await new Promise(resolve => task.resumeWaiters.push(resolve));
    }
    return task.token === sequence;
  }

  function pause() {
    const task = activeTask;
    if (!task || task.failed || task.paused) return false;
    task.paused = true;
    setButtonState(task.button, 'paused');
    try { resolveWebSpeech(webSpeech)?.synthesis.pause?.(); } catch {}
    notify('paused', task);
    return true;
  }

  function resume() {
    const task = activeTask;
    if (!task || task.failed || !task.paused) return false;
    task.paused = false;
    setButtonState(task.button, 'playing');
    try { resolveWebSpeech(webSpeech)?.synthesis.resume?.(); } catch {}
    for (const resolve of task.resumeWaiters.splice(0)) resolve();
    notify('playing', task);
    return true;
  }

  function toggle() { return activeTask?.paused ? resume() : pause(); }
  function isActive(button) { return !!activeTask && !activeTask.failed && activeTask.button === button; }

  function showError(task, error, userMessage = 'تعذّر تشغيل الصوت على هذا الجهاز.') {
    task.failed = true;
    const reason = String(error?.message || error || 'speech-engine-unavailable');
    try { console.warn('Web Speech playback failed on this device.', {locale: task.locale, reason}); } catch {}
    setButtonState(task.button, 'error');
    notify('error', task, userMessage);
    if (errorTimer) clearTimeout(errorTimer);
    errorTimer = setTimeout(() => {
      if (task.token !== sequence) return;
      activeTask = null;
      setButtonState(task.button, 'idle');
      notify('idle', task);
      errorTimer = null;
    }, 5000);
  }

  function speakWithWebSpeech(task, text, rate) {
    const api = resolveWebSpeech(webSpeech);
    if (!api) return Promise.reject(new Error('Web Speech API is unavailable on this device.'));
    return new Promise((resolve, reject) => {
      let utterance = null;
      let timeout = null;
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        if (utterance) { utterance.onend = null; utterance.onerror = null; utterance.onboundary = null; }
        callback(value);
      };
      try {
        utterance = new api.Utterance(text);
        utterance.lang = ITALIAN_TTS_LOCALE;
        utterance.rate = rate;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        if (task.selectedVoice) utterance.voice = task.selectedVoice;
        utterance.onend = () => finish(resolve, task.token === sequence);
        utterance.onboundary = event => {
          if (task.token !== sequence || (event?.name && event.name !== 'word')) return;
          const index = Number(event?.charIndex);
          if (!Number.isFinite(index)) return;
          reportWordProgress(task, task.currentChunkOffset + index, 'web-boundary', event?.charLength);
        };
        utterance.onerror = event => {
          if (task.token !== sequence) finish(resolve, false);
          else finish(reject, new Error(`Web Speech API failed: ${String(event?.error || 'unknown error')}`));
        };
        timeout = setTimeout(() => finish(reject, new Error('Web Speech API timed out.')), Math.max(20000, Math.min(120000, text.length * 350)));
        api.synthesis.speak(utterance);
      } catch (error) {
        finish(reject, error);
      }
    });
  }

  async function prepareWebVoice(task, api = resolveWebSpeech(webSpeech)) {
    if (!api) throw new Error('Web Speech API is unavailable on this device.');
    const voices = await waitForVoices(api.synthesis, task, () => task.token === sequence, () => notify('preparing', task));
    if (task.token !== sequence) return false;
    task.selectedVoice = chooseVoice(voices, ITALIAN_TTS_LOCALE);
    task.voiceSource = 'browser';
    task.voiceName = task.selectedVoice ? voiceNameFor() : 'Voce italiana scelta dal sistema';
    if (task.selectedVoice) {
      try { console.log('[TTS] selected system voice metadata:', voiceMetadataForLog(task.selectedVoice)); } catch {}
    } else {
      try { console.log('[TTS] no listed Italian voice; requesting it-IT from the system speech engine.'); } catch {}
    }
    return true;
  }

  async function speakChunk(task, text) {
    if (!task.voicePrepared) {
      if (!(await prepareWebVoice(task))) return false;
      task.voicePrepared = true;
    }
    await speakWithWebSpeech(task, text, rateFor());
    return task.token === sequence;
  }

  async function runSegments(segments, locale, button, onSegment = null, kind = 'speech') {
    if (!String(locale || '').toLowerCase().startsWith('it')) {
      await stop();
      return false;
    }
    const stopping = stop();
    const token = sequence;
    await stopping;
    if (token !== sequence) return false;

    const prepared = (segments || []).map(segment => typeof segment === 'string' ? {text: segment} : segment)
      .filter(segment => String(segment?.text || '').trim());
    if (!prepared.length) return false;
    const api = resolveWebSpeech(webSpeech);
    const chunksBySegment = prepared.map(segment => {
      let cursor = 0;
      return splitSpeechText(segment.text).map(text => {
        const found = String(segment.text).indexOf(text, cursor);
        const offset = found >= 0 ? found : cursor;
        cursor = offset + text.length;
        return {text, offset};
      });
    });
    const totalCharacters = chunksBySegment.flat().reduce((sum, chunk) => sum + chunk.text.length, 0);
    if (!totalCharacters) return false;
    const task = {
      token,
      locale: ITALIAN_TTS_LOCALE,
      button,
      kind,
      voiceName: voiceNameFor(),
      voiceSource: 'browser',
      paused: false,
      failed: false,
      resumeWaiters: [],
      progress: 0,
      totalCharacters,
      completedCharacters: 0,
      currentChunkCharacters: 0,
      currentChunkOffset: 0,
      currentSegmentIndex: 0,
      currentSegmentText: '',
      selectedVoice: null,
      voicePrepared: false
    };
    activeTask = task;
    if (!api) {
      showError(task, 'web-speech-api-unavailable', speechServiceMessage());
      return false;
    }
    try {
      setButtonState(task.button, 'playing');
      notify('playing', task);

      for (let segmentIndex = 0; segmentIndex < prepared.length; segmentIndex += 1) {
        if (task.token !== sequence || !(await waitUntilResumed(task))) return false;
        task.currentSegmentIndex = segmentIndex;
        task.currentSegmentText = String(prepared[segmentIndex].text || '');
        try { onSegment?.(segmentIndex, prepared[segmentIndex]); } catch {}
        for (const chunk of chunksBySegment[segmentIndex]) {
          if (task.token !== sequence || !(await waitUntilResumed(task))) return false;
          task.currentChunkCharacters = chunk.text.length;
          task.currentChunkOffset = chunk.offset;
          try {
            const completed = await speakChunk(task, chunk.text);
            if (!completed || task.token !== sequence) return false;
          } catch (error) {
            if (task.token !== sequence) return false;
            const voiceUnavailable = /language-unavailable|voice-unavailable|speech voice list is unavailable|no matching language voice/iu.test(String(error?.message || error));
            showError(task, error, voiceUnavailable ? voiceInstallMessage() : 'تعذّر تشغيل الصوت على هذا الجهاز.');
            return false;
          }
          if (task.token !== sequence) return false;
          task.completedCharacters += chunk.text.length;
          task.currentChunkCharacters = 0;
          reportProgress(task, task.completedCharacters / task.totalCharacters);
        }
      }
      reportProgress(task, 1);
      return true;
    } catch (error) {
      if (task.token !== sequence) return false;
      const voiceUnavailable = /language-unavailable|voice-unavailable|speech voice list is unavailable|no matching language voice/iu.test(String(error?.message || error));
      showError(task, error, voiceUnavailable ? voiceInstallMessage() : 'تعذّر تشغيل الصوت على هذا الجهاز.');
      return false;
    } finally {
      if (task.token === sequence && !task.failed) {
        activeTask = null;
        setButtonState(button, 'idle');
        notify('idle', task);
      }
    }
  }

  function speak(text, locale, button) {
    return runSegments([{text: String(text || '')}], locale, button);
  }
  function speakSequence(segments, locale, button, onSegment) {
    return runSegments(segments, locale, button, onSegment, 'lesson-explainer');
  }

  return {
    speak,
    speakSequence,
    pause,
    resume,
    toggle,
    stop,
    isActive,
    get state() { return activeTask ? (activeTask.failed ? 'error' : activeTask.paused ? 'paused' : 'playing') : 'idle'; }
  };
}
