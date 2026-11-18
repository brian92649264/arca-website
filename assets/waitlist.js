// ARCA waitlist: two-step sign-up that writes to a Google Sheet via Apps Script.
// Paste your Apps Script web app URL (ends in /exec) between the quotes:
const WAITLIST_ENDPOINT = 'https://script.google.com/macros/s/AKfycbw_aFZbMyhmGPquvfIOJmLhUYCcEIA-MrINP8TI9lypu0uxlpS_fESyEDwVrRUwmXpcXA/exec';

(function () {
  const dlg = document.getElementById('wl');
  const openBtn = document.getElementById('wl-open');
  if (!dlg || !openBtn) return;

  const $ = (id) => document.getElementById(id);
  const step1 = $('wl-step1'), step2 = $('wl-step2'), done = $('wl-done'), already = $('wl-already');
  const otherInput = $('wl-other');
  let signupId = null;
  let joining = null; // the email save running in the background, if any

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

  function show(el) {
    [step1, step2, done, already].forEach((x) => { x.hidden = x !== el; });
    $('wl-bar2').classList.toggle('on', el !== step1);
  }

  function showError(el, msg) { el.textContent = msg; el.hidden = !msg; }

  // Sends to the Sheet and returns its reply, e.g. { status: 'ok' } or { status: 'exists' }
  async function send(data) {
    if (!WAITLIST_ENDPOINT) throw new Error('Waitlist endpoint not set');
    const res = await fetch(WAITLIST_ENDPOINT, { method: 'POST', body: new URLSearchParams(data) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    let reply;
    try { reply = JSON.parse(text); } catch (e) { reply = { status: text.trim() === 'ok' ? 'ok' : 'error' }; }
    if (reply.status !== 'ok' && reply.status !== 'exists') throw new Error(reply.status || 'error');
    return reply;
  }

  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  // Wake the Apps Script up while they type, so the real save doesn't wait for it to start
  let warmed = 0;
  function warmUp() {
    if (!WAITLIST_ENDPOINT || Date.now() - warmed < 5 * 60 * 1000) return;
    warmed = Date.now();
    fetch(WAITLIST_ENDPOINT, { method: 'GET', mode: 'no-cors' }).catch(() => {});
  }
  function open() { warmUp(); dlg.showModal(); }

  function startOver() {
    step1.reset(); step2.reset();
    joining = null;
    otherInput.hidden = true;
    showError($('wl-err1'), ''); showError($('wl-err2'), '');
    signupId = null;
    show(step1);
    $('wl-email').focus();
  }

  // Reopening keeps whatever screen they were on (form, questions or thank-you)
  openBtn.addEventListener('click', open);
  // Header and hero buttons open the same popup
  document.querySelectorAll('[data-wl-open]').forEach((b) =>
    b.addEventListener('click', (e) => { e.preventDefault(); open(); }));
  $('wl-close').addEventListener('click', () => dlg.close());
  dlg.querySelectorAll('[data-wl-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
  dlg.querySelectorAll('[data-wl-again]').forEach((b) => b.addEventListener('click', startOver));
  // Click on the dark backdrop closes too
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  step1.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('wl-err1');
    const email = $('wl-email').value.trim();
    if (step1.website.value) return; // honeypot: a bot filled the hidden field
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return showError(err, 'Please enter a valid email address.');
    showError(err, '');

    // Show the questions straight away and save the email in the background
    const id = newId();
    const firstName = $('wl-name').value.trim();
    signupId = id;
    $('wl-hi').textContent = firstName ? ', ' + firstName : '';
    showError($('wl-err2'), '');
    show(step2);

    const attempt = send({ action: 'join', id, email, firstName, language: navigator.language || '' });
    joining = attempt;
    attempt.then((reply) => {
      if (joining !== attempt) return; // they started over since
      if (reply.status === 'exists') {
        $('wl-already-email').textContent = email;
        show(already);
      }
    }, () => {
      if (joining !== attempt) return;
      joining = null; signupId = null;
      showError(err, 'Sorry, something went wrong. Please try again, or email us at smartfinanceapp12@gmail.com.');
      show(step1); // their name and email are still filled in
    });
  });

  // Show the "Which country?" box only when Other is ticked
  step2.addEventListener('change', (e) => {
    if (e.target.name === 'countries' && e.target.value === 'Other') {
      otherInput.hidden = !e.target.checked;
      if (e.target.checked) otherInput.focus(); else otherInput.value = '';
    }
  });

  step2.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(step2);
    const countries = fd.getAll('countries');
    const btn = step2.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      // Answers are saved onto the email's row, so the email has to be saved first
      const reply = await joining;
      if (!reply || reply.status !== 'ok') return; // already on the list, or the join failed: those screens take over
      await send({
        action: 'answers',
        id: signupId,
        age: fd.get('age') || '',
        countries: countries.join(', '),
        otherCountry: countries.includes('Other') ? (fd.get('otherCountry') || '').trim() : '',
        apps: fd.get('apps') || '',
        connect: fd.get('connect') || '',
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
