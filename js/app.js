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

const VIEWS = { pending: Pending, register: Register, history: History, students: Students, rooms: Rooms, admin: Admin, teacher: Teacher, stats: Stats };
const NAV = {
  admin: [['register', 'Registrar evaluación', 'fa-file-circle-plus', 'cta'], ['pending', 'Pendientes', 'fa-list-check'], ['history', 'Historial', 'fa-clock-rotate-left'], ['students', 'Estudiantes', 'fa-users'], ['stats', 'Estadística', 'fa-chart-pie'], ['rooms', 'Salas', 'fa-door-open'], ['admin', 'Administración', 'fa-gear']],
  docente: [['register', 'Registrar evaluación', 'fa-file-circle-plus', 'cta'], ['teacher', 'Mi panel', 'fa-chalkboard-user'], ['history', 'Historial', 'fa-clock-rotate-left']],
  asistente: [['pending', 'Pendientes de mis cursos', 'fa-list-check']],
  inspector: [['pending', 'Pendientes', 'fa-list-check'], ['history', 'Historial', 'fa-clock-rotate-left'], ['students', 'Estudiantes', 'fa-users'], ['stats', 'Estadística', 'fa-chart-pie']],
  pie: [['pending', 'Pendientes', 'fa-list-check'], ['history', 'Historial', 'fa-clock-rotate-left'], ['students', 'Estudiantes', 'fa-users'], ['stats', 'Estadística', 'fa-chart-pie']]
};

