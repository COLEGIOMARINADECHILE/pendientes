/* ===== Bitácora: registro de todo lo que se hace en la plataforma ===== */
const AUDIT_ACTIONS = ['Registro de evaluación', 'Rendida', 'Inasistencia', 'Cambio de fecha u hora', 'Sala', 'Devolución al docente', 'No considerada', 'Cierre con nota mínima', 'Reposo médico', 'Suspensión', 'Plan de evaluación', 'Estudiante (datos)', 'Retiro / reintegro', 'Observación', 'Contacto con familia', 'Eliminación', 'Correo enviado', 'Usuarios', 'Configuración', 'Imágenes', 'Traspaso de datos', 'Ingreso al sistema', 'Otros cambios'];

/* Traduce cada cambio de datos a una línea legible de la bitácora (el servidor agrega quién y cuándo). */
const Audit = {
  fromOps(ops) { const out = []; ops.forEach(o => { try { const e = this.one(o); if (e) out.push(e); } catch (err) { /* nunca debe impedir guardar */ } }); return out; },

  one(o) {
    if (o.c === 'settings') {
      const names = { maxEvalsPerDay: 'máximo de evaluaciones por día', rule: 'regla de anticipación', cycleSchedules: 'días y horarios de rendición', roomsByCycle: 'salas', coordinators: 'coordinación', blockedDays: 'días bloqueados', customSubjects: 'asignaturas' };
      const k = Object.keys(o.data || {}).map(x => names[x] || x).join(', ');
      return { action: 'Configuración', text: `Modificó la configuración: ${k}` };
    }
    if (o.c === 'students') return this.student(o);
    if (o.c === 'evaluations') return this.evaluation(o);
    return null;
  },

  student(o) {
    const st = DB.get('students', o.id) || {}, p = o.data || {}, base = { student: st.name || p.name, course: st.course || p.course };
    if (o.op === 'set') return { ...base, action: 'Estudiante (datos)', text: `Agregó al estudiante ${fmtName(p.name)} (${p.course})` };
    if (o.op === 'delete') return { ...base, action: 'Eliminación', text: 'Eliminó al estudiante de la nómina' };
    if ('onLicense' in p || 'licenseStart' in p) return { ...base, action: 'Reposo médico', text: p.onLicense ? `Registró reposo del ${D.fmt(p.licenseStart)} al ${D.fmt(p.licenseEnd)}` : 'Quitó el reposo médico' };
    if ('suspended' in p) return { ...base, action: 'Suspensión', text: p.suspended ? `Registró suspensión del ${D.fmt(p.suspensionStart)} al ${D.fmt(p.suspensionEnd)}` : 'Quitó la suspensión' };
    if ('withdrawn' in p) return { ...base, action: 'Retiro / reintegro', text: p.withdrawn ? `Retiró del establecimiento (${p.withdrawnReason || 'sin motivo'})` : 'Reintegró al establecimiento' };
    if ('status' in p) return { ...base, action: 'Plan de evaluación', text: `Cambió el estado del estudiante a «${p.status}»` };
    if (p.course && st.course && p.course !== st.course) return { ...base, action: 'Estudiante (datos)', text: `Cambió de curso: ${st.course} → ${p.course}` };
    return { ...base, action: 'Estudiante (datos)', text: `Editó datos del estudiante (${Object.keys(p).filter(k => !/History$/.test(k)).join(', ')})` };
  },

  evaluation(o) {
    const ev = DB.get('evaluations', o.id) || {}, p = o.data || {}, subj = ev.subject || p.subject || '';
    const base = { student: ev.studentName || p.studentName, course: ev.course || p.course, teacher: ev.teacher || p.teacher };
    const newObs = () => (p.observations && p.observations.length > (ev.observations || []).length) ? (p.observations[p.observations.length - 1].text || '') : '';
    if (o.op === 'set') return { ...base, action: 'Registro de evaluación', text: `Registró evaluación de ${subj}${p.citationDate ? ' citada para el ' + D.fmt(p.citationDate) : ' sin fecha'} (${p.status || 'Pendiente'})` };
    if (o.op === 'delete') return { ...base, action: 'Eliminación', text: `Eliminó la evaluación de ${subj}` };
    const keys = Object.keys(p);
    if (p.status === ST.DONE) return { ...base, action: 'Rendida', text: `Marcó como rendida la evaluación de ${subj}` };
    if (p.status === ST.EXCL) return { ...base, action: 'No considerada', text: `No se considera la evaluación de ${subj}. Motivo: ${p.excludedReason || ''}${p.excludedNote ? ' (' + p.excludedNote + ')' : ''}` };
    if (p.status === ST.FAIL) return { ...base, action: 'Cierre con nota mínima', text: `Cerró con nota 1.0 la evaluación de ${subj}` };
    if (p.status === ST.LIC) return { ...base, action: 'Reposo médico', text: `Evaluación de ${subj} cerrada por reposo médico de 15 días o más` };
    if (p.status === ST.PLAN) return { ...base, action: 'Plan de evaluación', text: `Evaluación de ${subj} queda sin considerarse por Plan de Evaluación` };
    if (p.status === ST.PEND && ev.status && ev.status !== ST.PEND) return { ...base, action: 'Otros cambios', text: `La evaluación de ${subj} vuelve a pendiente (antes: ${ev.status})` };
    if (p.history && p.history.length > (ev.history || []).length) return { ...base, action: 'Inasistencia', text: newObs() || `No asistió a la citación de ${subj}` };
    if ('suspensionExemptCount' in p) return { ...base, action: 'Suspensión', text: newObs() || `Citación de ${subj} reprogramada por suspensión` };
    if ('needsUtpReschedule' in p && 'licenseStart' in p) return { ...base, action: 'Reposo médico', text: newObs() || `Evaluación de ${subj} queda sin fecha por reposo médico` };
    if ('citationDate' in p || 'citationTime' in p) return { ...base, action: 'Cambio de fecha u hora', text: `Citación de ${subj}: ${D.fmt(ev.citationDate)} ${ev.citationTime || ''} → ${D.fmt('citationDate' in p ? p.citationDate : ev.citationDate)} ${('citationTime' in p ? p.citationTime : ev.citationTime) || ''}`.replace(/\s+/g, ' ') };
    if ('returnedToTeacher' in p) return { ...base, action: 'Devolución al docente', text: p.returnedToTeacher ? `Marcó como devuelta al docente la prueba de ${subj}` : `Quitó la devolución al docente de la prueba de ${subj}` };
    if (keys.every(k => k === 'room')) return (ev.room && ev.room !== p.room) ? { ...base, action: 'Sala', text: `Cambió la sala de ${subj}: ${ev.room} → ${p.room || 'sin sala'}` } : null;   // la asignación automática no se registra
    if (keys.every(k => k === 'contacted')) return { ...base, action: 'Contacto con familia', text: p.contacted ? `Marcó familia contactada (${subj})` : `Quitó la marca de familia contactada (${subj})` };
    if (keys.every(k => ['teacherNotifiedAt', 'notifiedAt'].includes(k))) return null;
    if (newObs()) return { ...base, action: 'Observación', text: newObs() };
    return { ...base, action: 'Otros cambios', text: `Editó la evaluación de ${subj} (${keys.join(', ')})` };
  }
};

