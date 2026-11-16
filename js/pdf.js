/* ===== Documentos PDF: listados, nóminas de firmas y cartas a las familias ===== */
const PDF = {
  M: 20,
  doc: o => new window.jspdf.jsPDF({ format: 'letter', unit: 'mm', orientation: o || 'portrait' }),

  header(doc, title, scope) {
    const W = doc.internal.pageSize.width, c = scope ? Cfg.coord(scope) : null;
    if (Brand.logo) {
      try { const p = doc.getImageProperties(Brand.logo), r = Math.min(28 / p.width, 22 / p.height); doc.addImage(Brand.logo, p.fileType || 'PNG', PDF.M, 12, p.width * r, p.height * r); } catch (e) {}
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Colegio Marina de Chile', W - PDF.M, 16, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.text(c ? c.title : 'Coordinación Académica', W - PDF.M, 21, { align: 'right' }); doc.text('SLEP Andalién Sur', W - PDF.M, 26, { align: 'right' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(title, W / 2, 42, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  },

  signature(doc, scope, x, y) {
    const c = Cfg.coord(scope);
    doc.text('__________________________________', x, y);
    if (c.name) { doc.setFont('helvetica', 'bold'); doc.text(c.name, x + 8, y + 5); doc.setFont('helvetica', 'normal'); doc.text(c.title, x + 8, y + 10); }
    else doc.text(c.title, x + 8, y + 5);
  },

  out(doc, name, mode) { if (mode === 'print') { doc.autoPrint(); window.open(doc.output('bloburl'), '_blank'); } else doc.save(name); },

  /** Tabla agrupada por ciclo y curso. */
  grouped(doc, y, head, evals, rowFn, color, widths) {
    const body = [], n = head.length;
    groupByCycleCourse(evals).forEach(g => {
      body.push([{ content: g.cycle.toUpperCase(), colSpan: n, styles: { fillColor: color, textColor: 255, fontStyle: 'bold' } }]);
      g.courses.forEach(c => {
        body.push([{ content: `Curso ${c.course} · ${c.list.length}`, colSpan: n, styles: { fillColor: [238, 243, 253], textColor: [36, 72, 189], fontStyle: 'bold' } }]);
        c.list.sort((a, b) => a.studentName.localeCompare(b.studentName, 'es') || (a.subject || '').localeCompare(b.subject || '', 'es')).forEach((e, i) => body.push(rowFn(e, i)));
      });
    });
    doc.autoTable({ head: [head], body, startY: y, margin: { left: PDF.M, right: PDF.M }, theme: 'grid', headStyles: { fillColor: color, textColor: 255 }, styles: { font: 'helvetica', fontSize: 7.6, cellPadding: 2, valign: 'middle', minCellHeight: 8 }, columnStyles: widths || {} });
  },

  citation: e => e.citationDate ? `${D.fmt(e.citationDate)} ${/^\d\d:\d\d$/.test(e.citationTime || '') ? e.citationTime : ''}`.trim() : (isUtp(e) ? 'A definir por UTP' : 'Por agendar'),

  /** Tabla agrupada por curso, en hoja vertical: cada curso es una franja dentro de la misma tabla. */
  courseBands(doc, y, head, evals, rowFn, color, cols, fontSize) {
    const body = [], n = head.length, by = {};
    evals.forEach(e => (by[e.course] = by[e.course] || []).push(e));
    Object.keys(by).sort((a, b) => COURSES.indexOf(a) - COURSES.indexOf(b)).forEach(c => {
      const l = by[c].sort((a, b) => a.studentName.localeCompare(b.studentName, 'es') || (a.subject || '').localeCompare(b.subject || '', 'es'));
      body.push([{ content: `CURSO ${c}  ·  ${new Set(l.map(e => e.studentName)).size} estudiante(s)  ·  ${l.length} evaluación(es)`, colSpan: n, styles: { fillColor: [232, 241, 251], textColor: [10, 79, 158], fontStyle: 'bold', fontSize: fontSize + 1, minCellHeight: 7 } }]);
      l.forEach((e, i) => body.push(rowFn(e, i)));
    });
    doc.autoTable({ head: [head], body, startY: y, margin: { left: 15, right: 15 }, theme: 'grid', headStyles: { fillColor: color, textColor: 255 }, styles: { font: 'helvetica', fontSize, cellPadding: 1.8, valign: 'middle', minCellHeight: 9 }, columnStyles: cols, rowPageBreak: 'avoid' });
    return doc.lastAutoTable.finalY;
  },

  pending(evals, meta, mode) {
    const doc = PDF.doc(); PDF.header(doc, 'EVALUACIONES PENDIENTES', meta.scope);
    doc.text(`${meta.text}  |  Total: ${evals.length}  |  Emitido: ${D.fmt(D.today())}`, 15, 50);
    PDF.courseBands(doc, 54, ['N°', 'Estudiante', 'Asignatura', 'Contenido', 'Docente', 'Citación', 'Op.'], evals,
      (e, i) => [i + 1, fmtName(e.studentName), e.subject, e.content || '-', titleCase(e.teacher), PDF.citation(e) + (e.room ? '\n' + e.room : ''), isUtp(e) ? 'UTP' : `${attempt(e)}ª`],
      [15, 105, 196], { 0: { cellWidth: 7, halign: 'center' }, 1: { cellWidth: 36, fontStyle: 'bold' }, 2: { cellWidth: 24 }, 5: { cellWidth: 25 }, 6: { cellWidth: 9, halign: 'center' } }, 7);
    PDF.out(doc, `Pendientes_${D.today()}.pdf`, mode);
  },

  /** Lista de firmas en hoja vertical. split=true: cursos separados por franjas en la misma hoja, alfabético dentro de cada curso. */
  attendance(evals, meta, mode) {
    const doc = PDF.doc(), W = doc.internal.pageSize.width;
    PDF.header(doc, 'LISTA DE ASISTENCIA Y FIRMAS' + (meta.course ? ' - ' + meta.course : ''), meta.scope);
    doc.text(`${meta.text}  |  ${new Set(evals.map(e => e.course + e.studentName)).size} estudiante(s) · ${evals.length} evaluación(es)`, 15, 50);
    const cols = { 0: { cellWidth: 7, halign: 'center' }, 1: { cellWidth: 44, fontStyle: 'bold' }, 2: { cellWidth: 28 }, 4: { cellWidth: 26 }, 5: { cellWidth: 36 } };
    let y;
    if (meta.split !== false) {
      y = PDF.courseBands(doc, 54, ['N°', 'Estudiante', 'Asignatura', 'Docente', 'Fecha · Sala', 'Firma'], evals,
        (e, i) => [i + 1, fmtName(e.studentName), e.subject, titleCase(e.teacher), PDF.citation(e) + '\n' + (e.room || 'Sala por asignar'), ''], [15, 105, 196], cols, 7.6);
    } else {
      const sorted = [...evals].sort((a, b) => COURSES.indexOf(a.course) - COURSES.indexOf(b.course) || a.studentName.localeCompare(b.studentName, 'es') || (a.subject || '').localeCompare(b.subject || '', 'es'));
      doc.autoTable({ head: [['N°', 'Curso · Estudiante', 'Asignatura', 'Docente', 'Fecha · Sala', 'Firma']], body: sorted.map((e, i) => [i + 1, `${e.course} · ${fmtName(e.studentName)}`, e.subject, titleCase(e.teacher), PDF.citation(e) + '\n' + (e.room || 'Sala por asignar'), '']),
        startY: 54, margin: { left: 15, right: 15 }, theme: 'grid', headStyles: { fillColor: [15, 105, 196], textColor: 255 }, styles: { font: 'helvetica', fontSize: 7.6, cellPadding: 1.8, valign: 'middle', minCellHeight: 9 }, columnStyles: cols });
      y = doc.lastAutoTable.finalY;
    }
    y = Math.min(y + 14, doc.internal.pageSize.height - 14);
    doc.text('________________________________', W - 15 - 70, y); doc.text('Firma docente / asistente a cargo', W - 15 - 70, y + 5);
    PDF.out(doc, `Lista_Firmas_${D.today()}.pdf`, mode);
  },

  /** Nómina por sala (hoja vertical): una página por sala, cursos como franjas. */
  rooms(dist, cycle, date, order, mode) {
    const doc = PDF.doc(), salas = {}, W = doc.internal.pageSize.width;
    dist.forEach(e => (salas[e.room || 'Por asignar'] = salas[e.room || 'Por asignar'] || []).push(e));
    Object.keys(salas).sort((a, b) => a.localeCompare(b, 'es', { numeric: true })).forEach((r, idx) => {
      if (idx) doc.addPage();
      PDF.header(doc, `NÓMINA DE RENDICIÓN - ${r.toUpperCase()}`, cycle);
      const list = salas[r];
      doc.text(`${cycle}  |  ${D.long(date)}  |  ${new Set(list.map(e => e.studentName + e.course)).size} estudiante(s) · ${list.length} evaluación(es)`, 15, 50);
      let y;
      const cols = { 0: { cellWidth: 7, halign: 'center' }, 1: { cellWidth: 44, fontStyle: 'bold' }, 2: { cellWidth: 30 }, 4: { cellWidth: 12 }, 5: { cellWidth: 38 } };
      if (order === 'docente') {
        const by = {}; list.forEach(e => (by[e.teacher || 'SIN DOCENTE'] = by[e.teacher || 'SIN DOCENTE'] || []).push(e));
        const body = [];
        Object.keys(by).sort((a, b) => a.localeCompare(b, 'es')).forEach(t => {
          body.push([{ content: `${titleCase(t).toUpperCase()}  ·  ${by[t].length}`, colSpan: 6, styles: { fillColor: [232, 241, 251], textColor: [10, 79, 158], fontStyle: 'bold' } }]);
          by[t].sort((a, b) => a.course.localeCompare(b.course, 'es', { numeric: true }) || a.studentName.localeCompare(b.studentName, 'es')).forEach((e, i) => body.push([i + 1, `${e.course} · ${fmtName(e.studentName)}`, e.subject, titleCase(e.teacher), e.citationTime || '', '']));
        });
        doc.autoTable({ head: [['N°', 'Curso · Estudiante', 'Asignatura', 'Docente', 'Hora', 'Firma']], body, startY: 54, margin: { left: 15, right: 15 }, theme: 'grid', headStyles: { fillColor: [74, 105, 132], textColor: 255 }, styles: { font: 'helvetica', fontSize: 7.6, cellPadding: 1.8, valign: 'middle', minCellHeight: 10 }, columnStyles: cols, rowPageBreak: 'avoid' });
        y = doc.lastAutoTable.finalY;
      } else {
        y = PDF.courseBands(doc, 54, ['N°', 'Estudiante', 'Asignatura', 'Docente', 'Hora', 'Firma'], list,
          (e, i) => [i + 1, fmtName(e.studentName), e.subject, titleCase(e.teacher), e.citationTime || '', ''], [74, 105, 132], cols, 7.6);
      }
      y = Math.min(y + 12, doc.internal.pageSize.height - 14);
      doc.text('________________________________', W - 15 - 70, y); doc.text('Firma docente / asistente a cargo de la sala', W - 15 - 70, y + 5);
    });
    PDF.out(doc, `Nomina_Salas_${date}.pdf`, mode);
  },

  /** Cartas a las familias (una página por estudiante). */
  letters(evals, mode) {
    const by = {};
    evals.forEach(e => (by[e.course + '||' + e.studentName] = by[e.course + '||' + e.studentName] || []).push(e));
    const keys = Object.keys(by).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
    const doc = PDF.doc();
    keys.forEach((k, i) => { if (i) doc.addPage(); const l = by[k]; PDF.letter(doc, l[0].studentName, l[0].course, l, PDF.fitScale(l[0].studentName, l[0].course, l)); });
    PDF.out(doc, `Cartas_Citacion_${D.today()}.pdf`, mode);
    return keys.length;
  },

  /** Dibuja la carta en UNA hoja con la escala indicada. Devuelve true si todo cabe antes de la firma. */
  letter(doc, name, course, evals, sc = 1) {
    const W = doc.internal.pageSize.width, wide = W - PDF.M * 2, H = doc.internal.pageSize.height;
    PDF.header(doc, 'COMUNICACIÓN DE EVALUACIONES PENDIENTES', course);
    const st = studentOf(name, course), g = st ? st.gender : 'O';
    const el = g === 'M' ? 'el' : g === 'F' ? 'la' : 'el/la', del = g === 'M' ? 'del' : g === 'F' ? 'de la' : 'del/de la', pup = g === 'M' ? 'su pupilo' : g === 'F' ? 'su pupila' : 'su pupilo/a';
    let y = 54;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11 * sc); doc.text(`Estimada familia ${del} estudiante: ${fmtName(name)} (${course})`, PDF.M, y); y += 8 * sc;
    const intro = `Junto con saludarles, les escribimos para invitarles a seguir acompañando el proceso educativo de ${pup}. En concordancia con la Ley General de Educación (Ley 20.370, Art. 4) y el Decreto 67 sobre evaluación, les comunicamos que ${el} estudiante debe presentarse a rendir las siguientes evaluaciones pendientes para resguardar su trayectoria educativa:`;
    const t1 = doc.splitTextToSize(intro, wide); doc.text(t1, PDF.M, y); y += t1.length * 5 * sc + 3;

    doc.autoTable({
      head: [['Asignatura', 'Docente', 'Instrumento', 'Contenido', 'Fecha', 'Hora', 'Sala', 'Oport.']],
      body: evals.map(e => [e.subject, titleCase(e.teacher), e.instrumentType || '-', e.content || '-', e.citationDate ? D.long(e.citationDate) : 'Por definir', /^\d\d:\d\d$/.test(e.citationTime || '') ? e.citationTime : (e.citationTime || '-'), e.room || 'Por asignar', isUtp(e) ? 'UTP' : `${attempt(e)}ª de 3`]),
      startY: y, margin: { left: PDF.M, right: PDF.M }, theme: 'grid', headStyles: { fillColor: [15, 105, 196] }, styles: { fontSize: 8 * sc, cellPadding: 1.8 * sc },
      columnStyles: { 6: { fontStyle: 'bold' }, 7: { fontStyle: 'bold', halign: 'center' } }
    });
    y = doc.lastAutoTable.finalY + 6;

    const ultima = evals.some(e => attempt(e) === 3 && !isUtp(e)), utp = evals.some(isUtp), c = Cfg.coord(course);
    let aviso = `${el[0].toUpperCase() + el.slice(1)} estudiante debe presentarse en la sala, fecha y hora indicadas. Se dispone de tres citaciones enviadas al hogar; la columna "Oport." señala en cuál va cada evaluación.`;
    if (ultima) aviso += ' Hay evaluaciones en su 3ª y ÚLTIMA citación: de no asistir, pasarán a ser aplicadas por la Unidad Técnica Pedagógica dentro del horario de clases, sin nueva citación al hogar.';
    if (utp) aviso += ' Las evaluaciones marcadas "UTP" ya agotaron las citaciones al hogar: las aplica la Unidad Técnica Pedagógica en el día y hora que ella determine. Es muy importante que el/la estudiante asista regularmente a clases.';
    if (c.email) aviso += `\n\nAnte cualquier duda escriba a ${c.email} (${c.title}${c.name ? ', ' + titleCase(c.name) : ''}).`;
    doc.setFontSize(9 * sc); const lines = doc.splitTextToSize(aviso, wide - 14), alto = lines.length * 4.4 * sc + 14 * sc;
    const hot = ultima || utp;
    doc.setFillColor(...(hot ? [255, 244, 235] : [232, 241, 251])); doc.setDrawColor(...(hot ? [224, 96, 13] : [15, 105, 196])); doc.setLineWidth(.7);
    doc.roundedRect(PDF.M, y, wide, alto, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5 * sc); doc.setTextColor(...(hot ? [154, 52, 18] : [10, 79, 158]));
    doc.text(utp ? 'IMPORTANTE: EVALUACIONES A CARGO DE UTP' : ultima ? 'IMPORTANTE: ÚLTIMA CITACIÓN ENVIADA AL HOGAR' : 'IMPORTANTE: SALA Y NÚMERO DE OPORTUNIDAD', PDF.M + 7, y + 6 * sc + .5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9 * sc); doc.setTextColor(0); doc.text(lines, PDF.M + 7, y + 11.5 * sc + .5); doc.setLineWidth(.2);

    const fy = H - 30; doc.setFontSize(10);
    doc.text('__________________________________', PDF.M + 4, fy); doc.text('Firma Apoderado / Toma de conocimiento', PDF.M + 4, fy + 5);
    PDF.signature(doc, course, W - PDF.M - 68, fy);
    return y + alto <= fy - 8;
  },

  /** Busca la escala más grande con la que la carta cabe en una sola hoja. */
  fitScale(name, course, evals) {
    for (const sc of [1, .92, .84, .76, .68, .6, .52, .45]) {
      const t = PDF.doc();
      if (PDF.letter(t, name, course, evals, sc) && t.getNumberOfPages() === 1) return sc;
    }
    return .45;
  },
  /** Tabla simple para cualquier listado. */
  table(title, head, rows, mode, name, orient) {
    const doc = PDF.doc(orient || 'portrait'); PDF.header(doc, title);
    doc.text(`Total: ${rows.length}  |  Emitido: ${D.fmt(D.today())}`, PDF.M, 50);
    doc.autoTable({ head: [head], body: rows, startY: 54, margin: { left: PDF.M, right: PDF.M }, theme: 'grid', headStyles: { fillColor: [52, 97, 232], textColor: 255 }, styles: { font: 'helvetica', fontSize: 7.6, cellPadding: 2, valign: 'middle' } });
    PDF.out(doc, name, mode);
  },

  failLetter(ev) {
    const doc = PDF.doc(); PDF.header(doc, 'RESOLUCIÓN DE CIERRE DE PROCESO EVALUATIVO', ev.course);
    const st = studentOf(ev.studentName, ev.course), g = st ? st.gender : 'O';
    const el = g === 'M' ? 'el' : g === 'F' ? 'la' : 'el/la', del = g === 'M' ? 'del' : g === 'F' ? 'de la' : 'del/de la';
    const W = doc.internal.pageSize.width, wide = W - PDF.M * 2; let y = 56;
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(`Estimada familia ${del} estudiante: ${fmtName(ev.studentName)}${st && st.rut ? ' - RUT: ' + st.rut : ''}`, PDF.M, y); y += 5; doc.text(`Curso: ${ev.course}`, PDF.M, y); y += 9;
    doc.setFont('helvetica', 'normal');
    const t1 = doc.splitTextToSize(`Junto con saludar, les informamos que ${el} estudiante fue citado en todas las oportunidades establecidas sin presentarse, pese a las comunicaciones y llamados realizados al hogar, y no existe justificativo médico o de fuerza mayor formalizado que respalde sus inasistencias a la evaluación siguiente:`, wide);
    doc.text(t1, PDF.M, y); y += t1.length * 4.6 + 3;
    doc.autoTable({ body: [['Asignatura', ev.subject], ['Docente', titleCase(ev.teacher)], ['Contenido', ev.content || '-'], ['Instrumento', ev.instrumentType || '-'], ['Inasistencia original', D.fmt(ev.absenceDate)]], startY: y, margin: { left: PDF.M, right: PDF.M }, theme: 'grid', styles: { fontSize: 10 }, columnStyles: { 0: { fontStyle: 'bold', fillColor: [240, 244, 248], cellWidth: 45 } } });
    y = doc.lastAutoTable.finalY + 8;
    const t2 = doc.splitTextToSize('Conforme al Decreto 67 de Evaluación y al Reglamento Interno de Evaluación, se procede al cierre de este proceso calificando con nota mínima (1.0).', wide);
    doc.setFont('helvetica', 'bold'); doc.text(t2, PDF.M, y);
    const fy = doc.internal.pageSize.height - 35; doc.setFont('helvetica', 'normal');
    doc.text('__________________________________', PDF.M + 4, fy); doc.text('Firma Apoderado / Toma conocimiento', PDF.M + 4, fy + 5);
    PDF.signature(doc, ev.course, W - PDF.M - 68, fy);
    doc.save(`Cierre_${ev.studentName.replace(/ /g, '_')}.pdf`);
  }
};



