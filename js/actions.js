/* ===== Acciones de dominio: todo cambio de datos pasa por aquí ===== */
const Act = {
  who: () => (Auth.user ? Auth.user.name : 'Sistema'),
  obs: text => ({ date: new Date().toISOString(), by: Act.who(), text }),
  op: (id, data) => ({ c: 'evaluations', op: 'update', id, data }),
  sop: (id, data) => ({ c: 'students', op: 'update', id, data }),
  withObs: (ev, text, data = {}) => Act.op(ev.id, { ...data, observations: [...(ev.observations || []), Act.obs(text)] }),

  /** Cambia fecha y/u hora de una citación (valida bloqueos, reposos, suspensión y tope diario). */
  async move(ev, { date, time }) {
    const upd = {}, before = `${D.fmt(ev.citationDate)} ${ev.citationTime || ''}`.trim(), sch = Cfg.schedule(ev.course);
    if (date !== undefined && date !== (ev.citationDate || '')) {
      if (date) {
        if (date < D.today()) throw new Error('La fecha no puede ser anterior a hoy.');
        const r = availability(ev.studentName, ev.course, date, { ignoreId: ev.id });
        if (!r.ok) throw new Error(r.message);
      }
      Object.assign(upd, { citationDate: date || null, room: null, needsUtpReschedule: false, contacted: false });
      if (date && time === undefined && (!ev.citationTime || sch.isOfficialTime(ev.citationTime) || !/^\d\d:\d\d$/.test(ev.citationTime))) upd.citationTime = sch.timeFor(date);
    }
    if (time !== undefined && time !== (ev.citationTime || '')) upd.citationTime = time || sch.timeFor(upd.citationDate || ev.citationDate || D.today());
    if (!Object.keys(upd).length) return;
    const after = `${D.fmt('citationDate' in upd ? upd.citationDate : ev.citationDate)} ${upd.citationTime || ev.citationTime || ''}`.trim();
    await DB.write([Act.withObs(ev, `Citación modificada: ${before} → ${after}.`, upd)]);
  },

  async nextOfficial(ev) {
    const from = D.add(ev.citationDate && ev.citationDate >= D.today() ? ev.citationDate : D.add(D.today(), -1), 1);
    const nd = findNextAvailable(ev.studentName, ev.course, from, { ignoreId: ev.id });
    await Act.move(ev, { date: nd });
    return nd;
  },

  /** El estudiante rindió: cierra el registro en toda la plataforma. */
  async done(evs, received = true) {
    const today = D.today(), ops = [];
    evs.forEach(ev => {
      if (ev.status === ST.DONE) return;
      ops.push(Act.withObs(ev, `${titleCase(Act.who())} registra la evaluación como RENDIDA${received ? ' y recibida' : ''} (${D.fmt(ev.citationDate || today)}).`, {
        status: ST.DONE, completedDate: ev.citationDate || today, history: [...(ev.history || []), { date: ev.citationDate || today, status: ST.DONE }],
        returnedToTeacher: received, returnDate: received ? today : null, utpTransfer: false, needsUtpReschedule: false, includeInCitation: false, contacted: true
      }));
    });
    if (ops.length) await DB.write(ops);
    return ops.length;
  },

  /** No asistió: 2ª citación -> agenda la 3ª; 3ª citación -> pasa a UTP sin fecha. Durante una suspensión no cuenta. */
  async absent(evs) {
    const ops = []; let nuevas = 0, utp = 0, susp = 0;
    const reservas = {};
    evs.forEach(ev => {
      const st = studentOf(ev.studentName, ev.course), sus = suspensionOf(st), fecha = ev.citationDate || D.today();
      const sch = Cfg.schedule(ev.course);
      if (sus && fecha >= sus.start && fecha <= sus.end) {
        const nd = afterSuspension(sus, ev.course);
        ops.push(Act.withObs(ev, `Estudiante suspendido(a) del ${D.fmt(sus.start)} al ${D.fmt(sus.end)}: la citación del ${D.fmt(fecha)} no cuenta como inasistencia. Se reprograma para el ${D.fmt(nd)}.`, { citationDate: nd, citationTime: sch.timeFor(nd), room: null, contacted: false, suspensionExemptCount: (ev.suspensionExemptCount || 0) + 1 }));
        susp++; return;
      }
      const history = [...(ev.history || []), { date: fecha, status: 'Inasistente' }];
      if (usedAttempts(ev) < 1) {
        const k = ev.course + '||' + ev.studentName; reservas[k] = reservas[k] || {};
        const from = D.add(fecha >= D.today() ? fecha : D.add(D.today(), -1), 1);
        const nd = findNextAvailable(ev.studentName, ev.course, from, { ignoreId: ev.id, extra: 0 });
        ops.push(Act.withObs(ev, `No asistió a la citación del ${D.fmt(fecha)}. Se agenda la 3ª y última citación al hogar: ${D.long(nd)}.`, { history, citationDate: nd, citationTime: sch.timeFor(nd), room: null, contacted: false }));
        nuevas++;
      } else {
        ops.push(Act.withObs(ev, `No asistió a la citación del ${D.fmt(fecha)}. Agotadas las citaciones al hogar: pasa a UTP (${history.length + 2 - (ev.suspensionExemptCount || 0)}ª oportunidad), sin fecha hasta que UTP la asigne.`, { history, citationDate: null, room: null, contacted: false, utpTransfer: true, utpTransferDate: D.today() }));
        utp++;
      }
    });
    if (ops.length) await DB.write(ops);
    return { nuevas, utp, susp };
  },

  async closeFail(ev) {
    await DB.write([Act.withObs(ev, 'Proceso cerrado con nota mínima (1.0) tras agotar las oportunidades.', { status: ST.FAIL, history: [...(ev.history || []), { date: ev.citationDate || D.today(), status: 'Inasistente (Final)' }] })]);
  },
  async reopen(ev) {
    await DB.write([Act.withObs(ev, 'Caso reabierto: vuelve a pendiente, sin fecha.', { status: ST.PEND, citationDate: null, room: null, utpTransfer: ev.utpTransfer === true, closedByLicense: false, includeInCitation: true })]);
  },
  async addObs(ev, text) { await DB.write([Act.op(ev.id, { observations: [...(ev.observations || []), Act.obs(text)] })]); },
  async toggleContact(ev) { await DB.write([Act.op(ev.id, { contacted: !ev.contacted })]); },
  async remove(ev) { await DB.write([{ c: 'evaluations', op: 'delete', id: ev.id }]); },

  /* ---------- Estudiantes ---------- */
  pendingOf: st => DB.evaluations.filter(e => e.studentName === st.name && e.course === st.course),

  async setLicense(st, start, end) {
    const days = D.days(start, end), long = days >= LICENSE_LONG, ops = [];
    const history = [...(st.licenseHistory || []), { id: newId(), start, end, days, long, by: Act.who(), registeredAt: new Date().toISOString() }];
    ops.push(Act.sop(st.id, { onLicense: true, licenseStart: start, licenseEnd: end, licenseHistory: history }));
    let n = 0;
    Act.pendingOf(st).filter(e => e.status === ST.PEND).forEach(ev => {
      const info = { licenseStart: start, licenseEnd: end, licenseDays: days };
      if (long) { ops.push(Act.withObs(ev, `CERRADA POR MOTIVOS MÉDICOS: reposo de ${days} días (${D.fmt(start)} al ${D.fmt(end)}). No se considera en el proceso ni se califica con nota mínima.`, { ...info, status: ST.LIC, citationDate: null, room: null, closedByLicense: true })); n++; }
      else if (!ev.citationDate || ev.citationDate <= end) { ops.push(Act.withObs(ev, `Reposo médico de ${days} día(s) (${D.fmt(start)} al ${D.fmt(end)}): queda sin fecha y UTP la reagendará al regreso.`, { ...info, citationDate: null, room: null, needsUtpReschedule: true })); n++; }
      else if (ev.citationDate < minAfterLicense(end)) {
        const min = minAfterLicense(end), nd = findNextAvailable(ev.studentName, ev.course, min, { ignoreId: ev.id });
        ops.push(Act.withObs(ev, `Reposo médico de ${days} día(s): tras ${REENTRY_DAYS} días hábiles de readaptación, la citación del ${D.fmt(ev.citationDate)} se traslada al ${D.long(nd)}.`, { ...info, citationDate: nd, citationTime: Cfg.schedule(ev.course).timeFor(nd), room: null })); n++;
      }
    });
    await DB.write(ops); return { days, long, n };
  },
  async removeLicense(st) {
    const ops = [Act.sop(st.id, { onLicense: false, licenseStart: null, licenseEnd: null, licenseHistory: (st.licenseHistory || []).filter(l => !(l.start === st.licenseStart && l.end === st.licenseEnd)) })];
    Act.pendingOf(st).forEach(ev => {
      if (ev.status === ST.LIC) ops.push(Act.withObs(ev, 'Se deja sin efecto el reposo: vuelve al proceso, pendiente de agendar.', { status: ST.PEND, closedByLicense: false, includeInCitation: true, needsUtpReschedule: true }));
      else if (ev.needsUtpReschedule) ops.push(Act.op(ev.id, { needsUtpReschedule: false }));
    });
    await DB.write(ops);
  },
  async setSuspension(st, start, end, note) {
    const days = D.days(start, end), nd = afterSuspension({ end }, st.course), ops = [];
    ops.push(Act.sop(st.id, { suspended: true, suspensionStart: start, suspensionEnd: end, suspensionNote: note || null }));
    let n = 0;
    Act.pendingOf(st).filter(e => e.status === ST.PEND && e.citationDate && e.citationDate >= start && e.citationDate <= end).forEach(ev => {
      ops.push(Act.withObs(ev, `Suspensión del ${D.fmt(start)} al ${D.fmt(end)}: la citación del ${D.fmt(ev.citationDate)} se reprograma para el ${D.fmt(nd)}, sin contar inasistencia.`, { citationDate: nd, citationTime: Cfg.schedule(ev.course).timeFor(nd), room: null, suspensionExemptCount: (ev.suspensionExemptCount || 0) + 1 })); n++;
    });
    await DB.write(ops); return { days, nd, n };
  },
  async removeSuspension(st) { await DB.write([Act.sop(st.id, { suspended: false, suspensionStart: null, suspensionEnd: null, suspensionNote: null })]); },

  /** Plan de Evaluación: las pendientes anteriores quedan guardadas pero no se consideran. */
  async setStatus(st, status) {
    const ops = [Act.sop(st.id, { status, planSince: status === ST.PLAN ? D.today() : null })];
    Act.pendingOf(st).forEach(ev => {
      if (status === ST.PLAN && ev.status === ST.PEND && !ev.planScheduledByUtp)
        ops.push(Act.withObs(ev, 'Plan de Evaluación: la evaluación queda guardada pero no se considera en el proceso.', { status: ST.PLAN, closedByPlan: true, previousStatus: ev.status, citationDate: null, room: null }));
      else if (status !== ST.PLAN && ev.closedByPlan)
        ops.push(Act.withObs(ev, 'Fin del Plan de Evaluación: vuelve al proceso como pendiente.', { status: ev.previousStatus || ST.PEND, closedByPlan: false }));
    });
    await DB.write(ops);
  },
  async withdraw(st, info) { await DB.write([Act.sop(st.id, { withdrawn: true, withdrawnDate: info.date, withdrawnReason: info.reason, withdrawnNote: info.note || null, withdrawnBy: Act.who() })]); },
  async restore(st) { await DB.write([Act.sop(st.id, { withdrawn: false, withdrawnDate: null, withdrawnReason: null, withdrawnNote: null })]); },

  /** Edita nombre/RUT/género/curso; las evaluaciones siguen al estudiante con todo su historial. */
  async editStudent(st, v) {
    const name = v.name.trim().toUpperCase(), course = v.course, ops = [];
    const history = st.courseHistory || [];
    if (course !== st.course) history.push({ from: st.course, to: course, date: new Date().toISOString(), by: Act.who() });
    if (name !== st.name || course !== st.course) {
      Act.pendingOf(st).forEach(ev => ops.push(Act.op(ev.id, { studentName: name, course, ...(cycleOf(course) !== cycleOf(st.course) ? { room: null } : {}) })));
    }
    ops.push(Act.sop(st.id, { name, course, rut: normRut(v.rut), gender: v.gender, email: (v.email || '').trim(), guardianEmail: (v.guardianEmail || '').trim(), courseHistory: history }));
    await DB.write(ops);
  },
  async addStudent(v) {
    const doc = { name: v.name.trim().toUpperCase(), course: v.course, rut: normRut(v.rut), gender: v.gender || guessGender(v.name), status: 'Activo', email: (v.email || '').trim(), guardianEmail: (v.guardianEmail || '').trim() };
    await DB.write([{ c: 'students', op: 'set', id: newId(), data: doc }]); return doc;
  },
  async removeStudent(st) { await DB.write([{ c: 'students', op: 'delete', id: st.id }]); },

  /** Traspasa todas las evaluaciones de un nombre de docente a otro. */
  async transferTeacher(fromName, toName) {
    const ops = DB.evaluations.filter(e => sameText(e.teacher, fromName)).map(e => Act.op(e.id, { teacher: toName }));
    if (ops.length) await DB.write(ops);
    return ops.length;
  },
  async saveConfig(patch) { await DB.write([{ c: 'settings', op: 'update', id: 'config', data: patch }]); }
};
