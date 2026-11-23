import { createCloudProgress, mergeCloudProgress, validateCloudProgress } from './cloud-progress.mjs';

const safeMessages = {
  unavailable: 'خدمة الحساب غير متاحة الآن. يمكنك متابعة الدراسة محليًا.',
  offline: 'لا يوجد اتصال بالإنترنت؛ حُفظ تقدمك على هذا الجهاز.',
  unverified: 'يرجى توثيق بريدك الإلكتروني قبل مزامنة التقدم.',
  generic: 'تعذر إكمال العملية. تحقق من الاتصال وحاول مجددًا.',
  recent: 'لأمانك، سجّل الدخول مجددًا قبل حذف الحساب.',
  delete: 'تعذر حذف الحساب من الخادم؛ بقيت بياناتك المحلية كما هي.',
  partialDelete: 'حُذفت بيانات الحساب من الخادم، لكن تعذر حذف تسجيل الدخول. بياناتك المحلية ما زالت سليمة؛ سجّل الدخول مجددًا ثم أعد محاولة الحذف.',
  quota: 'بلغت خدمة الحساب حد الاستخدام أو الحصة المتاحة. يمكنك متابعة الدراسة محليًا والمحاولة لاحقًا.',
  permission: 'لا تسمح صلاحيات الحساب بإتمام هذه العملية. تحقق من تسجيل الدخول أو تواصل مع الدعم.'
};
const errCode = e => String(e?.code || '');
function safeError(e, action = '') {
  const code = errCode(e);
  if (/network-request-failed|unavailable|deadline-exceeded|offline/i.test(code)) return safeMessages.offline;
  if (/resource-exhausted|quota/i.test(code)) return safeMessages.quota;
  if (/permission-denied/i.test(code)) return safeMessages.permission;
  if (/popup-closed-by-user|cancelled-popup-request|popup-cancelled|popup_closed/i.test(code)) return 'أُلغيت نافذة تسجيل الدخول؛ يمكنك المحاولة مجددًا.';
  if (/requires-recent-login/i.test(code)) return safeMessages.recent;
  if (/wrong-password|invalid-credential|user-not-found|email-already-in-use|weak-password|invalid-email|too-many-requests/i.test(code)) {
    const map = { 'auth/wrong-password':'البريد أو كلمة المرور غير صحيحة.','auth/invalid-credential':'بيانات تسجيل الدخول غير صحيحة.','auth/user-not-found':'لا يوجد حساب بهذا البريد.','auth/email-already-in-use':'هذا البريد مرتبط بحساب بالفعل.','auth/weak-password':'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.','auth/invalid-email':'صيغة البريد الإلكتروني غير صحيحة.','auth/too-many-requests':'محاولات كثيرة؛ انتظر قليلًا ثم حاول مجددًا.' };
    return map[code] || safeMessages.generic;
  }
  if (action === 'delete') return safeMessages.delete;
  return safeMessages.generic;
}
const userView = u => u ? ({ uid:u.uid, email:u.email || '', displayName:u.displayName || '', emailVerified:!!u.emailVerified }) : null;
const stable = value => JSON.stringify(value, (_k,v) => v instanceof Set ? [...v].sort() : v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])) : v);

