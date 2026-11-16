/* ===== Arranque: sesión, navegación por perfil, login y portal de familias ===== */
const ROLE_LABELS = { admin: 'Administrador (Coordinación / UTP)', docente: 'Docente', asistente: 'Asistente de Educación', inspector: 'Inspectoría (consulta)', pie: 'Equipo PIE (consulta)' };

const Auth = {
  get user() { return API.user; },
  get role() { return API.user && API.user.role; },
  isAdmin() { return this.role === 'admin'; },
  readOnly() { return ['inspector', 'pie'].includes(this.role); },
  canSchedule() { return this.role === 'admin'; },
  canContact() { return ['admin', 'asistente'].includes(this.role); }
};

const VIEWS = { pending: Pending, register: Register, history: History, students: Students, rooms: Rooms, admin: Admin, teacher: Teacher, stats: Stats, log: Bitacora };
const NAV = {
  admin: [['register', 'Registrar evaluación', 'fa-file-circle-plus', 'cta'], ['pending', 'Pendientes', 'fa-list-check'], ['history', 'Historial', 'fa-clock-rotate-left'], ['students', 'Estudiantes', 'fa-users'], ['stats', 'Estadística', 'fa-chart-pie'], ['rooms', 'Salas', 'fa-door-open'], ['log', 'Bitácora', 'fa-clipboard-list'], ['admin', 'Administración', 'fa-gear']],
  docente: [['register', 'Registrar evaluación', 'fa-file-circle-plus', 'cta'], ['teacher', 'Mi panel', 'fa-chalkboard-user'], ['history', 'Historial', 'fa-clock-rotate-left']],
  asistente: [['pending', 'Pendientes de mis cursos', 'fa-list-check']],
  inspector: [['pending', 'Pendientes', 'fa-list-check'], ['history', 'Historial', 'fa-clock-rotate-left'], ['students', 'Estudiantes', 'fa-users'], ['stats', 'Estadística', 'fa-chart-pie']],
  pie: [['pending', 'Pendientes', 'fa-list-check'], ['history', 'Historial', 'fa-clock-rotate-left'], ['students', 'Estudiantes', 'fa-users'], ['stats', 'Estadística', 'fa-chart-pie']]
};

const App = {
  view: null,
  go(v) {
    this.view = v;
    $('.main').className = 'main';   // quita el color de ciclo de la pantalla de registro
    $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    const label = (NAV[Auth.role].find(n => n[0] === v) || [])[1] || '';
    $('#top-title').textContent = label;
    VIEWS[v].mount($('#view'));
    window.scrollTo({ top: 0 });
    sessionStorage.setItem('ep_view', v);
  },

  applyBrand() {
    const set = (id, src) => { const e = $(id); if (!e) return; e.hidden = !src; if (src) e.src = src; };
    set('#lg-banner', Brand.banner); $('#lg-card').classList.toggle('has-banner', !!Brand.banner); set('#lg-logo', Brand.logo); set('#sd-logo', Brand.logo); set('#sd-banner', Brand.banner); $('#side').classList.toggle('has-banner', !!Brand.banner); $('#bn-img').hidden = true;
    $('#lg-badges').innerHTML = (Brand.badges || []).map(b => `<img src="${esc(b)}" alt="Insignia">`).join('');
    $('#lg-icon').hidden = !!Brand.logo; $('#sd-icon').hidden = !!Brand.logo;
    if (typeof Pwa !== 'undefined') Pwa.applyIcon();
  },

  async enter() {
    const u = Auth.user;
    $('#u-name').textContent = titleCase(u.name);
    $('#u-role').textContent = ROLE_LABELS[u.role] + (u.headTeacherOf && u.role === 'docente' ? ` · Jefe ${u.headTeacherOf}` : '');
    $('#nav').innerHTML = NAV[u.role].map(([k, l, i, c]) => `<button data-v="${k}" class="${c || ''}" onclick="App.go('${k}')"><i class="fa-solid ${i}"></i> ${l}</button>`).join('');
    $('#year').textContent = new Date().getFullYear();
    $('#login').hidden = true; $('#app').hidden = false;
    this.applyBrand();
    this.go(NAV[u.role][0][0]);
  },

  logout() { API.clear(); sessionStorage.removeItem('ep_view'); location.reload(); }
};

