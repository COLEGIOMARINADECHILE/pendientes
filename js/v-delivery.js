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
        <div class="table-wrap" style="max-height:52vh"><table class="tbl"><thead><tr><th>Docente</th><th>Pruebas que se le devuelven</th><th>Aún pendientes de rendir</th><th>Recibirá el correo en</th></tr></thead><tbody>
        ${gs.map(g => `<tr><td><b>${esc(titleCase(g.teacher))}</b></td>
          <td><span class="pill ok">${g.done.length}</span><details><summary class="muted" style="cursor:pointer;font-size:.78rem">Ver de quiénes</summary>${this.listHtml(g.done)}</details></td>
          <td>${g.pend.length ? `<span class="pill warn">${g.pend.length}</span><details><summary class="muted" style="cursor:pointer;font-size:.78rem">Ver lista</summary>${this.listHtml(g.pend)}</details>` : '<span class="pill ok">Ninguna</span>'}</td>
          <td>${g.email ? `<i class="fa-regular fa-envelope"></i> ${esc(g.email)}` : '<span class="pill bad">Sin correo registrado</span><br><small>Agréguelo en Administración → Usuarios</small>'}</td></tr>`).join('')}
        </tbody></table></div>`,
      footer: `<button class="btn" data-no>No enviar</button><button class="btn" data-pdf><i class="fa-solid fa-file-pdf"></i> Fichas de entrega (PDF)</button>
        <button class="btn primary" data-send ${con.length ? '' : 'disabled'}><i class="fa-solid fa-paper-plane"></i> Enviar correo a ${con.length} docente(s)</button>`
    });
    $('[data-no]', d).onclick = () => d.close();
    $('[data-pdf]', d).onclick = () => PDF.delivery(gs);
    $('[data-send]', d).onclick = e => UI.busy(e.currentTarget, async () => { await this.send(ids, gs); d.close(); });
  },

  async send(ids, gs) {
    await DB.flush();
    const r = await API.call('notifyTeachers', { evalIds: ids });
    if (r.demo) return UI.toast('Modo demo: no se envían correos.', 'info');
    const okTeachers = new Set(r.results.filter(x => x.sent).map(x => String(x.teacher).trim().toUpperCase()));
    const marks = (gs || []).filter(g => okTeachers.has(String(g.teacher).trim().toUpperCase())).flatMap(g => g.done.map(e => Act.op(e.id, { teacherNotifiedAt: new Date().toISOString() })));
    if (marks.length) DB.write(marks).catch(() => {});
    UI.modal({ title: 'Resultado del envío', body: `<ul class="list">${r.results.map(x => `<li><span><b>${esc(titleCase(x.teacher))}</b> · ${x.count} prueba(s)${x.pending ? ` · ${x.pending} pendiente(s)` : ''}</span><span class="pill ${x.sent ? 'ok' : 'bad'}">${x.sent ? 'Enviado a ' + esc(x.to) : esc(x.reason || 'No enviado')}</span></li>`).join('')}</ul>` });
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
          <td>${r.email ? esc(r.email) : '<span class="pill bad">Sin correo</span>'}</td><td>${r.email ? `<button class="btn sm" data-one="${i}"><i class="fa-solid fa-envelope"></i> Enviar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`,
      footer: `<button class="btn" data-no>Cerrar</button><button class="btn primary" data-all ${con.length ? '' : 'disabled'}><i class="fa-solid fa-paper-plane"></i> Enviar a ${con.length} docente(s)</button>` });
    const run = async (names, btn) => UI.busy(btn, async () => { await DB.flush(); const r = await API.call('notifyTeachers', { kind: 'history', teachers: names }); if (r.demo) return UI.toast('Modo demo: no se envían correos.', 'info'); UI.modal({ title: 'Resultado del envío', body: `<ul class="list">${r.results.map(x => `<li><span><b>${esc(titleCase(x.teacher))}</b></span><span class="pill ${x.sent ? 'ok' : 'bad'}">${x.sent ? 'Enviado a ' + esc(x.to) : esc(x.reason || 'No enviado')}</span></li>`).join('')}</ul>` }); });
    $('[data-no]', d).onclick = () => d.close();
    $('[data-all]', d).onclick = e => run(con.map(r => r.teacher), e.currentTarget);
    $$('[data-one]', d).forEach(b => b.onclick = e => run([rows[+b.dataset.one].teacher], e.currentTarget));
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
      UI.modal({ title: 'Resultado del envío', body: `<ul class="list">${r.results.map(x => `<li><span><b>${esc(titleCase(x.teacher))}</b> · ${x.pending} pendiente(s)</span><span class="pill ${x.sent ? 'ok' : 'bad'}">${x.sent ? 'Enviado a ' + esc(x.to) : esc(x.reason || 'No enviado')}</span></li>`).join('')}</ul>` });
    });
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
    const H = doc.internal.pageSize.height, W = doc.internal.pageSize.width, fy = Math.max(y + 18, H - 40);
    if (fy > H - 14) doc.addPage();
    const sy = fy > H - 14 ? 40 : fy;
    doc.text('______________________________', PDF.M + 4, sy); doc.text('Entrega (UTP / Coordinación)', PDF.M + 4, sy + 5);
    doc.text('______________________________', W - PDF.M - 70, sy); doc.text('Recibe conforme (docente)', W - PDF.M - 70, sy + 5);
  });
  doc.save(`Ficha_entrega_docentes_${D.today()}.pdf`);
};