const Bitacora = {
  f: { q: '', action: '', from: '', to: '' }, rows: [], more: false, busy: false, timer: null,

  mount(el) {
    el.innerHTML = `
      <div class="page-head"><div><h1>Bitácora</h1><p>Todo lo que se ha hecho en la plataforma: quién, cuándo y qué. Siempre de lo más reciente a lo más antiguo.</p></div>
        <div class="actions"><button class="btn" onclick="Bitacora.reload()"><i class="fa-solid fa-rotate"></i> Actualizar</button><button class="btn" onclick="Bitacora.csv()"><i class="fa-solid fa-file-csv"></i> Descargar CSV</button></div></div>
      <div class="card toolbar">
        <div class="field" style="grid-column:span 2"><label>Buscar por nombre o texto</label><input id="bt-q" value="${esc(this.f.q)}" placeholder="Persona que lo hizo, estudiante, docente, curso o detalle…"></div>
        <div class="field"><label>Acción</label><select id="bt-act">${opts(AUDIT_ACTIONS, this.f.action, 'Todas las acciones')}</select></div>
        <div class="field"><label>Desde</label><input type="date" id="bt-from" value="${this.f.from}"></div>
        <div class="field"><label>Hasta</label><input type="date" id="bt-to" value="${this.f.to}"></div>
        <button class="btn ghost" onclick="Bitacora.clear()" style="align-self:end">Limpiar filtros</button>
      </div>
      <div class="chips" id="bt-quick" style="margin-bottom:12px">${[['Hoy', D.today(), D.today()], ['Ayer', D.add(D.today(), -1), D.add(D.today(), -1)], ['Últimos 7 días', D.add(D.today(), -6), D.today()], ['Este mes', D.today().slice(0, 8) + '01', D.today()]].map(([l, a, b]) => `<button type="button" class="btn sm" data-a="${a}" data-b="${b}">${l}</button>`).join('')}</div>
      <div class="card table-card"><div class="table-wrap"><table class="tbl fixed log"><colgroup><col style="width:130px"><col style="width:15%"><col style="width:15%"><col><col style="width:20%"></colgroup>
        <thead><tr><th>Fecha y hora</th><th>Realizado por</th><th>Acción</th><th>Detalle</th><th>Estudiante · curso · docente</th></tr></thead><tbody id="bt-body"></tbody></table></div></div>
      <div style="text-align:center;margin:14px"><span class="muted" id="bt-count"></span> <button class="btn" id="bt-more" hidden onclick="Bitacora.next(this)">Cargar más</button></div>`;
    const on = (id, ev, fn) => $(id).addEventListener(ev, fn);
    on('#bt-q', 'input', e => { this.f.q = e.target.value; clearTimeout(this.timer); this.timer = setTimeout(() => this.reload(), 350); });
    on('#bt-act', 'change', e => { this.f.action = e.target.value; this.reload(); });
    on('#bt-from', 'change', e => { this.f.from = e.target.value; this.reload(); });
    on('#bt-to', 'change', e => { this.f.to = e.target.value; this.reload(); });
    $$('#bt-quick button').forEach(b => b.onclick = () => { this.f.from = b.dataset.a; this.f.to = b.dataset.b; $('#bt-from').value = this.f.from; $('#bt-to').value = this.f.to; this.reload(); });
    this.reload();
  },

  clear() { this.f = { q: '', action: '', from: '', to: '' }; this.mount($('#view')); },
  async reload() { this.rows = []; await this.fetch(); },
  next(btn) { return UI.busy(btn, () => this.fetch()); },

  async fetch() {
    if (this.busy) return; this.busy = true;
    try {
      const r = await API.call('logList', { ...this.f, limit: 200, offset: this.rows.length });
      this.rows = this.rows.concat(r.rows || []); this.more = !!r.more; this.draw();
    } catch (e) { $('#bt-body').innerHTML = `<tr><td colspan="5"><div class="empty"><i class="fa-solid fa-triangle-exclamation"></i>${esc(e.message)}</div></td></tr>`; }
    finally { this.busy = false; }
  },

  pill(a) {
    const c = { 'Rendida': 'ok', 'Registro de evaluación': 'brand', 'Inasistencia': 'warn', 'Cambio de fecha u hora': 'sky', 'No considerada': 'vio', 'Eliminación': 'bad', 'Correo enviado': 'brand', 'Ingreso al sistema': 'dark', 'Usuarios': 'dark', 'Reposo médico': 'sky', 'Suspensión': 'warn', 'Devolución al docente': 'ok', 'Cierre con nota mínima': 'bad' }[a] || '';
    return `<span class="pill ${c}">${esc(a)}</span>`;
  },
  when(at) { const m = String(at || '').match(/^(\d{4})-(\d\d)-(\d\d) (\d\d:\d\d)/); return m ? `<b>${m[3]}/${m[2]}/${m[1]}</b><br><small>${m[4]}</small>` : esc(at); },

  draw() {
    $('#bt-body').innerHTML = this.rows.map(e => `<tr>
      <td>${this.when(e.at)}</td>
      <td><b>${esc(titleCase(e.user))}</b><br><small>${esc(ROLE_LABELS[e.role] ? ROLE_LABELS[e.role].split(' (')[0] : e.role || '')}</small></td>
      <td>${this.pill(e.action)}</td>
      <td style="font-size:.84rem">${esc(e.text)}</td>
      <td style="font-size:.8rem">${e.student ? `<b>${esc(fmtName(e.student))}</b>` : ''}${e.course ? ` · ${esc(e.course)}` : ''}${e.teacher ? `<br><span class="muted">Doc.: ${esc(titleCase(e.teacher))}</span>` : ''}</td></tr>`).join('')
      || `<tr><td colspan="5"><div class="empty"><i class="fa-solid fa-clipboard-list"></i>No hay registros con esos filtros.</div></td></tr>`;
    $('#bt-count').textContent = `${this.rows.length} registro(s) mostrados`;
    $('#bt-more').hidden = !this.more;
  },

  csv() {
    if (!this.rows.length) return UI.toast('No hay registros para descargar.', 'error');
    const q = s => `"${String(s || '').replace(/"/g, '""')}"`;
    const lines = [['Fecha y hora', 'Realizado por', 'Perfil', 'Acción', 'Detalle', 'Estudiante', 'Curso', 'Docente'].map(q).join(';')]
      .concat(this.rows.map(e => [e.at, e.user, e.role, e.action, e.text, e.student, e.course, e.teacher].map(q).join(';')));
    UI.download(`bitacora_${D.today()}.csv`, '\ufeff' + lines.join('\n'), 'text/csv;charset=utf-8');
  }
};
