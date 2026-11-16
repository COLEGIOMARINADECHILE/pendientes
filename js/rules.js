/* ===== Reglas de negocio puras: fechas, ciclos, disponibilidad, licencias, salas ===== */
const CYCLES = [
  { name: 'Primer Ciclo', courses: ['1° A', '1° B', '2° A', '2° B', '3° A', '3° B', '4° A', '4° B'] },
  { name: 'Segundo Ciclo', courses: ['5° A', '5° B', '6° A', '6° B', '7° A', '7° B', '8° A', '8° B'] },
  { name: 'Enseñanza Media', courses: ['1° Medio A', '1° Medio B', '1° Medio C', '2° Medio A', '2° Medio B', '2° Medio C', '3° Medio A', '3° Medio B', '3° Medio C', '4° Medio A', '4° Medio B', '4° Medio C'] }
];
const COURSES = CYCLES.flatMap(c => c.courses);
const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DEFAULT_SUBJECTS = ['MATEMÁTICA', 'LENGUAJE Y COMUNICACIÓN', 'HISTORIA', 'CS. NATURALES', 'ARTES', 'MÚSICA', 'TECNOLOGÍA', 'ED. FÍSICA', 'INGLÉS', 'RELIGIÓN', 'GEOMETRÍA', 'LENGUA Y LITERATURA', 'QUÍMICA'];
const INSTRUMENTS = ['Prueba Escrita', 'Trabajo en Clases', 'Entrega de Producto', 'Actividad Práctica', 'Trabajo en Equipo'];
const LICENSE_LONG = 15, REENTRY_DAYS = 5, DEFAULT_WD = 4, DEFAULT_TIME = '09:45';
const ST = { PEND: 'Pendiente', DONE: 'Rendida', FAIL: 'No Cumplida', LIC: 'Cerrada por Licencia', PLAN: 'Plan de Evaluación' };

/* ---------- Fechas (siempre ISO yyyy-mm-dd, hora local) ---------- */
const D = {
  iso: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  parse: s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); },
  today: () => D.iso(new Date()),
  add: (s, n) => { const d = D.parse(s); d.setDate(d.getDate() + n); return D.iso(d); },
  addWork(s, n) { const d = D.parse(s); let k = 0; while (k < n) { d.setDate(d.getDate() + 1); if (d.getDay() % 6) k++; } return D.iso(d); },
  subWork(s, n) { const d = D.parse(s); let k = 0; while (k < n) { d.setDate(d.getDate() - 1); if (d.getDay() % 6) k++; } return D.iso(d); },
  weekday: s => WEEKDAYS[D.parse(s).getDay()],
  fmt: s => s ? s.split('-').reverse().join('/') : '—',
  long: s => s ? `${D.weekday(s)} ${D.fmt(s)}` : 'Sin fecha',
  endWeek: s => { const d = D.parse(s); d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); return D.iso(d); },
  days: (a, b) => Math.round((D.parse(b) - D.parse(a)) / 864e5) + 1
};

/* ---------- Textos ---------- */
const titleCase = s => s ? String(s).toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '';
function fmtName(n) {   // "APELLIDO APELLIDO NOMBRE" -> "Nombre Apellido Apellido"
  if (!n) return '';
  if (n.includes(',')) { const p = n.split(','); return titleCase(`${p[1].trim()} ${p[0].trim()}`); }
  const w = n.trim().split(/\s+/);
  return w.length >= 3 ? titleCase(`${w.slice(2).join(' ')} ${w.slice(0, 2).join(' ')}`) : titleCase(n);
}
function firstName(n) { const w = String(n || '').trim().split(/\s+/); return titleCase(w.length >= 3 ? w[2] : w[0]); }
const sameText = (a, b) => String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase();
const normRut = r => String(r || '').replace(/[.\s]/g, '').toUpperCase();
function guessGender(n) { const f = String(n || '').split(' ')[0].toLowerCase(); return f.endsWith('a') && f !== 'andrea' ? 'F' : (f.endsWith('o') || f.endsWith('s') ? 'M' : 'O'); }