/* ---------- Login ---------- */
async function initLogin() {
  const status = $('#lg-status');
  $$('.login-form > .seg button').forEach(b => b.onclick = () => {
    $$('.login-form > .seg button').forEach(x => x.classList.toggle('on', x === b));
    $('#f-staff').hidden = b.dataset.t !== 'staff'; $('#f-family').hidden = b.dataset.t !== 'family';
  });
  let users = [];
  try {
    const pu = await API.call('boot').catch(() => API.call('publicUsers'));   // una sola llamada: usuarios + imágenes
    Object.assign(Brand, { banner: pu.banner || '', logo: pu.logo || '', badges: pu.badges || [] }); App.applyBrand(); users = pu.users;
    if (API.demo) status.innerHTML = '<span class="pill warn">MODO DEMO</span> Administrador: <b>ADMINISTRADOR / admin</b> · Docente: <b>ANA PEREZ / 1234</b> · RUT de prueba: <b>24111222-3</b>';
  } catch (e) { status.textContent = 'No se pudo conectar con el servidor: ' + e.message; }

  const initials = n => String(n).trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const fill = () => {
    const role = $('#lg-role').value, lvl = $('#lg-level').value;
    $('#lg-level-box').hidden = role !== 'docente';
    $('#lg-names-box').hidden = !role;
    let l = users.filter(u => u.role === role);
    // Docentes: se listan según el nivel en que tienen más horas asignadas (los sin asignaciones aparecen en ambos)
    if (role === 'docente' && lvl) l = l.filter(u => !u.level || u.level === lvl);
    l.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    $('#lg-name').value = l.length === 1 ? l[0].id : '';
    const sb = $('#lg-search'); sb.hidden = l.length < 9; sb.value = '';
    $('#lg-names').innerHTML = l.length ? l.map(u => `<button type="button" data-id="${esc(u.id)}" class="${l.length === 1 ? 'on' : ''}"><span class="av">${esc(initials(u.name))}</span><span class="nm">${esc(titleCase(u.name))}</span></button>`).join('') : '<p class="muted" style="margin:6px">No hay usuarios en este perfil.</p>';
    $$('#lg-names button').forEach(b => b.onclick = () => { $$('#lg-names button').forEach(x => x.classList.toggle('on', x === b)); $('#lg-name').value = b.dataset.id; $('#lg-pass').focus(); });
  };
  $('#lg-search').oninput = e => { const q = normP(e.target.value); $$('#lg-names button').forEach(b => b.hidden = q && !normP(b.textContent).includes(q)); };
  $('#lg-role').onchange = fill; $('#lg-level').onchange = fill;
  $$('#lg-levels button').forEach(b => b.onclick = () => { $$('#lg-levels button').forEach(x => x.classList.toggle('on', x === b)); $('#lg-level').value = b.dataset.l; fill(); });
  $$('#lg-roles button').forEach(b => b.onclick = () => { $$('#lg-roles button').forEach(x => x.classList.toggle('on', x === b)); $('#lg-role').value = b.dataset.r; $('#lg-level').value = ''; $$('#lg-levels button').forEach(x => x.classList.toggle('on', !x.dataset.l)); fill(); });

  $('#f-staff').onsubmit = e => {
    e.preventDefault();
    if (!$('#lg-name').value) return UI.toast('Seleccione su nombre en la lista.', 'error');
    UI.busy($('#lg-btn'), async () => {
      const r = await API.call('login', { userId: $('#lg-name').value, password: $('#lg-pass').value });
      API.setSession(r.token, r.user);
      await bootApp(r.all);
    });
  };
  $('#f-family').onsubmit = e => {
    e.preventDefault();
    UI.busy(e.submitter || $('#f-family button'), async () => Portal.open((await API.call('portal', { rut: $('#lg-rut').value })), $('#lg-rut').value));
  };
}

