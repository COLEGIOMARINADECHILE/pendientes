/* ===== Cliente de la API (Apps Script) + almacén en memoria + modo demo ===== */
const API = {
  token: sessionStorage.getItem('ep_token') || '',
  user: JSON.parse(sessionStorage.getItem('ep_user') || 'null'),
  demo: !APP_CONFIG.API_URL,

  /** Dirección pública de la plataforma, para que los correos incluyan el enlace. */
  appUrl() { return location.protocol === 'https:' ? (location.origin + location.pathname).replace(/[^/]*$/, '') : ''; },

  async call(action, payload = {}) {
    if (this.demo) return Mock.call(action, payload, this.token);
    let res;
    try {
      res = await fetch(APP_CONFIG.API_URL, { method: 'POST', body: JSON.stringify({ action, token: this.token, appUrl: this.appUrl(), ...payload }) });
    } catch (e) { throw new Error('No hay conexión con el servidor (Apps Script).'); }
    const j = await res.json().catch(() => ({ ok: false, error: 'Respuesta inválida del servidor.' }));
    if (!j.ok) {
      if (j.code === 'AUTH') { this.clear(); location.reload(); }
      throw new Error(j.error || 'Error desconocido');
    }
    return j;
  },
  setSession(token, user) {
    this.token = token; this.user = user;
    sessionStorage.setItem('ep_token', token); sessionStorage.setItem('ep_user', JSON.stringify(user));
  },
  clear() { this.token = ''; this.user = null; sessionStorage.removeItem('ep_token'); sessionStorage.removeItem('ep_user'); }
};

const Brand = { banner: '', logo: '' };

/* ---------- Almacén en memoria: toda la lógica trabaja sobre estos arreglos ---------- */
const DB = {
  users: [], students: [], evaluations: [], config: {}, idx: new Map(),

  queue: Promise.resolve(), pending: 0,

  /** Espera a que se terminen de guardar los cambios en curso y recarga todo desde el servidor. */
  async load() { await this.queue; return this._load(); },
  async _load() { return this.hydrate(await API.call('loadAll')); },
  hydrate(r) {
    this.users = r.users || [];
    this.students = (r.students || [])
      .map(s => ({ gender: 'O', status: 'Activo', ...s, name: String(s.name || '').trim().toUpperCase(), course: normCourse(s.course) }))
      .filter(s => s.name);
    this.evaluations = (r.evaluations || [])
      .map(e => ({ ...e, studentName: String(e.studentName || '').trim().toUpperCase(), course: normCourse(e.course) }));
    this.config = r.config || {};
    this.reindex();
  },  reindex() { this.idx = new Map(this.students.map(s => [s.course + '||' + s.name, s])); },
  col(c) { return c === 'students' ? this.students : c === 'evaluations' ? this.evaluations : null; },
  get(c, id) { return this.col(c).find(x => x.id === id); },

  /** El cambio se ve al instante en pantalla; el guardado en Google Sheets sigue en segundo plano, en orden.
   *  Use `await DB.flush()` antes de pedirle algo al servidor que dependa de lo recién guardado. */
  write(ops) {
    ops.forEach(o => this.apply(o));
    this.pending++;
    this.queue = this.queue
      .then(() => API.call('batch', { ops }))
      .catch(async e => { UI.toast('No se pudo guardar: ' + (e.message || e) + '. Se recargan los datos.', 'error', 9000); await this._load().catch(() => {}); if (typeof App !== 'undefined' && App.view) App.go(App.view); })
      .finally(() => { this.pending--; });
    return Promise.resolve();
  },
  flush() { return this.queue; },  apply(o) {
    if (o.c === 'settings') { Object.assign(this.config, o.data || {}); return; }
    const arr = this.col(o.c);
    const i = arr.findIndex(x => x.id === o.id);
    if (o.op === 'delete') { if (i > -1) arr.splice(i, 1); }
    else if (o.op === 'update') { if (i > -1) Object.assign(arr[i], o.data); }
    else if (i > -1) Object.assign(arr[i], o.data);
    else arr.push({ ...o.data, id: o.id });
    if (o.c === 'students') this.reindex();
  }
};