/* ---------- Cursos escritos de distinta forma ---------- */
function normCourse(raw) {
  const key = (t, g) => { let s = String(t || '').toUpperCase().replace(/º/g, '°').replace(/[\s.\-_]/g, '').replace(/MEDIA/g, 'MEDIO'); return g ? s.replace(/°/g, '') : s; };
  if (!normCourse.map) { normCourse.map = {}; COURSES.forEach(c => { normCourse.map[key(c)] = c; normCourse.map[key(c, 1)] = c; }); }
  return normCourse.map[key(raw)] || normCourse.map[key(raw, 1)] || String(raw || '').trim();
}
const cycleOf = course => (CYCLES.find(c => c.courses.includes(course)) || CYCLES[0]).name;
const levelOf = course => cycleOf(course) === 'Enseñanza Media' ? 'Media' : 'Básica';

/* ---------- Configuración con valores por omisión ---------- */
const Cfg = {
  get max() { return Number(DB.config.maxEvalsPerDay) || 2; },
  get rule() { const r = DB.config.rule || {}; return { enabled: r.enabled !== false, days: r.days != null ? Number(r.days) : 2, cutoff: r.cutoff || '12:00' }; },
  get blocked() { return DB.config.blockedDays || []; },
  get subjects() { return [...new Set([...DEFAULT_SUBJECTS, ...(DB.config.customSubjects || [])])].sort(); },
  rooms(cycle) { const l = (DB.config.roomsByCycle || {})[cycle]; return l && l.length ? l : ['Sala 1']; },
  coord(x) {
    const cy = CYCLES.some(c => c.name === x) ? x : cycleOf(x), c = (DB.config.coordinators || {})[cy] || {};
    return { cycle: cy, name: (c.name || '').trim(), title: (c.title || '').trim() || `Coordinación ${cy}`, email: (c.email || '').trim() };
  },
  schedule(course) {
    const cy = cycleOf(course), c = (DB.config.cycleSchedules || {})[cy] || {};
    const wd1 = c.weekday != null ? Number(c.weekday) : DEFAULT_WD, t1 = c.time || DEFAULT_TIME;
    const days = [{ wd: wd1, time: t1 }];
    if (c.secondDayEnabled && c.weekday2 != null && Number(c.weekday2) !== wd1) days.push({ wd: Number(c.weekday2), time: c.time2 || t1 });
    days.sort((a, b) => ((a.wd + 6) % 7) - ((b.wd + 6) % 7));
    return {
      cycle: cy, days, weekdays: days.map(d => d.wd),
      label: days.map(d => `${WEEKDAYS[d.wd]} ${d.time}`).join(' y '),
      timeFor: iso => { try { const w = D.parse(iso).getDay(); return (days.find(d => d.wd === w) || days[0]).time; } catch (e) { return t1; } },
      isOfficialTime: t => days.some(d => d.time === t)
    };
  }
};

/* ---------- Estudiantes y su situación ---------- */
const studentOf = (name, course) => DB.idx.get(course + '||' + name);
const isWithdrawn = ev => { const s = studentOf(ev.studentName, ev.course); return !!(s && s.withdrawn); };

function licenseOf(st) {
  if (!st || !st.onLicense || !st.licenseStart || !st.licenseEnd) return null;
  const days = D.days(st.licenseStart, st.licenseEnd);
  return { start: st.licenseStart, end: st.licenseEnd, days, long: days >= LICENSE_LONG, vigente: D.today() <= st.licenseEnd };
}
function suspensionOf(st) {
  if (!st || !st.suspended || !st.suspensionStart || !st.suspensionEnd) return null;
  return { start: st.suspensionStart, end: st.suspensionEnd, days: D.days(st.suspensionStart, st.suspensionEnd), vigente: D.today() <= st.suspensionEnd };
}
/** Primera fecha en que se puede rendir tras un reposo: 5 días hábiles y no dentro de la semana del regreso. */
function minAfterLicense(end) {
  const regreso = D.addWork(end, 1), tras = D.addWork(regreso, REENTRY_DAYS), finSem = D.endWeek(regreso);
  return tras > finSem ? tras : D.addWork(finSem, 1);
}
function longLicenseCovering(st, iso) {
  if (!st || !iso) return null;
  const rangos = [...(st.licenseHistory || [])];
  if (st.licenseStart && st.licenseEnd) rangos.push({ start: st.licenseStart, end: st.licenseEnd });
  return rangos.find(r => r.start && r.end && D.days(r.start, r.end) >= LICENSE_LONG && iso >= r.start && iso <= r.end) || null;
}

