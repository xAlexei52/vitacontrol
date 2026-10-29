/* VitaControl — app principal */
(function () {
  'use strict';

  const $ = (sel, el = document) => el.querySelector(sel);
  const API = {
    token: localStorage.getItem('vc_token') || null,
    async call(path, opts = {}) {
      const res = await fetch('/api' + path, {
        ...opts,
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}),
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      if (res.status === 401) {
        logout();
        throw new Error('Sesión expirada');
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error del servidor');
      return data;
    },
  };

  const state = {
    content: null,          // { dieta, rutinas }
    currentDate: todayStr(),
    calMonth: null,         // Date del mes visible en calendario
    chartRange: 30,
    chart: null,
    tab: null,              // pestaña mostrada, para animar solo al cambiar
  };

  const MEAL_ORDER = ['desayuno', 'colacion1', 'comida', 'colacion2', 'cena'];
  const TABS = ['hoy', 'dieta', 'gym', 'progreso'];

  const ICONS = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    chevL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    chevR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
    chevD: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    timer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/></svg>',
    mark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/></svg>',
  };

  // ---------- Utilidades de fecha (siempre hora local) ----------
  function todayStr() { return dateToStr(new Date()); }
  function dateToStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function strToDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function addDays(s, n) {
    const d = strToDate(s);
    d.setDate(d.getDate() + n);
    return dateToStr(d);
  }
  function fmtLong(s) {
    return strToDate(s).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  function mondayOf(s) {
    return addDays(s, -((strToDate(s).getDay() + 6) % 7));
  }
  // Lunes=1 ... Viernes=5 → día de rutina sugerido; sáb/dom → null
  function suggestedRoutineDay(s) {
    const dow = strToDate(s).getDay();
    return dow >= 1 && dow <= 5 ? dow : null;
  }
  // Días transcurridos desde el 1/1/1970, en UTC para que no lo mueva el huso
  function dayNumber(s) {
    const [y, m, d] = s.split('-').map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / 86400000);
  }
  // Posición del menú dentro del banco de esa comida. Avanza 1 por día natural,
  // así el ciclo dura tantos días como menús haya (28) en vez de repetirse cada
  // semana: el lunes que viene ya no cae el mismo menú que este lunes.
  function menuIndex(comida, s) {
    const n = (comida.semana || []).length;
    return n ? ((dayNumber(s) % n) + n) % n : 0;
  }
  // Menú que toca en esa fecha
  function menuDelDia(comida, s) {
    if (comida.semana && comida.semana.length) {
      return comida.semana[menuIndex(comida, s)];
    }
    return comida.base || [];
  }
  function esc(t) {
    const div = document.createElement('div');
    div.textContent = t;
    return div.innerHTML;
  }
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Animaciones ----------
  // Reinicia una animación CSS de entrada (al cambiar de pestaña o de día)
  function enter(el) {
    el.classList.remove('view-enter');
    void el.offsetWidth;
    el.classList.add('view-enter');
  }

  // Abre o cierra un plegable midiendo su alto real; si se interrumpe a medio
  // camino, parte del alto actual en vez de saltar.
  function setCollapse(btn, region, open) {
    btn.setAttribute('aria-expanded', String(open));
    if (reduceMotion()) {
      region.hidden = !open;
      region.style.height = '';
      region.style.opacity = '';
      return;
    }
    const done = (fn) => {
      const finish = (e) => {
        if (e && e.propertyName !== 'height') return;
        region.removeEventListener('transitionend', finish);
        clearTimeout(t);
        fn();
      };
      const t = setTimeout(finish, 400);
      region.addEventListener('transitionend', finish);
    };
    if (open) {
      const from = region.hidden ? 0 : region.getBoundingClientRect().height;
      region.hidden = false;
      region.style.height = 'auto';
      const to = region.scrollHeight;
      region.style.height = from + 'px';
      region.style.opacity = '0';
      void region.offsetHeight;
      region.style.height = to + 'px';
      region.style.opacity = '1';
      done(() => { if (btn.getAttribute('aria-expanded') === 'true') region.style.height = ''; });
    } else {
      region.style.height = region.getBoundingClientRect().height + 'px';
      void region.offsetHeight;
      region.style.height = '0px';
      region.style.opacity = '0';
      done(() => { if (btn.getAttribute('aria-expanded') === 'false') region.hidden = true; });
    }
  }

  // Botón + región plegable. labelHtml ya viene escapado; el contenido va
  // dentro de .collapse-inner
  let uid = 0;
  function disclosure(labelHtml, inner) {
    const id = 'c' + (++uid);
    return `
      <button class="disclosure" aria-expanded="false" aria-controls="${id}">
        <span>${labelHtml}</span><span class="chev">${ICONS.chevD}</span>
      </button>
      <div class="collapse" id="${id}" hidden><div class="collapse-inner">${inner}</div></div>`;
  }
  function wireDisclosures(root) {
    root.querySelectorAll('.disclosure').forEach((btn) => {
      const region = document.getElementById(btn.getAttribute('aria-controls'));
      btn.addEventListener('click', () => setCollapse(btn, region, btn.getAttribute('aria-expanded') !== 'true'));
    });
  }

  function appHead() {
    return `<div class="app-head"><span class="mark">${ICONS.mark}</span>VitaControl</div>`;
  }

  // ---------- Toast ----------
  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // ---------- Auth ----------
  function logout() {
    API.token = null;
    localStorage.removeItem('vc_token');
    state.tab = null;
    $('#app').classList.add('hidden');
    $('#view-login').classList.remove('hidden');
  }

  function initLogin() {
    const MAX_PIN = 8;
    let pin = '';
    const dotsEl = $('#pin-dots');
    const errEl = $('#login-error');

    function drawDots() {
      const n = Math.max(pin.length, 4);
      dotsEl.innerHTML = Array.from({ length: n }, (_, i) =>
        `<span class="pin-dot ${i < pin.length ? 'on' : ''}"></span>`).join('');
    }
    drawDots();

    async function submit() {
      if (pin.length < 4) return;
      errEl.classList.add('hidden');
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo entrar');
        API.token = data.token;
        localStorage.setItem('vc_token', data.token);
        pin = '';
        drawDots();
        await enterApp();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
        pin = '';
        drawDots();
        const card = $('.login-card');
        card.classList.remove('shake');
        void card.offsetWidth;
        card.classList.add('shake');
      }
    }

    function press(key) {
      if (key === 'del') pin = pin.slice(0, -1);
      else if (key === 'ok') return submit();
      else if (pin.length < MAX_PIN) pin += key;
      drawDots();
    }

    $('#pin-pad').addEventListener('click', (e) => {
      const btn = e.target.closest('.pin-key');
      if (btn) press(btn.dataset.key);
    });

    // Teclado físico (en PC)
    document.addEventListener('keydown', (e) => {
      if ($('#view-login').classList.contains('hidden')) return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('del');
      else if (e.key === 'Enter') press('ok');
    });
  }

  async function enterApp() {
    state.content = await API.call('/content');
    $('#view-login').classList.add('hidden');
    $('#app').classList.remove('hidden');
    if (!location.hash) location.hash = '#hoy';
    render();
  }

  // ---------- Router ----------
  window.addEventListener('hashchange', render);

  function render() {
    clearInterval(state.gymTimer);
    let tab = (location.hash || '#hoy').slice(1);
    if (!TABS.includes(tab)) tab = 'hoy';
    document.querySelectorAll('.tab').forEach((el) => {
      const on = el.dataset.tab === tab;
      el.classList.toggle('active', on);
      if (on) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
    $('#tab-indicator').style.transform = `translateX(${TABS.indexOf(tab) * 100}%)`;

    const main = $('#main');
    main.innerHTML = '';
    if (tab === 'hoy') renderHoy(main);
    else if (tab === 'dieta') renderDieta(main);
    else if (tab === 'gym') renderGym(main);
    else renderProgreso(main);
    if (state.tab !== tab) enter(main);
    state.tab = tab;
    window.scrollTo(0, 0);
  }

  // ---------- Vista: HOY ----------
  async function renderHoy(main) {
    const date = state.currentDate;
    const today = todayStr();
    const dieta = state.content.dieta;
    const rutinas = state.content.rutinas;
    const monday = mondayOf(date);
    const thisWeek = monday === mondayOf(today);

    main.innerHTML = `
      ${appHead()}
      <h1 class="page-title">${esc(fmtLong(date))}</h1>
      <p class="page-sub">${date === today ? 'Lo que te toca hoy' : 'Registro de un día anterior'}</p>
      <div class="week">
        <button class="btn btn-icon" id="week-prev" aria-label="Semana anterior">${ICONS.chevL}</button>
        <div class="week-days" id="week-days"></div>
        <button class="btn btn-icon" id="week-next" aria-label="Semana siguiente" ${thisWeek ? 'disabled' : ''}>${ICONS.chevR}</button>
      </div>
      <div id="hoy-body"><p class="muted">Cargando…</p></div>
    `;

    const goTo = (d) => {
      state.currentDate = d;
      renderHoy(main).then(() => enter($('#hoy-body')));
    };
    $('#week-prev').addEventListener('click', () => goTo(addDays(date, -7)));
    $('#week-next').addEventListener('click', () => {
      const next = addDays(date, 7);
      goTo(next > today ? today : next);
    });

    // Tira de la semana: lunes a domingo
    const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const days = $('#week-days');
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i);
      const b = document.createElement('button');
      b.className = 'day' + (d === date ? ' selected' : '') + (d === today ? ' today' : '');
      b.dataset.date = d;
      b.disabled = d > today;
      b.setAttribute('aria-label', fmtLong(d));
      if (d === date) b.setAttribute('aria-current', 'date');
      b.innerHTML = `<span class="dow">${DOW[i]}</span><span class="dom">${strToDate(d).getDate()}</span><span class="dot"></span>`;
      b.addEventListener('click', () => { if (d !== date) goTo(d); });
      days.appendChild(b);
    }
    // Punto verde en los días con 4+ comidas (no bloquea la vista)
    const last = addDays(monday, 6) > today ? today : addDays(monday, 6);
    API.call(`/progress?from=${monday}&to=${last}`).then((p) => {
      days.querySelectorAll('.day').forEach((b) => {
        const info = p.days && p.days[b.dataset.date];
        b.classList.toggle('ok', !!(info && info.meals >= 4));
      });
    }).catch(() => {});

    let day;
    try {
      day = await API.call('/day/' + date);
    } catch (err) {
      $('#hoy-body').innerHTML = `<p class="error">${esc(err.message)}</p>`;
      return;
    }

    const suggested = suggestedRoutineDay(date);
    const rutinaHoy = suggested ? rutinas.dias.find((d) => d.dia === suggested) : null;
    const isDone = (id) => !!(day.meals[id] && day.meals[id].checked);

    const body = $('#hoy-body');
    body.innerHTML = `
      <div class="summary">
        <div class="summary-line"><b>Comidas</b><span class="muted num" id="meals-count"></span></div>
        <div class="bar" role="progressbar" aria-label="Comidas del día" aria-valuemin="0" aria-valuemax="5" id="meals-bar"><span></span></div>
      </div>

      <div class="timeline" id="timeline"></div>

      <div class="card">
        <div class="card-head"><h2>Peso</h2><span class="meta">${day.weight != null ? 'Guardado' : 'Sin registrar'}</span></div>
        <div class="weight-row">
          <label class="weight-field">
            <input type="number" id="weight-input" inputmode="decimal" step="0.1" min="20" max="400"
                   placeholder="0.0" value="${day.weight ?? ''}" aria-label="Peso en kilogramos">
            <span>kg</span>
          </label>
          <button class="btn btn-primary" id="weight-save">Guardar</button>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Gimnasio</h2><span class="meta">${rutinaHoy ? `Día ${rutinaHoy.dia}, ${esc(rutinaHoy.nombre)}` : 'Descanso'}</span></div>
        <div id="gym-box"></div>
      </div>
      <p class="footer-note">${esc(dieta.notaMedica)}</p>
    `;

    // Resumen de comidas
    const updateSummary = () => {
      const n = MEAL_ORDER.filter(isDone).length;
      $('#meals-count').textContent = `${n} de 5`;
      $('#meals-bar').setAttribute('aria-valuenow', n);
      $('#meals-bar > span').style.transform = `scaleX(${n / 5})`;
    };
    updateSummary();

    // Peso
    $('#weight-save').addEventListener('click', async () => {
      const kg = $('#weight-input').value;
      try {
        await API.call(`/day/${date}/weight`, { method: 'PUT', body: { kg: kg === '' ? null : Number(kg) } });
        toast(kg === '' ? 'Peso borrado' : `Peso guardado: ${kg} kg`);
      } catch (err) { toast(err.message); }
    });

    // Línea del día: un nodo por comida (palomea) y su tarjeta (despliega el menú)
    const timeline = $('#timeline');
    for (const comida of dieta.comidas) {
      const menu = menuDelDia(comida, date);
      const sem = comida.semana || [];
      const idx = menuIndex(comida, date);
      // Alternativas = los otros platillos sugeridos (mismas raciones)
      const altMenus = sem.filter((_, k) => k !== idx);
      const regionId = 'meal-' + comida.id;

      const row = document.createElement('div');
      row.className = 'meal' + (isDone(comida.id) ? ' done' : '');
      row.innerHTML = `
        <button class="node" aria-pressed="${isDone(comida.id)}" aria-label="${esc(comida.nombre)} hecha">${ICONS.check}</button>
        <div class="meal-card">
          <button class="meal-open" aria-expanded="false" aria-controls="${regionId}">
            <span>
              <span class="meal-name">${esc(comida.nombre)}</span>
              <span class="meal-dish">${esc(menu[0] || '')}</span>
            </span>
            <span class="chev">${ICONS.chevD}</span>
          </button>
          <div class="collapse" id="${regionId}" hidden>
            <div class="meal-body">
              <ul class="list">${menu.slice(1).map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
              ${altMenus.length ? `
                <p class="alt-title">¿No se te antoja? Cámbialo por:</p>
                ${altMenus.map((items) => `
                  <div class="alt-group"><b>${esc(items[0])}</b><span>${items.slice(1).map(esc).join('. ')}</span></div>`).join('')}` : ''}
            </div>
          </div>
        </div>`;

      const node = $('.node', row);
      node.addEventListener('click', async () => {
        const now = !row.classList.contains('done');
        row.classList.toggle('done', now);
        node.setAttribute('aria-pressed', String(now));
        day.meals[comida.id] = { checked: now };
        updateSummary();
        try {
          await API.call(`/day/${date}/meal`, { method: 'PUT', body: { meal: comida.id, checked: now } });
        } catch (err) {
          row.classList.toggle('done', !now);
          node.setAttribute('aria-pressed', String(!now));
          day.meals[comida.id] = { checked: !now };
          updateSummary();
          toast(err.message);
        }
      });
      const open = $('.meal-open', row);
      open.addEventListener('click', () =>
        setCollapse(open, $('#' + regionId, row), open.getAttribute('aria-expanded') !== 'true'));
      timeline.appendChild(row);
    }

    // Gym
    renderGymBox($('#gym-box'), date, day.gym, suggested);
  }

  function renderGymBox(box, date, gym, suggested) {
    const rutinas = state.content.rutinas;
    if (gym && gym.completed) {
      const d = rutinas.dias.find((x) => x.dia === gym.routineDay);
      box.innerHTML = `
        <button class="done-row" aria-pressed="true">
          <span class="knob">${ICONS.check}</span>
          <span><b>Sesión hecha</b><small>Día ${gym.routineDay}, ${esc(d ? d.nombre : '')}. Toca para desmarcar</small></span>
        </button>`;
      $('.done-row', box).addEventListener('click', async () => {
        try {
          await API.call(`/day/${date}/gym`, { method: 'PUT', body: { routineDay: gym.routineDay, completed: false } });
          toast('Sesión desmarcada');
          render();
        } catch (err) { toast(err.message); }
      });
      return;
    }
    box.innerHTML = `
      ${suggested ? '' : '<p class="muted" style="margin-bottom:12px">Hoy es descanso. Si aun así entrenaste, márcalo.</p>'}
      <div class="segments" role="radiogroup" aria-label="Día de rutina">
        ${rutinas.dias.map((d) => `
          <button class="seg ${suggested === d.dia ? 'active' : ''}" data-day="${d.dia}" role="radio"
            aria-checked="${suggested === d.dia}">Día ${d.dia}</button>`).join('')}
      </div>
      <button class="btn btn-primary btn-block" id="gym-done">Marcar gym como hecho</button>`;
    let selected = suggested || 1;
    wireSegments(box, (b) => { selected = Number(b.dataset.day); });
    $('#gym-done', box).addEventListener('click', async () => {
      try {
        await API.call(`/day/${date}/gym`, { method: 'PUT', body: { routineDay: selected, completed: true } });
        toast('Sesión guardada');
        render();
      } catch (err) { toast(err.message); }
    });
  }

  // Grupo de segmentos de una sola opción
  function wireSegments(root, onPick) {
    const segs = root.querySelectorAll('.seg');
    // Que la opción elegida se vea aunque la fila tenga scroll horizontal
    root.querySelectorAll('.segments').forEach((row) => {
      const on = row.querySelector('.seg.active');
      if (on) row.scrollLeft = on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2;
    });
    segs.forEach((b) => {
      b.addEventListener('click', () => {
        segs.forEach((x) => {
          x.classList.toggle('active', x === b);
          if (x.hasAttribute('aria-checked')) x.setAttribute('aria-checked', String(x === b));
        });
        onPick(b);
      });
    });
  }

  // ---------- Vista: DIETA ----------
  // Nombre de cada grupo de equivalentes de racionesDiarias
  const GRUPOS = {
    verduras: 'verduras',
    frutas: 'frutas',
    cereales: 'cereales',
    aoaA: 'pollo, pescado y magros',
    aoaC: 'huevo y panela',
    grasas: 'grasas',
  };
  function renderDieta(main) {
    const dieta = state.content.dieta;
    const r = dieta.racionesDiarias;
    const today = todayStr();
    main.innerHTML = `
      ${appHead()}
      <h1 class="page-title">Tu dieta</h1>
      <p class="page-sub">${esc(dieta.nota)}</p>

      <h2 class="section-title">Raciones del día</h2>
      <div class="portions">
        ${Object.entries(r).map(([k, n]) => `
          <div class="portion"><b>${n}</b><span>${esc(GRUPOS[k] || k)}</span></div>`).join('')}
      </div>

      ${dieta.comidas.map((c) => {
        const sem = c.semana || [];
        const idx = menuIndex(c, today);
        return `
        <div class="card">
          <div class="card-head" style="margin-bottom:4px">
            <h2>${esc(c.nombre)}</h2>
            <span class="meta">${sem.length} opciones</span>
          </div>
          <div class="divider-group">
            ${sem.map((items, i) => disclosure(
              `${esc(items[0])}${i === idx ? ' <span class="tag">Hoy</span>' : ''}`,
              `<ul class="list">${items.slice(1).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`)).join('')}
          </div>
        </div>`;
      }).join('')}

      <div class="card">
        <div class="card-head"><h2>Recomendaciones</h2></div>
        <ul class="list">${dieta.recomendaciones.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      </div>

      <p class="footer-note">${esc(dieta.notaMedica)} ${esc(dieta.fuente)}.</p>
    `;
    wireDisclosures(main);
  }

  // ---------- Vista: GYM ----------
  // Entrenamiento en curso: se guarda en localStorage para sobrevivir recargas
  function getWorkout() {
    try {
      const w = JSON.parse(localStorage.getItem('vc_workout'));
      return w && w.date === todayStr() ? w : null;
    } catch { return null; }
  }

  function fmtElapsed(ms) {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  async function renderGym(main) {
    const rutinas = state.content.rutinas;
    const today = todayStr();
    const suggested = suggestedRoutineDay(today);
    const initial = suggested || 1;

    main.innerHTML = `
      ${appHead()}
      <h1 class="page-title">Rutinas</h1>
      <p class="page-sub">5 días por semana, de 45 a 60 minutos</p>
      <div class="card" id="gym-today"><div class="card-head"><h2>Entrenamiento de hoy</h2></div><p class="muted">Cargando…</p></div>
      <h2 class="section-title">Ver rutina</h2>
      <div class="segments" id="gym-tabs">
        ${rutinas.dias.map((d) => `<button class="seg ${d.dia === initial ? 'active' : ''}" data-day="${d.dia}">Día ${d.dia}</button>`).join('')}
      </div>
      <div id="gym-day"></div>
      <div class="card">
        <div class="card-head"><h2>Antes de empezar</h2></div>
        <ul class="list">${rutinas.notas.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
      </div>
    `;

    wireSegments($('#gym-tabs'), (b) => {
      renderGymDay(rutinas.dias.find((d) => d.dia === Number(b.dataset.day)));
      enter($('#gym-day'));
    });
    renderGymDay(rutinas.dias.find((d) => d.dia === initial));

    let gym = null;
    try {
      const day = await API.call('/day/' + today);
      gym = day.gym;
    } catch { /* se muestra el selector de todos modos */ }
    renderGymToday($('#gym-today'), gym, suggested);
  }

  function renderGymToday(box, gym, suggested) {
    const rutinas = state.content.rutinas;
    const today = todayStr();
    const head = (meta) => `<div class="card-head"><h2>Entrenamiento de hoy</h2>${meta ? `<span class="meta">${meta}</span>` : ''}</div>`;

    // Ya completado hoy
    if (gym && gym.completed) {
      const d = rutinas.dias.find((x) => x.dia === gym.routineDay);
      box.innerHTML = `
        ${head('')}
        <button class="done-row" aria-pressed="true">
          <span class="knob">${ICONS.check}</span>
          <span><b>Sesión hecha</b><small>Día ${gym.routineDay}, ${esc(d ? d.nombre : '')}${gym.notes ? '. ' + esc(gym.notes) : ''}</small></span>
        </button>`;
      $('.done-row', box).addEventListener('click', async () => {
        try {
          await API.call(`/day/${today}/gym`, { method: 'PUT', body: { routineDay: gym.routineDay, completed: false } });
          toast('Sesión desmarcada');
          render();
        } catch (err) { toast(err.message); }
      });
      return;
    }

    // Entrenamiento en curso → cronómetro
    const workout = getWorkout();
    if (workout) {
      const d = rutinas.dias.find((x) => x.dia === workout.day);
      box.innerHTML = `
        ${head(`Día ${workout.day}, ${esc(d ? d.nombre : '')}`)}
        <div class="timer" id="gym-timer" aria-live="off">00:00</div>
        <div class="stack">
          <button class="btn btn-primary btn-block" id="gym-finish">Terminar y guardar</button>
          <button class="btn btn-ghost btn-block" id="gym-cancel">Cancelar entrenamiento</button>
        </div>`;
      const timerEl = $('#gym-timer', box);
      const tick = () => { timerEl.textContent = fmtElapsed(Date.now() - workout.start); };
      tick();
      state.gymTimer = setInterval(tick, 1000);

      $('#gym-finish', box).addEventListener('click', async () => {
        const min = Math.max(1, Math.round((Date.now() - workout.start) / 60000));
        try {
          await API.call(`/day/${today}/gym`, {
            method: 'PUT',
            body: { routineDay: workout.day, completed: true, notes: `Duración: ${min} min` },
          });
          localStorage.removeItem('vc_workout');
          toast(`Sesión guardada: ${min} min`);
          render();
        } catch (err) { toast(err.message); }
      });
      $('#gym-cancel', box).addEventListener('click', () => {
        localStorage.removeItem('vc_workout');
        toast('Entrenamiento cancelado');
        render();
      });
      return;
    }

    // Sin empezar → elegir qué trabajar hoy e iniciar
    box.innerHTML = `
      ${head(suggested ? '' : 'Hoy es descanso')}
      <div class="segments" role="radiogroup" aria-label="Parte del cuerpo de hoy">
        ${rutinas.dias.map((d) => `
          <button class="seg ${suggested === d.dia ? 'active' : ''}" data-day="${d.dia}" role="radio"
            aria-checked="${suggested === d.dia}">${esc(d.nombre)}</button>`).join('')}
      </div>
      <div class="stack">
        <button class="btn btn-primary btn-block" id="gym-start">${ICONS.timer} Iniciar entrenamiento</button>
        <button class="btn btn-ghost btn-block" id="gym-quick">Marcar como hecho sin cronómetro</button>
      </div>`;

    let selected = suggested || 1;
    wireSegments(box, (b) => { selected = Number(b.dataset.day); });
    $('#gym-start', box).addEventListener('click', () => {
      localStorage.setItem('vc_workout', JSON.stringify({ date: today, day: selected, start: Date.now() }));
      toast('Cronómetro iniciado');
      render();
    });
    $('#gym-quick', box).addEventListener('click', async () => {
      try {
        await API.call(`/day/${today}/gym`, { method: 'PUT', body: { routineDay: selected, completed: true } });
        toast('Sesión guardada');
        render();
      } catch (err) { toast(err.message); }
    });
  }

  function renderGymDay(dia) {
    const box = $('#gym-day');
    box.innerHTML = `
      <div class="card">
        <div class="card-head"><h2>${esc(dia.nombre)}</h2><span class="meta">Día ${dia.dia}</span></div>
        <div class="divider-group">
          ${dia.ejercicios.map((ex, i) => `
            <div class="exercise">
              <div class="ex-head">
                <div>
                  <div class="ex-name">${esc(ex.nombre)}</div>
                  <div class="ex-meta">${ex.series} ${ex.series === 1 ? 'serie' : 'series'} × ${esc(ex.reps)}${ex.descanso !== '-' ? ', descanso ' + esc(ex.descanso) : ''}</div>
                </div>
                ${ex.videoId || ex.videoQuery ? `<button class="video-btn" data-i="${i}" aria-expanded="false" aria-controls="vf-${i}">${ICONS.play} Video</button>` : ''}
              </div>
              <div class="collapse video-frame" id="vf-${i}" hidden></div>
            </div>`).join('')}
        </div>
      </div>
    `;
    box.querySelectorAll('.video-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.i);
        const ex = dia.ejercicios[i];
        const frame = $('#vf-' + i, box);
        const isOpen = btn.getAttribute('aria-expanded') === 'true';
        // Cierra los demás videos para no cargar varios iframes
        box.querySelectorAll('.video-btn[aria-expanded="true"]').forEach((other) => {
          if (other === btn) return;
          const f = $('#vf-' + other.dataset.i, box);
          setCollapse(other, f, false);
          setTimeout(() => { if (f.hidden) f.innerHTML = ''; }, 420);
        });
        if (isOpen) {
          setCollapse(btn, frame, false);
          setTimeout(() => { if (frame.hidden) frame.innerHTML = ''; }, 420);
          return;
        }
        frame.innerHTML = ex.videoId ? `
          <iframe src="https://www.youtube-nocookie.com/embed/${ex.videoId}" title="Video: ${esc(ex.nombre)}"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen loading="lazy"></iframe>
          <p>¿No carga? <a target="_blank" rel="noopener" href="https://www.youtube.com/watch?v=${ex.videoId}">Ábrelo en YouTube</a></p>` : `
          <p><a target="_blank" rel="noopener"
            href="https://www.youtube.com/results?search_query=${encodeURIComponent(ex.videoQuery)}">Buscar el video en YouTube</a></p>`;
        setCollapse(btn, frame, true);
      });
    });
  }

  // ---------- Vista: PROGRESO ----------
  async function renderProgreso(main) {
    main.innerHTML = `
      ${appHead()}
      <h1 class="page-title">Progreso</h1>
      <p class="page-sub">Tu peso, el gym y qué tan constante vas</p>
      <div id="prog-body"><p class="muted">Cargando…</p></div>
    `;

    const today = todayStr();
    const from = addDays(today, -180);
    let data, settings;
    try {
      [data, settings] = await Promise.all([
        API.call(`/progress?from=${from}&to=${today}`),
        API.call('/settings'),
      ]);
    } catch (err) {
      $('#prog-body').innerHTML = `<p class="error">${esc(err.message)}</p>`;
      return;
    }

    // Semana actual (lunes a domingo)
    const monday = mondayOf(today);
    let gymWeek = 0, dietWeekDays = 0, trackedWeekDays = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i);
      if (d > today) break;
      const info = data.days[d];
      if (info && info.gym) gymWeek++;
      if (info && info.meals !== undefined) {
        trackedWeekDays++;
        if (info.meals >= 4) dietWeekDays++;
      }
    }
    const weights = data.weights;
    const lastW = weights.length ? weights[weights.length - 1].kg : null;
    const prevMonthW = weights.find((w) => w.date >= addDays(today, -30));
    const delta = lastW !== null && prevMonthW ? (lastW - prevMonthW.kg) : null;
    const fmtDelta = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1);

    // Recordatorio de laboratorios (cada 6 meses)
    let labBanner = '';
    if (settings.lastLabDate) {
      const due = strToDate(settings.lastLabDate);
      due.setMonth(due.getMonth() + 6);
      const dueStr = dateToStr(due);
      if (dueStr <= today) {
        labBanner = `<div class="note note-warn">Ya tocan tus laboratorios de colesterol y triglicéridos. Los últimos fueron el ${esc(settings.lastLabDate)}.</div>`;
      } else if (dueStr <= addDays(today, 21)) {
        labBanner = `<div class="note note-warn">Tus laboratorios semestrales tocan el ${esc(dueStr)}. Ve agendando.</div>`;
      }
    }

    $('#prog-body').innerHTML = `
      ${labBanner}
      <div class="stats">
        <div class="stat"><span>Peso actual</span><b>${lastW !== null ? lastW + ' <small>kg</small>' : '—'}</b></div>
        <div class="stat"><span>Cambio en 30 días</span><b>${delta !== null ? fmtDelta(delta) + ' <small>kg</small>' : '—'}</b></div>
        <div class="stat"><span>Gym esta semana</span><b>${gymWeek} <small>de 5</small></b></div>
        <div class="stat"><span>Dieta esta semana</span><b>${trackedWeekDays ? Math.round((dietWeekDays / trackedWeekDays) * 100) + ' <small>%</small>' : '—'}</b></div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Peso</h2>${settings.targetWeight ? `<span class="meta num">Meta ${esc(settings.targetWeight)} kg</span>` : ''}</div>
        <div class="segments">
          ${[30, 90, 180].map((r) => `<button class="seg ${state.chartRange === r ? 'active' : ''}" data-range="${r}">${r} días</button>`).join('')}
        </div>
        <div class="chart-box"><canvas id="weight-chart" role="img" aria-label="Gráfica de peso"></canvas></div>
        ${weights.length === 0 ? '<p class="empty-chart">Aún no hay pesos. Regístralo desde la pestaña Hoy.</p>' : ''}
      </div>

      <div class="card">
        <div class="cal-head">
          <button class="btn btn-icon" id="cal-prev" aria-label="Mes anterior">${ICONS.chevL}</button>
          <h2 id="cal-title"></h2>
          <button class="btn btn-icon" id="cal-next" aria-label="Mes siguiente">${ICONS.chevR}</button>
        </div>
        <div class="cal-grid" id="cal-grid"></div>
        <div class="legend">
          <span><span class="sw-diet"></span> Dieta cumplida (4 o más comidas)</span>
          <span><span class="cal-dot"></span> Fuiste al gym</span>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Ajustes</h2></div>
        <div class="field">
          <label for="set-target">Peso meta (kg)</label>
          <input type="number" id="set-target" inputmode="decimal" step="0.1" value="${esc(settings.targetWeight || '')}" placeholder="Por ejemplo, 75">
        </div>
        <div class="field">
          <label for="set-lab">Fecha de tus últimos laboratorios</label>
          <input type="date" id="set-lab" value="${esc(settings.lastLabDate || '')}">
        </div>
        <div class="stack">
          <button class="btn btn-primary btn-block" id="set-save">Guardar ajustes</button>
          <button class="btn btn-ghost btn-block" id="btn-logout">Cerrar sesión</button>
        </div>
      </div>
    `;

    // Gráfica
    const target = settings.targetWeight ? Number(settings.targetWeight) : null;
    drawChart(weights, target);
    wireSegments($('#prog-body'), (b) => {
      if (!b.dataset.range) return;
      state.chartRange = Number(b.dataset.range);
      drawChart(weights, target);
    });

    // Calendario
    if (!state.calMonth) state.calMonth = strToDate(today);
    drawCalendar(data);
    $('#cal-prev').addEventListener('click', () => { state.calMonth.setMonth(state.calMonth.getMonth() - 1); drawCalendar(data); });
    $('#cal-next').addEventListener('click', () => { state.calMonth.setMonth(state.calMonth.getMonth() + 1); drawCalendar(data); });

    // Ajustes
    $('#set-save').addEventListener('click', async () => {
      try {
        await API.call('/settings', {
          method: 'PUT',
          body: { targetWeight: $('#set-target').value, lastLabDate: $('#set-lab').value },
        });
        toast('Ajustes guardados');
      } catch (err) { toast(err.message); }
    });
    $('#btn-logout').addEventListener('click', logout);
  }

  function drawChart(weights, target) {
    const cutoff = addDays(todayStr(), -state.chartRange);
    const pts = weights.filter((w) => w.date >= cutoff);
    const ctx = $('#weight-chart');
    if (state.chart) state.chart.destroy();
    const font = { family: 'Manrope', size: 12 };
    const datasets = [{
      label: 'Peso (kg)',
      data: pts.map((w) => w.kg),
      borderColor: '#2f7d3e',
      backgroundColor: 'rgba(154, 217, 139, 0.18)',
      borderWidth: 2,
      fill: true,
      tension: 0,
      pointRadius: 0,
      pointHoverRadius: 5,
      pointBackgroundColor: '#2f7d3e',
    }];
    if (target && pts.length) {
      datasets.push({
        label: 'Meta',
        data: pts.map(() => target),
        borderColor: '#8a938b',
        borderWidth: 1.5,
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false,
      });
    }
    state.chart = new Chart(ctx, {
      type: 'line',
      data: { labels: pts.map((w) => w.date.slice(8) + '/' + w.date.slice(5, 7)), datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: reduceMotion() ? false : { duration: 400, easing: 'easeOutQuart' },
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { ticks: { color: '#5a625b', maxTicksLimit: 5, font }, grid: { display: false }, border: { display: false } },
          y: { ticks: { color: '#5a625b', maxTicksLimit: 5, font }, grid: { color: '#eef1ec' }, border: { display: false } },
        },
        plugins: {
          legend: { display: datasets.length > 1, position: 'top', align: 'end', labels: { color: '#5a625b', boxWidth: 12, boxHeight: 2, font } },
          tooltip: { backgroundColor: '#18201a', titleFont: font, bodyFont: font, padding: 10, cornerRadius: 10, displayColors: false },
        },
      },
    });
  }

  function drawCalendar(data) {
    const y = state.calMonth.getFullYear();
    const m = state.calMonth.getMonth();
    $('#cal-title').textContent = state.calMonth.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
    const grid = $('#cal-grid');
    grid.innerHTML = '';
    // Encabezados L-D
    for (const d of ['L', 'M', 'M', 'J', 'V', 'S', 'D']) {
      const el = document.createElement('div');
      el.className = 'cal-dow';
      el.textContent = d;
      grid.appendChild(el);
    }
    const first = new Date(y, m, 1);
    const offset = (first.getDay() + 6) % 7; // lunes = 0
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const today = todayStr();
    for (let i = 0; i < offset; i++) grid.appendChild(document.createElement('div'));
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = dateToStr(new Date(y, m, d));
      const info = data.days[ds];
      const el = document.createElement('div');
      el.className = 'cal-cell' + (info && info.meals >= 4 ? ' diet' : '') + (ds === today ? ' today' : '');
      el.innerHTML = `<span>${d}</span><span class="cal-dots">${info && info.gym ? '<span class="cal-dot"></span>' : ''}</span>`;
      grid.appendChild(el);
    }
    enter(grid);
  }

  // ---------- Arranque ----------
  async function boot() {
    initLogin();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    if (API.token) {
      try {
        await enterApp();
        return;
      } catch { /* token inválido → login */ }
    }
    $('#view-login').classList.remove('hidden');
  }

  boot();
})();
