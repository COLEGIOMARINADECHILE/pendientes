/* ===== Estadística: rendición por docente, asignatura, curso y estudiantes críticos ===== */
const Stats = {
  f: { cycle: '', course: '', teacher: '' },

  mount(el) {
    el.innerHTML = `
      <div class="page-head"><div><h1>Estadística</h1><p>Porcentajes de rendición, pendientes y estudiantes que no rinden pese a agotar las oportunidades.</p></div>
        <div class="actions"><button class="btn" onclick="Stats.pdf()"><i class="fa-solid fa-file-pdf"></i> Descargar PDF</button></div></div>
      <div class="card toolbar">
        <div class="field"><label>Ciclo</label><select id="st-cycle">${opts(CYCLES.map(c => c.name), this.f.cycle, 'Todos')}</select></div>
        <div class="field"><label>Curso</label><select id="st-course"></select></div>
        <div class="field"><label>Docente</label><select id="st-teacher">${opts([...new Set(DB.evaluations.map(e => e.teacher).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')).map(t => [t, titleCase(t)]), this.f.teacher, 'Todos')}</select></div>
      </div>
      <div id="st-out" class="stack"></div>`;
    const fill = () => { const cs = this.f.cycle ? CYCLES.find(c => c.name === this.f.cycle).courses : COURSES; $('#st-course').innerHTML = opts(cs, this.f.course, 'Todos'); };
    fill();
    $('#st-cycle').onchange = e => { this.f.cycle = e.target.value; this.f.course = ''; fill(); this.refresh(); };
    $('#st-course').onchange = e => { this.f.course = e.target.value; this.refresh(); };
    $('#st-teacher').onchange = e => { this.f.teacher = e.target.value; this.refresh(); };
    this.refresh();
  },

  /* Evaluaciones que cuentan para el proceso (se excluyen cerradas por salud y plan) */
  data() {
    const f = this.f;
    return DB.evaluations.filter(e => !isWithdrawn(e) && [ST.DONE, ST.PEND, ST.FAIL].includes(e.status) && (!f.cycle || cycleOf(e.course) === f.cycle) && (!f.course || e.course === f.course) && (!f.teacher || sameText(e.teacher, f.teacher)));
  },
  exhausted: e => e.status === ST.FAIL || isUtp(e),

  agg(list, keyFn) {
    const m = {};
    list.forEach(e => {
      const k = keyFn(e) || 'SIN DATO', r = m[k] = m[k] || { key: k, total: 0, done: 0, pend: 0, ex: 0 };
      r.total++; if (e.status === ST.DONE) r.done++; else r.pend++;
      if (Stats.exhausted(e)) r.ex++;
    });
    return Object.values(m).map(r => ({ ...r, pct: r.total ? Math.round(r.done * 100 / r.total) : 0, pctEx: r.total ? Math.round(r.ex * 100 / r.total) : 0 }));
  },

  bar(p, color) { return `<div class="bar"><i style="width:${p}%;background:${color}"></i><span>${p}%</span></div>`; },

  table(title, icon, rows, keyLabel, fmtKey) {
    return `<div class="card"><h2><i class="fa-solid ${icon}"></i> ${title}</h2>
      <div class="table-wrap" style="margin-top:12px;max-height:420px"><table class="tbl"><thead><tr><th>${keyLabel}</th><th>Total</th><th>Rendidas</th><th>Pendientes</th><th style="min-width:170px">% rendición</th><th>Oport. agotadas</th><th style="min-width:130px">% sin rendir (agotadas)</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td><b>${fmtKey ? fmtKey(r.key) : esc(r.key)}</b></td><td>${r.total}</td><td>${r.done}</td><td>${r.pend}</td><td>${this.bar(r.pct, r.pct >= 70 ? 'var(--leaf)' : r.pct >= 40 ? 'var(--sun)' : 'var(--coral)')}</td><td>${r.ex}</td><td>${this.bar(r.pctEx, 'var(--utp)')}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Sin datos.</td></tr>'}
      </tbody></table></div></div>`;
  },

  compute() {
    const f = this.f, excl = DB.evaluations.filter(e => !isWithdrawn(e) && e.status === ST.EXCL && (!f.cycle || cycleOf(e.course) === f.cycle) && (!f.course || e.course === f.course) && (!f.teacher || sameText(e.teacher, f.teacher))).length;
    const l = this.data(), total = l.length, done = l.filter(e => e.status === ST.DONE).length;
    const pend = l.filter(e => e.status === ST.PEND).length, fail = l.filter(e => e.status === ST.FAIL).length, ex = l.filter(this.exhausted).length;
    const byTeacher = this.agg(l, e => titleCase(e.teacher)).sort((a, b) => b.pend - a.pend);
    const bySubject = this.agg(l, e => e.subject).sort((a, b) => b.pend - a.pend);
    const byCourse = this.agg(l, e => e.course).sort((a, b) => COURSES.indexOf(a.key) - COURSES.indexOf(b.key));
    const st = {};
    l.forEach(e => { const k = e.course + '||' + e.studentName, r = st[k] = st[k] || { name: e.studentName, course: e.course, pend: 0, total: 0, ex: 0, subj: [] }; r.total++; if (e.status === ST.PEND) r.pend++; if (Stats.exhausted(e)) { r.ex++; r.subj.push(e.subject); } });
    const students = Object.values(st);
    return { excl, l, total, done, pend, fail, ex, byTeacher, bySubject, byCourse,
      topPend: students.filter(s => s.pend).sort((a, b) => b.pend - a.pend || a.name.localeCompare(b.name, 'es')).slice(0, 15),
      stuEx: students.filter(s => s.ex).sort((a, b) => b.ex - a.ex || a.name.localeCompare(b.name, 'es')), nStudents: students.length };
  },

  refresh() {
    const s = this.compute(), pct = (a, b) => b ? Math.round(a * 100 / b) : 0;
    this.last = s;
    const kpi = (n, l, c) => `<div class="kpi" style="--c:var(${c});cursor:default"><b>${n}</b><span>${l}</span></div>`;
    $('#st-out').innerHTML = `
      <div class="kpis">${kpi(s.total, 'Evaluaciones consideradas', '--brand')}${kpi(pct(s.done, s.total) + '%', 'Nivel de rendición', '--ok')}${kpi(s.pend, 'Pendientes', '--sun')}
        ${kpi(s.ex + ' (' + pct(s.ex, s.total) + '%)', 'Sin rendir con oportunidades agotadas', '--utp')}${kpi(s.fail, 'Cerradas con nota 1.0', '--coral')}${kpi(s.excl, 'No consideradas (excluidas)', '--vio')}</div>
      <div class="card"><h2><i class="fa-solid fa-chart-column"></i> Nivel de rendición por curso</h2><div style="margin-top:14px;display:grid;gap:8px">
        ${s.byCourse.map(r => `<div style="display:grid;grid-template-columns:100px 1fr 90px;gap:10px;align-items:center"><b>${esc(r.key)}</b>${this.bar(r.pct, r.pct >= 70 ? 'var(--leaf)' : r.pct >= 40 ? 'var(--sun)' : 'var(--coral)')}<small>${r.done}/${r.total} rendidas</small></div>`).join('') || '<span class="muted">Sin datos.</span>'}</div></div>
      ${this.table('Por docente', 'fa-person-chalkboard', s.byTeacher, 'Docente')}
      ${this.table('Por asignatura', 'fa-book', s.bySubject, 'Asignatura', k => subjBadge(k))}
      <div class="card"><h2><i class="fa-solid fa-user-clock"></i> Estudiantes con más evaluaciones pendientes</h2>
        <div class="table-wrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>Estudiante</th><th>Curso</th><th>Pendientes</th><th>Total registradas</th></tr></thead><tbody>
        ${s.topPend.map(r => `<tr><td><b>${esc(fmtName(r.name))}</b></td><td>${esc(r.course)}</td><td><span class="pill ${r.pend >= 3 ? 'bad' : 'warn'}">${r.pend}</span></td><td>${r.total}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Sin pendientes.</td></tr>'}</tbody></table></div></div>
      <div class="card"><h2><i class="fa-solid fa-triangle-exclamation" style="color:var(--utp)"></i> Sin rendir pese a agotar las oportunidades</h2>
        <p class="muted">Estudiantes con evaluaciones en manos de UTP (más de 3 oportunidades) o cerradas con nota mínima. Afecta a <b>${s.stuEx.length}</b> de ${s.nStudents} estudiante(s) con registros (${pct(s.stuEx.length, s.nStudents)}%).</p>
        <div class="table-wrap" style="margin-top:12px;max-height:420px"><table class="tbl"><thead><tr><th>Estudiante</th><th>Curso</th><th>Evaluaciones</th><th>Asignaturas</th></tr></thead><tbody>
        ${s.stuEx.map(r => `<tr class="st-utp"><td><b>${esc(fmtName(r.name))}</b></td><td>${esc(r.course)}</td><td><span class="pill utp">${r.ex}</span></td><td>${[...new Set(r.subj)].map(subjBadge).join(' ')}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Ningún estudiante en esta situación.</td></tr>'}</tbody></table></div></div>`;
  },

  pdf() {
    const s = this.last || this.compute(), doc = PDF.doc();
    PDF.header(doc, 'ESTADÍSTICA DE EVALUACIONES PENDIENTES', this.f.course || this.f.cycle || null);
    if (this.f.teacher) doc.text(`Docente: ${titleCase(this.f.teacher)}`, PDF.M, 47);
    doc.text(`${this.f.course || this.f.cycle || 'Todos los ciclos'}  |  Consideradas: ${s.total}  |  Rendición: ${s.total ? Math.round(s.done * 100 / s.total) : 0}%  |  Oportunidades agotadas: ${s.ex}  |  Emitido: ${D.fmt(D.today())}`, PDF.M, 50);
    let y = 55;
    const t = (title, head, rows) => { doc.autoTable({ head: [[{ content: title, colSpan: head.length, styles: { fillColor: [10, 79, 158] } }], head], body: rows, startY: y, margin: { left: PDF.M, right: PDF.M }, theme: 'grid', headStyles: { fillColor: [15, 105, 196], textColor: 255 }, styles: { fontSize: 7.6, cellPadding: 2 } }); y = doc.lastAutoTable.finalY + 8; };
    const ag = r => [r.key, r.total, r.done, r.pend, r.pct + '%', r.ex, r.pctEx + '%'], H = k => [k, 'Total', 'Rendidas', 'Pendientes', '% rendición', 'Oport. agotadas', '% sin rendir'];
    t('Por docente', H('Docente'), s.byTeacher.map(ag)); t('Por asignatura', H('Asignatura'), s.bySubject.map(ag)); t('Por curso', H('Curso'), s.byCourse.map(ag));
    t('Estudiantes con más pendientes', ['Estudiante', 'Curso', 'Pendientes', 'Total'], s.topPend.map(r => [fmtName(r.name), r.course, r.pend, r.total]));
    t('Sin rendir pese a oportunidades agotadas', ['Estudiante', 'Curso', 'Evaluaciones', 'Asignaturas'], s.stuEx.map(r => [fmtName(r.name), r.course, r.ex, [...new Set(r.subj)].join(', ')]));
    doc.save(`Estadistica_${D.today()}.pdf`);
  }
};



