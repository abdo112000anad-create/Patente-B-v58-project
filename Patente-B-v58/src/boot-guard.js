(() => {
  'use strict';
  let status = 'loading';
  let timer;
  const finish = next => {
    status = next;
    document.documentElement.dataset.appStatus = next;
    clearTimeout(timer);
  };
  const fail = () => {
    if (status !== 'loading') return;
    finish('error');
    const main = document.getElementById('main');
    if (!main) return;
    const box = document.createElement('div');
    box.className = 'empty-state';
    box.setAttribute('role', 'alert');
    const heading = document.createElement('h2');
    heading.textContent = 'Avvio non completato · تعذّر بدء التطبيق';
    const message = document.createElement('p');
    message.textContent = 'Un file è stato bloccato o la connessione è scaduta. Attendi la verifica del sito, poi riprova. I tuoi progressi non vengono cancellati. / حُجب ملف أو انتهت مهلة الاتصال. انتظر اكتمال التحقق من الموقع ثم أعد المحاولة. لن يُحذف تقدمك.';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'quiet-button';
    button.textContent = 'Riprova · أعد المحاولة';
    button.addEventListener('click', () => location.reload());
    box.append(heading, message, button);
    main.replaceChildren(box);
  };
  document.documentElement.dataset.appStatus = status;
  window.addEventListener('patente:ready', () => finish('ready'), {once: true});
  window.addEventListener('patente:failed', () => finish('error'), {once: true});
  window.addEventListener('error', event => {
    if (event.target?.id === 'appBundle' || /\/app\.bundle\.js(?:\?|$)/.test(event.filename || '')) fail();
  }, true);
  timer = setTimeout(fail, 25000);
})();