/* ---------- Calendario oficial ---------- */
function blockedInfo(iso, course) {
  const cy = course ? cycleOf(course) : '';
  return Cfg.blocked.find(b => b && b.start && iso >= b.start && iso <= (b.end || b.start) && (!b.cycle || !course || b.cycle === cy)) || null;
}
function nextOfficialAfter(course, iso) {
  const wds = Cfg.schedule(course).weekdays; const d = D.parse(iso);
  for (let i = 0; i < 70; i++) { d.setDate(d.getDate() + 1); const s = D.iso(d); if (wds.includes(d.getDay()) && !blockedInfo(s, course)) return s; }
  return D.add(iso, 7);
}
const nextOfficialFrom = (course, iso) => nextOfficialAfter(course, D.add(iso, -1));

const deadline = iso => { const r = Cfg.rule; return new Date(`${r.days > 0 ? D.subWork(iso, r.days) : iso}T${r.cutoff}:00`); };
const expired = iso => Cfg.rule.enabled && !!iso && new Date() > deadline(iso);
function applyAnticipation(iso, course) {
  let f = iso, i = 0;
  while (expired(f) && i++ < 12) f = nextOfficialAfter(course, f);
  return { date: f, moved: f !== iso };
}

/** ¿Se puede citar a este estudiante en esa fecha? */
function availability(name, course, iso, o = {}) {
  if (!iso) return { ok: true };
  const b = blockedInfo(iso, course);
  if (b) return { ok: false, reason: 'bloqueado', message: `El ${D.long(iso)} está bloqueado: ${b.reason || 'sin motivo'}.` };
  if (o.anticipation && expired(iso)) return { ok: false, reason: 'anticipacion', message: `El plazo para registrar evaluaciones del ${D.long(iso)} ya venció (${Cfg.rule.days} día(s) hábil(es) antes, hasta las ${Cfg.rule.cutoff}).` };
  const st = studentOf(name, course), lic = licenseOf(st);
  if (lic) {
    if (iso >= lic.start && iso <= lic.end) return { ok: false, reason: 'licencia', message: `${fmtName(name)} tiene reposo médico hasta el ${D.fmt(lic.end)}.` };
    const min = minAfterLicense(lic.end);
    if (iso < min && lic.end >= D.add(D.today(), -45)) return { ok: false, reason: 'reingreso', suggested: min, message: `${fmtName(name)} regresa de un reposo: tras ${REENTRY_DAYS} días hábiles de readaptación puede rendir desde el ${D.fmt(min)}.` };
  }
  const sus = suspensionOf(st);
  if (sus && iso >= sus.start && iso <= sus.end) return { ok: false, reason: 'suspension', suggested: afterSuspension(sus, course), message: `${fmtName(name)} está suspendido(a) hasta el ${D.fmt(sus.end)}.` };
  const n = DB.evaluations.filter(e => e.studentName === name && e.course === course && e.status === ST.PEND && e.citationDate === iso && e.id !== o.ignoreId).length + (o.extra || 0);
  if (n >= Cfg.max) return { ok: false, reason: 'limite', message: `${fmtName(name)} ya tiene ${n} evaluación(es) el ${D.long(iso)} (máximo por día: ${Cfg.max}).` };
  return { ok: true };
}
const afterSuspension = (sus, course) => nextOfficialAfter(course, D.endWeek(D.addWork(sus.end, 1)));

/** Próximo día oficial disponible para el estudiante, desde la fecha indicada (inclusive). */
function findNextAvailable(name, course, from, o = {}) {
  let d = nextOfficialFrom(course, from || D.today());
  for (let i = 0; i < 60; i++) {
    const r = availability(name, course, d, o);
    if (r.ok) return d;
    d = (r.suggested && r.suggested > d) ? nextOfficialFrom(course, r.suggested) : nextOfficialAfter(course, d);
  }
  return d;
}