const App = {
  view: null,
  go(v) {
    this.view = v;
    $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    const label = (NAV[Auth.role].find(n => n[0] === v) || [])[1] || '';
    $('#top-title').textContent = label;
    VIEWS[v].mount($('#view'));
    window.scrollTo({ top: 0 });
    sessionStorage.setItem('ep_view', v);
  },

  applyBrand() {
    const set = (id, src) => { const e = $(id); if (!e) return; e.hidden = !src; if (src) e.src = src; };
    set('#lg-logo', Brand.logo); set('#sd-logo', Brand.logo); set('#bn-img', Brand.banner);
    $('#lg-badges').innerHTML = (Brand.badges || []).map(b => `<img src="${esc(b)}" alt="Insignia">`).join('');
    $('#lg-icon').hidden = !!Brand.logo; $('#sd-icon').hidden = !!Brand.logo;
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
  $$('.seg button').forEach(b => b.onclick = () => {
    $$('.seg button').forEach(x => x.classList.toggle('on', x === b));
    $('#f-staff').hidden = b.dataset.t !== 'staff'; $('#f-family').hidden = b.dataset.t !== 'family';
  });
  let users = [];
  try {
    const [bnd, pu] = await Promise.all([API.call('branding').catch(() => ({})), API.call('publicUsers')]);
    Object.assign(Brand, { banner: bnd.banner || '', logo: bnd.logo || '', badges: bnd.badges || [] }); App.applyBrand(); users = pu.users;
    if (API.demo) status.innerHTML = '<span class="pill warn">MODO DEMO</span> Administrador: <b>ADMINISTRADOR / admin</b> · Docente: <b>ANA PEREZ / 1234</b> · RUT de prueba: <b>24111222-3</b>';
  } catch (e) { status.textContent = 'No se pudo conectar con el servidor: ' + e.message; }

  const fill = () => {
    const role = $('#lg-role').value, lvl = $('#lg-level').value;
    $('#lg-level-box').hidden = role !== 'docente';
    let l = users.filter(u => u.role === role);
    if (role === 'docente' && lvl) l = l.filter(u => (u.mainLevel || 'Básica') === lvl);
    l.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    $('#lg-name').innerHTML = role ? opts(l.map(u => [u.id, titleCase(u.name)]), l.length === 1 ? l[0].id : '', l.length ? 'Seleccione su nombre…' : 'No hay usuarios en este perfil') : '<option value="">Seleccione un perfil primero</option>';
  };
  $('#lg-role').onchange = fill; $('#lg-level').onchange = fill;
  $$('#lg-roles button').forEach(b => b.onclick = () => { $$('#lg-roles button').forEach(x => x.classList.toggle('on', x === b)); $('#lg-role').value = b.dataset.r; $('#lg-role').dispatchEvent(new Event('change')); setTimeout(() => ($('#lg-name').value ? $('#lg-pass') : $('#lg-name')).focus(), 50); });

  $('#f-staff').onsubmit = e => {
    e.preventDefault();
    UI.busy($('#lg-btn'), async () => {
      const r = await API.call('login', { userId: $('#lg-name').value, password: $('#lg-pass').value });
      API.setSession(r.token, r.user);
      await bootApp();
    });
  };
  $('#f-family').onsubmit = e => {
    e.preventDefault();
    UI.busy(e.submitter || $('#f-family button'), async () => Portal.open((await API.call('portal', { rut: $('#lg-rut').value })), $('#lg-rut').value));
  };
}

async function bootApp() {
  await DB.load();
  const b = await API.call('branding').catch(() => ({}));
  Object.assign(Brand, { banner: b.banner || '', logo: b.logo || '', badges: b.badges || [] });
  await App.enter();
}

/* ---------- Portal de familias ---------- */
const Portal = {
  open(r) {
    const s = r.student, hoy = D.today(), g = s.gender === 'M' ? 'El' : s.gender === 'F' ? 'La' : 'El/La';
    const pend = r.evals.filter(e => e.status === ST.PEND || e.status === 'Licencia Médica').sort((a, b) => (a.citationDate || '9').localeCompare(b.citationDate || '9'));
    const done = r.evals.filter(e => !pend.includes(e));
    const pal = subj => { let h = 0; for (const c of subj || '') h = c.charCodeAt(0) + ((h << 5) - h); return [['#3b82f6', '#eff6ff'], ['#8b5cf6', '#f5f3ff'], ['#ec4899', '#fdf2f8'], ['#f97316', '#fff7ed'], ['#06b6d4', '#ecfeff'], ['#22c55e', '#f0fdf4'], ['#ca8a04', '#fefce8'], ['#0ea5e9', '#f0f9ff']][Math.abs(h) % 8]; };
    const card = e => {
      const [c, bg] = pal(e.subject), utp = isUtp(e), resched = isReschedule(e);
      let chip = '<span class="pill">Por agendar</span>';
      if (utp) chip = '<span class="pill utp"><i class="fa-solid fa-user-shield"></i> En manos de UTP</span>';
      else if (resched) chip = '<span class="pill sky">Reposo médico: por reagendar</span>';
      else if (e.citationDate) { const n = D.days(hoy, e.citationDate) - 1; chip = n < 0 ? '<span class="pill bad">Fecha pasada</span>' : n === 0 ? '<span class="pill bad">¡Es hoy!</span>' : n === 1 ? '<span class="pill warn">Es mañana</span>' : `<span class="pill ${n <= 7 ? 'warn' : 'ok'}">En ${n} días</span>`; }
      return `<div class="pcard" style="--c:${c};--bg2:${bg}"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><b style="color:${c}">${esc(e.subject)}</b>${chip}</div>
        <div style="font-size:.88rem;margin-top:6px"><b>Docente:</b> ${esc(titleCase(e.teacher))}<br><b>Temática:</b> ${esc(e.content || '-')}</div>
        <div style="background:#fff;border-radius:10px;padding:10px 12px;margin-top:10px"><small><i class="fa-regular fa-calendar-check"></i> FECHA DE RENDICIÓN</small><br><b style="color:${utp ? 'var(--utp)' : c}">${e.citationDate ? `${D.long(e.citationDate)} · ${esc(e.citationTime || DEFAULT_TIME)}` : utp ? 'La fecha la asigna la Unidad Técnica Pedagógica' : 'Pendiente de agendar'}</b>${e.room ? `<br><small><i class="fa-solid fa-door-open"></i> Sala: <b>${esc(e.room)}</b></small>` : ''}
        ${utp ? '<div class="notice utp" style="margin-top:8px;font-size:.8rem">Esta evaluación agotó las citaciones al hogar: la aplica la UTP dentro del horario de clases. <b>No se enviará una nueva citación.</b></div>' : ''}</div></div>`;
    };
    const el = $('#portal');
    el.innerHTML = `<div class="portal-box"><button class="btn sm" onclick="$('#portal').hidden=true"><i class="fa-solid fa-arrow-left"></i> Volver</button>
      <div style="text-align:center;margin:18px 0;border-bottom:1px solid var(--line);padding-bottom:16px"><i class="fa-solid fa-graduation-cap" style="font-size:2.2rem;color:var(--brand)"></i><h2 style="justify-content:center;margin-top:8px">${esc(fmtName(s.name))}</h2><div class="muted">Curso: ${esc(s.course)}</div></div>
      <h3><i class="fa-solid fa-list-check" style="color:var(--brand)"></i> Estado de evaluaciones</h3>
      ${pend.length ? `<p class="muted">Ordenadas desde la fecha más próxima. Total: <b>${pend.length}</b>.</p>${pend.map(card).join('')}` : `<div class="notice ok" style="text-align:center;margin-top:12px"><b>${g} estudiante está al día.</b><br>No registra evaluaciones pendientes.</div>`}
      ${done.length ? `<details style="margin-top:18px"><summary style="cursor:pointer;font-weight:700">Evaluaciones ya finalizadas (${done.length})</summary>${done.map(e => `<div class="pcard" style="--c:${e.status === ST.DONE ? '#22c55e' : '#7a45e5'}"><b>${esc(e.subject)}</b> <span class="pill ${e.status === ST.DONE ? 'ok' : 'vio'}">${esc(e.status)}</span><br><small>${esc(titleCase(e.teacher))}${e.citationDate ? ' · ' + D.fmt(e.citationDate) : ''}</small></div>`).join('')}</details>` : ''}</div>`;
    el.hidden = false;
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



