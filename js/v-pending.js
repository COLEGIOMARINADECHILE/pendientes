/* ===== Vista "Pendientes": una sola tabla, con pestañas y fecha/hora editables en la misma fila ===== */
const Pending = {
  tab: 'semana', sel: new Set(),
  f: { cycle: '', course: '', teacher: '', attempt: '', q: '', group: 'curso' },

  /* ---------- datos ---------- */
  base() {
    let l = DB.evaluations.filter(e => e.status === ST.PEND && !isWithdrawn(e));
    if (Auth.role === 'asistente') {
      const cs = new Set((Auth.user.assignments || []).map(a => a.course));
      if (cs.size) l = l.filter(e => cs.has(e.course));
    }
    return l;
  },
  filtered() {
    const f = this.f, q = f.q.toLowerCase();
    return this.base().filter(ev => {
      if (f.cycle && cycleOf(ev.course) !== f.cycle) return false;
      if (f.course && ev.course !== f.course) return false;
      if (f.teacher && (ev.teacher || '') !== f.teacher) return false;
      if (f.attempt === 'utp') { if (!isUtp(ev)) return false; }
      else if (f.attempt && (isUtp(ev) || String(attempt(ev)) !== f.attempt)) return false;
      if (q && !`${ev.studentName} ${ev.subject} ${ev.content || ''} ${ev.teacher || ''} ${ev.course}`.toLowerCase().includes(q)) return false;
      return true;
    });
  },
  visible() { const l = this.filtered(); return this.tab === 'todas' ? l : l.filter(e => bucket(e) === this.tab); },

  /* ---------- armado de la pantalla ---------- */
  mount(el) {
    const ro = Auth.readOnly();
    el.innerHTML = `
      <div class="page-head">
        <div><h1>Evaluaciones pendientes</h1><p>Cambie fecha y hora directamente en cada fila. Los cambios se guardan solos.</p></div>
        <div class="actions">
          ${Auth.isAdmin() ? '<button class="btn success" onclick="App.go(\'register\')"><i class="fa-solid fa-plus"></i> Registrar</button>' : ''}
          <button class="btn" onclick="Pending.reload(this)"><i class="fa-solid fa-rotate"></i> Actualizar</button>
          ${Auth.isAdmin() ? '<button class="btn primary" onclick="Delivery.studentsModal()" title="Envía por correo a los estudiantes sus evaluaciones pendientes, para las fechas y el momento que elija"><i class="fa-solid fa-paper-plane"></i> Avisar a estudiantes</button>' : ''}
          <button class="btn" onclick="Pending.printModal('firmas')"><i class="fa-solid fa-clipboard-user"></i> Lista de firmas</button>
          <button class="btn" onclick="Pending.printModal('cartas')"><i class="fa-solid fa-envelope-open-text"></i> Citaciones por curso</button>
          <button class="btn" onclick="Pending.printModal('lista')"><i class="fa-solid fa-file-pdf"></i> Listado PDF</button>
        </div>
      </div>
      <div class="kpis" id="p-kpis"></div>
      <div class="card toolbar">
        <div class="field"><label>Ciclo</label><select id="pf-cycle"></select></div>
        <div class="field"><label>Curso</label><select id="pf-course"></select></div>
        <div class="field"><label>Docente</label><select id="pf-teacher"></select></div>
        <div class="field"><label>Oportunidad</label><select id="pf-attempt">${opts([['2', '2ª citación'], ['3', '3ª citación (última)'], ['utp', 'En UTP']], this.f.attempt, 'Todas')}</select></div>
        <div class="field"><label>Agrupar por</label><select id="pf-group">${opts([['curso', 'Ciclo y curso'], ['docente', 'Docente'], ['fecha', 'Fecha de citación']], this.f.group)}</select></div>
        <div class="field" style="grid-column:span 2"><label>Buscar</label><input id="pf-q" placeholder="Estudiante, asignatura, contenido…" value="${esc(this.f.q)}"></div>
      </div>
      <div id="p-bulk"></div>
      <div class="card table-card"><div class="table-wrap"><table class="tbl fixed">
        <colgroup><col style="width:38px"><col style="width:14%"><col style="width:25%"><col style="width:11%"><col style="width:23%"><col style="width:12%"><col></colgroup>
        <thead><tr>
          <th>${ro ? '' : '<input type="checkbox" id="p-all" title="Seleccionar todo lo que se ve">'}</th>
          <th>Estudiante</th><th>Evaluación</th><th>Docente</th><th>Fecha y hora de citación</th><th>Estado</th><th>Acciones</th>
        </tr></thead><tbody id="p-body"></tbody></table></div></div>`;
    this.fillFilters();
    const on = (id, fn) => { const x = $('#' + id); x.addEventListener(x.tagName === 'INPUT' ? 'input' : 'change', fn); };
    on('pf-cycle', e => { this.f.cycle = e.target.value; this.f.course = ''; this.fillFilters(); this.refresh(); });
    on('pf-course', e => { this.f.course = e.target.value; this.refresh(); });
    on('pf-teacher', e => { this.f.teacher = e.target.value; this.refresh(); });
    on('pf-attempt', e => { this.f.attempt = e.target.value; this.refresh(); });
    on('pf-group', e => { this.f.group = e.target.value; this.refresh(); });
    on('pf-q', e => { this.f.q = e.target.value; this.refresh(); });
    const all = $('#p-all'); if (all) all.onchange = e => { this.visible().forEach(ev => e.target.checked ? this.sel.add(ev.id) : this.sel.delete(ev.id)); this.refresh(); };
    this.refresh();
  },

  fillFilters() {
    const base = this.base(), f = this.f;
    const courses = [...new Set(base.filter(e => !f.cycle || cycleOf(e.course) === f.cycle).map(e => e.course))].sort((a, b) => COURSES.indexOf(a) - COURSES.indexOf(b));
    const teachers = [...new Set(base.map(e => e.teacher || '').filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    $('#pf-cycle').innerHTML = opts(CYCLES.map(c => c.name), f.cycle, 'Todos');
    $('#pf-course').innerHTML = opts(courses, f.course, 'Todos');
    $('#pf-teacher').innerHTML = opts(teachers.map(t => [t, titleCase(t)]), f.teacher, 'Todos');
  },

  refresh() {
    const list = this.filtered(), counts = { todas: list.length };
    list.forEach(e => { const b = bucket(e); counts[b] = (counts[b] || 0) + 1; });
    const K = [['semana', 'Esta semana', '--warn', '--warn-l'], ['proximas', 'Próximas semanas', '--brand', '--brand-l'], ['sinfecha', 'Sin fecha', '--sky', '--sky-l'], ['utp', 'En manos de UTP', '--utp', '--utp-l'], ['todas', 'Todas', '--ok', '--ok-l']];
    $('#p-kpis').innerHTML = K.map(([k, l, c, cl]) => `<button class="kpi ${this.tab === k ? 'on' : ''}" style="--c:var(${c});--cl:var(${cl})" onclick="Pending.setTab('${k}')"><b>${counts[k] || 0}</b><span>${l}</span></button>`).join('');

    const vis = this.visible(), ids = new Set(vis.map(e => e.id));
    [...this.sel].forEach(id => { if (!ids.has(id)) this.sel.delete(id); });
    $('#p-body').innerHTML = vis.length ? this.groups(vis) : `<tr><td colspan="7"><div class="empty"><i class="fa-regular fa-circle-check"></i>No hay evaluaciones en esta lista con los filtros actuales.</div></td></tr>`;
    this.bulkBar();
  },
  setTab(t) { this.tab = t; this.refresh(); },

  groups(list) {
    const hd = (t, n, l1, ids) => `<tr class="grp ${l1 ? 'l1' : ''}"><td colspan="7">${ids && !Auth.readOnly() ? `<input type="checkbox" title="Seleccionar este grupo" style="margin-right:10px" onchange="Pending.selGroup('${ids.join(',')}',this.checked)">` : ''}${t}<small>${n} evaluación(es)</small></td></tr>`;
    const byStudent = (a, b) => a.studentName.localeCompare(b.studentName, 'es') || (a.subject || '').localeCompare(b.subject || '', 'es');
    let html = '';
    if (this.f.group === 'docente') {
      const g = {}; list.forEach(e => (g[e.teacher || 'SIN DOCENTE'] = g[e.teacher || 'SIN DOCENTE'] || []).push(e));
      Object.keys(g).sort((a, b) => a.localeCompare(b, 'es')).forEach(t => { html += hd(`<i class="fa-solid fa-person-chalkboard"></i> ${esc(titleCase(t))}`, g[t].length, 1, g[t].map(e => e.id)) + g[t].sort((a, b) => a.course.localeCompare(b.course, 'es', { numeric: true }) || byStudent(a, b)).map(e => this.row(e)).join(''); });
    } else if (this.f.group === 'fecha') {
      const g = {}; list.forEach(e => (g[e.citationDate || '9999'] = g[e.citationDate || '9999'] || []).push(e));
      Object.keys(g).sort().forEach(d => { html += hd(d === '9999' ? '<i class="fa-regular fa-calendar-xmark"></i> Sin fecha asignada' : `<i class="fa-regular fa-calendar"></i> ${D.long(d)}`, g[d].length, 1, g[d].map(e => e.id)) + g[d].sort((a, b) => a.course.localeCompare(b.course, 'es', { numeric: true }) || byStudent(a, b)).map(e => this.row(e)).join(''); });
    } else {
      groupByCycleCourse(list).forEach(g => {
        html += hd(`<i class="fa-solid fa-layer-group"></i> ${g.cycle}`, g.courses.reduce((n, c) => n + c.list.length, 0), 1, g.courses.flatMap(c => c.list.map(e => e.id)));
        g.courses.forEach(c => { html += hd(`Curso ${c.course}`, c.list.length, 0, c.list.map(e => e.id)) + c.list.sort(byStudent).map(e => this.row(e)).join(''); });
      });
    }
    return html;
  },

  /* ---------- una fila ---------- */
  row(ev) {
    const b = bucket(ev), today = D.today(), sch = Cfg.schedule(ev.course), st = studentOf(ev.studentName, ev.course);
    const lic = licenseOf(st), sus = suspensionOf(st), ro = Auth.readOnly(), canSch = Auth.canSchedule();
    const vencida = ev.citationDate && ev.citationDate < today;
    const cls = b === 'utp' ? 'st-utp' : vencida ? 'st-vencida' : b === 'sinfecha' ? 'st-sinfecha' : b === 'semana' ? 'st-semana' : '';

    const timeVal = /^\d\d:\d\d$/.test(ev.citationTime || '') ? ev.citationTime : '';
    let hint = '';
    if (ev.citationDate) {
      hint = `<span class="hint">${D.weekday(ev.citationDate)}${ev.room ? ' · ' + esc(ev.room) : ''}${!timeVal && ev.citationTime ? ' · ' + esc(ev.citationTime) : ''}</span>`;
      if (vencida) hint += ' <span class="pill bad">Vencida</span>';
      else if (!sch.weekdays.includes(D.parse(ev.citationDate).getDay())) hint += ' <span class="pill warn">Fuera de día oficial</span>';
    } else hint = `<span class="hint">${b === 'utp' ? 'UTP debe asignar fecha' : isReschedule(ev) ? 'Reposo médico: UTP debe reagendar' : 'Sin fecha asignada'}</span>`;

    const dateCell = canSch
      ? `<div class="dt"><input type="date" value="${ev.citationDate || ''}" min="${today}" onchange="Pending.setDate('${ev.id}',this)" title="Fecha de citación">
           <input type="time" value="${timeVal}" onchange="Pending.setTime('${ev.id}',this)" title="Hora">
           <button class="icon-btn" title="Pasar al próximo día oficial disponible" onclick="Pending.nextDay('${ev.id}',this)"><i class="fa-solid fa-forward-step"></i></button></div>${hint}`
      : `<strong>${D.fmt(ev.citationDate)}</strong> ${esc(ev.citationTime || '')}<br>${hint}`;

    const tags = [];
    tags.push(b === 'utp' ? '<span class="pill utp"><i class="fa-solid fa-user-shield"></i> En UTP</span>' : `<span class="pill ${attempt(ev) >= 3 ? 'warn' : 'brand'}">${attempt(ev)}ª citación</span>`);
    if (isReschedule(ev)) tags.push('<span class="pill sky"><i class="fa-solid fa-notes-medical"></i> Por reagendar</span>');
    if (lic && lic.vigente) tags.push(`<span class="pill sky">Reposo hasta ${D.fmt(lic.end)}</span>`);
    if (sus && sus.vigente) tags.push(`<span class="pill warn">Suspendido hasta ${D.fmt(sus.end)}</span>`);
    if (st && st.status === ST.PLAN) tags.push('<span class="pill vio">Plan de Evaluación</span>');
    if (ev.contacted) tags.push('<span class="pill ok"><i class="fa-solid fa-phone"></i> Contactada</span>');

    let acts = '';
    if (Auth.isAdmin()) acts += `<button class="btn sm ib success" title="Rindió la evaluación" onclick="Pending.done('${ev.id}',this)"><i class="fa-solid fa-check"></i></button>
                                 <button class="btn sm ib danger" title="No asistió: se reprograma sola" onclick="Pending.absent('${ev.id}',this)"><i class="fa-solid fa-xmark"></i></button>`;
    if (Auth.canContact()) acts += `<button class="btn sm ib ${ev.contacted ? '' : 'ghost'}" title="Marcar familia contactada" onclick="Pending.contact('${ev.id}',this)"><i class="fa-solid fa-phone"></i></button>`;
    acts += `<button class="btn sm ib" title="Ficha del estudiante" onclick="Ficha.open('${st ? st.id : ''}','${ev.id}')"><i class="fa-solid fa-folder-open"></i></button>`;
    if (Auth.isAdmin()) acts += `<button class="btn sm ib" title="No considerar esta evaluación (indicando el motivo)" onclick="Pending.exclude('${ev.id}')"><i class="fa-solid fa-eye-slash"></i></button>`;
    if (Auth.isAdmin() && b === 'utp') acts += `<button class="btn sm ib" title="Cerrar con nota 1.0" onclick="Pending.fail('${ev.id}')"><i class="fa-solid fa-ban"></i></button>`;

    return `<tr id="r-${ev.id}" class="${cls}">
      <td>${ro ? '' : `<input type="checkbox" ${this.sel.has(ev.id) ? 'checked' : ''} onchange="Pending.toggle('${ev.id}',this.checked)">`}</td>
      <td><b>${esc(fmtName(ev.studentName))}</b><br><small>${esc(ev.course)}</small></td>
      <td>${subjBadge(ev.subject)}<div style="margin-top:4px;font-size:.8rem">${esc(ev.content || 'Sin contenido registrado')}</div><small>${esc(ev.instrumentType || '')}</small></td>
      <td>${esc(titleCase(ev.teacher))}</td>
      <td>${dateCell}</td>
      <td><div class="chips">${tags.join('')}</div></td>
      <td><div class="rowacts">${acts}</div></td></tr>`;
  },

  /* ---------- acciones sobre una fila ---------- */
  ev: id => DB.get('evaluations', id),
  flash(id) { const r = $('#r-' + id); if (r) r.classList.add('flash'); },

  async setDate(id, input) {
    const ev = this.ev(id);
    try { await Act.move(ev, { date: input.value }); UI.toast(input.value ? `Nueva fecha: ${D.long(input.value)}` : 'Fecha quitada.', 'success', 2200); this.refresh(); this.flash(id); }
    catch (e) { input.value = ev.citationDate || ''; UI.toast(e.message, 'error'); }
  },
  async setTime(id, input) {
    const ev = this.ev(id);
    try { await Act.move(ev, { time: input.value }); UI.toast('Hora actualizada.', 'success', 1800); this.flash(id); }
    catch (e) { input.value = ev.citationTime || ''; UI.toast(e.message, 'error'); }
  },
  nextDay(id, btn) { UI.busy(btn, async () => { const nd = await Act.nextOfficial(this.ev(id)); UI.toast(`Movida al ${D.long(nd)}`, 'success', 2500); this.refresh(); this.flash(id); }); },
  done(id, btn) { UI.busy(btn, async () => { const ev = this.ev(id); await Act.done([ev]); UI.toast(`${fmtName(ev.studentName)} — ${ev.subject}: rendida.`, 'success'); this.refresh(); }); },
  absent(id, btn) {
    UI.busy(btn, async () => {
      const ev = this.ev(id), r = await Act.absent([ev]);
      UI.toast(r.utp ? 'Agotó las citaciones: pasa a UTP sin fecha.' : r.susp ? 'Estaba suspendido: se reprogramó sin contar inasistencia.' : `Nueva citación: ${D.long(ev.citationDate)}. Puede ajustarla en la fila.`, 'success', 5000);
      this.refresh(); this.flash(id);
    });
  },
  contact(id, btn) { UI.busy(btn, async () => { await Act.toggleContact(this.ev(id)); this.refresh(); }); },
  async fail(id) {
    const ev = this.ev(id);
    if (!await UI.confirm('Cerrar con nota mínima', `Se cerrará el proceso de <b>${esc(fmtName(ev.studentName))}</b> en ${esc(ev.subject)} con nota 1.0 y se generará la carta de resolución.`, 'Cerrar proceso', true)) return;
    await Act.closeFail(ev); PDF.failLetter(ev); this.refresh();
  },
  exclude(id) { this.excludeModal([this.ev(id)]); },
  bulkExclude() { this.excludeModal(this.selected()); },
  async excludeModal(evs) {
    evs = evs.filter(Boolean); if (!evs.length) return;
    const v = await UI.form({ title: `No considerar ${evs.length} evaluación(es)`, ok: 'Marcar como no considerada',
      intro: 'La evaluación sale de las listas de pendientes y de las estadísticas. Queda registrada con su motivo y esa información también se incluye en los correos y fichas del docente.',
      fields: [{ name: 'reason', label: 'Motivo', type: 'select', full: true, options: EXCLUDE_REASONS.map(x => [x, x]) },
        { name: 'note', label: 'Detalle (opcional)', type: 'textarea', full: true, placeholder: 'Ej. Reposo desde el 03/11 por 30 días.' },
        { name: 'notify', label: 'Avisar ahora al docente por correo', type: 'check', value: true }] });
    if (!v) return;
    UI.busy(null, async () => {
      const n = await Act.exclude(evs, v); this.sel.clear(); this.refresh();
      UI.toast(` evaluación(es) marcada(s) como NO consideradas.`, 'success');
      if (v.notify && n) {
        await DB.flush();
        const r = await API.call('notifyExcluded', { evalIds: evs.map(e => e.id) });
        if (r.demo) UI.toast('Modo demo: no se envían correos.', 'info');
        else UI.notice({ type: 'success', title: 'Aviso a los docentes', html: `<ul class="list">${r.results.map(x => `<li><span><b>${esc(titleCase(x.teacher))}</b> · ${x.count} evaluación(es)</span><span class="pill ${x.sent ? 'ok' : 'bad'}">${x.sent ? 'Enviado a ' + esc(x.to) : esc(x.reason || 'No enviado')}</span></li>`).join('')}</ul>` });
      }
      if (Ficha.dlg && Ficha.dlg.open) Ficha.render();
    });
  },
  toggle(id, on) { on ? this.sel.add(id) : this.sel.delete(id); this.bulkBar(); },

  /* ---------- acciones en bloque ---------- */
  bulkBar() {
    const box = $('#p-bulk'), n = this.sel.size;
    if (Auth.readOnly()) { box.innerHTML = ''; return; }
    const adm = Auth.canSchedule(), off = n ? '' : 'disabled';
    box.innerHTML = `<div class="bulkbar"><div class="bb-count"><b>${n}</b><span>seleccionada(s)</span></div>
      ${adm ? `<button class="btn success" ${off} onclick="Pending.bulkDone(this)"><i class="fa-solid fa-check-double"></i> Marcar como RENDIDAS</button>
      <button class="btn danger" ${off} onclick="Pending.bulkAbsent(this)" title="Se reprograman solas al próximo día oficial"><i class="fa-solid fa-calendar-xmark"></i> Marcar como NO RENDIDAS y reprogramar</button>
      <span class="bb-sep"></span><input type="date" id="bk-date" min="${D.today()}" ${off}><input type="time" id="bk-time" ${off}>
      <button class="btn" ${off} onclick="Pending.bulkExclude()" title="Sale de las listas y se informa al docente"><i class="fa-solid fa-eye-slash"></i> NO considerar…</button>
      <button class="btn sm" ${off} onclick="Pending.bulkMove(this)"><i class="fa-solid fa-calendar-check"></i> Aplicar fecha/hora</button>
      <button class="btn sm" ${off} onclick="Pending.bulkNext(this)"><i class="fa-solid fa-forward-step"></i> Próximo día oficial</button>` : ''}
      <button class="btn sm ghost" ${off} onclick="Pending.clearSel()">Limpiar</button>
      <div class="bb-help">Marque las casillas (o el grupo completo) y use los botones. <b>✓</b> rindió · <b>✗</b> no asistió (se reprograma sola) · <i class="fa-solid fa-phone"></i> familia contactada · <i class="fa-solid fa-folder-open"></i> ficha.</div></div>`;
  },
  selGroup(ids, on) { ids.split(',').forEach(id => on ? this.sel.add(id) : this.sel.delete(id)); this.refresh(); },  clearSel() { this.sel.clear(); this.refresh(); },
  selected() { return [...this.sel].map(id => this.ev(id)).filter(Boolean); },
  async eachMove(evs, fn) {
    let ok = 0; const bad = [];
    for (const ev of evs) { try { await fn(ev); ok++; } catch (e) { bad.push(`${fmtName(ev.studentName)}: ${e.message}`); } }
    UI.toast(`${ok} actualizada(s)${bad.length ? ` · ${bad.length} con problema` : ''}.`, bad.length ? 'error' : 'success', 6000);
    if (bad.length) UI.modal({ title: 'No se pudieron cambiar', body: `<ul class="list">${bad.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` });
    this.sel.clear(); this.refresh();
  },
  bulkMove(btn) {
    const date = $('#bk-date').value, time = $('#bk-time').value;
    if (!date && !time) return UI.toast('Indique la fecha y/o la hora que desea aplicar.', 'error');
    UI.busy(btn, () => this.eachMove(this.selected(), ev => Act.move(ev, { date: date || undefined, time: time || undefined })));
  },
  bulkNext(btn) { UI.busy(btn, () => this.eachMove(this.selected(), ev => Act.nextOfficial(ev))); },
  bulkDone(btn) { UI.busy(btn, async () => { const n = await Act.done(this.selected()); this.sel.clear(); this.refresh(); UI.toast(`${n} evaluación(es) registradas como rendidas.`, 'success'); }); },
  async bulkAbsent(btn) {
    if (!await UI.confirm('Marcar como no rendidas', `Se registrará la inasistencia de <b>${this.sel.size}</b> evaluación(es): quienes van en su 2ª citación quedan reagendados en el día oficial siguiente y quienes agotaron las citaciones pasan a UTP.`, 'Registrar inasistencias', true)) return;
    UI.busy(btn, async () => { const r = await Act.absent(this.selected()); this.sel.clear(); this.refresh(); UI.toast(`${r.nuevas} reagendada(s) · ${r.utp} a UTP · ${r.susp} por suspensión.`, 'success'); });
  },
  async reload(btn) { await UI.busy(btn, async () => { await DB.load(); this.fillFilters(); this.refresh(); UI.toast('Datos actualizados.', 'success', 1800); }); },

  /* ---------- impresión ---------- */
  async printModal(pre) {
    const v = await UI.form({
      title: 'Imprimir / descargar', ok: 'Generar',
      intro: 'Elija el documento. Se incluyen solo las evaluaciones citadas dentro del rango de fechas.',
      fields: [
        { name: 'doc', label: 'Documento', type: 'select', value: pre || 'firmas', full: true, options: [['firmas', 'Nómina de rendición con firmas'], ['cartas', 'Citaciones individuales (una hoja por estudiante)'], ['lista', 'Listado de pendientes (lo que se ve en pantalla)']] },
        { name: 'cycle', label: 'Ciclo', type: 'select', value: this.f.cycle, options: [['', 'Todos'], ...CYCLES.map(c => [c.name, c.name])] },
        { name: 'course', label: 'Curso', type: 'select', value: this.f.course, options: [['', 'Todos'], ...COURSES.map(c => [c, c])] },
        { name: 'from', label: 'Citadas desde', type: 'date', value: D.today() },
        { name: 'to', label: 'Hasta', type: 'date', value: D.today() },
        { name: 'mode', label: 'Salida', type: 'select', value: 'download', options: [['download', 'Descargar PDF'], ['print', 'Abrir para imprimir']] },
        { name: 'split', label: 'Lista de firmas: cursos separados por franjas en la misma hoja (estudiantes en orden alfabético)', type: 'check', value: true }
      ]
    });
    if (!v) return;
    let evs = v.doc === 'lista' ? this.visible() : this.base().filter(e => e.citationDate && e.citationDate >= v.from && e.citationDate <= v.to);
    if (v.cycle) evs = evs.filter(e => cycleOf(e.course) === v.cycle);
    if (v.course) evs = evs.filter(e => e.course === v.course);
    if (!evs.length) return UI.toast('No hay evaluaciones para esa selección.', 'error');
    const scope = v.course || v.cycle || null;
    const text = v.doc === 'lista' ? `${v.course || v.cycle || 'Todos los ciclos'}` : (v.from === v.to ? `Citadas el ${D.long(v.from)}` : `Citadas entre ${D.fmt(v.from)} y ${D.fmt(v.to)}`);
    await ensureRooms(evs);
    if (v.doc === 'cartas') { const n = PDF.letters(evs.filter(e => e.includeInCitation !== false), v.mode); UI.toast(`${n} carta(s) generada(s).`, 'success'); }
    else if (v.doc === 'firmas') PDF.attendance(evs, { text, scope, course: v.course, split: v.split }, v.mode);
    else PDF.pending(evs, { text, scope }, v.mode);
  }
};








