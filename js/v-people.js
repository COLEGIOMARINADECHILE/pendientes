/* ===== Ficha del estudiante, Estudiantes, Historial, Mi panel docente y Salas ===== */

/* ---------- Ficha: todo sobre un estudiante en una sola ventana ---------- */
const Ficha = {
  dlg: null, stId: null,
  open(stId, focusEv) {
    const st = DB.get('students', stId) || (focusEv && studentOf(DB.get('evaluations', focusEv).studentName, DB.get('evaluations', focusEv).course));
    if (!st) return UI.toast('No se encontró al estudiante.', 'error');
    this.stId = st.id;
    this.dlg = UI.modal({ title: '', body: '<div id="fc-body"></div>', wide: true });
    this.render();
  },
  render() {
    const st = DB.get('students', this.stId); if (!st) { this.dlg.close(); return; }
    const lic = licenseOf(st), sus = suspensionOf(st), adm = Auth.isAdmin();
    $('h3', this.dlg).innerHTML = `<i class="fa-solid fa-user-graduate" style="color:var(--brand)"></i> ${esc(fmtName(st.name))} <small>· ${esc(st.course)}${st.rut ? ' · ' + esc(st.rut) : ''}</small>`;
    const evs = Act.pendingOf(st).sort((a, b) => (a.status === ST.PEND ? 0 : 1) - (b.status === ST.PEND ? 0 : 1) || String(b.citationDate || b.absenceDate || '').localeCompare(String(a.citationDate || a.absenceDate || '')));
    const chips = [];
    if (st.status !== 'Activo') chips.push(`<span class="pill vio">${esc(st.status)}</span>`);
    if (lic) chips.push(`<span class="pill ${lic.long ? 'vio' : 'sky'}">Reposo ${D.fmt(lic.start)} al ${D.fmt(lic.end)} (${lic.days} días)${lic.vigente ? '' : ' · finalizado'}</span>`);
    if (sus) chips.push(`<span class="pill warn">Suspensión ${D.fmt(sus.start)} al ${D.fmt(sus.end)}</span>`);
    if (st.withdrawn) chips.push(`<span class="pill dark">Retirado ${D.fmt(st.withdrawnDate)}</span>`);
    const pend = evs.filter(e => e.status === ST.PEND).length;
    $('#fc-body', this.dlg).innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px">${chips.join('') || '<span class="pill ok">Sin situaciones especiales</span>'}<span class="pill brand">${pend} pendiente(s)</span>
        ${adm ? `<span style="margin-left:auto;display:flex;gap:6px"><button class="btn sm" onclick="Students.license('${st.id}')"><i class="fa-solid fa-notes-medical"></i> Reposo</button><button class="btn sm" onclick="Students.suspension('${st.id}')"><i class="fa-solid fa-user-clock"></i> Suspensión</button></span>` : ''}</div>
      ${(st.licenseHistory || []).length ? `<details style="margin-bottom:14px"><summary class="muted" style="cursor:pointer">Historial de reposos (${st.licenseHistory.length})</summary><ul class="list" style="margin-top:8px">${st.licenseHistory.map(l => `<li><span>${D.fmt(l.start)} al ${D.fmt(l.end)} · ${l.days || D.days(l.start, l.end)} días</span><span class="pill ${(l.days || 0) >= LICENSE_LONG ? 'vio' : 'sky'}">${(l.days || 0) >= LICENSE_LONG ? 'No considerado' : 'Regular'}</span></li>`).join('')}</ul></details>` : ''}
      ${evs.length ? evs.map(e => this.card(e, adm)).join('') : '<div class="empty">Este estudiante no registra evaluaciones.</div>'}`;
  },
  card(ev, adm) {
    const b = ev.status === ST.PEND ? bucket(ev) : null;
    const color = ev.status === ST.DONE ? 'var(--ok)' : ev.status === ST.PEND ? (b === 'utp' ? 'var(--utp)' : 'var(--brand)') : ev.status === ST.FAIL ? 'var(--bad)' : 'var(--vio)';
    const obs = allObs(ev).slice(-6);
    return `<div class="evcard" style="border-left-color:${color}">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div>${subjBadge(ev.subject)} <small>${esc(ev.instrumentType || '')}</small><div style="margin:6px 0;font-size:.88rem">${esc(ev.content || '')}</div></div>
        <div style="text-align:right"><span class="pill ${ev.status === ST.DONE ? 'ok' : ev.status === ST.PEND ? (b === 'utp' ? 'utp' : 'brand') : 'vio'}">${ev.status === ST.PEND ? (b === 'utp' ? 'En UTP' : attempt(ev) + 'ª citación') : esc(ev.status)}</span></div></div>
      <div style="font-size:.82rem;color:var(--muted)">Docente: ${esc(titleCase(ev.teacher))} · Inasistencia: ${D.fmt(ev.absenceDate)} · Citación: ${ev.citationDate ? D.long(ev.citationDate) + ' ' + esc(ev.citationTime || '') : 'sin fecha'}${ev.room ? ' · ' + esc(ev.room) : ''}${(ev.history || []).length ? ` · Inasistencias previas: ${ev.history.filter(h => /Inasist/.test(h.status)).map(h => D.fmt(h.date)).join(', ')}` : ''}</div>
      ${obs.map(o => `<div class="obs"><b>${D.fmt(String(o.date).slice(0, 10))}</b> ${o.by ? '· ' + esc(titleCase(o.by)) : ''}: ${esc(o.text)}</div>`).join('')}
      <div class="rowacts" style="margin-top:10px">
        <button class="btn sm" onclick="Ficha.addObs('${ev.id}')"><i class="fa-regular fa-comment-dots"></i> Observación</button>
        ${adm ? `<button class="btn sm" onclick="Ficha.edit('${ev.id}')"><i class="fa-solid fa-pen"></i> Editar</button>
          ${ev.status !== ST.PEND ? `<button class="btn sm" onclick="Ficha.reopen('${ev.id}')"><i class="fa-solid fa-rotate-left"></i> Reabrir</button>` : ''}
          ${ev.status === ST.FAIL ? `<button class="btn sm" onclick="PDF.failLetter(DB.get('evaluations','${ev.id}'))"><i class="fa-solid fa-file-pdf"></i> Carta</button>` : ''}
          <button class="btn sm danger" onclick="Ficha.del('${ev.id}')"><i class="fa-solid fa-trash"></i></button>` : ''}</div></div>`;
  },
  async addObs(id) {
    if (Auth.readOnly()) return UI.toast('Su perfil es solo de consulta.', 'error');
    const v = await UI.form({ title: 'Nueva observación', fields: [{ name: 'text', label: 'Observación', type: 'textarea', required: true, full: true }] });
    if (v) UI.busy(null, async () => { await Act.addObs(DB.get('evaluations', id), v.text.trim()); this.render(); });
  },
  async edit(id) {
    const ev = DB.get('evaluations', id);
    const v = await UI.form({ title: 'Editar evaluación', fields: [
      { name: 'content', label: 'Contenido', type: 'textarea', value: ev.content, full: true },
      { name: 'instrumentType', label: 'Instrumento', type: 'select', value: ev.instrumentType, options: INSTRUMENTS },
      { name: 'absenceDate', label: 'Fecha de inasistencia', type: 'date', value: ev.absenceDate },
      { name: 'citationDate', label: 'Fecha de citación', type: 'date', value: ev.citationDate || '' },
      { name: 'citationTime', label: 'Hora', type: 'time', value: /^\d\d:\d\d$/.test(ev.citationTime || '') ? ev.citationTime : '' },
      { name: 'room', label: 'Sala', type: 'text', value: ev.room || '', hint: 'Elija una sala configurada o escriba un lugar libre.' },
      { name: 'returned', label: 'Instrumento devuelto al docente', type: 'check', value: ev.returnedToTeacher }] });
    if (!v) return;
    UI.busy(null, async () => {
      await DB.write([Act.op(id, { content: v.content, instrumentType: v.instrumentType, absenceDate: v.absenceDate, room: v.room || null, returnedToTeacher: v.returned, returnDate: v.returned ? (ev.returnDate || D.today()) : null })]);
      await Act.move(ev, { date: v.citationDate, time: v.citationTime || undefined });
      UI.toast('Evaluación actualizada.', 'success'); this.render();
    });
  },
  async reopen(id) { if (await UI.confirm('Reabrir caso', 'La evaluación volverá a pendiente, sin fecha.', 'Reabrir')) UI.busy(null, async () => { await Act.reopen(DB.get('evaluations', id)); this.render(); }); },
  async del(id) { if (await UI.confirm('Eliminar evaluación', 'Se eliminará definitivamente este registro.', 'Eliminar', true)) UI.busy(null, async () => { await Act.remove(DB.get('evaluations', id)); this.render(); }); }
};

/* ---------- Estudiantes: nómina, reposos, suspensiones, retiros y cambios de curso ---------- */
const Students = {
  f: { cycle: '', course: '', q: '', withdrawn: false },
  mount(el) {
    const adm = Auth.isAdmin();
    el.innerHTML = `
      <div class="page-head"><div><h1>Estudiantes</h1><p>Nómina por curso, situación especial (PIE, plan, reposo, suspensión) y retiros.</p></div>
        ${adm ? `<div class="actions"><button class="btn" onclick="Students.importPdf()"><i class="fa-solid fa-file-pdf"></i> Importar desde PDF</button><button class="btn primary" onclick="Students.add()"><i class="fa-solid fa-user-plus"></i> Agregar estudiante</button></div>` : ''}</div>
      <div class="card toolbar">
        <div class="field"><label>Ciclo</label><select id="sf-cycle">${opts(CYCLES.map(c => c.name), this.f.cycle, 'Todos')}</select></div>
        <div class="field"><label>Curso</label><select id="sf-course"></select></div>
        <div class="field" style="grid-column:span 2"><label>Buscar por nombre o RUT</label><input id="sf-q" value="${esc(this.f.q)}" placeholder="Nombre, apellido o RUT"></div>
        <label class="check"><input type="checkbox" id="sf-wd" ${this.f.withdrawn ? 'checked' : ''}> Ver retirados</label>
      </div>
      <div class="card table-card"><div class="table-wrap"><table class="tbl"><thead><tr><th>Estudiante</th><th>RUT</th><th>Género</th><th>Estado</th><th>Situación</th><th>Acciones</th></tr></thead><tbody id="s-body"></tbody></table></div></div>
      <p class="muted" id="s-count"></p>`;
    const fillCourse = () => { const cs = this.f.cycle ? CYCLES.find(c => c.name === this.f.cycle).courses : COURSES; $('#sf-course').innerHTML = opts(cs, this.f.course, 'Todos'); };
    fillCourse();
    $('#sf-cycle').onchange = e => { this.f.cycle = e.target.value; this.f.course = ''; fillCourse(); this.refresh(); };
    $('#sf-course').onchange = e => { this.f.course = e.target.value; this.refresh(); };
    $('#sf-q').oninput = e => { this.f.q = e.target.value; this.refresh(); };
    $('#sf-wd').onchange = e => { this.f.withdrawn = e.target.checked; this.refresh(); };
    this.refresh();
  },
  refresh() {
    const f = this.f, q = f.q.toLowerCase().trim(), adm = Auth.isAdmin();
    let l = DB.students.filter(s => !!s.withdrawn === f.withdrawn && (!f.cycle || cycleOf(s.course) === f.cycle) && (!f.course || s.course === f.course) && (!q || s.name.toLowerCase().includes(q) || (s.rut || '').toLowerCase().includes(q)));
    l.sort((a, b) => COURSES.indexOf(a.course) - COURSES.indexOf(b.course) || a.name.localeCompare(b.name, 'es'));
    const total = l.length; l = l.slice(0, 400);
    $('#s-count').textContent = total > 400 ? `Mostrando 400 de ${total}. Use los filtros para acotar.` : `${total} estudiante(s).`;
    $('#s-body').innerHTML = l.map(s => {
      const lic = licenseOf(s), sus = suspensionOf(s), pend = DB.evaluations.filter(e => e.studentName === s.name && e.course === s.course && e.status === ST.PEND).length;
      const sit = [lic ? `<span class="pill ${lic.long ? 'vio' : 'sky'}">Reposo ${D.fmt(lic.end)}${lic.vigente ? '' : ' (fin)'}</span>` : '', sus ? `<span class="pill warn">Susp. ${D.fmt(sus.end)}</span>` : '', pend ? `<span class="pill brand">${pend} pend.</span>` : '', s.withdrawn ? `<span class="pill dark">${esc(s.withdrawnReason || 'Retirado')} · ${D.fmt(s.withdrawnDate)}</span>` : ''].join(' ');
      return `<tr><td><b>${esc(fmtName(s.name))}</b><br><small>${esc(s.course)}</small></td>
        <td>${s.rut ? esc(s.rut) : '<span class="pill warn">Sin RUT</span>'}<br>${studentEmail(s) ? `<small><i class="fa-regular fa-envelope"></i> ${esc(studentEmail(s))}</small>` : '<small class="muted">Sin correo</small>'}</td>
        <td>${adm ? `<select style="width:84px" onchange="Students.setGender('${s.id}',this.value)">${opts([['M', 'Hombre'], ['F', 'Mujer'], ['O', 'Otro']], s.gender || 'O')}</select>` : esc(s.gender || '')}</td>
        <td>${adm && !s.withdrawn ? `<select style="width:150px" onchange="Students.setStatus('${s.id}',this.value)">${opts(['Activo', 'PIE', ST.PLAN], s.status)}</select>` : esc(s.status)}</td>
        <td><div class="chips">${sit}</div></td>
        <td><div class="rowacts"><button class="btn sm" title="Ficha" onclick="Ficha.open('${s.id}')"><i class="fa-solid fa-folder-open"></i></button>
          ${adm ? (s.withdrawn ? `<button class="btn sm" onclick="Students.restore('${s.id}')"><i class="fa-solid fa-rotate-left"></i> Reintegrar</button>`
            : `<button class="btn sm" title="Reposo médico" onclick="Students.license('${s.id}')"><i class="fa-solid fa-notes-medical"></i></button>
               <button class="btn sm" title="Suspensión" onclick="Students.suspension('${s.id}')"><i class="fa-solid fa-user-clock"></i></button>
               <button class="btn sm" title="Editar / cambiar de curso" onclick="Students.edit('${s.id}')"><i class="fa-solid fa-pen"></i></button>
               <button class="btn sm" title="Retirar del establecimiento" onclick="Students.withdraw('${s.id}')"><i class="fa-solid fa-user-minus"></i></button>`) : ''}</div></td></tr>`;
    }).join('') || `<tr><td colspan="6"><div class="empty"><i class="fa-solid fa-users"></i>No hay estudiantes con esos filtros.</div></td></tr>`;
  },
  st: id => DB.get('students', id),
  setGender(id, g) { UI.busy(null, async () => { await DB.write([Act.sop(id, { gender: g })]); UI.toast('Género actualizado.', 'success', 1500); }); },
  setStatus(id, s) { UI.busy(null, async () => { await Act.setStatus(this.st(id), s); UI.toast(`Estado: ${s}.`, 'success'); this.refresh(); }); },

  studentFields: v => [
    { name: 'name', label: 'Nombre completo (APELLIDOS NOMBRES)', value: v.name || '', required: true, full: true },
    { name: 'rut', label: 'RUT (sin puntos, con guión)', value: v.rut || '', placeholder: '12345678-9', hint: 'Es la clave con que la familia consulta en la portada.' },
    { name: 'gender', label: 'Género (para las cartas)', type: 'select', value: v.gender || 'O', options: [['M', 'Hombre'], ['F', 'Mujer'], ['O', 'Otro / sin especificar']] },
    { name: 'course', label: 'Curso', type: 'select', value: v.course || '', options: COURSES.map(c => [c, c]) },
    { name: 'email', label: 'Correo del estudiante', type: 'email', value: studentEmail(v), placeholder: '12345678-9@andaliensur.cl', hint: 'Se genera solo desde el RUT (RUT@andaliensur.cl). Puede editarlo si es distinto.' },
    { name: 'guardianEmail', label: 'Correo del apoderado (opcional)', type: 'email', value: v.guardianEmail || '' }],
  async add() {
    const v = await UI.form({ title: 'Agregar estudiante', fields: this.studentFields({ course: this.f.course || COURSES[0] }) });
    if (!v) return;
    if (DB.students.some(s => s.name === v.name.trim().toUpperCase() && s.course === v.course)) return UI.toast('Ese estudiante ya está en el curso.', 'error');
    UI.busy(null, async () => { await Act.addStudent(v); UI.toast('Estudiante agregado.', 'success'); this.refresh(); });
  },
  async edit(id) {
    const st = this.st(id), v = await UI.form({ title: 'Editar estudiante', intro: 'Si cambia el curso, todo su historial (evaluaciones, reposos, observaciones) lo acompaña.', fields: this.studentFields(st) });
    if (v) UI.busy(null, async () => { await Act.editStudent(st, v); UI.toast('Datos actualizados.', 'success'); this.refresh(); });
  },
  async license(id) {
    const st = this.st(id), lic = licenseOf(st), body = st.licenseStart ? { start: st.licenseStart, end: st.licenseEnd } : {};
    const v = await UI.form({ title: `Reposo médico · ${fmtName(st.name)}`, ok: 'Guardar reposo',
      intro: `Con <b>${LICENSE_LONG} días o más</b> las evaluaciones pendientes quedan cerradas por salud (no se consideran ni llevan nota 1.0). Con menos, quedan sin fecha para que UTP las reagende al regreso.`,
      fields: [{ name: 'start', label: 'Primer día', type: 'date', value: lic ? body.start : D.today(), required: true }, { name: 'end', label: 'Último día', type: 'date', value: lic ? body.end : '', required: true }, ...(lic ? [{ name: 'remove', label: 'Quitar el reposo registrado', type: 'check' }] : [])] });
    if (!v) return;
    UI.busy(null, async () => {
      if (v.remove) { await Act.removeLicense(st); UI.toast('Reposo eliminado.', 'success'); }
      else { if (v.end < v.start) throw new Error('El último día no puede ser anterior al primero.'); const r = await Act.setLicense(st, v.start, v.end); UI.toast(`Reposo de ${r.days} día(s). ${r.n} evaluación(es) ${r.long ? 'cerradas por salud' : 'pasaron a "Sin fecha"'}.`, 'success', 6000); }
      this.refresh(); if (Ficha.dlg && Ficha.dlg.open) Ficha.render();
    });
  },
  async suspension(id) {
    const st = this.st(id), sus = suspensionOf(st);
    const v = await UI.form({ title: `Suspensión · ${fmtName(st.name)}`, intro: 'Las evaluaciones citadas durante la suspensión se reprograman al próximo día oficial después del regreso, sin contar inasistencia.',
      fields: [{ name: 'start', label: 'Primer día', type: 'date', value: sus ? sus.start : D.today(), required: true }, { name: 'end', label: 'Último día', type: 'date', value: sus ? sus.end : '', required: true }, { name: 'note', label: 'Observación', type: 'textarea', value: st.suspensionNote || '', full: true }, ...(sus ? [{ name: 'remove', label: 'Quitar la suspensión', type: 'check' }] : [])] });
    if (!v) return;
    UI.busy(null, async () => {
      if (v.remove) await Act.removeSuspension(st);
      else { if (v.end < v.start) throw new Error('El último día no puede ser anterior al primero.'); const r = await Act.setSuspension(st, v.start, v.end, v.note); UI.toast(`Suspensión de ${r.days} día(s). ${r.n} citación(es) reprogramada(s) al ${D.fmt(r.nd)}.`, 'success', 6000); }
      this.refresh(); if (Ficha.dlg && Ficha.dlg.open) Ficha.render();
    });
  },
  async withdraw(id) {
    const st = this.st(id), v = await UI.form({ title: `Retirar a ${fmtName(st.name)}`, ok: 'Confirmar retiro',
      intro: 'No se borra nada: el estudiante deja de aparecer en todas las listas de trabajo y puede reintegrarse cuando quiera.',
      fields: [{ name: 'date', label: 'Fecha de retiro', type: 'date', value: D.today(), required: true }, { name: 'reason', label: 'Motivo', type: 'select', value: 'Cambio de establecimiento', options: ['Cambio de establecimiento', 'Cambio de ciudad', 'Retiro voluntario de la familia', 'Traslado por motivos de salud', 'Otro'] }, { name: 'note', label: 'Observación', type: 'textarea', full: true }] });
    if (v) UI.busy(null, async () => { await Act.withdraw(st, v); UI.toast('Estudiante retirado.', 'success'); this.refresh(); });
  },
  restore(id) { UI.busy(null, async () => { await Act.restore(this.st(id)); UI.toast('Estudiante reintegrado.', 'success'); this.refresh(); }); },

  /* Importar nóminas desde PDF (RUT + nombre) */
  async importPdf() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/pdf';
    inp.onchange = async () => {
      const file = inp.files[0]; if (!file) return;
      UI.toast('Leyendo el PDF…', 'info');
      try {
        await UI.loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js');
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
        const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise, found = [];
        const isRut = s => /^\d{7,9}-[\dkK]$/i.test(normRut(s));
        for (let p = 1; p <= pdf.numPages; p++) {
          const items = (await (await pdf.getPage(p)).getTextContent()).items.map(i => i.str.trim()).filter(Boolean);
          for (let j = 0; j < items.length; j++) {
            let rut = null, k = j + 1;
            if (isRut(items[j])) rut = normRut(items[j]);
            else if (/^\d{1,3}(\.\d{3}){2}$|^\d{7,9}$/.test(items[j]) && /^-[\dkK]$/i.test(items[j + 1] || '')) { rut = normRut(items[j] + items[j + 1]); k = j + 2; }
            if (!rut) continue;
            const parts = []; while (k < items.length && !isRut(items[k]) && !/^\d{1,3}$/.test(items[k]) && !/^\d{2}\/\d{2}\/\d{4}$/.test(items[k])) parts.push(items[k++]);
            const name = parts.join(' ').replace(/\s+/g, ' ').trim(); if (name.length > 5) found.push(`${name} | ${rut}`);
          }
        }
        const v = await UI.form({ title: 'Importar estudiantes desde PDF', ok: 'Guardar estudiantes', wide: true, intro: 'Revise y corrija la lista. Formato: NOMBRE COMPLETO | RUT.',
          fields: [{ name: 'course', label: 'Curso de destino', type: 'select', options: COURSES.map(c => [c, c]), value: this.f.course || COURSES[0] }, { name: 'text', label: `${found.length} estudiante(s) detectados`, type: 'textarea', value: found.join('\n'), full: true }] });
        if (!v) return;
        const ops = []; let n = 0;
        v.text.split('\n').filter(l => l.trim()).forEach(l => {
          const [nm, rut] = l.split('|'), name = (nm || '').trim().toUpperCase();
          if (name && !DB.students.some(s => s.name === name && s.course === v.course) && !ops.some(o => o.data.name === name)) { ops.push({ c: 'students', op: 'set', id: newId(), data: { name, rut: normRut(rut), course: v.course, gender: guessGender(name), status: 'Activo' } }); n++; }
        });
        if (ops.length) await DB.write(ops);
        UI.toast(`${n} estudiante(s) importado(s).`, 'success'); this.refresh();
      } catch (e) { UI.toast('No se pudo leer el PDF: ' + (e.message || e), 'error'); }
    };
    inp.click();
  }
};

/* ---------- Historial: rendidas, cerradas por salud, plan, notas mínimas ---------- */
const History = {
  f: { status: ST.DONE, cycle: '', course: '', q: '' },
  mount(el) {
    el.innerHTML = `
      <div class="page-head"><div><h1>Historial de evaluaciones</h1><p>Evaluaciones ya cerradas, separadas por resultado.</p></div>
        <div class="actions"><button class="btn" onclick="History.pdf()"><i class="fa-solid fa-file-pdf"></i> Descargar PDF</button></div></div>
      <div class="card toolbar">
        <div class="field"><label>Resultado</label><select id="hf-status">${opts([[ST.DONE, 'Rendidas'], [ST.LIC, 'Cerradas por salud (reposo ≥ 15 días)'], [ST.PLAN, 'Plan de Evaluación'], [ST.FAIL, 'Nota mínima (1.0)']], this.f.status)}</select></div>
        <div class="field"><label>Ciclo</label><select id="hf-cycle">${opts(CYCLES.map(c => c.name), this.f.cycle, 'Todos')}</select></div>
        <div class="field"><label>Curso</label><select id="hf-course">${opts(COURSES, this.f.course, 'Todos')}</select></div>
        <div class="field" style="grid-column:span 2"><label>Buscar</label><input id="hf-q" value="${esc(this.f.q)}" placeholder="Estudiante, asignatura, docente…"></div>
      </div>
      ${Auth.isAdmin() && this.f.status === ST.DONE ? '<div id="h-bulk" class="bulkbar"></div>' : ''}
      <div class="card table-card"><div class="table-wrap"><table class="tbl"><thead><tr><th style="width:34px">${Auth.isAdmin() ? '<input type="checkbox" id="h-all" title="Seleccionar todo lo que se ve">' : ''}</th><th>Estudiante</th><th>Evaluación</th><th>Docente</th><th>Fecha</th><th>Devuelta al docente</th><th>Acciones</th></tr></thead><tbody id="h-body"></tbody></table></div></div>`;
    ['status', 'cycle', 'course'].forEach(k => $('#hf-' + k).onchange = e => { this.f[k] = e.target.value; this.refresh(); });
    $('#hf-q').oninput = e => { this.f.q = e.target.value; this.refresh(); };
    this.refresh();
  },
  list() {
    const f = this.f, q = f.q.toLowerCase();
    let l = DB.evaluations.filter(e => e.status === f.status && !isWithdrawn(e) && (!f.cycle || cycleOf(e.course) === f.cycle) && (!f.course || e.course === f.course) && (!q || `${e.studentName} ${e.subject} ${e.teacher} ${e.content || ''}`.toLowerCase().includes(q)));
    if (Auth.role === 'docente') l = l.filter(e => sameText(e.teacher, Auth.user.name) || sameText(Auth.user.headTeacherOf, e.course));
    return l;
  },
  refresh() {
    const l = this.list().sort((a, b) => COURSES.indexOf(a.course) - COURSES.indexOf(b.course) || a.studentName.localeCompare(b.studentName, 'es'));
    const ha = $('#h-all'); if (ha) ha.onchange = e => { l.forEach(x => e.target.checked ? this.sel.add(x.id) : this.sel.delete(x.id)); this.refresh(); };
    $('#h-body').innerHTML = l.slice(0, 500).map(e => `<tr class="${e.status === ST.DONE ? 'st-ok' : 'st-vio'}">
      <td>${Auth.isAdmin() ? `<input type="checkbox" ${this.sel.has(e.id) ? 'checked' : ''} onchange="History.toggle('${e.id}',this.checked)">` : ''}</td><td><b>${esc(fmtName(e.studentName))}</b><br><small>${esc(e.course)}</small></td>
      <td>${subjBadge(e.subject)}<div style="font-size:.8rem;margin-top:4px">${esc(e.content || '')}</div></td><td>${esc(titleCase(e.teacher))}</td>
      <td>${D.fmt(e.completedDate || e.citationDate)}</td>
      <td>${e.status !== ST.DONE ? '—' : Auth.isAdmin() ? `<label class="check"><input type="checkbox" ${e.returnedToTeacher ? 'checked' : ''} onchange="History.returned('${e.id}',this.checked)"> ${e.returnedToTeacher ? D.fmt(e.returnDate) : 'No'}</label>` : (e.returnedToTeacher ? 'Sí' : 'No')}</td>
      <td><div class="rowacts"><button class="btn sm" onclick="Ficha.open('','${e.id}')"><i class="fa-solid fa-folder-open"></i></button>${Auth.isAdmin() && e.status !== ST.DONE ? `<button class="btn sm" onclick="History.reopen('${e.id}')"><i class="fa-solid fa-rotate-left"></i> Devolver al proceso</button>` : ''}</div></td></tr>`).join('')
      || `<tr><td colspan="7"><div class="empty"><i class="fa-regular fa-folder-open"></i>No hay evaluaciones en esta categoría.</div></td></tr>`;
    this.bulk();
  },
  sel: new Set(),
  toggle(id, on) { on ? this.sel.add(id) : this.sel.delete(id); this.bulk(); },
  bulk() {
    const b = $('#h-bulk'); if (!b) return;
    const vis = this.list().filter(e => e.status === ST.DONE), pend = vis.filter(e => !e.returnedToTeacher), n = this.sel.size, off = n ? '' : 'disabled';
    b.innerHTML = `<div class="bb-count"><b>${n}</b><span>seleccionada(s)</span></div>
      <button class="btn success" ${off} onclick="History.bulkReturn(false)"><i class="fa-solid fa-check-double"></i> Marcar seleccionadas como devueltas</button>
      <button class="btn" onclick="History.bulkReturn(true)" ${pend.length ? '' : 'disabled'}><i class="fa-solid fa-list-check"></i> Marcar TODAS las visibles (${pend.length} sin devolver)</button>
      <span class="bb-sep"></span>
      <button class="btn sm" ${off} onclick="History.deliveryFor()"><i class="fa-solid fa-file-pdf"></i> Ficha de entrega</button>
      <button class="btn sm" onclick="Delivery.pendingModal()"><i class="fa-solid fa-user-clock"></i> Lista de pendientes por docente</button>
      <button class="btn sm ghost" ${off} onclick="History.sel.clear();History.refresh()">Limpiar</button>`;
  },
  deliveryFor() { Delivery.offer([...this.sel]); },
  bulkReturn(all) {
    UI.busy(null, async () => {
      const vis = this.list().filter(e => e.status === ST.DONE);
      const ids = all ? vis.filter(e => !e.returnedToTeacher).map(e => e.id) : [...this.sel];
      if (!ids.length) return;
      await DB.write(ids.map(id => Act.op(id, { returnedToTeacher: true, returnDate: D.today() })));
      this.sel.clear(); this.refresh(); UI.toast(` prueba(s) marcadas como devueltas al docente.`, 'success');
      Delivery.offer(ids);
    });
  },
  returned(id, on) { UI.busy(null, async () => { await DB.write([Act.op(id, { returnedToTeacher: on, returnDate: on ? D.today() : null })]); this.refresh(); }); },
  reopen(id) { UI.busy(null, async () => { await Act.reopen(DB.get('evaluations', id)); UI.toast('Vuelve al proceso como pendiente.', 'success'); this.refresh(); }); },
  pdf() {
    const l = this.list(); if (!l.length) return UI.toast('No hay datos para descargar.', 'error');
    PDF.table(`EVALUACIONES: ${this.f.status.toUpperCase()}`, ['N°', 'Curso', 'Estudiante', 'Asignatura', 'Contenido', 'Docente', 'Fecha'],
      l.sort((a, b) => COURSES.indexOf(a.course) - COURSES.indexOf(b.course) || a.studentName.localeCompare(b.studentName, 'es')).map((e, i) => [i + 1, e.course, fmtName(e.studentName), e.subject, e.content || '-', titleCase(e.teacher), D.fmt(e.completedDate || e.citationDate)]), 'download', `Historial_${D.today()}.pdf`);
  }
};

/* ---------- Mi panel docente (incluye jefatura) ---------- */
const Teacher = {
  scope: 'mine',
  mount(el) {
    const head = Auth.user.headTeacherOf;
    el.innerHTML = `
      <div class="page-head"><div><h1>Mi panel docente</h1><p>Estado de las evaluaciones de sus estudiantes. Cuando el estudiante rinda y usted reciba el instrumento, presione <b>Rendida y recibida</b>.</p></div>
        <div class="actions">${head ? `<select id="tp-scope" style="width:auto"><option value="mine">Mis evaluaciones</option><option value="head">Mi jefatura (${esc(head)})</option></select>` : ''}
        <button class="btn success" onclick="App.go('register')"><i class="fa-solid fa-plus"></i> Registrar evaluación</button></div></div>
      <div id="tp-notes" class="stack" style="margin-bottom:16px"></div>
      <div class="card" style="margin-bottom:16px"><h2><i class="fa-regular fa-clock"></i> Pendientes</h2><div class="table-wrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>Curso</th><th>Estudiante</th><th>Asignatura</th><th>Estado</th><th>Citación</th><th>Observaciones</th><th></th></tr></thead><tbody id="tp-pend"></tbody></table></div></div>
      <div class="card"><h2><i class="fa-solid fa-check-double"></i> Ya rendidas y cerradas</h2><div class="table-wrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>Curso</th><th>Estudiante</th><th>Asignatura</th><th>Estado</th><th>Fecha</th></tr></thead><tbody id="tp-done"></tbody></table></div></div>`;
    if (head) $('#tp-scope').onchange = e => { this.scope = e.target.value; this.refresh(); };
    this.refresh();
  },
  refresh() {
    const me = Auth.user, head = me.headTeacherOf;
    const mine = DB.evaluations.filter(e => !isWithdrawn(e) && (this.scope === 'head' && head ? e.course === head : sameText(e.teacher, me.name)));
    const key = e => e.course + e.studentName;
    const pend = mine.filter(e => e.status === ST.PEND).sort((a, b) => a.course.localeCompare(b.course, 'es', { numeric: true }) || a.studentName.localeCompare(b.studentName, 'es'));
    const done = mine.filter(e => e.status !== ST.PEND).sort((a, b) => String(b.completedDate || b.citationDate || '').localeCompare(String(a.completedDate || a.citationDate || '')));
    const lastObs = e => { const o = allObs(e).slice(-1)[0]; return o ? esc(o.text) : '—'; };
    $('#tp-pend').innerHTML = pend.map(e => { const u = isUtp(e); return `<tr class="${u ? 'st-utp' : 'st-semana'}"><td>${esc(e.course)}</td><td><b>${esc(fmtName(e.studentName))}</b></td><td>${subjBadge(e.subject)}<div style="font-size:.8rem;margin-top:4px">${esc(e.content || '')}</div></td>
      <td>${u ? '<span class="pill utp">En manos de UTP</span><br><small>La aplica UTP en horario de clases.</small>' : `<span class="pill brand">${attempt(e)}ª citación</span>`}${isReschedule(e) ? ' <span class="pill sky">Por reagendar</span>' : ''}</td>
      <td>${e.citationDate ? `${D.long(e.citationDate)}<br><small>${esc(e.citationTime || '')}${e.room ? ' · ' + esc(e.room) : ''}</small>` : '<span class="muted">Sin fecha</span>'}</td>
      <td style="max-width:240px;font-size:.8rem">${lastObs(e)}</td>
      <td>${sameText(e.teacher, me.name) ? `<button class="btn sm success" onclick="Teacher.received('${e.id}',this)"><i class="fa-solid fa-check-double"></i> Rendida y recibida</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="7"><div class="empty"><i class="fa-regular fa-circle-check"></i>No tiene evaluaciones pendientes.</div></td></tr>';
    $('#tp-done').innerHTML = done.map(e => `<tr class="${e.status === ST.DONE ? 'st-ok' : 'st-vio'}"><td>${esc(e.course)}</td><td><b>${esc(fmtName(e.studentName))}</b></td><td>${subjBadge(e.subject)}</td><td><span class="pill ${e.status === ST.DONE ? 'ok' : 'vio'}">${esc(e.status)}</span>${e.status === ST.DONE && e.returnedToTeacher ? ' <small>recibida</small>' : ''}</td><td>${D.fmt(e.completedDate || e.citationDate)}</td></tr>`).join('') || '<tr><td colspan="5"><div class="empty">Aún no hay evaluaciones rendidas.</div></td></tr>';

    const plan = [...new Set(mine.filter(e => (studentOf(e.studentName, e.course) || {}).status === ST.PLAN).map(e => `${fmtName(e.studentName)} (${e.course})`))];
    const up = Cfg.blocked.filter(b => (b.end || b.start) >= D.today()).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 8);
    $('#tp-notes').innerHTML = (plan.length ? `<div class="notice vio"><b>Estudiantes con Plan de Evaluación:</b> ${plan.map(esc).join(' · ')}. Sus evaluaciones anteriores quedan guardadas pero no se consideran; solo Coordinación o UTP puede agendarles nuevas.</div>` : '')
      + (up.length ? `<div class="notice bad"><b><i class="fa-solid fa-calendar-xmark"></i> Días bloqueados:</b> ${up.map(b => `${D.fmt(b.start)}${b.end && b.end !== b.start ? '–' + D.fmt(b.end) : ''} (${esc(b.reason || '')})`).join(' · ')}</div>` : '');
  },
  received(id, btn) { UI.busy(btn, async () => { await Act.done([DB.get('evaluations', id)]); UI.toast('Registrada como rendida y recibida.', 'success'); this.refresh(); }); }
};

/* ---------- Salas: distribución del día de rendición ---------- */
const Rooms = {
  dist: null,
  mount(el) {
    el.innerHTML = `
      <div class="page-head"><div><h1>Distribución de salas</h1><p>Cada estudiante queda en una sola sala y los estudiantes de un mismo docente se ubican juntos.</p></div></div>
      <div class="card toolbar">
        <div class="field"><label>Ciclo</label><select id="rm-cycle">${opts(CYCLES.map(c => c.name), CYCLES[1].name)}</select></div>
        <div class="field"><label>Fecha de rendición</label><input type="date" id="rm-date"></div>
        <div class="field"><label>Ordenar la nómina por</label><select id="rm-order"><option value="curso">Curso y estudiante</option><option value="docente">Docente</option></select></div>
        <div class="actions"><button class="btn" onclick="Rooms.calc()"><i class="fa-solid fa-shuffle"></i> Recalcular</button><button class="btn primary" onclick="Rooms.save(this)"><i class="fa-solid fa-floppy-disk"></i> Guardar</button><button class="btn success" onclick="Rooms.print()"><i class="fa-solid fa-print"></i> Nómina por sala</button></div>
      </div>
      <div id="rm-out"></div>`;
    $('#rm-cycle').onchange = () => { this.setDate(); this.calc(); };
    $('#rm-date').onchange = () => this.calc();
    this.setDate(); this.calc();
  },
  setDate() { const c = CYCLES.find(x => x.name === $('#rm-cycle').value); $('#rm-date').value = nextOfficialFrom(c.courses[0], D.today()); },
  calc() {
    const cy = $('#rm-cycle').value, date = $('#rm-date').value, out = $('#rm-out');
    const evs = DB.evaluations.filter(e => e.status === ST.PEND && e.citationDate === date && cycleOf(e.course) === cy && !isWithdrawn(e));
    if (!evs.length) { this.dist = null; out.innerHTML = `<div class="card"><div class="empty"><i class="fa-solid fa-door-open"></i>No hay citaciones el ${D.long(date)} en ${esc(cy)}.</div></div>`; return; }
    this.dist = evs.map(e => ({ ...e, room: null })); assignRooms(cy, this.dist);
    this.draw(cy);
  },
  draw(cy) {
    const rooms = Cfg.rooms(cy), d = this.dist, tmap = {};
    d.forEach(e => (tmap[e.teacher] = tmap[e.teacher] || new Set()).add(e.room));
    const counts = rooms.map(r => `<span class="pill brand">${esc(r)}: ${new Set(d.filter(e => e.room === r).map(e => e.course + e.studentName)).size}</span>`).join(' ');
    const teachers = Object.keys(tmap).sort((a, b) => tmap[b].size - tmap[a].size).map(t => `<span class="pill ${tmap[t].size === 1 ? 'ok' : tmap[t].size === 2 ? 'warn' : 'bad'}">${esc(titleCase(t))}: ${tmap[t].size === 1 ? '1 sala' : tmap[t].size + ' salas'}</span>`).join(' ');
    $('#rm-out').innerHTML = `<div class="card"><div class="chips" style="margin-bottom:10px">${counts}</div><div class="chips"><small style="width:100%">Docentes por sala (verde = juntos):</small>${teachers}</div></div>
      <div class="card table-card" style="margin-top:16px"><div class="table-wrap"><table class="tbl"><thead><tr><th>Sala</th><th>Curso</th><th>Estudiante</th><th>Asignatura</th><th>Docente</th></tr></thead><tbody>
      ${[...d].sort((a, b) => String(a.room).localeCompare(String(b.room), 'es', { numeric: true }) || a.course.localeCompare(b.course, 'es', { numeric: true }) || a.studentName.localeCompare(b.studentName, 'es')).map(e => `<tr><td><input list="rm-opts" value="${esc(e.room)}" style="width:130px" onchange="Rooms.set('${e.id}',this.value)"></td><td>${esc(e.course)}</td><td><b>${esc(fmtName(e.studentName))}</b></td><td>${subjBadge(e.subject)}</td><td>${esc(titleCase(e.teacher))}</td></tr>`).join('')}
      </tbody></table></div></div><datalist id="rm-opts">${rooms.map(r => `<option value="${esc(r)}">`).join('')}</datalist>`;
  },
  set(id, room) { const e = this.dist.find(x => x.id === id); if (e && room.trim()) e.room = room.trim(); },
  save(btn) {
    if (!this.dist) return UI.toast('Primero calcule la distribución.', 'error');
    UI.busy(btn, async () => { await DB.write(this.dist.map(e => Act.op(e.id, { room: e.room }))); UI.toast('Salas asignadas y guardadas.', 'success'); });
  },
  print() {
    if (!this.dist) return UI.toast('No hay distribución para imprimir.', 'error');
    PDF.rooms(this.dist, $('#rm-cycle').value, $('#rm-date').value, $('#rm-order').value, 'print');
  }
};



