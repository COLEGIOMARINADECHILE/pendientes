/* ===== Administración: calendario, usuarios, asignaturas, imagen y datos ===== */
const Admin = {
  tab: 'calendar',
  mount(el) {
    el.innerHTML = `
      <div class="page-head"><div><h1>Administración</h1><p>Toda la configuración del sistema en un solo lugar.</p></div></div>
      <div class="subtabs">${[['calendar', 'Calendario y salas'], ['users', 'Usuarios'], ['subjects', 'Asignaturas'], ['brand', 'Imagen'], ['data', 'Datos y respaldo']].map(([k, l]) => `<button data-t="${k}" class="${this.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div id="ad-body"></div>`;
    $$('.subtabs button', el).forEach(b => b.onclick = () => { this.tab = b.dataset.t; this.mount(el); });
    this[this.tab]($('#ad-body'));
  },

  /* ---------- Calendario, salas, coordinación y días bloqueados ---------- */
  calendar(el) {
    const c = DB.config, r = Cfg.rule, bl = [...Cfg.blocked].sort((a, b) => a.start.localeCompare(b.start));
    el.innerHTML = `
      <div class="card"><h2><i class="fa-solid fa-sliders"></i> Reglas generales</h2>
        <div class="fgrid" style="margin-top:14px">
          <div class="field"><label>Máximo de evaluaciones por día (por estudiante)</label><input type="number" id="c-max" min="1" max="10" value="${Cfg.max}"></div>
          <div class="field"><label>Anticipación para registrar</label><select id="c-rule">${opts([['si', 'Activa'], ['no', 'Desactivada']], r.enabled ? 'si' : 'no')}</select></div>
          <div class="field"><label>Días hábiles de anticipación</label><input type="number" id="c-days" min="0" max="15" value="${r.days}"></div>
          <div class="field"><label>Hora de corte</label><input type="time" id="c-cut" value="${r.cutoff}"></div></div>
        <small>Si un docente registra pasada la hora de corte, la rendición se corre al siguiente día oficial.</small></div>
      ${CYCLES.map(cy => {
        const s = (c.cycleSchedules || {})[cy.name] || {}, co = (c.coordinators || {})[cy.name] || {}, media = cy.name === 'Enseñanza Media';
        return `<div class="card" data-cy="${cy.name}"><h2><i class="fa-solid fa-layer-group"></i> ${cy.name}</h2>
          <div class="fgrid" style="margin-top:14px">
            <div class="field"><label>Día oficial de rendición</label><select class="cy-wd">${opts(WEEKDAYS.map((n, i) => [i, n]), s.weekday != null ? s.weekday : DEFAULT_WD)}</select></div>
            <div class="field"><label>Horario oficial</label><input type="time" class="cy-time" value="${s.time || DEFAULT_TIME}"></div>
            ${media ? `<div class="field"><label class="check"><input type="checkbox" class="cy-2on" ${s.secondDayEnabled ? 'checked' : ''}> Segundo día de rendición</label><div style="display:flex;gap:6px"><select class="cy-wd2">${opts(WEEKDAYS.map((n, i) => [i, n]), s.weekday2 != null ? s.weekday2 : 2)}</select><input type="time" class="cy-time2" value="${s.time2 || s.time || DEFAULT_TIME}"></div></div>` : ''}
            <div class="field full"><label>Salas disponibles (una por línea)</label><textarea class="cy-rooms" style="min-height:90px">${esc(Cfg.rooms(cy.name).join('\n'))}</textarea><small>Ej. "Sala 12", "Laboratorio". Los estudiantes se reparten entre estas salas.</small></div>
            <div class="field"><label>Coordinador/a</label><input class="co-name" value="${esc(co.name || '')}" placeholder="Nombre y apellido"></div>
            <div class="field"><label>Cargo en las cartas</label><input class="co-title" value="${esc(co.title || 'Coordinación ' + cy.name)}"></div>
            <div class="field"><label>Correo para las familias</label><input type="email" class="co-mail" value="${esc(co.email || '')}"></div></div></div>`;
      }).join('')}
      <div style="display:flex;justify-content:flex-end;margin:16px 0"><button class="btn primary" onclick="Admin.saveCalendar(this)"><i class="fa-solid fa-floppy-disk"></i> Guardar calendario, salas y coordinación</button></div>
      <div class="card"><h2><i class="fa-solid fa-calendar-xmark" style="color:var(--bad)"></i> Días bloqueados</h2>
        <p class="muted">Feriados, jornadas u otros motivos: esos días no se pueden usar para rendir.</p>
        <div class="fgrid"><div class="field"><label>Desde</label><input type="date" id="b-from"></div><div class="field"><label>Hasta (opcional)</label><input type="date" id="b-to"></div>
          <div class="field"><label>Motivo</label><input id="b-why" placeholder="Feriado, jornada de reflexión…"></div>
          <div class="field"><label>Aplica a</label><select id="b-cy">${opts(CYCLES.map(x => x.name), '', 'Todos los ciclos')}</select></div></div>
        <button class="btn" style="margin-top:12px" onclick="Admin.addBlock(this)"><i class="fa-solid fa-plus"></i> Bloquear</button>
        <ul class="list" style="margin-top:14px">${bl.map(b => `<li><span><b>${D.fmt(b.start)}${b.end && b.end !== b.start ? ' al ' + D.fmt(b.end) : ''}</b> · ${esc(b.reason || '')} <small>(${esc(b.cycle || 'Todos los ciclos')})</small>${DB.evaluations.filter(e => e.status === ST.PEND && e.citationDate >= b.start && e.citationDate <= (b.end || b.start)).length ? ' <span class="pill warn">hay evaluaciones citadas</span>' : ''}</span><button class="btn sm danger" onclick="Admin.delBlock('${b.id}')">Quitar</button></li>`).join('') || '<li class="muted">No hay días bloqueados.</li>'}</ul></div>`;
  },
  saveCalendar(btn) {
    UI.busy(btn, async () => {
      const cycleSchedules = {}, coordinators = {}, roomsByCycle = {};
      $$('[data-cy]').forEach(card => {
        const n = card.dataset.cy, on = $('.cy-2on', card), wd = +$('.cy-wd', card).value, wd2 = $('.cy-wd2', card);
        if (on && on.checked && +wd2.value === wd) throw new Error(`${n}: el segundo día debe ser distinto al primero.`);
        cycleSchedules[n] = { weekday: wd, time: $('.cy-time', card).value || DEFAULT_TIME, secondDayEnabled: !!(on && on.checked), weekday2: wd2 ? +wd2.value : null, time2: $('.cy-time2', card) ? $('.cy-time2', card).value : null };
        roomsByCycle[n] = $('.cy-rooms', card).value.split('\n').map(x => x.trim()).filter(Boolean);
        coordinators[n] = { name: $('.co-name', card).value.trim(), title: $('.co-title', card).value.trim(), email: $('.co-mail', card).value.trim() };
      });
      await Act.saveConfig({ maxEvalsPerDay: +$('#c-max').value || 2, rule: { enabled: $('#c-rule').value === 'si', days: +$('#c-days').value || 0, cutoff: $('#c-cut').value || '12:00' }, cycleSchedules, roomsByCycle, coordinators });
      UI.toast('Configuración guardada.', 'success');
    });
  },
  addBlock(btn) {
    UI.busy(btn, async () => {
      const start = $('#b-from').value, end = $('#b-to').value || start, reason = $('#b-why').value.trim();
      if (!start || !reason) throw new Error('Indique la fecha y el motivo.');
      if (end < start) throw new Error('"Hasta" no puede ser anterior a "Desde".');
      await Act.saveConfig({ blockedDays: [...Cfg.blocked, { id: newId(), start, end, reason, cycle: $('#b-cy').value }] });
      UI.toast('Día(s) bloqueado(s). Revise si había evaluaciones citadas en esas fechas.', 'success'); this.calendar($('#ad-body'));
    });
  },
  delBlock(id) { UI.busy(null, async () => { await Act.saveConfig({ blockedDays: Cfg.blocked.filter(b => b.id !== id) }); this.calendar($('#ad-body')); }); },

  /* ---------- Usuarios ---------- */
  users(el) {
    el.innerHTML = `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px"><h2><i class="fa-solid fa-user-gear"></i> Usuarios y accesos</h2><button class="btn primary" onclick="Admin.userForm()"><i class="fa-solid fa-user-plus"></i> Nuevo usuario</button></div>
      <div class="table-wrap" style="margin-top:14px"><table class="tbl"><thead><tr><th>Nombre</th><th>Perfil</th><th>Jefatura</th><th>Asignaciones</th><th></th></tr></thead><tbody>
      ${[...DB.users].sort((a, b) => a.name.localeCompare(b.name, 'es')).map(u => `<tr><td><b>${esc(titleCase(u.name))}</b></td><td><span class="pill brand">${esc(ROLE_LABELS[u.role] || u.role)}</span></td><td>${esc(u.headTeacherOf || '—')}</td><td>${(u.assignments || []).length ? `${(u.assignments || []).length} (${[...new Set(u.assignments.map(a => a.course))].slice(0, 4).join(', ')}${new Set(u.assignments.map(a => a.course)).size > 4 ? '…' : ''})` : '—'}</td>
        <td><div class="rowacts"><button class="btn sm" onclick="Admin.userForm('${u.id}')"><i class="fa-solid fa-pen"></i> Editar</button><button class="btn sm danger" onclick="Admin.delUser('${u.id}')"><i class="fa-solid fa-trash"></i></button></div></td></tr>`).join('')}
      </tbody></table></div></div>
      <div class="card"><h2><i class="fa-solid fa-right-left"></i> Traspasar evaluaciones entre docentes</h2><p class="muted">Úselo cuando un docente reemplaza a otro. Se traspasan todas sus evaluaciones (rendidas, pendientes y cerradas).</p>
        <div class="fgrid"><div class="field"><label>Desde (nombre en las evaluaciones)</label><select id="tr-from">${opts(this.teacherNames().map(([n, c]) => [n, `${titleCase(n)} (${c})`]), '', 'Seleccione…')}</select></div>
        <div class="field"><label>Hacia (docente destino)</label><select id="tr-to">${opts(DB.users.filter(u => u.role === 'docente').map(u => [u.name, titleCase(u.name)]), '', 'Seleccione…')}</select></div></div>
        <button class="btn" style="margin-top:12px" onclick="Admin.transfer(this)"><i class="fa-solid fa-right-left"></i> Traspasar</button></div>`;
  },
  teacherNames() { const m = {}; DB.evaluations.forEach(e => { if (e.teacher) m[e.teacher] = (m[e.teacher] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); },
  transfer(btn) {
    const from = $('#tr-from').value, to = $('#tr-to').value;
    if (!from || !to) return UI.toast('Seleccione el docente de origen y el de destino.', 'error');
    if (sameText(from, to)) return UI.toast('El origen y el destino son el mismo docente.', 'error');
    UI.busy(btn, async () => { const n = await Act.transferTeacher(from, to); UI.toast(`${n} evaluación(es) traspasadas a ${titleCase(to)}.`, 'success'); this.users($('#ad-body')); });
  },
  async delUser(id) {
    const u = DB.users.find(x => x.id === id);
    if (!await UI.confirm('Eliminar usuario', `Se eliminará el acceso de <b>${esc(titleCase(u.name))}</b>. Sus evaluaciones no se borran.`, 'Eliminar', true)) return;
    UI.busy(null, async () => { DB.users = (await API.call('deleteUser', { id })).users; this.users($('#ad-body')); });
  },
  userForm(id) {
    const u = id ? DB.users.find(x => x.id === id) : { role: 'docente', assignments: [] };
    let asg = (u.assignments || []).map(a => ({ ...a }));
    const d = UI.modal({ title: id ? 'Editar usuario' : 'Nuevo usuario', wide: true, body: `
      <div style="display:grid;grid-template-columns:300px 1fr;gap:20px" class="uf-grid">
        <div class="stack">
          <div class="field"><label>Nombre completo</label><input id="uf-name" value="${esc(u.name || '')}"></div>
          <div class="field"><label>Perfil</label><select id="uf-role">${opts(Object.entries(ROLE_LABELS), u.role)}</select></div>
          <div class="field"><label>Contraseña</label><input id="uf-pass" type="text" placeholder="${id ? 'Dejar vacío para no cambiarla' : 'Contraseña inicial'}"></div>
          <div class="field" id="uf-lvl"><label>Nivel principal</label><select id="uf-level">${opts([['', 'Automático (según cursos)'], ['Básica', 'Enseñanza Básica'], ['Media', 'Enseñanza Media']], u.mainLevel || '')}</select></div>
          <div class="field" id="uf-head"><label>Profesor jefe de</label><select id="uf-hc">${opts(COURSES, u.headTeacherOf || '', 'Ninguno')}</select></div></div>
        <div id="uf-asg"><h3 style="margin-bottom:8px">Cursos y asignaturas que imparte</h3>
          <div class="fgrid" style="grid-template-columns:1fr 1fr">
            <div><b style="font-size:.85rem">1. Cursos</b><div class="card" style="padding:10px;max-height:210px;overflow:auto;box-shadow:none">${CYCLES.map(c => `<label class="check" style="font-weight:700;color:var(--brand-d)"><input type="checkbox" data-cyall="${c.name}"> ${c.name}</label><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:2px 8px;margin:4px 0 8px 22px">${c.courses.map(x => `<label class="check"><input type="checkbox" class="uf-c" value="${x}" data-cy="${c.name}"> ${x}</label>`).join('')}</div>`).join('')}</div></div>
            <div><b style="font-size:.85rem" id="uf-sublbl">2. Asignaturas</b><input id="uf-sq" placeholder="Buscar…" style="margin:4px 0"><div class="card" style="padding:10px;max-height:170px;overflow:auto;box-shadow:none" id="uf-subs">${Cfg.subjects.map(s => `<label class="check" data-s="${esc(s.toLowerCase())}"><input type="checkbox" class="uf-s" value="${esc(s)}"> ${esc(s)}</label>`).join('')}</div></div></div>
          <button type="button" class="btn sm primary" id="uf-apply" style="margin:10px 0"><i class="fa-solid fa-link"></i> Asignar seleccionados</button>
          <div id="uf-list"></div></div></div>`,
      footer: '<button class="btn" data-no>Cancelar</button><button class="btn primary" data-ok><i class="fa-solid fa-floppy-disk"></i> Guardar usuario</button>' });
    const drawList = () => {
      const by = {}; asg.forEach((a, i) => (by[a.course] = by[a.course] || []).push([a, i]));
      $('#uf-list', d).innerHTML = Object.keys(by).sort((a, b) => COURSES.indexOf(a) - COURSES.indexOf(b)).map(c => `<div style="margin-bottom:6px"><b>${esc(c)}</b> ${by[c].map(([a, i]) => `<span class="pill" style="margin:2px">${esc(a.subject)} <a href="#" data-rm="${i}" style="color:var(--bad);text-decoration:none">×</a></span>`).join('')}</div>`).join('') || '<small>Aún no hay asignaciones.</small>';
      $$('[data-rm]', d).forEach(a => a.onclick = e => { e.preventDefault(); asg.splice(+a.dataset.rm, 1); drawList(); });
    };
    const roleUI = () => { const r = $('#uf-role', d).value; $('#uf-asg', d).hidden = !(r === 'docente' || r === 'asistente'); $('#uf-lvl', d).hidden = $('#uf-head', d).hidden = r !== 'docente'; $('#uf-subs', d).parentElement.hidden = r === 'asistente'; $('#uf-sublbl', d).hidden = $('#uf-sq', d).hidden = r === 'asistente'; };
    $('#uf-role', d).onchange = roleUI; roleUI(); drawList();
    $$('[data-cyall]', d).forEach(c => c.onchange = () => $$(`.uf-c[data-cy="${c.dataset.cyall}"]`, d).forEach(x => x.checked = c.checked));
    $('#uf-sq', d).oninput = e => $$('#uf-subs label', d).forEach(l => l.style.display = l.dataset.s.includes(e.target.value.toLowerCase()) ? '' : 'none');
    $('#uf-apply', d).onclick = () => {
      const cs = $$('.uf-c:checked', d).map(x => x.value), asist = $('#uf-role', d).value === 'asistente', ss = asist ? ['TODAS'] : $$('.uf-s:checked', d).map(x => x.value);
      if (!cs.length || !ss.length) return UI.toast('Marque al menos un curso y una asignatura.', 'error');
      cs.forEach(c => ss.forEach(s => { if (!asg.some(a => a.course === c && a.subject === s)) asg.push({ course: c, subject: s }); }));
      $$('.uf-c:checked, .uf-s:checked, [data-cyall]:checked', d).forEach(x => x.checked = false); drawList();
    };
    $('[data-no]', d).onclick = () => d.close();
    $('[data-ok]', d).onclick = e => UI.busy(e.currentTarget, async () => {
      const role = $('#uf-role', d).value, name = $('#uf-name', d).value.trim();
      if (!name) throw new Error('Escriba el nombre.');
      const r = await API.call('saveUser', { user: { id: id || null, name, role, password: $('#uf-pass', d).value, assignments: asg, headTeacherOf: role === 'docente' ? ($('#uf-hc', d).value || null) : null, mainLevel: role === 'docente' ? ($('#uf-level', d).value || null) : null } });
      DB.users = r.users; d.close(); UI.toast('Usuario guardado.', 'success'); this.users($('#ad-body'));
    });
  },

  /* ---------- Asignaturas ---------- */
  subjects(el) {
    const custom = DB.config.customSubjects || [];
    el.innerHTML = `<div class="card"><h2><i class="fa-solid fa-book"></i> Asignaturas</h2>
      <div style="display:flex;gap:8px;margin:14px 0"><input id="sb-new" placeholder="Ej. TALLER DE ROBÓTICA"><button class="btn primary" onclick="Admin.addSubject(this)"><i class="fa-solid fa-plus"></i> Añadir</button></div>
      <p class="muted">Las asignaturas personalizadas quedan disponibles en todos los formularios y en la asignación de docentes.</p>
      <ul class="list">${custom.map((s, i) => `<li>${subjBadge(s)}<button class="btn sm danger" onclick="Admin.delSubject(${i})"><i class="fa-solid fa-trash"></i></button></li>`).join('') || '<li class="muted">Sin asignaturas personalizadas.</li>'}</ul></div>`;
  },
  addSubject(btn) {
    const n = $('#sb-new').value.trim().toUpperCase(); if (!n) return;
    if (Cfg.subjects.includes(n)) return UI.toast('Esa asignatura ya existe.', 'error');
    UI.busy(btn, async () => { await Act.saveConfig({ customSubjects: [...(DB.config.customSubjects || []), n] }); UI.toast('Asignatura añadida.', 'success'); this.subjects($('#ad-body')); });
  },
  delSubject(i) { UI.busy(null, async () => { const l = [...(DB.config.customSubjects || [])]; l.splice(i, 1); await Act.saveConfig({ customSubjects: l }); this.subjects($('#ad-body')); }); },

  /* ---------- Imagen ---------- */
  brand(el) {
    el.innerHTML = `<div class="card"><h2><i class="fa-solid fa-image"></i> Imagen institucional</h2>
      <div class="fgrid" style="margin-top:14px"><div class="field"><label>Banner principal (recomendado 1200×220 px)</label><input type="file" id="im-banner" accept="image/*"><img id="im-bp" src="${esc(Brand.banner)}" ${Brand.banner ? '' : 'hidden'} style="max-height:90px;margin-top:8px;object-fit:contain"></div>
        <div class="field"><label>Insignia / logo (recomendado 400×400 px)</label><input type="file" id="im-logo" accept="image/*"><img id="im-lp" src="${esc(Brand.logo)}" ${Brand.logo ? '' : 'hidden'} style="max-height:90px;margin-top:8px;object-fit:contain"></div></div>
      <small>El logo aparece en la portada, el menú y los PDF. Las imágenes se reducen automáticamente y se guardan en Google Sheets.</small>
      <div style="margin-top:14px"><button class="btn primary" onclick="Admin.saveBrand(this)"><i class="fa-solid fa-floppy-disk"></i> Guardar imágenes</button></div></div>
      <div class="card"><h2><i class="fa-solid fa-award"></i> Insignias en la portada</h2>
        <p class="muted">Agregue las insignias que desee (colegio, SLEP, Mineduc, programas…). Quedan guardadas y se muestran en la portada de acceso.</p>
        <div class="badges" id="bd-list" style="margin:12px 0"></div>
        <label class="btn"><i class="fa-solid fa-plus"></i> Agregar insignia<input type="file" id="bd-file" accept="image/*" hidden></label></div>`;
    this.drawBadges();
    $('#bd-file').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) UI.busy(null, async () => { const img = await UI.resizeImage(f, 240, 240, 'image/png'); await this.saveBadges([...(Brand.badges || []), img]); }); };
    this.pending = {};
    $('#im-banner').onchange = async e => { if (e.target.files[0]) { this.pending.banner = await UI.resizeImage(e.target.files[0], 1200, 300, 'image/jpeg'); $('#im-bp').src = this.pending.banner; $('#im-bp').hidden = false; } };
    $('#im-logo').onchange = async e => { if (e.target.files[0]) { this.pending.logo = await UI.resizeImage(e.target.files[0], 400, 400, 'image/png'); $('#im-lp').src = this.pending.logo; $('#im-lp').hidden = false; } };
  },
  drawBadges() {
    const l = $('#bd-list'); if (!l) return;
    l.innerHTML = (Brand.badges || []).map((b, i) => `<div style="position:relative"><img src="${esc(b)}" alt="Insignia"><button class="icon-btn" title="Quitar" onclick="Admin.delBadge(${i})" style="position:absolute;top:-6px;right:-6px;background:#fff;border:1px solid var(--line);width:22px;height:22px"><i class="fa-solid fa-xmark" style="font-size:.7rem"></i></button></div>`).join('') || '<span class="muted">Aún no hay insignias agregadas.</span>';
  },
  async saveBadges(list) { await API.call('saveBranding', { badges: list }); Brand.badges = list; this.drawBadges(); App.applyBrand(); UI.toast('Insignias guardadas.', 'success'); },
  delBadge(i) { UI.busy(null, () => { const l = [...(Brand.badges || [])]; l.splice(i, 1); return this.saveBadges(l); }); },
  saveBrand(btn) {
    if (!this.pending.banner && !this.pending.logo) return UI.toast('Primero seleccione una imagen.', 'error');
    UI.busy(btn, async () => { await API.call('saveBranding', this.pending); Object.assign(Brand, this.pending); App.applyBrand(); this.pending = {}; UI.toast('Imágenes guardadas.', 'success'); });
  },

  /* ---------- Datos ---------- */
  data(el) {
    el.innerHTML = `<div class="card"><h2><i class="fa-solid fa-database"></i> Datos y respaldo</h2>
      <div class="kpis" style="margin-top:14px">${[['Estudiantes', DB.students.length], ['Evaluaciones', DB.evaluations.length], ['Usuarios', DB.users.length]].map(([l, n]) => `<div class="kpi" style="cursor:default"><b>${n}</b><span>${l}</span></div>`).join('')}</div>
      <p class="muted">${API.demo ? '<b>Modo demo:</b> los datos viven solo en este navegador. Configure la URL de Apps Script en <code>js/config.js</code> para guardar en Google Sheets.' : 'Los datos se guardan en el libro de Google Sheets vinculado a su Apps Script (hojas: usuarios, estudiantes, evaluaciones, configuracion).'}</p>
      ${API.demo ? '' : `<div class="notice" style="margin-bottom:14px"><b><i class="fa-solid fa-cloud-arrow-down"></i> Traspasar datos desde la plataforma anterior (Firebase)</b><p style="margin:6px 0 10px">Copia <b>todo</b>: usuarios, estudiantes, evaluaciones con su historial, salas, horarios, coordinadores, días bloqueados, asignaturas, regla de anticipación, banner e insignia. No borra nada de Firebase y puede repetirse sin duplicar.</p>
        <button class="btn primary" onclick="Admin.migrate(this)"><i class="fa-solid fa-right-left"></i> Traspasar desde Firebase</button>
        <label class="btn" style="margin-left:8px"><i class="fa-solid fa-file-import"></i> Importar un respaldo JSON<input type="file" accept=".json" hidden onchange="Admin.importJson(this)"></label></div>`}
      <div class="actions"><button class="btn" onclick="Admin.backup()"><i class="fa-solid fa-download"></i> Descargar respaldo (JSON)</button>
        ${API.demo ? '<button class="btn danger" onclick="Admin.resetDemo()"><i class="fa-solid fa-rotate-left"></i> Restablecer datos de ejemplo</button>' : ''}</div></div>`;
  },
  /* Traspaso de Firebase → Apps Script, sin archivos aparte */
  async migrate(btn) {
    if (!await UI.confirm('Traspasar desde Firebase', 'Se leerán todos los datos de la plataforma anterior y se copiarán a Google Sheets. Los registros que ya existan se actualizan, sin duplicarse.', 'Iniciar traspaso')) return;
    const d = UI.modal({ title: 'Traspaso en curso', body: '<pre id="mg-log" style="background:#0f1b38;color:#cfe1ff;padding:14px;border-radius:10px;min-height:160px;max-height:50vh;overflow:auto;white-space:pre-wrap;font-size:.82rem;margin:0">Iniciando…</pre>' });
    const log = t => { const p = $('#mg-log', d); if (p) { p.textContent += '\n' + t; p.scrollTop = 1e9; } };
    try {
      const base = 'https://www.gstatic.com/firebasejs/8.10.1/';
      for (const f of ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js']) await UI.loadScript(base + f);
      const app = firebase.initializeApp({ apiKey: 'AIzaSyBVcDcIN6caANqRrfbVKao8dHVrNFrRZ9U', authDomain: 'pendientessegundociclo.firebaseapp.com', projectId: 'pendientessegundociclo', storageBucket: 'pendientessegundociclo.appspot.com', messagingSenderId: '633970608522', appId: '1:633970608522:web:560163652e78b7bd36a073' }, 'mig' + Date.now());
      await app.auth().signInAnonymously(); const fs = app.firestore();
      const read = async c => (await fs.collection(c).get()).docs.map(x => ({ id: x.id, ...x.data() }));
      const one = async (c, id) => { const x = await fs.collection(c).doc(id).get(); return x.exists ? x.data() : {}; };
      log('Leyendo Firebase…');
      const [users, students, evals] = [await read('app_users'), await read('students'), await read('evaluations')];
      const general = await one('settings', 'general'), cfg = await one('settings', 'config'), ag = await one('config', 'agendamiento');
      log(`Encontrados: ${users.length} usuarios, ${students.length} estudiantes, ${evals.length} evaluaciones.`);
      const config = { ...general, ...cfg }; delete config.bannerUrl; delete config.logoUrl;
      if (ag && ag.days !== undefined) config.rule = { enabled: ag.enabled !== false, days: ag.days, cutoff: ag.cutoff || '12:00' };
      const send = async (name, docs) => { for (let i = 0; i < docs.length; i += 400) { await API.call('importAll', { collections: { [name]: docs.slice(i, i + 400) } }); log(`  ${name}: ${Math.min(i + 400, docs.length)}/${docs.length}`); } };
      await send('users', users); await send('students', students); await send('evaluations', evals);
      await send('settings', [{ id: 'config', ...config }, { id: 'branding', banner: general.bannerUrl || '', logo: general.logoUrl || '' }]);
      log('Actualizando la plataforma…'); await DB.load();
      const b = await API.call('branding'); Object.assign(Brand, { banner: b.banner || '', logo: b.logo || '', badges: b.badges || [] }); App.applyBrand();
      log('\n✔ TRASPASO COMPLETO. Ya puede cerrar esta ventana.'); this.data($('#ad-body'));
    } catch (e) { log('ERROR: ' + (e.message || e)); }
  },
  importJson(inp) {
    const f = inp.files[0]; inp.value = ''; if (!f) return;
    UI.busy(null, async () => {
      const j = JSON.parse(await f.text()), cols = {};
      if (j.students) cols.students = j.students; if (j.evaluations) cols.evaluations = j.evaluations;
      if (j.config) cols.settings = [{ id: 'config', ...j.config }];
      for (const [c, docs] of Object.entries(cols)) for (let i = 0; i < docs.length; i += 400) await API.call('importAll', { collections: { [c]: docs.slice(i, i + 400) } });
      await DB.load(); UI.toast('Respaldo importado.', 'success'); this.data($('#ad-body'));
    });
  },
  backup() { UI.download(`respaldo_evaluaciones_${D.today()}.json`, JSON.stringify({ exportado: new Date().toISOString(), students: DB.students, evaluations: DB.evaluations, users: DB.users, config: DB.config }, null, 1)); },
  async resetDemo() { if (await UI.confirm('Restablecer demo', 'Se borrarán los cambios hechos en este navegador y volverán los datos de ejemplo.', 'Restablecer', true)) { Mock.reset(); location.reload(); } }
};