function newId() { return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

/* ---------- MODO DEMO (sin Apps Script): datos de ejemplo en localStorage ---------- */
const Mock = {
  K: 'ep_demo_v1',
  load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(this.K)); } catch (e) {}
    if (!d) { d = this.seed(); this.save(d); }
    return d;
  },
  save(d) { localStorage.setItem(this.K, JSON.stringify(d)); },
  reset() { localStorage.removeItem(this.K); },

  seed() {
    const t = D.today(), th = D.parse(t); th.setDate(th.getDate() + ((4 - th.getDay() + 7) % 7 || 7));
    const thu = D.iso(th), thu2 = D.add(thu, 7);
    const st = (n, c, rut, g) => ({ id: newId(), name: n, course: c, rut, gender: g, status: 'Activo' });
    const students = [
      st('GONZALEZ MUÑOZ MATIAS', '5° A', '24111222-3', 'M'), st('SOTO PEREZ CAMILA', '5° A', '24222333-4', 'F'),
      st('ROJAS DIAZ BENJAMIN', '5° A', '24333444-5', 'M'), st('FUENTES LAGOS ISIDORA', '5° A', '24444555-6', 'F'),
      st('TORRES VEGA MARTIN', '5° A', '24555666-7', 'M'), st('PINO SILVA ANTONIA', '5° A', '24666777-8', 'F'),
      st('ARAYA CORTES VICENTE', '1° Medio A', '21111222-3', 'M'), st('LOPEZ REYES JAVIERA', '1° Medio A', '21222333-4', 'F'),
      st('MORALES NUÑEZ DIEGO', '1° Medio A', '21333444-5', 'M'), st('CARRASCO BRAVO FLORENCIA', '1° Medio A', '21444555-6', 'F')
    ];
    const ev = (i, subj, teacher, extra) => ({
      id: newId(), studentName: students[i].name, course: students[i].course, subject: subj, teacher,
      instrumentType: 'Prueba Escrita', content: 'Unidad 2: contenidos del semestre', absenceDate: D.add(t, -9),
      citationTime: '09:45', status: 'Pendiente', history: [], observations: [], createdAt: new Date().toISOString(), addedBy: 'ANA PEREZ', ...extra
    });
    const evaluations = [
      ev(0, 'MATEMÁTICA', 'ANA PEREZ', { citationDate: thu }),
      ev(1, 'LENGUAJE Y COMUNICACIÓN', 'LUIS ROJAS', { citationDate: thu }),
      ev(2, 'HISTORIA', 'ANA PEREZ', { citationDate: thu2 }),
      ev(3, 'CS. NATURALES', 'LUIS ROJAS', { citationDate: thu, history: [{ date: D.add(thu, -7), status: 'Inasistente' }] }),
      ev(4, 'MATEMÁTICA', 'ANA PEREZ', { citationDate: null, utpTransfer: true, history: [{ date: D.add(t, -14), status: 'Inasistente' }, { date: D.add(t, -7), status: 'Inasistente' }] }),
      ev(6, 'INGLÉS', 'LUIS ROJAS', { citationDate: thu, citationTime: '11:30' }),
      ev(7, 'MATEMÁTICA', 'ANA PEREZ', { citationDate: null, needsUtpReschedule: true, licenseStart: D.add(t, -3), licenseEnd: D.add(t, 6), licenseDays: 10 }),
      ev(8, 'HISTORIA', 'LUIS ROJAS', { status: 'Rendida', citationDate: D.add(t, -7), returnedToTeacher: true, returnDate: D.add(t, -6) }),
      ev(5, 'ARTES', 'LUIS ROJAS', { citationDate: D.add(t, -2) })
    ];
    students[7].onLicense = true; students[7].licenseStart = D.add(t, -3); students[7].licenseEnd = D.add(t, 6);
    const users = [
      { id: 'u1', name: 'ADMINISTRADOR', role: 'admin', password: 'admin', assignments: [] },
      { id: 'u2', name: 'ANA PEREZ', role: 'docente', password: '1234', mainLevel: null, headTeacherOf: '5° A',
        assignments: [{ course: '5° A', subject: 'MATEMÁTICA' }, { course: '5° A', subject: 'HISTORIA' }] },
      { id: 'u3', name: 'LUIS ROJAS', role: 'docente', password: '1234', assignments: [{ course: '5° A', subject: 'ARTES' }, { course: '1° Medio A', subject: 'INGLÉS' }] },
      { id: 'u4', name: 'CARLA SOTO', role: 'asistente', password: '1234', assignments: [{ course: '5° A', subject: 'TODAS' }] },
      { id: 'u5', name: 'INSPECTORIA', role: 'inspector', password: '1234', assignments: [] }
    ];
    return { users, students, evaluations, config: { coordinators: { 'Segundo Ciclo': { name: 'Coordinadora Demo', title: 'Coordinación Segundo Ciclo', email: 'coordinacion@ejemplo.cl' } } }, branding: {} };
  },

  call(action, p, token) {
    return new Promise((resolve, reject) => setTimeout(() => {
      try { resolve(this.run(action, p, token)); } catch (e) { reject(e); }
    }, 40));
  },
  run(action, p, token) {
    const d = this.load();
    const pub = u => ({ id: u.id, name: u.name, role: u.role, assignments: u.assignments || [], headTeacherOf: u.headTeacherOf || null, mainLevel: u.mainLevel || null, email: u.email || '' });
    const me = () => { const u = d.users.find(x => 'mock-' + x.id === token); if (!u) throw new Error('Sesión expirada.'); return u; };
    switch (action) {
      case 'boot': { const u = this.run('publicUsers', p, token); return { users: u.users, banner: d.branding.banner || '', logo: d.branding.logo || '', badges: d.branding.badges || [] }; }
      case 'publicUsers': return { users: d.users.map(u => { const as = u.assignments || [], me = as.filter(a => /medio/i.test(a.course)).length; return { id: u.id, name: u.name, role: u.role, mainLevel: u.mainLevel || null, level: u.mainLevel || (as.length ? (me > as.length - me ? 'Media' : 'Básica') : '') }; }) };
      case 'branding': return { banner: d.branding.banner || '', logo: d.branding.logo || '', badges: d.branding.badges || [] };
      case 'login': {
        const u = d.users.find(x => x.id === p.userId);
        if (!u || u.password !== p.password) throw new Error('Usuario o contraseña incorrectos.');
        return { token: 'mock-' + u.id, user: pub(u) };
      }
      case 'loadAll': me(); return { users: d.users.map(pub), students: d.students, evaluations: d.evaluations, config: d.config };
      case 'batch':
        me();
        p.ops.forEach(o => {
          if (o.c === 'settings') { Object.assign(d.config, o.data); return; }
          const arr = d[o.c], i = arr.findIndex(x => x.id === o.id);
          if (o.op === 'delete') { if (i > -1) arr.splice(i, 1); }
          else if (o.op === 'update') { if (i > -1) Object.assign(arr[i], o.data); }
          else if (i > -1) arr[i] = { ...o.data, id: o.id }; else arr.push({ ...o.data, id: o.id });
        });
        this.save(d); return {};
      case 'saveUser': {
        const u = p.user, ex = u.id && d.users.find(x => x.id === u.id);
        if (ex) Object.assign(ex, u, { password: u.password || ex.password });
        else d.users.push({ ...u, id: newId(), password: u.password });
        this.save(d); return { users: d.users.map(pub) };
      }
      case 'deleteUser': d.users = d.users.filter(x => x.id !== p.id); this.save(d); return { users: d.users.map(pub) };
      case 'notifyExcluded': me(); return { results: [], demo: true };
      case 'previewTeacher': me(); return { html: '<p style="font-family:sans-serif;padding:20px">La vista previa del correo está disponible al conectar con Apps Script.</p>' };
      case 'notifyTeachers': me(); return { results: [], demo: true };
      case 'notify': me(); return { sent: 0, noMail: 0, demo: true };
      case 'changePassword': me().password = p.password; this.save(d); return {};
      case 'saveBranding': Object.assign(d.branding, p.banner ? { banner: p.banner } : {}, p.logo ? { logo: p.logo } : {}, p.badges ? { badges: p.badges } : {}); this.save(d); return {};
      case 'portal': {
        const rut = normRut(p.rut), s = d.students.find(x => normRut(x.rut) === rut && !x.withdrawn);
        if (!s) throw new Error('RUT no encontrado.');
        return { student: { name: s.name, course: s.course, gender: s.gender }, evals: d.evaluations.filter(e => e.studentName === s.name && e.course === s.course) };
      }
      default: throw new Error('Acción no disponible en modo demo: ' + action);
    }
  }
};





window.addEventListener('beforeunload', e => { if (DB.pending > 0) { e.preventDefault(); e.returnValue = ''; } });