/* ---------- Estado de las evaluaciones ---------- */
const usedAttempts = ev => Math.max(0, (ev.history || []).length - (ev.suspensionExemptCount || 0));
const attempt = ev => usedAttempts(ev) + 2;                       // 2ª citación = primera enviada al hogar
const isReschedule = ev => ev.status === ST.PEND && ev.needsUtpReschedule === true && !ev.citationDate;
const isUtp = ev => ev.status === ST.PEND && !isReschedule(ev) && (usedAttempts(ev) >= 2 || ev.utpTransfer === true);
function bucket(ev) {
  if (isUtp(ev)) return 'utp';
  if (!ev.citationDate) return 'sinfecha';
  return ev.citationDate <= D.endWeek(D.today()) ? 'semana' : 'proximas';
}
const allObs = ev => [...(ev.observations || []), ...(ev.assistantObservations || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));

/* ---------- Distribución de salas: un estudiante, una sala; un docente, las menos salas posibles ---------- */
function assignRooms(cycle, evals) {
  const rooms = Cfg.rooms(cycle), key = e => e.course + '||' + e.studentName;
  const load = Object.fromEntries(rooms.map(r => [r, 0])), sRoom = {}, seen = new Set();
  evals.forEach(e => { if (e.room && e.room in load) { sRoom[key(e)] = e.room; if (!seen.has(key(e))) { seen.add(key(e)); load[e.room]++; } } });
  const stu = new Map();
  evals.filter(e => !sRoom[key(e)]).forEach(e => {
    const k = key(e); if (!stu.has(k)) stu.set(k, { k, course: e.course, name: e.studentName, teachers: new Set(), n: 0 });
    const s = stu.get(k); s.teachers.add(e.teacher || 'SIN DOCENTE'); s.n++;
  });
  const list = [...stu.values()];
  const base = Math.ceil(new Set(evals.map(key)).size / rooms.length) || 1, cap = base + Math.max(2, Math.round(base * .3));
  const tsize = {}; list.forEach(s => s.teachers.forEach(t => tsize[t] = (tsize[t] || 0) + 1));
  list.forEach(s => s.owner = [...s.teachers].sort((a, b) => tsize[b] - tsize[a] || a.localeCompare(b, 'es'))[0]);
  const groups = {}; list.forEach(s => (groups[s.owner] = groups[s.owner] || []).push(s));
  const least = () => rooms.reduce((b, r) => load[r] < load[b] ? r : b, rooms[0]);
  const fit = n => { let best = null, left = 1e9; rooms.forEach(r => { const f = cap - load[r]; if (f >= n && f - n < left) { left = f - n; best = r; } }); return best; };
  Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length || a.localeCompare(b, 'es')).forEach(t => {
    const g = groups[t].sort((a, b) => a.course.localeCompare(b.course, 'es', { numeric: true }) || b.n - a.n || a.name.localeCompare(b.name, 'es'));
    const one = fit(g.length);
    if (one) { g.forEach(s => { sRoom[s.k] = one; load[one]++; }); return; }
    let i = 0;
    while (i < g.length) { const r = least(), sp = Math.max(1, cap - load[r]); g.slice(i, i + sp).forEach(s => { sRoom[s.k] = r; load[r]++; }); i += sp; }
  });
  const changed = [];
  evals.forEach(e => { const r = sRoom[key(e)]; if (r && e.room !== r) { e.room = r; changed.push(e); } });
  return changed;
}

/** Asigna y guarda la sala de las evaluaciones que aún no la tienen (para cartas y nóminas). */
async function ensureRooms(evs) {
  const combos = new Set(evs.filter(e => e.citationDate && e.status === ST.PEND).map(e => cycleOf(e.course) + '|' + e.citationDate));
  const ops = [];
  combos.forEach(c => {
    const [cy, date] = c.split('|');
    const day = DB.evaluations.filter(e => e.status === ST.PEND && e.citationDate === date && cycleOf(e.course) === cy && !isWithdrawn(e));
    assignRooms(cy, day).forEach(e => ops.push({ c: 'evaluations', op: 'update', id: e.id, data: { room: e.room } }));
  });
  if (ops.length) await DB.write(ops);
}

