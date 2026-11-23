const LABEL = {
  title: 'الحساب والمزامنة', open: 'الحساب', guest: 'استخدام محلي دون حساب',
  google: 'المتابعة باستخدام Google', email: 'البريد الإلكتروني', password: 'كلمة المرور',
  login: 'تسجيل الدخول', register: 'إنشاء حساب بالبريد', reset: 'إرسال رابط إعادة تعيين كلمة المرور',
  close: 'إغلاق', sync: 'مزامنة الآن', merge: 'دمج تقدم الزائر في هذا الحساب',
  verify: 'إرسال رسالة التحقق', signout: 'تسجيل الخروج', delete: 'حذف الحساب',
  confirmDelete: 'نعم، احذف الحساب نهائيًا', cancel: 'إلغاء',
  offline: 'يمكنك متابعة الدراسة محليًا دون حساب. الحساب اختياري ولا يمنع الدروس.',
  privacy: 'في نسخة الاختبار المحلية، تسجيل الدخول والمزامنة مع Firebase معطّلان؛ لا تُرسل بيانات حساب إلى Firebase. يبقى تقدمك على هذا الجهاز ويمكنك نسخه احتياطيًا محليًا. لا توجد إعلانات حية.',
  free: 'أنت تستخدم التطبيق دون حساب؛ يُحفظ التقدم محليًا على هذا الجهاز.'
};

function element(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'className') node.className = value;
    else if (key === 'type' || key === 'name' || key === 'autocomplete' || key === 'minLength' || key === 'required' || key === 'dir' || key === 'lang' || key === 'id' || key === 'role' || key === 'ariaLive' || key === 'for') node.setAttribute(key === 'ariaLive' ? 'aria-live' : key === 'for' ? 'for' : key, value === true ? '' : String(value));
    else if (key.startsWith('aria-')) node.setAttribute(key, String(value));
  }
  if (text) node.textContent = text;
  return node;
}

