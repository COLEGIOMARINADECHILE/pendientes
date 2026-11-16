/* ===== Entrega de pruebas a los docentes: resumen, ficha PDF y aviso por correo ===== */
const Delivery = {
  /** Agrupa por docente las pruebas indicadas (done) y las que aún siguen pendientes. */
  groups(ids) {
    const by = {};
    ids.map(i => DB.get('evaluations', i)).filter(Boolean).forEach(e => {
      const k = normP(e.teacher);
      (by[k] = by[k] || { teacher: e.teacher || 'SIN DOCENTE', done: [] }).done.push(e);
    });
    return Object.values(by).map(g => this.fill(g)).sort((a, b) => b.done.length - a.done.length || a.teacher.localeCompare(b.teacher, 'es'));
  },
  fill(g) {
    g.pend = DB.evaluations.filter(e => e.status === ST.PEND && normP(e.teacher) === normP(g.teacher) && !isWithdrawn(e))
      .sort((a, b) => a.course.localeCompare(b.course, 'es', { numeric: true }) || a.studentName.localeCompare(b.studentName, 'es'));
    g.excl = DB.evaluations.filter(e => e.status === ST.EXCL && normP(e.teacher) === normP(g.teacher) && !isWithdrawn(e));
    const u = DB.users.find(x => sameText(x.name, g.teacher));
    g.email = (u && u.email) || '';
    g.done.sort((a, b) => a.course.localeCompare(b.course, 'es', { numeric: true }) || a.studentName.localeCompare(b.studentName, 'es'));
    return g;
  },
  pendingGroups() {
    const by = {};
    DB.evaluations.filter(e => e.status === ST.PEND && !isWithdrawn(e)).forEach(e => { (by[String(e.teacher || '').trim().toUpperCase()] = by[String(e.teacher || '').trim().toUpperCase()] || { teacher: e.teacher || 'SIN DOCENTE', done: [] }); });
    return Object.values(by).map(g => this.fill(g)).sort((a, b) => b.pend.length - a.pend.length);
  },

  listHtml(rows) { return `<ul style="margin:6px 0 0;padding-left:18px;font-size:.8rem">${rows.map(e => `<li>${esc(fmtName(e.studentName))} <small>(${esc(e.course)} · ${esc(e.subject)}${e.citationDate ? ' · ' + D.fmt(e.citationDate) : ''})</small></li>`).join('')}</ul>`; },

  /** Pregunta si se quiere avisar a los docentes y muestra exactamente quiénes recibirían el correo. */
  offer(ids) {
    const gs = this.groups(ids), total = gs.reduce((n, g) => n + g.done.length, 0), con = gs.filter(g => g.email);
    if (!gs.length) return;
    const d = UI.modal({
      title: '<i class="fa-solid fa-box-open" style="color:var(--brand)"></i> Entrega de pruebas a los docentes', wide: true,
      body: `<div class="notice ok" style="margin-bottom:14px"><b>${total} prueba(s)</b> de <b>${gs.length} docente(s)</b> quedaron marcadas como rendidas y listas para devolver. ¿Desea avisarles por correo?</div>
        <div class="table-wrap" style="max-height:52vh"><table class="tbl"><thead><tr><th>Docente</th><th>Pruebas que se le devuelven</th><th>Aún pendientes de rendir</th><th>No considerar</th><th>Recibirá el correo en</th></tr></thead><tbody>
        ${gs.map(g => `<tr><td><b>${esc(titleCase(g.teacher))}</b><br><button class="btn sm" style="margin-top:6px" data-prev="${gs.indexOf(g)}"><i class="fa-regular fa-eye"></i> Ver correo</button></td>
          <td><span class="pill ok">${g.done.length} prueba(s)</span>${this.listHtml(g.done)}</td>
          <td>${g.pend.length ? `<span class="pill warn">${g.pend.length}</span><details><summary class="muted" style="cursor:pointer;font-size:.78rem">Ver lista</summary>${this.listHtml(g.pend)}</details>` : '<span class="pill ok">Ninguna</span>'}</td>
          <td>${g.excl.length ? `<span class="pill vio">${g.excl.length}</span><details><summary class="muted" style="cursor:pointer;font-size:.78rem">Ver motivos</summary><ul style="margin:6px 0 0;padding-left:18px;font-size:.8rem">${g.excl.map(e => `<li>${esc(fmtName(e.studentName))} <small>(${esc(e.subject)}): ${esc(e.excludedReason || '')}</small></li>`).join('')}</ul></details>` : '<span class="muted">—</span>'}</td>
          <td>${g.email ? `<i class="fa-regular fa-envelope"></i> ${esc(g.email)}` : '<span class="pill bad">Sin correo registrado</span><br><small>Agréguelo en Administración → Usuarios</small>'}</td></tr>`).join('')}
        </tbody></table></div>`,
      footer: `<button class="btn" data-no>No enviar</button><button class="btn" data-pdf><i class="fa-solid fa-file-pdf"></i> Fichas de entrega (PDF)</button>
        <button class="btn primary" data-send ${con.length ? '' : 'disabled'}><i class="fa-solid fa-paper-plane"></i> Enviar correo a ${con.length} docente(s)</button>`
    });
    $('[data-no]', d).onclick = () => d.close();
    $$('[data-prev]', d).forEach(b => b.onclick = () => this.preview(gs[+b.dataset.prev].teacher, ids, b));
    $('[data-pdf]', d).onclick = () => PDF.delivery(gs);
    $('[data-send]', d).onclick = e => UI.busy(e.currentTarget, async () => { await this.send(ids, gs); d.close(); });
  },

  /** Muestra el correo EXACTO que recibirá el docente. */
  preview(teacher, ids, btn) {
    UI.busy(btn, async () => {
      await DB.flush();
      const r = await API.call('previewTeacher', { teacher, evalIds: ids });
      const d = UI.modal({ title: `Así lo recibe ${esc(titleCase(teacher))}`, wide: true, body: '<iframe id="tp-frame" style="width:100%;height:66vh;border:1px solid var(--line);border-radius:12px;background:#fff"></iframe>' });
      $('#tp-frame', d).srcdoc = r.html;
    });
  },

  async send(ids, gs) {
    await DB.flush();
    const r = await API.call('notifyTeachers', { evalIds: ids });
    if (r.demo) return UI.toast('Modo demo: no se envían correos.', 'info');
    const okTeachers = new Set(r.results.filter(x => x.sent).map(x => String(x.teacher).trim().toUpperCase()));
    const marks = (gs || []).filter(g => okTeachers.has(String(g.teacher).trim().toUpperCase())).flatMap(g => g.done.map(e => Act.op(e.id, { teacherNotifiedAt: new Date().toISOString(), returnedToTeacher: true, returnDate: e.returnDate || D.today() })));
    if (marks.length) DB.write(marks).catch(() => {});
    UI.notice({ type: 'success', title: 'Resultado del envío', html: `<ul class="list">${r.results.map(x => { const g = (gs || []).find(h => normP(h.teacher) === normP(x.teacher)); return `<li><span><b>${esc(titleCase(x.teacher))}</b> · ${x.count} prueba(s) para retirar${g ? `<br><small class="muted">${g.done.map(e => esc(fmtName(e.studentName)) + ' (' + esc(e.course) + ')').join(' · ')}</small>` : ''}${x.pending ? ` · ${x.pending} pendiente(s)` : ''}</span><span class="pill ${x.sent ? 'ok' : 'bad'}">${x.sent ? 'Enviado a ' + esc(x.to) : esc(x.reason || 'No enviado')}</span></li>`; }).join('')}</ul>` });
  },

  /** Historial completo por docente (rendidas, pendientes, otras) con envío por correo. */
  historyModal(only) {
    const by = {};
    DB.evaluations.filter(e => !isWithdrawn(e) && e.teacher).forEach(e => { const k = normP(e.teacher); (by[k] = by[k] || { teacher: e.teacher, done: 0, pend: 0, other: 0 })[e.status === ST.DONE ? 'done' : e.status === ST.PEND ? 'pend' : 'other']++; });
    const rows = Object.values(by).filter(g => !only || normP(g.teacher) === normP(only)).sort((a, b) => a.teacher.localeCompare(b.teacher, 'es')).map(g => { const u = DB.users.find(x => sameText(x.name, g.teacher)); return { ...g, email: (u && u.email) || '' }; });
    const con = rows.filter(r => r.email);
    const d = UI.modal({ title: '<i class="fa-solid fa-paper-plane" style="color:var(--brand)"></i> Enviar historial a cada docente', wide: true,
      body: `<div class="notice" style="margin-bottom:12px">Cada docente recibe por correo el resumen de <b>todas sus evaluaciones</b>: rendidas, pendientes y otras situaciones, con su nivel de rendición.</div>
        <div class="table-wrap" style="max-height:52vh"><table class="tbl"><thead><tr><th>Docente</th><th>Rendidas</th><th>Pendientes</th><th>Otras</th><th>Correo</th><th></th></tr></thead><tbody>
        ${rows.map((r, i) => `<tr><td><b>${esc(titleCase(r.teacher))}</b></td><td><span class="pill ok">${r.done}</span></td><td><span class="pill warn">${r.pend}</span></td><td>${r.other}</td>
          <td>${r.email ? esc(r.email) : '<span class="pill bad">Sin correo</span>'}</td><td style="white-space:nowrap"><button class="btn sm" data-prevh="${i}"><i class="fa-regular fa-eye"></i> Ver</button> ${r.email ? `<button class="btn sm" data-one="${i}"><i class="fa-solid fa-envelope"></i> Enviar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`,
      footer: `<button class="btn" data-no>Cerrar</button><button class="btn primary" data-all ${con.length ? '' : 'disabled'}><i class="fa-solid fa-paper-plane"></i> Enviar a ${con.length} docente(s)</button>` });
    const run = async (names, btn) => UI.busy(btn, async () => { await DB.flush(); const r = await API.call('notifyTeachers', { kind: 'history', teachers: names }); if (r.demo) return UI.toast('Modo demo: no se envían correos.', 'info'); UI.notice({ type: 'success', title: 'Resultado del envío', html: `<ul class="list">${r.results.map(x => `<li><span><b>${esc(titleCase(x.teacher))}</b></span><span class="pill ${x.sent ? 'ok' : 'bad'}">${x.sent ? 'Enviado a ' + esc(x.to) : esc(x.reason || 'No enviado')}</span></li>`).join('')}</ul>` }); });
    $('[data-no]', d).onclick = () => d.close();
    $('[data-all]', d).onclick = e => run(con.map(r => r.teacher), e.currentTarget);
    $$('[data-one]', d).forEach(b => b.onclick = e => run([rows[+b.dataset.one].teacher], e.currentTarget));
    $$('[data-prevh]', d).forEach(b => b.onclick = () => this.preview(rows[+b.dataset.prevh].teacher, [], b));
  },

  /** Confirma a qué docentes se enviará su lista de pendientes y la envía. */
  pendingSendModal(names) {
    const rows = names.map(n => { const g = this.fill({ teacher: n, done: [] }); return g; }).sort((a, b) => a.teacher.localeCompare(b.teacher, 'es'));
    if (!rows.length) return UI.toast('No hay docentes con pendientes en esta selección.', 'info');
    const con = rows.filter(g => g.email && g.pend.length), total = rows.reduce((n, g) => n + g.pend.length, 0);
    const d = UI.modal({ title: '<i class="fa-solid fa-envelope-circle-check" style="color:var(--brand)"></i> Enviar lista de pendientes a los docentes', wide: true,
      body: `<div class="notice warn" style="margin-bottom:12px"><b>${total}</b> evaluación(es) pendiente(s) en <b>${rows.length}</b> docente(s). Se enviará a cada uno solo la lista de lo suyo.</div>
        <div class="table-wrap" style="max-height:50vh"><table class="tbl"><thead><tr><th>Docente</th><th>Saludo</th><th>Pendientes</th><th>Recibirá el correo en</th></tr></thead><tbody>
        ${rows.map(g => { const u = DB.users.find(x => sameText(x.name, g.teacher)); return `<tr><td><b>${esc(titleCase(g.teacher))}</b></td><td><small>${esc(staffGreeting(u || { name: g.teacher }))}</small></td><td><span class="pill warn">${g.pend.length}</span><details><summary class="muted" style="cursor:pointer;font-size:.78rem">Ver lista</summary>${this.listHtml(g.pend)}</details></td><td>${g.email ? `<i class="fa-regular fa-envelope"></i> ${esc(g.email)}` : '<span class="pill bad">Sin correo registrado</span>'}</td></tr>`; }).join('')}</tbody></table></div>`,
      footer: `<button class="btn" data-no>No enviar</button><button class="btn" data-pdf><i class="fa-solid fa-file-pdf"></i> PDF por docente</button><button class="btn primary" data-send ${con.length ? '' : 'disabled'}><i class="fa-solid fa-paper-plane"></i> Enviar a ${con.length} docente(s)</button>` });
    $('[data-no]', d).onclick = () => d.close();
    $('[data-pdf]', d).onclick = () => PDF.delivery(rows);
    $('[data-send]', d).onclick = e => UI.busy(e.currentTarget, async () => {
      await DB.flush(); const r = await API.call('notifyTeachers', { kind: 'pending', teachers: con.map(g => g.teacher) });
      d.close(); if (r.demo) return UI.toast('Modo demo: no se envían correos.', 'info');
      UI.notice({ type: 'success', title: 'Resultado del envío', html: `<ul class="list">${r.results.map(x => `<li><span><b>${esc(titleCase(x.teacher))}</b> · ${x.pending} pendiente(s)</span><span class="pill ${x.sent ? 'ok' : 'bad'}">${x.sent ? 'Enviado a ' + esc(x.to) : esc(x.reason || 'No enviado')}</span></li>`).join('')}</ul>` });
    });
  },

  /** Envío manual de evaluaciones pendientes a los estudiantes, para las fechas que se elijan y cuando se quiera. */
  studentsModal() {
    const today = D.today(), validMail = x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x || '');
    const d = UI.modal({ title: '<i class="fa-solid fa-paper-plane" style="color:var(--brand)"></i> Enviar aviso de evaluaciones pendientes a los estudiantes', wide: true,
      body: `<div class="notice" style="margin-bottom:12px">Elija las <b>fechas de citación</b> que quiere avisar y envíelo cuando usted decida: no hace falta esperar al jueves. Cada estudiante recibe solo sus evaluaciones de ese rango.</div>
        <div class="chips" style="margin-bottom:12px">${[['hoy', 'Hoy'], ['manana', 'Mañana'], ['semana', 'Esta semana'], ['prox', 'Próxima semana'], ['7d', 'Próximos 7 días']].map(([k, l]) => `<button type="button" class="btn sm" data-p="${k}">${l}</button>`).join('')}</div>
        <div class="fgrid" style="margin-bottom:12px">
          <div class="field"><label>Citadas desde</label><input type="date" id="sm-from" value="${D.add(today, 1)}"></div>
          <div class="field"><label>Hasta</label><input type="date" id="sm-to" value="${D.add(today, 1)}"></div>
          <div class="field"><label>Ciclo</label><select id="sm-cy">${opts(CYCLES.map(c => c.name), '', 'Todos')}</select></div>
          <div class="field"><label>Curso</label><select id="sm-co">${opts(COURSES, '', 'Todos')}</select></div></div>
        <div id="sm-list"></div>`,
      footer: `<button class="btn" data-no>Cerrar</button><button class="btn primary" data-send disabled><i class="fa-solid fa-paper-plane"></i> Enviar</button>` });
    const $$d = s => [...d.querySelectorAll(s)], q = s => d.querySelector(s);
    const range = p => {
      const dow = D.parse(today).getDay(), mon = D.add(today, ((8 - dow) % 7) || 7);
      return { hoy: [today, today], manana: [D.add(today, 1), D.add(today, 1)], semana: [today, D.endWeek(today)], prox: [mon, D.add(mon, 6)], '7d': [today, D.add(today, 7)] }[p];
    };
    const groups = () => {
      const from = q('#sm-from').value, to = q('#sm-to').value, cy = q('#sm-cy').value, co = q('#sm-co').value, by = new Map();
      DB.evaluations.filter(e => e.status === ST.PEND && e.citationDate && e.citationDate >= from && e.citationDate <= to && !isWithdrawn(e) && (!cy || cycleOf(e.course) === cy) && (!co || e.course === co)).forEach(e => {
        const k = e.course + '||' + e.studentName; if (!by.has(k)) by.set(k, { key: k, name: e.studentName, course: e.course, list: [] }); by.get(k).list.push(e);
      });
      return [...by.values()].map(g => { const st = studentOf(g.name, g.course); g.mail = [studentEmail(st), st && st.guardianEmail].filter(validMail); return g; })
        .sort((a, b) => COURSES.indexOf(a.course) - COURSES.indexOf(b.course) || a.name.localeCompare(b.name, 'es'));
    };
    const updateBtn = () => { const n = $$d('.sm-cb:checked').length; const b = q('[data-send]'); b.disabled = !n; b.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Enviar a ${n} estudiante(s)`; };
    const render = () => {
      const from = q('#sm-from').value, to = q('#sm-to').value;
      if (!from || !to || to < from) { q('#sm-list').innerHTML = '<div class="notice warn">Indique un rango de fechas válido.</div>'; updateBtn(); return; }
      const g = groups(), total = g.reduce((n, x) => n + x.list.length, 0);
      q('#sm-list').innerHTML = g.length ? `<div class="notice ok" style="margin-bottom:10px"><b>${g.length}</b> estudiante(s) con <b>${total}</b> evaluación(es) citadas entre el <b>${D.fmt(from)}</b> y el <b>${D.fmt(to)}</b>. Desmarque a quien no quiera avisar.</div>
        <div class="table-wrap" style="max-height:40vh"><table class="tbl"><thead><tr><th style="width:34px"><input type="checkbox" id="sm-all" checked></th><th>Estudiante</th><th>Evaluaciones</th><th>Recibirá el correo en</th></tr></thead><tbody>
        ${g.map(x => `<tr><td><input type="checkbox" class="sm-cb" value="${esc(x.key)}" ${x.mail.length ? 'checked' : 'disabled'}></td><td><b>${esc(fmtName(x.name))}</b><br><small>${esc(x.course)}</small></td>
          <td>${x.list.map(e => `${subjBadge(e.subject)} <small>${D.fmt(e.citationDate)}</small>`).join('<br>')}</td>
          <td>${x.mail.length ? x.mail.map(m => `<i class="fa-regular fa-envelope"></i> ${esc(m)}`).join('<br>') : '<span class="pill bad">Sin correo</span> <small>Agregue el RUT del estudiante</small>'}</td></tr>`).join('')}</tbody></table></div>`
        : '<div class="empty"><i class="fa-regular fa-calendar-xmark"></i>No hay evaluaciones pendientes citadas en ese rango.</div>';
      const all = q('#sm-all'); if (all) all.onchange = e => { $$d('.sm-cb:not(:disabled)').forEach(c => c.checked = e.target.checked); updateBtn(); };
      $$d('.sm-cb').forEach(c => c.onchange = updateBtn); updateBtn();
    };
    $$d('[data-p]').forEach(b => b.onclick = () => { const [f, t2] = range(b.dataset.p); q('#sm-from').value = f; q('#sm-to').value = t2; render(); });
    ['#sm-from', '#sm-to', '#sm-co'].forEach(s => q(s).onchange = render);
    q('#sm-cy').onchange = () => { const c = q('#sm-cy').value; q('#sm-co').innerHTML = opts(c ? CYCLES.find(x => x.name === c).courses : COURSES, '', 'Todos'); render(); };
    q('[data-no]').onclick = () => d.close();
    q('[data-send]').onclick = e => UI.busy(e.currentTarget, async () => {
      const keys = $$d('.sm-cb:checked').map(c => c.value), from = q('#sm-from').value, to = q('#sm-to').value;
      if (!await UI.confirm('Confirmar envío', `Se enviará el aviso a <b>${keys.length}</b> estudiante(s) con sus evaluaciones citadas entre el <b>${D.fmt(from)}</b> y el <b>${D.fmt(to)}</b>.`, 'Enviar ahora')) return;
      await DB.flush();
      const r = await API.call('sendStudents', { from, to, keys });
      if (r.demo) return UI.toast('Modo demo: no se envían correos.', 'info');
      d.close();
      UI.notice({ type: r.noMail ? 'warn' : 'success', title: `Aviso enviado: ${r.sent} correo(s)${r.noMail ? ` · ${r.noMail} sin enviar` : ''}`,
        html: `<ul class="list">${r.results.map(x => `<li><span><b>${esc(fmtName(x.name))}</b> <small>${esc(x.course)} · ${x.count} evaluación(es)</small></span><span class="pill ${x.sent ? 'ok' : 'bad'}">${x.sent ? 'Enviado' : esc(x.reason || 'No enviado')}</span></li>`).join('')}</ul>` });
    });
    render();
  },
  /** Lista de lo que aún sigue pendiente, por docente. */
  pendingModal() {
    const gs = this.pendingGroups(), total = gs.reduce((n, g) => n + g.pend.length, 0);
    UI.modal({
      title: 'Evaluaciones que aún siguen pendientes', wide: true,
      body: `<div class="notice warn" style="margin-bottom:12px"><b>${total}</b> evaluación(es) pendientes en <b>${gs.length}</b> docente(s).</div>
        <div class="table-wrap" style="max-height:55vh"><table class="tbl"><thead><tr><th>Docente</th><th>Pendientes</th><th>Detalle</th></tr></thead><tbody>
        ${gs.map(g => `<tr><td><b>${esc(titleCase(g.teacher))}</b></td><td><span class="pill warn">${g.pend.length}</span></td><td>${this.listHtml(g.pend)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No hay pendientes.</td></tr>'}</tbody></table></div>`,
      footer: '<button class="btn" onclick="PDF.delivery(Delivery.pendingGroups())"><i class="fa-solid fa-file-pdf"></i> Descargar PDF por docente</button>'
    });
  }
};

/* Ficha de entrega: una hoja por docente con lo que se le devuelve, lo pendiente y firmas */
PDF.delivery = function (groups) {
  if (!groups.length) return UI.toast('No hay información para la ficha.', 'error');
  const doc = PDF.doc();
  groups.forEach((g, i) => {
    if (i) doc.addPage();
    PDF.header(doc, g.done.length ? 'FICHA DE ENTREGA DE PRUEBAS AL DOCENTE' : 'EVALUACIONES PENDIENTES DEL DOCENTE');
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.text(`Docente: ${titleCase(g.teacher)}`, PDF.M, 54);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text(`Fecha: ${D.fmt(D.today())}   |   Pruebas que se entregan: ${g.done.length}   |   Aún pendientes de rendir: ${g.pend.length}`, PDF.M, 60);
    let y = 64;
    if (g.done.length) {
      doc.autoTable({ head: [[{ content: `PRUEBAS QUE SE LE DEVUELVEN (${g.done.length})`, colSpan: 6, styles: { fillColor: [74, 154, 43] } }], ['N°', 'Curso', 'Estudiante', 'Asignatura', 'Contenido', 'Rindió']],
        body: g.done.map((e, k) => [k + 1, e.course, fmtName(e.studentName), e.subject, e.content || '-', D.fmt(e.completedDate || e.citationDate)]),
        startY: y, margin: { left: PDF.M, right: PDF.M }, theme: 'grid', headStyles: { fillColor: [15, 105, 196], textColor: 255 }, styles: { fontSize: 8, cellPadding: 2 }, columnStyles: { 0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 18 } } });
      y = doc.lastAutoTable.finalY + 8;
    }
    if (g.pend.length) {
      doc.autoTable({ head: [[{ content: `AÚN PENDIENTES DE RENDIR (${g.pend.length})`, colSpan: 5, styles: { fillColor: [224, 96, 13] } }], ['N°', 'Curso', 'Estudiante', 'Asignatura', 'Citación']],
        body: g.pend.map((e, k) => [k + 1, e.course, fmtName(e.studentName), e.subject, e.citationDate ? D.long(e.citationDate) : (isUtp(e) ? 'En UTP' : 'Sin fecha')]),
        startY: y, margin: { left: PDF.M, right: PDF.M }, theme: 'grid', headStyles: { fillColor: [15, 105, 196], textColor: 255 }, styles: { fontSize: 8, cellPadding: 2 }, columnStyles: { 0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 18 } } });
      y = doc.lastAutoTable.finalY + 8;
    }
    if (g.excl && g.excl.length) {
      doc.autoTable({ head: [[{ content: `NO SE DEBEN CONSIDERAR (${g.excl.length})`, colSpan: 5, styles: { fillColor: [122, 69, 229] } }], ['N°', 'Curso', 'Estudiante', 'Asignatura', 'Motivo']],
        body: g.excl.map((e, k) => [k + 1, e.course, fmtName(e.studentName), e.subject, (e.excludedReason || '') + (e.excludedNote ? ': ' + e.excludedNote : '')]),
        startY: y, margin: { left: PDF.M, right: PDF.M }, theme: 'grid', headStyles: { fillColor: [15, 105, 196], textColor: 255 }, styles: { fontSize: 8, cellPadding: 2 }, columnStyles: { 0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 18 } } });
      y = doc.lastAutoTable.finalY + 8;
    }
    const H = doc.internal.pageSize.height, W = doc.internal.pageSize.width, fy = Math.max(y + 18, H - 40);
    if (fy > H - 14) doc.addPage();
    const sy = fy > H - 14 ? 40 : fy;
    doc.text('______________________________', PDF.M + 4, sy); doc.text('Entrega (UTP / Coordinación)', PDF.M + 4, sy + 5);
    doc.text('______________________________', W - PDF.M - 70, sy); doc.text('Recibe conforme (docente)', W - PDF.M - 70, sy + 5);
  });
  doc.save(`Ficha_entrega_docentes_${D.today()}.pdf`);
};










