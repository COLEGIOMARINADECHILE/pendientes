/* ===== Vista "Registrar evaluación": un único formulario para uno o varios estudiantes ===== */
const Register = {
  names: [],

  mount(el) {
    this.names = [];
    const doc = Auth.role === 'docente';
    el.innerHTML = `
      <div class="hero"><div class="hero-ic"><i class="fa-solid fa-file-circle-plus"></i></div><div><h1>${doc ? 'Ingresa tus evaluaciones pendientes' : 'Registrar evaluación pendiente'}</h1><p>Un solo formulario para uno o varios estudiantes. El sistema asigna el día oficial, avisa de cualquier situación especial y <b>envía el aviso por correo</b> al estudiante.</p></div></div>
      ${doc ? `<div class="notice" style="margin-bottom:16px"><i class="fa-solid fa-circle-info"></i> Solo verá los ciclos, cursos y asignaturas que tiene asignados; usted queda como docente responsable.</div>` : ''}
      <form id="rg" class="stack">
        <div class="card stepcard"><div class="step"><span class="n" style="--c:var(--brand)">1</span><div><h2>Curso y evaluación</h2><small>¿Qué prueba y de qué curso?</small></div></div>
          <div class="fgrid" style="margin-top:14px">
            <div class="field"><label>Ciclo</label><select id="rg-cycle" required></select></div>
            <div class="field"><label>Curso</label><select id="rg-course" required><option value="">Primero elija el ciclo</option></select></div>
            <div class="field"><label>Asignatura</label><select id="rg-subject" required></select></div>
            <div class="field"><label>Docente</label><select id="rg-teacher" required></select></div>
            <div class="field"><label>Tipo de instrumento</label><select id="rg-inst" required>${opts(INSTRUMENTS, '', 'Seleccione…')}</select></div>
            <div class="field"><label>Fecha de la inasistencia</label><input type="date" id="rg-abs" required></div>
            <div class="field full"><label>Contenido de la evaluación</label><textarea id="rg-content" required placeholder="Describa el contenido o tema evaluado…"></textarea></div>
          </div></div>

        <div class="card stepcard"><div class="step"><span class="n" style="--c:var(--coral)">2</span><div><h2>Estudiantes</h2><small>Agregue uno, varios o todo el curso.</small></div></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin:14px 0">
            <select id="rg-pick" style="flex:1;min-width:240px"><option value="">Elija primero el curso</option></select>
            <button type="button" class="btn" id="rg-add-all"><i class="fa-solid fa-users-line"></i> Todo el curso</button>
            <button type="button" class="btn ghost" id="rg-clear">Vaciar</button>
          </div>
          <ul class="list" id="rg-list"></ul><small id="rg-count"></small></div>

        <div class="card stepcard"><div class="step"><span class="n" style="--c:var(--leaf)">3</span><div><h2>Citación</h2><small>Fecha, hora y sala de rendición.</small></div></div>
          <div class="fgrid" style="margin-top:14px">
            <div class="field"><label>Fecha de la 2ª citación</label><input type="date" id="rg-date"><small id="rg-hint"></small></div>
            <div class="field"><label>Horario</label><select id="rg-time"></select></div>
            <div class="field" id="rg-time2-box" hidden><label>Hora específica</label><input type="time" id="rg-time2"></div>
            <div class="field"><label>Sala de rendición</label><select id="rg-room"></select></div>
            <div class="field full" style="display:flex;gap:22px;flex-wrap:wrap">
              <label class="check"><input type="checkbox" id="rg-pending"> Dejar la fecha pendiente por ahora</label>
              <label class="check"><input type="checkbox" id="rg-special"> Fecha distinta al día oficial de UTP</label>
              <label class="check"><input type="checkbox" id="rg-returned"> El instrumento ya fue devuelto al docente</label>
              <label class="check"><input type="checkbox" id="rg-mail" checked> Avisar por correo al estudiante</label>
            </div>
            <div class="field full" id="rg-special-box" hidden>
              <div class="notice warn">Al fijar una fecha fuera del calendario oficial, <b>el docente debe informar a UTP</b> el lugar y horario, fijarlo fuera de las horas de clases (salvo autorización de UTP) y supervisar personalmente la aplicación.</div>
              <div class="fgrid" style="margin-top:10px"><div class="field"><label>Lugar de aplicación</label><input id="rg-place" placeholder="Ej. Biblioteca"></div>
              <div class="field"><label>Horario (fuera de clases)</label><input type="time" id="rg-stime"></div></div></div>
            <div class="field full" id="rg-blocked"></div>
            <div class="field full"><label>Observaciones (opcional)</label><textarea id="rg-obs" style="min-height:54px"></textarea></div>
          </div></div>
        <div style="display:flex;justify-content:flex-end"><button class="btn primary" id="rg-save" style="padding:13px 26px;font-size:1rem"><i class="fa-solid fa-floppy-disk"></i> Guardar evaluación</button></div>
      </form>`;

    const cycles = doc ? CYCLES.filter(c => c.courses.some(x => this.myCourses().includes(x))) : CYCLES;
    $('#rg-cycle').innerHTML = opts(cycles.map(c => c.name), cycles.length === 1 ? cycles[0].name : '', 'Seleccione…');
    $('#rg-cycle').onchange = () => this.onCycle();
    $('#rg-course').onchange = () => this.onCourse();
    $('#rg-subject').onchange = () => this.fillTeachers();
    $('#rg-pick').onchange = e => { if (e.target.value) { this.add(e.target.value); e.target.value = ''; } };
    $('#rg-add-all').onclick = () => this.courseStudents().forEach(s => this.add(s.name));
    $('#rg-clear').onclick = () => { this.names = []; this.renderList(); };
    $('#rg-time').onchange = () => $('#rg-time2-box').hidden = $('#rg-time').value !== 'otro';
    $('#rg-special').onchange = e => { $('#rg-special-box').hidden = !e.target.checked; if (!e.target.checked) this.suggestDate(); this.hint(); };
    $('#rg-pending').onchange = e => { $('#rg-date').disabled = e.target.checked; if (!e.target.checked) this.suggestDate(); };
    $('#rg-date').onchange = () => this.snapDate();
    $('#rg').onsubmit = e => { e.preventDefault(); UI.busy($('#rg-save'), () => this.submit()); };
    this.renderList(); this.onCycle();
  },

  myCourses: () => [...new Set((Auth.user.assignments || []).map(a => a.course))],
  courseStudents() { const c = $('#rg-course').value; return DB.students.filter(s => s.course === c && !s.withdrawn).sort((a, b) => a.name.localeCompare(b.name, 'es')); },

  onCycle() {
    const cy = $('#rg-cycle').value, c = CYCLES.find(x => x.name === cy);
    let courses = c ? c.courses : [];
    if (Auth.role === 'docente') courses = courses.filter(x => this.myCourses().includes(x));
    $('#rg-course').innerHTML = opts(courses, courses.length === 1 ? courses[0] : '', cy ? 'Seleccione…' : 'Primero elija el ciclo');
    this.onCourse();
  },
  onCourse() {
    const course = $('#rg-course').value;
    this.names = []; this.renderList();
    const subs = Auth.role === 'docente' ? [...new Set((Auth.user.assignments || []).filter(a => a.course === course).map(a => a.subject))].sort() : Cfg.subjects;
    $('#rg-subject').innerHTML = opts(subs, subs.length === 1 && course ? subs[0] : '', course ? 'Seleccione…' : '');
    this.fillTeachers();
    $('#rg-room').innerHTML = opts([['', 'Automática (equitativa)'], ...(course ? Cfg.rooms(cycleOf(course)).map(r => [r, r]) : [])], '');
    $('#rg-time').innerHTML = opts(course ? [[Cfg.schedule(course).timeFor(D.today()), `Horario oficial (${Cfg.schedule(course).label})`], ['Por acordar con docente', 'Por acordar con docente'], ['otro', 'Otra hora…']] : [], '');
    this.suggestDate(); this.hint();
  },
  fillTeachers() {
    const course = $('#rg-course').value, subject = $('#rg-subject').value, sel = $('#rg-teacher');
    if (Auth.role === 'docente') { sel.innerHTML = `<option value="${esc(Auth.user.name)}">${esc(titleCase(Auth.user.name))}</option>`; return; }
    const docs = DB.users.filter(u => u.role === 'docente').sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const match = docs.filter(u => (u.assignments || []).some(a => a.course === course && a.subject === subject));
    sel.innerHTML = opts((match.length ? match : docs).map(u => [u.name, titleCase(u.name)]), match.length === 1 ? match[0].name : '', 'Seleccione…');
  },
  isSpecial: () => $('#rg-special').checked,

  hint() {
    const course = $('#rg-course').value, h = $('#rg-hint'), bl = $('#rg-blocked');
    if (!course) { h.textContent = 'Elija un curso para aplicar el día oficial.'; bl.innerHTML = ''; return; }
    const s = Cfg.schedule(course), r = Cfg.rule;
    h.innerHTML = this.isSpecial() ? '<span style="color:var(--warn)">Modo excepcional: puede elegir cualquier día no bloqueado.</span>'
      : `Día oficial de ${esc(s.cycle)}: <b>${esc(s.label)}</b>. Se ajusta al día disponible más cercano.${r.enabled ? ` Plazo: ${r.days} día(s) hábil(es) antes, hasta las ${r.cutoff}.` : ''}`;
    const up = Cfg.blocked.filter(b => (b.end || b.start) >= D.today() && (!b.cycle || b.cycle === s.cycle)).sort((a, b) => a.start.localeCompare(b.start));
    bl.innerHTML = up.length ? `<div class="notice bad"><b><i class="fa-solid fa-calendar-xmark"></i> Días bloqueados:</b> ${up.map(b => `${D.fmt(b.start)}${b.end && b.end !== b.start ? '–' + D.fmt(b.end) : ''} (${esc(b.reason || 'bloqueado')})`).join(' · ')}</div>` : '';
  },
  suggestDate() {
    const course = $('#rg-course').value, inp = $('#rg-date');
    if (!course || $('#rg-pending').checked || this.isSpecial()) return;
    let d = nextOfficialFrom(course, D.add(D.today(), 1));
    for (let i = 0; i < 20 && expired(d); i++) d = nextOfficialAfter(course, d);
    inp.value = d;
  },
  snapDate() {
    const course = $('#rg-course').value, inp = $('#rg-date');
    if (!course || !inp.value) return;
    const b = blockedInfo(inp.value, course);
    if (this.isSpecial()) { if (b) { UI.toast(`Día bloqueado: ${b.reason}.`, 'error'); inp.value = ''; } return; }
    let d = nextOfficialFrom(course, inp.value);
    for (let i = 0; i < 20 && expired(d); i++) d = nextOfficialAfter(course, d);
    if (d !== inp.value) { UI.toast(`El ${D.long(inp.value)} no está disponible; se ajustó al ${D.long(d)}.`, 'info'); inp.value = d; }
  },

  /* ---------- lista de estudiantes ---------- */
  add(name) {
    const course = $('#rg-course').value; if (!course || this.names.includes(name)) return;
    const st = studentOf(name, course);
    if (st && st.status === ST.PLAN && !Auth.isAdmin()) return UI.toast(`${fmtName(name)} tiene Plan de Evaluación: solo Coordinación o UTP puede agendarle evaluaciones.`, 'error', 6000);
    this.names.push(name); this.renderList();
  },
  badges(st) {
    const out = [], lic = licenseOf(st), sus = suspensionOf(st);
    if (st.status === ST.PLAN) out.push('<span class="pill vio">Plan de Evaluación</span>');
    if (lic && lic.vigente) out.push(`<span class="pill ${lic.long ? 'vio' : 'sky'}">Reposo ${lic.days} días</span>`);
    if (sus && sus.vigente) out.push('<span class="pill warn">Suspendido</span>');
    if (st.status === 'PIE') out.push('<span class="pill brand">PIE</span>');
    return out.join(' ');
  },
  renderList() {
    const course = $('#rg-course').value, list = $('#rg-list');
    list.innerHTML = this.names.length ? this.names.map((n, i) => { const st = studentOf(n, course); return `<li><span><b>${i + 1}.</b> ${esc(fmtName(n))} ${st ? this.badges(st) : ''}</span><button type="button" class="icon-btn" onclick="Register.names.splice(${i},1);Register.renderList()"><i class="fa-solid fa-xmark"></i></button></li>`; }).join('')
      : '<li class="muted" style="justify-content:center">Aún no hay estudiantes en la lista.</li>';
    $('#rg-count').textContent = `${this.names.length} estudiante(s) en la lista.`;
    $('#rg-pick').innerHTML = opts(this.courseStudents().filter(s => !this.names.includes(s.name)).map(s => [s.name, fmtName(s.name)]), '', course ? 'Seleccione un estudiante…' : 'Elija primero el curso');
  },

  /* ---------- guardado ---------- */
  read() {
    let time = $('#rg-time').value; if (time === 'otro') time = $('#rg-time2').value;
    const special = this.isSpecial();
    return {
      course: $('#rg-course').value, subject: $('#rg-subject').value, teacher: $('#rg-teacher').value, instrumentType: $('#rg-inst').value,
      absenceDate: $('#rg-abs').value, content: $('#rg-content').value.trim(), date: $('#rg-pending').checked ? null : $('#rg-date').value,
      time, official: !special && Cfg.schedule($('#rg-course').value).isOfficialTime(time), room: $('#rg-room').value || null, special,
      place: $('#rg-place').value.trim(), stime: $('#rg-stime').value, returned: $('#rg-returned').checked, obs: $('#rg-obs').value.trim()
    };
  },

  /** Calcula, por estudiante, qué fecha y estado corresponde. */
  plan(f) {
    return this.names.map(name => {
      const st = studentOf(name, f.course), r = { name, course: f.course, date: f.date, time: f.time, notes: [], attention: false, kind: 'ok' };
      const lic = licenseOf(st), sus = suspensionOf(st);
      const covers = lic && lic.long && f.absenceDate >= lic.start && f.absenceDate <= lic.end;
      if (st && st.status === ST.PLAN) { r.plan = true; r.notes.push('Plan de Evaluación: queda agendada por UTP y sí se considera en el proceso.'); r.attention = true; }
      if (covers || (lic && lic.long && lic.vigente)) {
        Object.assign(r, { kind: 'closed', date: null, attention: true });
        r.notes.push(`Reposo de ${lic.days} días: la evaluación se guarda CERRADA por salud (no se cita ni lleva nota mínima).`);
      } else if (lic && lic.vigente) {
        Object.assign(r, { kind: 'resched', date: null, attention: true });
        r.notes.push(`Reposo de ${lic.days} día(s) hasta el ${D.fmt(lic.end)}: queda pendiente y sin fecha; podrá rendir desde el ${D.fmt(minAfterLicense(lic.end))}.`);
      } else if (r.date) {
        if (sus && sus.vigente && (r.date <= sus.end)) {
          r.date = afterSuspension(sus, f.course); r.exempt = 1; r.attention = true;
          r.notes.push(`Suspendido(a) hasta el ${D.fmt(sus.end)}: se agenda el ${D.long(r.date)} como 1ª citación (no consume oportunidad).`);
        } else {
          if (!f.special) { const a = applyAnticipation(r.date, f.course); if (a.moved) { r.notes.push(`Plazo de anticipación vencido: se traslada al ${D.long(a.date)}.`); r.date = a.date; r.attention = true; } }
          const av = availability(name, f.course, r.date, { anticipation: !f.special });
          if (!av.ok) { r.notes.push(av.message + ' Se propone otra fecha.'); r.date = findNextAvailable(name, f.course, D.add(r.date, 1), { anticipation: !f.special }); r.attention = true; }
        }
      }
      if (r.date && f.official) r.time = Cfg.schedule(f.course).timeFor(r.date);
      return r;
    });
  },

  review(recs, f) {
    return new Promise(res => {
      const d = UI.modal({
        title: 'Revise antes de guardar', wide: true,
        body: `<div class="notice warn" style="margin-bottom:14px">Hay estudiantes en una situación especial o con tope de evaluaciones. Puede ajustar la fecha de cada uno.</div>
          <div class="table-wrap" style="max-height:52vh"><table class="tbl"><thead><tr><th>Estudiante</th><th>Situación</th><th>Fecha asignada</th></tr></thead><tbody>
          ${recs.map((r, i) => `<tr><td><b>${esc(fmtName(r.name))}</b></td><td>${r.notes.length ? r.notes.map(n => `<div style="font-size:.82rem;margin-bottom:3px">${esc(n)}</div>`).join('') : '<span class="pill ok">Sin novedades</span>'}</td>
            <td>${r.kind === 'ok' ? `<input type="date" data-i="${i}" value="${r.date || ''}" style="width:160px"><div class="hint" id="rv-${i}">${r.date ? D.weekday(r.date) : ''}</div>` : '<span class="muted">Sin fecha</span>'}</td></tr>`).join('')}
          </tbody></table></div>`,
        footer: '<button class="btn" data-no>Volver</button><button class="btn primary" data-ok><i class="fa-solid fa-check"></i> Confirmar y guardar</button>'
      });
      let ok = false;
      $$('input[data-i]', d).forEach(inp => inp.onchange = () => {
        const r = recs[+inp.dataset.i], av = availability(r.name, r.course, inp.value, { anticipation: !f.special });
        const hint = $('#rv-' + inp.dataset.i, d);
        if (!av.ok) { hint.innerHTML = `<span style="color:var(--bad)">${esc(av.message)}</span>`; r.bad = true; } else { hint.textContent = D.weekday(inp.value); r.bad = false; r.date = inp.value; if (f.official) r.time = Cfg.schedule(r.course).timeFor(r.date); }
      });
      $('[data-ok]', d).onclick = () => { if (recs.some(r => r.bad)) return UI.toast('Corrija las fechas marcadas en rojo.', 'error'); ok = true; d.close(); };
      $('[data-no]', d).onclick = () => d.close();
      d.addEventListener('close', () => res(ok));
    });
  },

  async submit() {
    const f = this.read();
    if (!f.course || !f.subject || !f.teacher || !f.instrumentType || !f.absenceDate || !f.content) throw new Error('Complete todos los campos obligatorios.');
    if (!this.names.length) throw new Error('Agregue al menos un estudiante a la lista.');
    if (f.special && !f.date && !$('#rg-pending').checked) throw new Error('Indique la fecha de aplicación.');
    if (f.special && f.date && (!f.place || !f.stime)) throw new Error('Para una fecha fuera del calendario oficial indique lugar y horario.');
    if (f.special && f.stime) f.time = f.stime;
    const bl = f.date && f.special ? blockedInfo(f.date, f.course) : null;
    if (bl) throw new Error(`Ese día está bloqueado: ${bl.reason}.`);
    const out = this.names.filter(n => { const s = studentOf(n, f.course); return !s || s.withdrawn; });
    if (out.length) throw new Error(`${out.map(fmtName).join(', ')}: figura(n) como retirado(s) del establecimiento.`);

    const recs = this.plan(f);
    if (recs.some(r => r.attention) && !await this.review(recs, f)) return;

    const now = new Date().toISOString(), ops = [];
    recs.forEach(r => {
      const st = studentOf(r.name, f.course), lic = licenseOf(st), obs = [];
      if (f.special && f.date) obs.push({ date: now, by: Act.who(), text: `Rendición fuera del calendario oficial de UTP: ${D.long(r.date)} a las ${f.stime} hrs., en ${f.place}. El/la docente informa a UTP, fija el horario fuera de clases y supervisa la aplicación.` });
      if (f.obs) obs.push({ date: now, by: Act.who(), text: f.obs });
      r.notes.forEach(n => obs.push({ date: now, by: Act.who(), text: n }));
      ops.push({ c: 'evaluations', op: 'set', id: newId(), data: {
        studentName: r.name, course: f.course, subject: f.subject, teacher: f.teacher, instrumentType: f.instrumentType, content: f.content,
        absenceDate: f.absenceDate, citationDate: r.date || null, citationTime: r.time || null, room: r.date ? f.room : null,
        status: r.kind === 'closed' ? ST.LIC : ST.PEND, closedByLicense: r.kind === 'closed', needsUtpReschedule: r.kind === 'resched',
        includeInCitation: r.kind !== 'closed', suspensionExemptCount: r.exempt || 0, planScheduledByUtp: !!r.plan,
        licenseStart: lic && r.kind !== 'ok' ? lic.start : null, licenseEnd: lic && r.kind !== 'ok' ? lic.end : null, licenseDays: lic && r.kind !== 'ok' ? lic.days : null,
        history: [], observations: obs, contacted: false, returnedToTeacher: f.returned, returnDate: f.returned ? D.today() : null,
        outOfSchedule: f.special, specialPlace: f.place || null, specialTime: f.stime || null, createdAt: now, addedBy: Act.who()
      } });
    });
    await DB.write(ops);

    let mailNote = '';
    if ($('#rg-mail').checked) {
      const ids = ops.filter(o => o.data.status === ST.PEND).map(o => o.id);
      try {
        await DB.flush();
        const m = await API.call('notify', { evalIds: ids });
        mailNote = m.demo ? 'Modo demo: no se envían correos.' : `Correo enviado a ${m.sent} estudiante(s)${m.noMail ? `; ${m.noMail} sin correo registrado` : ''}.`;
      } catch (e) { mailNote = 'Las evaluaciones se guardaron, pero no se pudo enviar el correo: ' + e.message; }
    }

    UI.modal({ title: '<i class="fa-solid fa-circle-check" style="color:var(--ok)"></i> Evaluación guardada', body: `
      <p style="margin-top:0">Se registraron <b>${recs.length}</b> evaluación(es) de <b>${esc(f.subject)}</b> en <b>${esc(f.course)}</b>.</p>
      <ul class="list">${recs.map(r => `<li><span>${esc(fmtName(r.name))}</span><span class="pill ${r.kind === 'closed' ? 'vio' : r.date ? 'ok' : 'sky'}">${r.kind === 'closed' ? 'Cerrada por salud' : r.date ? D.long(r.date) : 'Sin fecha (UTP reagenda)'}</span></li>`).join('')}</ul>${mailNote ? `<div class="notice" style="margin-top:12px"><i class="fa-regular fa-envelope"></i> ${esc(mailNote)}</div>` : ''}`,
      footer: '<button class="btn primary" onclick="this.closest(\'dialog\').close()">Entendido</button>' });
    this.mount($('#view'));
  }
};