export function initializeAccountUI({ service } = {}) {
  if (!service || typeof service.subscribe !== 'function') throw new TypeError('account service with subscribe() is required');
  const topbar = document.querySelector('#profileControlStore') || document.querySelector('.topbar-actions');
  if (!topbar) throw new Error('account control host not found');
  const trigger = element('button', { type: 'button', className: 'icon-button source-button account-trigger', 'aria-haspopup': 'dialog', 'aria-label': 'الحساب والمزامنة' });
  trigger.append(element('span', { lang: 'ar' }, LABEL.open));
  const backup = document.getElementById('progressBackupButton');
  if (backup?.parentNode === topbar) topbar.insertBefore(trigger, backup.nextSibling); else topbar.append(trigger);

  const dialog = element('dialog', { className: 'source-dialog account-dialog', dir: 'rtl', lang: 'ar', 'aria-labelledby': 'accountTitle' });
  const close = element('button', { type: 'button', className: 'dialog-close', 'aria-label': LABEL.close }, '×');
  const heading = element('h2', { id: 'accountTitle' }, LABEL.title);
  const status = element('p', { className: 'account-status', role: 'status', 'aria-live': 'polite' });
  const error = element('p', { className: 'account-error', role: 'alert', 'aria-live': 'assertive' });
  const detail = element('section', { className: 'account-detail' });
  const form = element('form', { className: 'account-form' });
  const emailLabel = element('label', { for: 'accountEmail' }, LABEL.email);
  const email = element('input', { id: 'accountEmail', type: 'email', name: 'email', autocomplete: 'email', required: true, dir: 'ltr' });
  emailLabel.append(email);
  const passLabel = element('label', { for: 'accountPassword' }, LABEL.password);
  const password = element('input', { id: 'accountPassword', type: 'password', name: 'password', autocomplete: 'current-password', minLength: 8, required: true, dir: 'ltr' });
  passLabel.append(password);
  const google = element('button', { type: 'button', className: 'quiet-button account-action' }, LABEL.google);
  const login = element('button', { type: 'submit', className: 'primary-button account-action' }, LABEL.login);
  const register = element('button', { type: 'button', className: 'quiet-button account-action' }, LABEL.register);
  const reset = element('button', { type: 'button', className: 'quiet-button account-action' }, LABEL.reset);
  form.append(emailLabel, passLabel, login, register, reset);
  const explanation = element('p', { className: 'account-privacy' }, LABEL.offline + ' ' + LABEL.privacy);
  const actions = element('div', { className: 'account-actions' });
  const confirmed = element('div', { className: 'account-delete-confirm', hidden: true });
  const confirmText = element('p', {}, 'سيُحذف حساب Firebase وتقدمه السحابي ونسخة الحساب المحلية على هذا الجهاز. يبقى تقدم الزائر منفصلًا، ولا تُمسح تلقائيًا النسخ المحلية في الأجهزة الأخرى. لا يمكن التراجع عن الحذف السحابي.');
  const confirmDelete = element('button', { type: 'button', className: 'account-danger' }, LABEL.confirmDelete);
  const cancelDelete = element('button', { type: 'button', className: 'quiet-button' }, LABEL.cancel);
  confirmed.append(confirmText, confirmDelete, cancelDelete);
  detail.append(explanation);
  dialog.append(close, heading, status, error, google, form, detail, actions, confirmed);
  document.body.append(dialog);

  let current = null;
  let busy = false;
  let unsub;
  const allButtons = () => [...dialog.querySelectorAll('button'), ...dialog.querySelectorAll('input')].filter(control => control !== close);
  function announce(message = '', err = '') { status.textContent = message; error.textContent = err; }
  function button(label, fn, cls = 'quiet-button') {
    const b = element('button', { type: 'button', className: cls }, label);
    b.addEventListener('click', () => run(fn));
    actions.append(b);
    return b;
  }
  function render(state = {}) {
    current = state;
    actions.replaceChildren();
    detail.replaceChildren(explanation);
    confirmed.hidden = true;
    form.hidden = !!state.user || service.isConfigured === false;
    google.hidden = !!state.user || service.isConfigured === false;
    if (state.user) {
      const who = element('p', { className: 'account-email', dir: 'ltr', lang: 'en' });
      who.textContent = String(state.user.email || '');
      detail.append(who, element('p', {}, state.user.emailVerified ? 'البريد الإلكتروني موثّق.' : 'البريد الإلكتروني غير موثّق.'));
      if (!state.user.emailVerified) button(LABEL.verify, () => service.sendVerification());
      const phaseText = ({ready:'الحساب جاهز.', syncing:'جارٍ مزامنة التقدم…', offline:'لا يوجد اتصال؛ يمكنك المتابعة محليًا.', error:'تعذر إكمال العملية.'})[state.phase] || 'حالة الحساب متاحة.';
      detail.append(element('p', { className: 'account-sync-state' }, phaseText));
      if (state.lastSyncedAt) detail.append(element('p', {}, `آخر مزامنة: ${new Date(state.lastSyncedAt).toLocaleString('ar')}`));
      button(LABEL.sync, () => service.syncNow());
      button(LABEL.merge, () => service.importGuestProgress(), 'primary-button');
      button(LABEL.signout, () => service.signOut());
      const del = element('button', { type: 'button', className: 'account-danger' }, LABEL.delete);
      del.addEventListener('click', () => { confirmed.hidden = false; confirmDelete.focus(); });
      actions.append(del);
    } else {
      detail.append(element('p', {}, LABEL.free));
      detail.append(element('p', { className: 'account-sync-state' }, state.phase === 'offline' ? 'أنت غير متصل؛ ستبقى الدراسة محلية.' : 'الحساب اختياري؛ لا يلزم لتعلّم الدروس.'));
      if (service.isConfigured === false) detail.append(element('p', { className: 'account-sync-state' }, 'تسجيل الدخول والمزامنة غير متاحين في نسخة الاختبار المحلية.'));
    }
    announce(state.message || '');
    if (busy) allButtons().forEach(control => { control.disabled = true; });
  }
  async function run(fn) {
    if (busy) return;
    busy = true; allButtons().forEach(control => { control.disabled = true; }); announce();
    try { await fn(); } catch (e) { announce('', e instanceof Error ? e.message : 'تعذر إكمال العملية. حاول مجددًا.'); }
    finally { password.value = ''; busy = false; allButtons().forEach(control => { control.disabled = false; }); }
  }
  google.addEventListener('click', () => run(() => service.signInGoogle()));
  form.addEventListener('submit', event => { event.preventDefault(); run(() => service.signInEmail(email.value.trim(), password.value)); });
  register.addEventListener('click', () => {
    if (!form.reportValidity()) return;
    password.autocomplete = 'new-password';
    run(() => service.registerEmail(email.value.trim(), password.value));
  });
  reset.addEventListener('click', () => {
    if (!email.value.trim() || !email.checkValidity()) { email.focus(); email.reportValidity(); return; }
    run(() => service.sendPasswordReset(email.value.trim()));
  });
  confirmDelete.addEventListener('click', () => run(() => service.deleteAccount()));
  cancelDelete.addEventListener('click', () => { confirmed.hidden = true; });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { password.value = ''; confirmed.hidden = true; trigger.focus(); });
  trigger.addEventListener('click', () => { if (!dialog.open) dialog.showModal(); email.focus(); });
  unsub = service.subscribe(state => render(state || {}));
  return { button: trigger, dialog, destroy() { unsub?.(); trigger.remove(); dialog.remove(); } };
}