async function bootApp(pre) {
  if (pre) {   // el servidor ya entregó todo junto con la sesión: sin llamadas extra
    DB.hydrate(pre);
    if (pre.branding) Object.assign(Brand, pre.branding);
  } else {
    const [, b] = await Promise.all([DB.load(), API.call('branding').catch(() => ({}))]);
    Object.assign(Brand, { banner: b.banner || '', logo: b.logo || '', badges: b.badges || [] });
  }
  await App.enter();
}

/* ---------- Portal de familias y estudiantes ---------- */
const Portal = {
  icon(subject) {
    const s = normP(subject);
    const map = [['MATEM', 'fa-square-root-variable'], ['GEOMETR', 'fa-shapes'], ['LENGUAJE', 'fa-book-open'], ['LITERATURA', 'fa-book-open'], ['HISTORIA', 'fa-landmark'], ['NATURAL', 'fa-seedling'], ['QUIMICA', 'fa-flask'], ['FISICA', 'fa-atom'], ['BIOLOG', 'fa-dna'], ['ARTE', 'fa-palette'], ['MUSICA', 'fa-music'], ['TECNOLOG', 'fa-laptop-code'], ['ED. FISICA', 'fa-person-running'], ['EDUCACION FISICA', 'fa-person-running'], ['INGLES', 'fa-language'], ['RELIGION', 'fa-dove'], ['ORIENT', 'fa-compass'], ['FILOSOF', 'fa-lightbulb'], ['CIUDADAN', 'fa-scale-balanced']];
    const hit = map.find(([k]) => s.includes(k));
    return hit ? hit[1] : 'fa-book';
  },
  palette(subject) {
    let h = 0; for (const c of subject || '') h = c.charCodeAt(0) + ((h << 5) - h);
    return [['#3b82f6', '#eff6ff'], ['#8b5cf6', '#f5f3ff'], ['#ec4899', '#fdf2f8'], ['#f97316', '#fff7ed'], ['#06b6d4', '#ecfeff'], ['#22c55e', '#f0fdf4'], ['#ca8a04', '#fefce8'], ['#0ea5e9', '#f0f9ff']][Math.abs(h) % 8];
  },

  /** Cuenta regresiva: un anillo que se llena a medida que se acerca la fecha. */
  countdown(n, utp, resched) {
    if (utp) return `<div class="pd-count utp"><div class="ring" style="--p:100"><i class="fa-solid fa-user-shield"></i></div><span>En UTP</span></div>`;
    if (resched) return `<div class="pd-count sky"><div class="ring" style="--p:100"><i class="fa-solid fa-notes-medical"></i></div><span>Por reagendar</span></div>`;
    if (n === null) return `<div class="pd-count"><div class="ring" style="--p:0"><i class="fa-solid fa-hourglass-half"></i></div><span>Por agendar</span></div>`;
    const p = Math.max(8, Math.min(100, Math.round((1 - n / 14) * 100)));
    if (n < 0) return `<div class="pd-count bad"><div class="ring" style="--p:100"><i class="fa-solid fa-triangle-exclamation"></i></div><span>Fecha pasada</span></div>`;
    if (n === 0) return `<div class="pd-count bad pulse"><div class="ring" style="--p:100"><b>HOY</b><i class="fa-solid fa-bell"></i></div><span>¡Es hoy!</span></div>`;
    if (n === 1) return `<div class="pd-count warn pulse"><div class="ring" style="--p:${p}"><b>1</b><small>día</small></div><span>¡Es mañana!</span></div>`;
    return `<div class="pd-count ${n <= 7 ? 'warn' : 'ok'}"><div class="ring" style="--p:${p}"><b>${n}</b><small>días</small></div><span>Faltan</span></div>`;
  },

  open(r) {
    const s = r.student, hoy = D.today();
    const isPend = e => e.status === ST.PEND || e.status === 'Licencia Médica';
    const pend = r.evals.filter(isPend).sort((a, b) => (a.citationDate || '9').localeCompare(b.citationDate || '9'));
    const done = r.evals.filter(e => e.status === ST.DONE).sort((a, b) => (b.completedDate || b.citationDate || '').localeCompare(a.completedDate || a.citationDate || ''));
    const other = r.evals.filter(e => !isPend(e) && e.status !== ST.DONE);
    const ini = String(s.name).trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    const proxima = pend.find(e => e.citationDate && e.citationDate >= hoy);
    const nProx = proxima ? D.days(hoy, proxima.citationDate) - 1 : null;

    const pendCard = e => {
      const [c, bg] = this.palette(e.subject), utp = isUtp(e), resched = isReschedule(e) || e.status === 'Licencia Médica';
      const n = e.citationDate ? D.days(hoy, e.citationDate) - 1 : null;
      const d = e.citationDate ? D.parse(e.citationDate) : null;
      const urg = utp ? 'utp' : resched ? 'sky' : n === null ? '' : n <= 0 ? 'bad' : n <= 7 ? 'warn' : 'ok';
      const block = d
        ? `<div class="pd-date ${urg}"><small>${WEEKDAYS[d.getDay()].slice(0, 3).toUpperCase()}</small><b>${d.getDate()}</b><small>${['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'][d.getMonth()]}</small></div>`
        : `<div class="pd-date ${urg}"><i class="fa-solid ${utp ? 'fa-user-shield' : 'fa-hourglass-half'}" style="font-size:1.6rem"></i><small>${utp ? 'UTP' : 'Sin fecha'}</small></div>`;
      return `<div class="pd-card" style="--c:${c};--bg:${bg}">
        ${block}
        <div class="pd-main">
          <div class="pd-top"><span class="pd-ic"><i class="fa-solid ${this.icon(e.subject)}"></i></span><b>${esc(e.subject)}</b></div>
          <div class="pd-content">${esc(e.content || 'Sin contenido registrado')}</div>
          <div class="pd-meta"><span><i class="fa-solid fa-person-chalkboard"></i> ${esc(titleCase(e.teacher))}</span>
            ${e.citationDate ? `<span><i class="fa-regular fa-clock"></i> ${esc(/^\d\d:\d\d$/.test(e.citationTime || '') ? e.citationTime + ' hrs.' : (e.citationTime || DEFAULT_TIME + ' hrs.'))}</span>` : ''}
            ${e.room ? `<span><i class="fa-solid fa-door-open"></i> ${esc(e.room)}</span>` : ''}
            ${e.instrumentType ? `<span><i class="fa-solid fa-file-pen"></i> ${esc(e.instrumentType)}</span>` : ''}</div>
          ${utp ? '<div class="notice utp" style="margin-top:8px;font-size:.8rem">Esta evaluación agotó las citaciones al hogar: la aplica la Unidad Técnica Pedagógica dentro del horario de clases. <b>No se enviará una nueva citación.</b></div>' : ''}
        </div>
        ${this.countdown(n, utp, resched)}</div>`;
    };

    const doneCard = e => {
      const [c] = this.palette(e.subject);
      return `<div class="dn-card" style="--c:${c}"><span class="dn-check"><i class="fa-solid fa-circle-check"></i></span>
        <span class="pd-ic" style="background:${c}"><i class="fa-solid ${this.icon(e.subject)}"></i></span>
        <div><b>${esc(e.subject)}</b><small>${esc(titleCase(e.teacher))}${e.completedDate || e.citationDate ? ' · rindió el ' + D.fmt(e.completedDate || e.citationDate) : ''}</small></div></div>`;
    };
    const otherCard = e => {
      const m = { [ST.FAIL]: ['fa-circle-xmark', 'Cerrada con nota mínima', 'bad'], [ST.LIC]: ['fa-notes-medical', 'Cerrada por reposo médico', 'vio'], [ST.PLAN]: ['fa-clipboard-list', 'Plan de evaluación', 'vio'], [ST.EXCL]: ['fa-eye-slash', 'No se considera', 'vio'] }[e.status] || ['fa-circle-info', e.status, ''];
      return `<div class="dn-card" style="--c:#7a45e5"><span class="dn-check" style="color:#7a45e5"><i class="fa-solid ${m[0]}"></i></span><span class="pd-ic" style="background:#7a45e5"><i class="fa-solid ${this.icon(e.subject)}"></i></span>
        <div><b>${esc(e.subject)}</b><small>${esc(titleCase(e.teacher))}</small></div><span class="pill ${m[2]}" style="margin-left:auto">${m[1]}</span></div>`;
    };

    const el = $('#portal');
    el.innerHTML = `<div class="portal-box wide">
      <div class="pt-layout">
        <aside class="pt-side">
          <button class="btn sm" onclick="$('#portal').hidden=true"><i class="fa-solid fa-arrow-left"></i> Volver</button>
          ${Brand.banner ? `<img class="pt-banner" src="${esc(Brand.banner)}" alt="Colegio Marina de Chile">` : ''}
          <div class="pt-hero">
            <div class="pt-av">${esc(ini)}</div>
            <div><small>¡Hola!</small><h2>${esc(fmtName(s.name))}</h2><span class="pill brand"><i class="fa-solid fa-graduation-cap"></i> Curso ${esc(s.course)}</span></div>
          </div>
          <div class="pt-stats">
            <div class="pt-stat pend"><i class="fa-solid fa-hourglass-half"></i><b>${pend.length}</b><span>pendiente${pend.length === 1 ? '' : 's'}</span></div>
            <div class="pt-stat done"><i class="fa-solid fa-circle-check"></i><b>${done.length}</b><span>rendida${done.length === 1 ? '' : 's'}</span></div>
          </div>
          ${proxima ? `<div class="pt-next"><i class="fa-solid fa-rocket"></i><div><small>TU PRÓXIMA EVALUACIÓN</small><b>${esc(proxima.subject)}</b><span>${nProx === 0 ? '¡Es hoy!' : nProx === 1 ? '¡Es mañana!' : `Faltan <b>${nProx}</b> días`} · ${D.long(proxima.citationDate)}</span></div></div>` : ''}
        </aside>
        <section class="pt-content">
          <h3 class="pt-h pt-h-main"><span class="pt-h-ic"><i class="fa-solid fa-hourglass-half"></i></span><span>Evaluaciones pendientes</span><span class="pt-h-n">${pend.length}</span></h3>
          ${pend.length ? `<p class="muted" style="margin:0 0 4px">Ordenadas desde la fecha más próxima.</p>${pend.map(pendCard).join('')}`
            : `<div class="pt-empty"><i class="fa-solid fa-face-smile-beam"></i><b>¡Estás al día!</b><span>No tienes evaluaciones pendientes.</span></div>`}
          <h3 class="pt-h pt-h-sub"><i class="fa-solid fa-circle-check" style="color:var(--ok)"></i> Evaluaciones rendidas</h3>
          ${done.length ? `<div class="dn-grid">${done.map(doneCard).join('')}</div>` : '<p class="muted">Aún no hay evaluaciones rendidas registradas.</p>'}
          ${other.length ? `<h3 class="pt-h pt-h-sub"><i class="fa-solid fa-folder-closed" style="color:var(--vio)"></i> Otras situaciones</h3><div class="dn-grid">${other.map(otherCard).join('')}</div>` : ''}
        </section>
      </div></div>`;
    el.hidden = false; el.scrollTop = 0;
  }
};