const groupByCycleCourse = evals => {
  const g = {};
  evals.forEach(e => { const cy = cycleOf(e.course); ((g[cy] = g[cy] || {})[e.course] = g[cy][e.course] || []).push(e); });
  return CYCLES.filter(c => g[c.name]).map(c => ({ cycle: c.name, courses: c.courses.filter(x => g[c.name][x]).map(x => ({ course: x, list: g[c.name][x] })) }));
};

/* Correo institucional del estudiante: RUT sin puntos y con gui�n + @andaliensur.cl (editable) */
const MAIL_DOMAIN = '@andaliensur.cl';
const autoEmail = rut => { const m = normRut(rut).match(/^(\d{7,9})-?([\dK])$/); return m ? m[1] + '-' + m[2].toLowerCase() + MAIL_DOMAIN : ''; };
/* Funcionarios: solo se escribe lo anterior a la @ */
const staffLocal = e => String(e || '').split('@')[0].trim().toLowerCase();
const studentEmail = st => (st && ((st.email || '').trim() || autoEmail(st.rut))) || '';


/* Género del funcionario (para el saludo "Estimado/Estimada"): el guardado o el deducido del primer nombre */
const FEM_STAFF = new Set(['carmen', 'beatriz', 'isabel', 'raquel', 'pilar', 'mercedes', 'soledad', 'rocío', 'rocio', 'ester', 'ruth', 'miriam', 'abigail', 'jazmín', 'jazmin', 'marisol', 'irene', 'karen', 'nicole', 'ingrid', 'inés', 'ines', 'noemí', 'noemi', 'lidia', 'doris', 'edith', 'elizabeth', 'jacqueline', 'jocelyn', 'katherine', 'liliana', 'maribel', 'yenny', 'yasna', 'sandra']);
const staffGender = u => {
  if (u && (u.gender === 'M' || u.gender === 'F')) return u.gender;
  const f = String((u && u.name) || '').trim().split(/\s+/)[0].toLowerCase();
  if (FEM_STAFF.has(f)) return 'F';
  if (['luca', 'joshua', 'bautista', 'juan', 'borja'].includes(f)) return 'M';
  return /a$/.test(f) ? 'F' : 'M';
};
const staffGreeting = u => `${staffGender(u) === 'F' ? 'Estimada' : 'Estimado'} ${titleCase(u && u.name)}`;

/* Compara nombres sin tildes, mayúsculas ni espacios de más */
const normP = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();

ST.EXCL = 'No considerada';
const EXCLUDE_REASONS = ['Reposo médico prolongado', 'Evaluación anulada por el docente', 'Error de registro', 'Registro duplicado', 'Estudiante con adecuación curricular / PIE', 'Estudiante retirado o trasladado', 'Otro motivo'];

/** Reglas de la clave (igual que en el servidor): 6+ caracteres, una letra y un número, sin secuencias. Devuelve el error o ''. */
function passError(pw) {
  pw = String(pw || '');
  if (pw.length < 6) return 'La contraseña debe tener al menos 6 caracteres.';
  if (!/[A-Za-z\u00C0-\u017F]/.test(pw) || !/\d/.test(pw)) return 'La contraseña debe tener al menos una letra y un número (no puede ser solo números como 123456).';
  if (/(.)\1{3,}/.test(pw)) return 'No repita el mismo carácter 4 veces seguidas.';
  const l = pw.toLowerCase();
  for (let i = 0; i + 3 < l.length; i++) {
    const a = l.charCodeAt(i), b = l.charCodeAt(i + 1), c = l.charCodeAt(i + 2), e = l.charCodeAt(i + 3);
    if ((b - a === 1 && c - b === 1 && e - c === 1) || (a - b === 1 && b - c === 1 && c - e === 1)) return 'No use secuencias como 1234 o abcd.';
  }
  return '';
}