/** Firebase account and owner-scoped cloud progress coordinator. Optional deps are for deterministic tests only. */
export function createAccountService({ firebaseConfig, getState, replaceState, getContext, onOwnerChanged = () => {}, getGuestState = () => null, onAccountDeleted = () => {}, deps = null }) {
  if (typeof getState !== 'function' || typeof replaceState !== 'function' || typeof getContext !== 'function') throw new TypeError('getState, replaceState and getContext are required');
  const configured = !!(deps || (firebaseConfig && typeof firebaseConfig === 'object' && firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId));
  let auth, db, sdk, nativeAuth, user = null, phase = 'guest', message = '', lastSyncedAt = null, epoch = 0, timer = null, lastAuto = 0, syncing = null;
  const listeners = new Set();
  let onlineHandler, visibilityHandler;
  const snapshot = () => ({ user:userView(user), phase, message, lastSyncedAt });
  const emit = () => { const s=snapshot(); for (const fn of listeners) { try { fn(s); } catch {} } };
  const set = (p,m='') => { phase=p; message=m; emit(); };
  const isNative = () => !!globalThis.Capacitor?.isNativePlatform?.();
  const live = (u, n=epoch) => n === epoch && (user?.uid || null) === (u?.uid || null);
  async function init() {
    if (!configured) return;
    try {
      if (deps) { auth=deps.auth; db=deps.db; sdk=deps.sdk; nativeAuth=deps.nativeAuth; }
      else if (!sdk) {
        const [appSdk, authSdk, storeSdk] = await Promise.all([import('firebase/app'),import('firebase/auth'),import('firebase/firestore')]);
        sdk={...appSdk,...authSdk,...storeSdk};
        const appName='patenteb-arabic-v28';
        const app = sdk.getApps().some(a=>a.name===appName) ? sdk.getApp(appName) : sdk.initializeApp(firebaseConfig,appName);
        auth=sdk.getAuth(app); db=sdk.getFirestore(app);
        if (isNative()) {
          try { await sdk.setPersistence(auth, sdk.indexedDBLocalPersistence); } catch {}
          const plugin = await import('@capacitor-firebase/authentication'); nativeAuth=plugin.FirebaseAuthentication;
        } else {
          try { await sdk.setPersistence(auth, sdk.indexedDBLocalPersistence); } catch { try { await sdk.setPersistence(auth,sdk.browserLocalPersistence); } catch {} }
        }
      }
      auth.languageCode = 'ar';
      sdk.onAuthStateChanged(auth, async next => {
        const uid=next?.uid || null;
        if ((user?.uid || null) !== uid) {
          ++epoch; clearTimeout(timer); timer=null; syncing=null;
          user=next; onOwnerChanged(uid); lastSyncedAt=null;
        } else user=next;
        if (user) { set('ready'); if (globalThis.navigator?.onLine === false) set('offline',safeMessages.offline); else void syncNow(); }
        else set(globalThis.navigator?.onLine === false ? 'offline':'guest', globalThis.navigator?.onLine === false ? safeMessages.offline : '');
      });
      onlineHandler=()=>{ if(user) void syncNow(); };
      globalThis.addEventListener?.('online',onlineHandler);
      visibilityHandler=()=>{ if(user && globalThis.document?.visibilityState==='visible') void syncNow(); };
      globalThis.document?.addEventListener?.('visibilitychange',visibilityHandler);
    } catch (e) { set('error',safeError(e)); }
  }
  const initialized = init();
  function docRef(uid) { return sdk.doc(db,'users',uid,'progress','state'); }
  function parseRemote(snapshot) { return snapshot.exists() ? snapshot.data()?.payload : null; }
  async function syncNow() {
    await initialized;
    const who=user, token=epoch;
    if (!who) return;
    if (globalThis.navigator?.onLine === false) { set('offline',safeMessages.offline); return; }
    if (syncing) return syncing;
    syncing=(async()=>{
      try {
        const refreshed=await sdk.reload(who); if (!live(who,token)) return;
        user=auth.currentUser || who;
        if (!user.emailVerified) { set('ready',safeMessages.unverified); return; }
        await sdk.getIdToken(user,true); if (!live(who,token)) return;
        const current=getState(); const context=getContext();
        const validated=validateCloudProgress(createCloudProgress(current),context);
        const captured={...validated,activeQuiz:current.activeQuiz??null,fontSize:current.fontSize};
        // Preserve future/local coordination metadata without adding it to cloud progress.
        for(const key of Object.keys(current)) if(/sync.*set|set.*sync/i.test(key)) captured[key]=structuredClone(current[key]);
        const ref=docRef(who.uid);
        const result=await sdk.runTransaction(db,async tx=>{
          const snap=await tx.get(ref); const remote=parseRemote(snap);
          const merged=remote ? mergeCloudProgress(captured,remote,context) : validateCloudProgress(createCloudProgress(captured),context);
          const payload=createCloudProgress(merged);
          if (!remote || digest(remote)!==digest(payload)) tx.set(ref,{payload,updatedAt:sdk.serverTimestamp()});
          return {state:merged,changed:!remote || digest(remote)!==digest(payload)};
        });
        if (!live(who,token)) return;
        const latest=getState();
        const finalState={...mergeCloudProgress(latest,createCloudProgress(result.state),context),activeQuiz:latest.activeQuiz??result.state.activeQuiz??null,fontSize:latest.fontSize??result.state.fontSize};
        for(const key of Object.keys(latest)) if(/sync.*set|set.*sync/i.test(key)) finalState[key]=structuredClone(latest[key]);
        if (stable(finalState)!==stable(latest)) replaceState(finalState);
        lastSyncedAt=Date.now(); set('ready','');
        if (digest(createCloudProgress(finalState))!==digest(createCloudProgress(result.state))) notifyLocalChange();
      } catch(e) { if(live(who,token)) set(globalThis.navigator?.onLine===false?'offline':'error',safeError(e)); }
      finally { if (live(who,token)) syncing=null; }
    })(); return syncing;
  }
  function digest(payload) {
    try { const p=typeof payload==='string'?JSON.parse(payload):{...payload}; delete p.exportedAt; return stable(p); } catch { return String(payload); }
  }
  async function signInEmail(email,password) { await initialized; try { await sdk.signInWithEmailAndPassword(auth,email,password); } catch(e){set('error',safeError(e));throw new Error(safeError(e));} }
  async function registerEmail(email,password) {
    await initialized; if(String(password).length<8) throw new Error('يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.');
    try { const result=await sdk.createUserWithEmailAndPassword(auth,email,password); await sdk.sendEmailVerification(result.user); set('ready','أرسلنا رابط التحقق إلى بريدك الإلكتروني.'); }
    catch(e){set('error',safeError(e));throw new Error(safeError(e));}
  }
  async function sendPasswordReset(email) { await initialized; try { await sdk.sendPasswordResetEmail(auth,email); set(phase,'أرسلنا رابط إعادة تعيين كلمة المرور إذا كان البريد مسجلًا.'); } catch(e){set('error',safeError(e));throw new Error(safeError(e));} }
  async function sendVerification() { await initialized; if(!user) return; try { await sdk.sendEmailVerification(user); set(phase,'أرسلنا رسالة التحقق إلى بريدك الإلكتروني.'); } catch(e){set('error',safeError(e));throw new Error(safeError(e));} }
  async function signInGoogle() {
    await initialized; try {
      const provider=new sdk.GoogleAuthProvider(); provider.addScope('email'); provider.addScope('profile');
      if(isNative()) { const result=await nativeAuth.signInWithGoogle(); const credential=sdk.GoogleAuthProvider.credential(result.credential?.idToken); await sdk.signInWithCredential(auth,credential); }
      else await sdk.signInWithPopup(auth,provider);
    } catch(e){set('error',safeError(e));throw new Error(safeError(e));}
  }
  async function signOut() { await initialized; try { if(isNative() && nativeAuth) { try { await nativeAuth.signOut(); } catch {} } await sdk.signOut(auth); } catch(e){set('error',safeError(e));throw new Error(safeError(e));} }
  async function importGuestProgress() {
    if(!user) throw new Error('سجّل الدخول أولًا لدمج تقدم الزائر.');
    const guest=getGuestState(); if(!guest) { set('ready','لا يوجد تقدم زائر محفوظ لدمجه.'); return; }
    const merged=mergeCloudProgress(getState(),createCloudProgress(guest),getContext());
    replaceState(merged); await syncNow();
  }
  function notifyLocalChange() {
    if(!user || !user.emailVerified) return;
    clearTimeout(timer); const expected=epoch;
    const schedule=()=>{ if(expected!==epoch || !user) return; const wait=Math.max(0,60_000-(Date.now()-lastAuto));
      timer=setTimeout(()=>{ if(expected!==epoch) return; lastAuto=Date.now(); void syncNow(); },Math.max(15_000,wait)); };
    schedule();
  }
  async function deleteAccount() {
    await initialized; const who=user, token=epoch; if(!who) return;
    try {
      const tokenResult=await sdk.getIdTokenResult(who,true); const authTime=Date.parse(tokenResult.authTime || '');
      if(!Number.isFinite(authTime) || authTime>Date.now()+60_000 || Date.now()-authTime>5*60_000) { const e=new Error(); e.code='auth/requires-recent-login'; throw e; }
      await sdk.deleteDoc(docRef(who.uid));
      if(!live(who,token)) return;
      try { await sdk.deleteUser(who); }
      catch(e) { const msg=safeMessages.partialDelete; set('error',msg); throw new Error(msg); }
      onAccountDeleted(who.uid);
    } catch(e) { if(live(who,token)) set('error',safeError(e,'delete')); throw new Error(safeError(e,'delete')); }
  }
  return { get isConfigured(){return configured;}, subscribe(listener){listeners.add(listener); listener(snapshot()); return ()=>listeners.delete(listener);}, signInGoogle,signInEmail,registerEmail,sendPasswordReset,sendVerification,syncNow,importGuestProgress,signOut,deleteAccount,notifyLocalChange };
}