/* ---------- Inicio ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  $('#btn-out').onclick = () => App.logout();
  $('#btn-sync').onclick = e => UI.busy(e.currentTarget, async () => { await DB.load(); App.go(App.view); UI.toast('Datos actualizados.', 'success', 1800); });
  $('#btn-pass').onclick = async () => {
    const v = await UI.form({ title: 'Cambiar mi contraseña', fields: [{ name: 'p', label: 'Nueva contraseña', type: 'password', required: true, full: true }] });
    if (v) UI.busy(null, async () => { await API.call('changePassword', { password: v.p }); UI.toast('Contraseña actualizada.', 'success'); });
  };
  if (API.token && API.user) {
    try { await bootApp(); return; } catch (e) { API.clear(); }
  }
  initLogin();
});




/* ---------- Instalación como aplicación (PC y celular) y tamaño de pantalla ---------- */
const Pwa = {
  evt: null,
  init() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); this.evt = e; this.show(); });
    window.addEventListener('appinstalled', () => { this.evt = null; $$('[data-install]').forEach(b => b.hidden = true); UI.toast('Aplicación instalada.', 'success'); });
    // iPhone/iPad no ofrece el aviso automático: se muestra el botón con instrucciones
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent), standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (ios && !standalone) this.show();
    $$('[data-install]').forEach(b => b.onclick = () => this.install());
    // Zoom
    this.zoom(0);
    $$('[data-zoom]').forEach(b => b.onclick = () => this.zoom(+b.dataset.zoom));
  },
  /** El ícono de la app instalada (PC, Android y iPhone) pasa a ser la insignia del colegio subida en Administración. */
  async applyIcon() {
    if (!Brand.logo || this.iconFor === Brand.logo) return;
    this.iconFor = Brand.logo;
    try {
      const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = Brand.logo; });
      const make = (size, pad) => { const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, size, size); const box = size * (1 - pad * 2), r = Math.min(box / img.width, box / img.height), w = img.width * r, h = img.height * r; x.drawImage(img, (size - w) / 2, (size - h) / 2, w, h); return c.toDataURL('image/png'); };
      const i192 = make(192, .1), i512 = make(512, .1), iMask = make(512, .22), i180 = make(180, .08);
      $$('link[rel=icon], link[rel=apple-touch-icon]').forEach(l => l.remove());
      document.head.insertAdjacentHTML('beforeend', `<link rel="icon" type="image/png" href="${i192}"><link rel="apple-touch-icon" href="${i180}">`);
      const base = location.href.replace(/[^/]*$/, '').split('?')[0];
      const man = { name: 'Evaluaciones Pendientes · Colegio Marina de Chile', short_name: 'Evaluaciones', start_url: base + 'index.html', scope: base, display: 'standalone', background_color: '#ffffff', theme_color: '#0f69c4', lang: 'es-CL',
        icons: [{ src: i192, sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: i512, sizes: '512x512', type: 'image/png', purpose: 'any' }, { src: iMask, sizes: '512x512', type: 'image/png', purpose: 'maskable' }] };
      const link = document.querySelector('link[rel=manifest]');
      if (link) link.href = URL.createObjectURL(new Blob([JSON.stringify(man)], { type: 'application/manifest+json' }));
    } catch (e) { /* si falla, queda el ícono por defecto */ }
  },
  show() { $$('[data-install]').forEach(b => b.hidden = false); },
  async install() {
    if (this.evt) { this.evt.prompt(); await this.evt.userChoice.catch(() => {}); this.evt = null; return; }
    UI.modal({ title: 'Instalar la aplicación', body: `<p style="margin-top:0">En iPhone / iPad:</p><ol style="line-height:1.9"><li>Abra esta página en <b>Safari</b>.</li><li>Pulse el botón <b>Compartir</b> <i class="fa-solid fa-arrow-up-from-bracket"></i>.</li><li>Elija <b>«Agregar a la pantalla de inicio»</b>.</li></ol><p class="muted">En Android y computador, use el botón <b>Instalar app</b> o el icono de instalación que aparece en la barra de direcciones del navegador.</p>` });
  },
  zoom(step) {
    let z = parseFloat(localStorage.getItem('ep_zoom')) || (window.innerWidth < 500 ? 0.92 : 1);
    z = Math.min(1.4, Math.max(0.7, Math.round((z + step * 0.08) * 100) / 100));
    localStorage.setItem('ep_zoom', z);
    document.documentElement.style.setProperty('--ui-zoom', z);
    ['#login', '#app', '#portal'].forEach(s => { const e = $(s); if (e) e.style.zoom = z; });
    if (step) UI.toast(`Tamaño de la aplicación: ${Math.round(z * 100)}%`, 'info', 1500);
  }
};
document.addEventListener('DOMContentLoaded', () => Pwa.init());













