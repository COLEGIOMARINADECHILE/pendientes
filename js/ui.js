/* ===== Utilidades de interfaz ===== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SUBJ_COLORS = [['#fef3c7', '#92400e'], ['#dcfce7', '#166534'], ['#dbeafe', '#1e40af'], ['#fce7f3', '#9d174d'], ['#ffedd5', '#9a3412'], ['#ede9fe', '#5b21b6'], ['#e0e7ff', '#3730a3'], ['#fee2e2', '#991b1b'], ['#cffafe', '#155e75'], ['#d1fae5', '#065f46']];
function subjBadge(s) {
  if (!s) return '';
  let h = 0; for (const ch of s) h = ch.charCodeAt(0) + ((h << 5) - h);
  const [bg, fg] = SUBJ_COLORS[Math.abs(h) % SUBJ_COLORS.length];
  return `<span class="subj" style="background:${bg};color:${fg}">${esc(s)}</span>`;
}
const opts = (list, sel, blank) => (blank ? `<option value="">${esc(blank)}</option>` : '') + list.map(x => {
  const [v, l] = Array.isArray(x) ? x : [x, x];
  return `<option value="${esc(v)}" ${String(v) === String(sel ?? '') ? 'selected' : ''}>${esc(l)}</option>`;
}).join('');

const UI = {
  toast(msg, type = 'info', ms = 4200) {
    const box = $('#toasts'), t = document.createElement('div');
    t.className = 'toast ' + type;
    t.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-xmark' : 'fa-circle-info'}"></i><span>${esc(msg)}</span>`;
    box.appendChild(t); setTimeout(() => t.remove(), ms);
  },

  modal({ title, body, footer = '', wide = false }) {
    const d = document.createElement('dialog');
    d.className = 'modal' + (wide ? ' wide' : '');
    d.innerHTML = `<div class="modal-head"><h3>${title}</h3><button class="icon-btn" data-x type="button"><i class="fa-solid fa-xmark"></i></button></div><div class="modal-body">${body}</div>${footer ? `<div class="modal-foot">${footer}</div>` : ''}`;
    document.body.appendChild(d);
    $('[data-x]', d).onclick = () => d.close();
    d.addEventListener('close', () => d.remove());
    d.showModal();
    return d;
  },

  confirm(title, text, ok = 'Confirmar', danger = false) {
    return new Promise(res => {
      const d = UI.modal({ title, body: `<p style="margin:0">${text}</p>`, footer: `<button class="btn" data-no>Cancelar</button><button class="btn ${danger ? 'danger solid' : 'primary'}" data-ok>${ok}</button>` });
      let r = false;
      $('[data-ok]', d).onclick = () => { r = true; d.close(); };
      $('[data-no]', d).onclick = () => d.close();
      d.addEventListener('close', () => res(r));
    });
  },

  /** Formulario genérico. fields: {name,label,type,value,options,required,hint,full,min}. Devuelve los valores o null. */
  form({ title, intro = '', fields, ok = 'Guardar', wide = false }) {
    return new Promise(res => {
      const fh = f => {
        const id = 'f_' + f.name;
        if (f.type === 'check') return `<div class="field full"><label class="check"><input type="checkbox" name="${f.name}" ${f.value ? 'checked' : ''}> ${f.label}</label></div>`;
        let inp;
        if (f.type === 'select') inp = `<select id="${id}" name="${f.name}">${opts(f.options, f.value)}</select>`;
        else if (f.type === 'textarea') inp = `<textarea id="${id}" name="${f.name}" ${f.required ? 'required' : ''} placeholder="${esc(f.placeholder || '')}">${esc(f.value || '')}</textarea>`;
        else inp = `<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}" ${f.required ? 'required' : ''} ${f.min ? `min="${f.min}"` : ''} placeholder="${esc(f.placeholder || '')}">`;
        return `<div class="field ${f.full ? 'full' : ''}"><label for="${id}">${f.label}</label>${inp}${f.hint ? `<small>${f.hint}</small>` : ''}</div>`;
      };
      const d = UI.modal({
        title, wide,
        body: `${intro ? `<p class="muted" style="margin:0 0 14px">${intro}</p>` : ''}<form id="uiform" class="fgrid">${fields.map(fh).join('')}</form>`,
        footer: `<button class="btn" data-no type="button">Cancelar</button><button class="btn primary" data-ok type="button">${ok}</button>`
      });
      const form = $('#uiform', d); let r = null;
      const submit = () => {
        if (!form.reportValidity()) return;
        r = {}; fields.forEach(f => { const el = form.elements[f.name]; r[f.name] = f.type === 'check' ? el.checked : el.value; });
        d.close();
      };
      $('[data-ok]', d).onclick = submit;
      form.onsubmit = e => { e.preventDefault(); submit(); };
      $('[data-no]', d).onclick = () => d.close();
      d.addEventListener('close', () => res(r));
    });
  },

  async busy(btn, fn) {
    if (btn && btn.dataset.busy) return;
    const html = btn ? btn.innerHTML : '';
    if (btn) { btn.dataset.busy = '1'; btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
    try { return await fn(); }
    catch (e) { UI.toast(e.message || String(e), 'error'); }
    finally { if (btn) { delete btn.dataset.busy; btn.disabled = false; btn.innerHTML = html; } }
  },

  loadScript(src) {
    return new Promise((ok, ko) => {
      if ($(`script[src="${src}"]`)) return ok();
      const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ko; document.head.appendChild(s);
    });
  },

  download(name, text, type = 'application/json') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },

  /** Reduce una imagen antes de guardarla (el banner y el logo viven en Google Sheets). */
  resizeImage(file, maxW, maxH, mime) {
    return new Promise((ok, ko) => {
      const fr = new FileReader();
      fr.onload = e => {
        const img = new Image();
        img.onload = () => {
          const r = Math.min(maxW / img.width, maxH / img.height, 1), w = Math.round(img.width * r), h = Math.round(img.height * r);
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          const x = c.getContext('2d'); if (mime === 'image/jpeg') { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); }
          x.drawImage(img, 0, 0, w, h); ok(c.toDataURL(mime, 0.82));
        };
        img.onerror = ko; img.src = e.target.result;
      };
      fr.onerror = ko; fr.readAsDataURL(file);
    });
  }
};
