// ARCA waitlist: two-step sign-up that writes to a Google Sheet via Apps Script.
// Paste your Apps Script web app URL (ends in /exec) between the quotes:
const WAITLIST_ENDPOINT = 'https://script.google.com/macros/s/AKfycbw_aFZbMyhmGPquvfIOJmLhUYCcEIA-MrINP8TI9lypu0uxlpS_fESyEDwVrRUwmXpcXA/exec';

(function () {
  const dlg = document.getElementById('wl');
  const openBtn = document.getElementById('wl-open');
  if (!dlg || !openBtn) return;

  const $ = (id) => document.getElementById(id);
  const step1 = $('wl-step1'), step2 = $('wl-step2'), done = $('wl-done');
  let signupId = null;

  // Turn each plain <span> list into tappable chips
  dlg.querySelectorAll('.wl-chips').forEach((group) => {
    const { name, type } = group.dataset;
    [...group.children].forEach((span) => {
      const label = document.createElement('label');
      label.className = 'wl-chip';
      const input = document.createElement('input');
      input.type = type; input.name = name; input.value = span.textContent;
      const text = document.createElement('span');
      text.textContent = span.textContent;
      label.append(input, text);
      span.replaceWith(label);
    });
  });

  // Where the visitor came from (no questions needed)
  const params = new URLSearchParams(location.search);
  let referrer = '';
  try {
    const r = document.referrer && new URL(document.referrer);
    if (r && r.host !== location.host) referrer = r.hostname;
  } catch (e) { /* ignore */ }
  const meta = {
    source: params.get('utm_source') || referrer || 'direct',
    campaign: params.get('utm_campaign') || '',
    language: navigator.language || ''
  };

  function show(el) {
    [step1, step2, done].forEach((x) => { x.hidden = x !== el; });
    $('wl-bar2').classList.toggle('on', el !== step1);
  }

  function showError(el, msg) { el.textContent = msg; el.hidden = !msg; }

  function send(data) {
    if (!WAITLIST_ENDPOINT) return Promise.reject(new Error('Waitlist endpoint not set'));
    // no-cors: Apps Script doesn't send CORS headers; the request still arrives.
    return fetch(WAITLIST_ENDPOINT, {
      method: 'POST',
      mode: 'no-cors',
      keepalive: true,
      body: new URLSearchParams(data)
    });
  }

  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  openBtn.addEventListener('click', () => {
    show(signupId && !step2.hidden ? step2 : signupId ? done : step1);
    dlg.showModal();
  });
  $('wl-close').addEventListener('click', () => dlg.close());
  $('wl-finish').addEventListener('click', () => dlg.close());
  // Click on the dark backdrop closes too
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  step1.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('wl-err1');
    const email = $('wl-email').value.trim();
    if (step1.website.value) return; // honeypot: a bot filled the hidden field
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return showError(err, 'Please enter a valid email address.');
    if (!$('wl-consent').checked) return showError(err, 'Please tick the box so we can email you about the launch.');
    showError(err, '');

    const btn = step1.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Joining…';
    const id = newId();
    const firstName = $('wl-name').value.trim();
    try {
      await send({ action: 'join', id, email, firstName, consent: 'yes', ...meta });
      signupId = id;
      $('wl-hi').textContent = firstName ? ', ' + firstName : '';
      show(step2);
    } catch (ex) {
      showError(err, 'Sorry, something went wrong. Please try again, or email us at smartfinanceapp12@gmail.com.');
    } finally {
      btn.disabled = false; btn.textContent = 'Join the waitlist';
    }
  });

  // "Which banks?" only for Yes / Maybe
  step2.addEventListener('change', (e) => {
    if (e.target.name === 'connect') $('wl-banks').hidden = e.target.value.startsWith('No');
  });

  step2.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(step2);
    const connect = fd.get('connect') || '';
    const btn = step2.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      await send({
        action: 'answers',
        id: signupId,
        age: fd.get('age') || '',
        countries: fd.getAll('countries').join(', '),
        apps: fd.get('apps') || '',
        connect,
        banks: connect.startsWith('No') ? '' : fd.getAll('banks').join(', '),
        pay: fd.get('pay') || '',
        pain: (fd.get('pain') || '').trim()
      });
      show(done);
    } catch (ex) {
      showError($('wl-err2'), 'Sorry, your answers didn’t send. You’re still on the waitlist, so you can try again or skip.');
    } finally {
      btn.disabled = false; btn.textContent = 'Send answers';
    }
  });
  $('wl-skip').addEventListener('click', () => show(done));
})();
