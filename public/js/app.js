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
  };

  const MEAL_ORDER = ['desayuno', 'colacion1', 'comida', 'colacion2', 'cena'];
  const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  const ICONS = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    chevL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    chevR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
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
  // Lunes=1 ... Viernes=5 → día de rutina sugerido; sáb/dom → null
  function suggestedRoutineDay(s) {
    const dow = strToDate(s).getDay();
    return dow >= 1 && dow <= 5 ? dow : null;
  }
  function esc(t) {
    const div = document.createElement('div');
    div.textContent = t;
    return div.innerHTML;
  }

  // ---------- Toast ----------
  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
  }

  // ---------- Auth ----------
  function logout() {
    API.token = null;
    localStorage.removeItem('vc_token');
    $('#app').classList.add('hidden');
    $('#view-login').classList.remove('hidden');
  }

  async function initLogin() {
    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#login-btn');
      const errEl = $('#login-error');
      btn.disabled = true;
      btn.textContent = 'Entrando…';
      errEl.classList.add('hidden');
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: $('#login-email').value, password: $('#login-password').value }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo entrar');
        API.token = data.token;
        localStorage.setItem('vc_token', data.token);
        await enterApp();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Entrar';
      }
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
    const tab = (location.hash || '#hoy').slice(1);
    document.querySelectorAll('.tab').forEach((el) => {
      el.classList.toggle('active', el.dataset.tab === tab);
    });
    const main = $('#main');
    main.innerHTML = '';
    if (tab === 'hoy') renderHoy(main);
    else if (tab === 'dieta') renderDieta(main);
    else if (tab === 'gym') renderGym(main);
    else if (tab === 'progreso') renderProgreso(main);
    else renderHoy(main);
    window.scrollTo(0, 0);
  }

  // ---------- Vista: HOY ----------
  async function renderHoy(main) {
    const date = state.currentDate;
    const dieta = state.content.dieta;
    const rutinas = state.content.rutinas;

    main.innerHTML = `
      <div class="date-nav">
        <button class="btn btn-sm" id="day-prev" aria-label="Día anterior">${ICONS.chevL}</button>
        <h2>${esc(fmtLong(date))}</h2>
        <button class="btn btn-sm" id="day-next" aria-label="Día siguiente" ${date >= todayStr() ? 'disabled' : ''}>${ICONS.chevR}</button>
      </div>
      <div id="hoy-body"><p class="muted">Cargando…</p></div>
    `;
    $('#day-prev').addEventListener('click', () => { state.currentDate = addDays(date, -1); render(); });
    $('#day-next').addEventListener('click', () => { state.currentDate = addDays(date, 1); render(); });

    let day;
    try {
      day = await API.call('/day/' + date);
    } catch (err) {
      $('#hoy-body').innerHTML = `<p class="error">${esc(err.message)}</p>`;
      return;
    }

    const mealsChecked = MEAL_ORDER.filter((m) => day.meals[m] && day.meals[m].checked).length;
    const suggested = suggestedRoutineDay(date);
    const rutinaHoy = suggested ? rutinas.dias.find((d) => d.dia === suggested) : null;

    const body = $('#hoy-body');
    body.innerHTML = `
      <div class="card">
        <h3>Peso de hoy</h3>
        <div class="weight-row">
          <input type="number" id="weight-input" inputmode="decimal" step="0.1" min="20" max="400"
                 placeholder="kg" value="${day.weight ?? ''}" aria-label="Peso en kilogramos">
          <button class="btn btn-primary" id="weight-save">Guardar</button>
        </div>
      </div>

      <div class="card">
        <h3>Comidas <span class="progress-pill" id="meals-pill">${mealsChecked}/5</span></h3>
        <div id="meal-checks"></div>
      </div>

      <div class="card">
        <h3>Omega 3 (Lysi) — 1 cda cada 12 h</h3>
        <div id="supp-checks"></div>
      </div>

      <div class="card">
        <h3>Gimnasio</h3>
        ${rutinaHoy
          ? `<p>Hoy toca: <b>Día ${rutinaHoy.dia} — ${esc(rutinaHoy.nombre)}</b></p>`
          : '<p class="muted">Hoy es día de descanso según tu plan de lunes a viernes. Si aun así entrenaste, márcalo abajo.</p>'}
        <div id="gym-box"></div>
      </div>
      <p class="footer-note">${esc(dieta.notaMedica)}</p>
    `;

    // Peso
    $('#weight-save').addEventListener('click', async () => {
      const kg = $('#weight-input').value;
      try {
        await API.call(`/day/${date}/weight`, { method: 'PUT', body: { kg: kg === '' ? null : Number(kg) } });
        toast(kg === '' ? 'Peso borrado' : 'Peso guardado: ' + kg + ' kg');
      } catch (err) { toast(err.message); }
    });

    // Comidas
    const mealBox = $('#meal-checks');
    for (const comida of dieta.comidas) {
      const checked = day.meals[comida.id] && day.meals[comida.id].checked;
      const btn = document.createElement('button');
      btn.className = 'check-item' + (checked ? ' checked' : '');
      btn.setAttribute('aria-pressed', checked ? 'true' : 'false');
      btn.innerHTML = `
        <span class="check-box">${ICONS.check}</span>
        <span class="check-body">
          <span class="check-title">${esc(comida.nombre)}</span>
          <span class="check-sub">${esc(comida.base[0])}…</span>
        </span>`;
      btn.addEventListener('click', async () => {
        const now = !btn.classList.contains('checked');
        btn.classList.toggle('checked', now);
        btn.setAttribute('aria-pressed', now ? 'true' : 'false');
        try {
          await API.call(`/day/${date}/meal`, { method: 'PUT', body: { meal: comida.id, checked: now } });
          const n = mealBox.querySelectorAll('.check-item.checked').length;
          $('#meals-pill').textContent = n + '/5';
        } catch (err) {
          btn.classList.toggle('checked', !now);
          toast(err.message);
        }
      });
      mealBox.appendChild(btn);
    }

    // Suplemento
    const suppBox = $('#supp-checks');
    const doses = [
      { id: 'manana', label: 'Toma de la mañana', sub: 'Con el desayuno' },
      { id: 'noche', label: 'Toma de la noche', sub: 'Con la cena' },
    ];
    for (const dose of doses) {
      const checked = !!day.supplements[dose.id];
      const btn = document.createElement('button');
      btn.className = 'check-item' + (checked ? ' checked' : '');
      btn.setAttribute('aria-pressed', checked ? 'true' : 'false');
      btn.innerHTML = `
        <span class="check-box">${ICONS.check}</span>
        <span class="check-body">
          <span class="check-title">${esc(dose.label)}</span>
          <span class="check-sub">${esc(dose.sub)}</span>
        </span>`;
      btn.addEventListener('click', async () => {
        const now = !btn.classList.contains('checked');
        btn.classList.toggle('checked', now);
        btn.setAttribute('aria-pressed', now ? 'true' : 'false');
        try {
          await API.call(`/day/${date}/supplement`, { method: 'PUT', body: { dose: dose.id, checked: now } });
        } catch (err) {
          btn.classList.toggle('checked', !now);
          toast(err.message);
        }
      });
      suppBox.appendChild(btn);
    }

    // Gym
    renderGymBox($('#gym-box'), date, day.gym, suggested);
  }

  function renderGymBox(box, date, gym, suggested) {
    const rutinas = state.content.rutinas;
    if (gym && gym.completed) {
      const d = rutinas.dias.find((x) => x.dia === gym.routineDay);
      box.innerHTML = `
        <button class="check-item checked" aria-pressed="true">
          <span class="check-box">${ICONS.check}</span>
          <span class="check-body">
            <span class="check-title">¡Sesión completada!</span>
            <span class="check-sub">Día ${gym.routineDay} — ${esc(d ? d.nombre : '')}</span>
          </span>
        </button>
        <p class="note-banner">Recuerda: 2 frutas después de pesas 🍎🍎</p>`;
      box.querySelector('.check-item').addEventListener('click', async () => {
        try {
          await API.call(`/day/${date}/gym`, { method: 'PUT', body: { routineDay: gym.routineDay, completed: false } });
          toast('Sesión desmarcada');
          render();
        } catch (err) { toast(err.message); }
      });
      return;
    }
    box.innerHTML = `
      <div class="day-pills" role="radiogroup" aria-label="Día de rutina">
        ${rutinas.dias.map((d) => `
          <button class="day-pill ${suggested === d.dia ? 'active' : ''}" data-day="${d.dia}" role="radio"
            aria-checked="${suggested === d.dia}">Día ${d.dia}</button>`).join('')}
      </div>
      <button class="btn btn-success btn-block" id="gym-done">Marcar gym completado</button>`;
    let selected = suggested || 1;
    box.querySelectorAll('.day-pill').forEach((p) => {
      p.addEventListener('click', () => {
        selected = Number(p.dataset.day);
        box.querySelectorAll('.day-pill').forEach((x) => {
          x.classList.toggle('active', x === p);
          x.setAttribute('aria-checked', x === p ? 'true' : 'false');
        });
      });
    });
    $('#gym-done', box).addEventListener('click', async () => {
      try {
        await API.call(`/day/${date}/gym`, { method: 'PUT', body: { routineDay: selected, completed: true } });
        toast('¡Buen trabajo! 💪');
        render();
      } catch (err) { toast(err.message); }
    });
  }

  // ---------- Vista: DIETA ----------
  function renderDieta(main) {
    const dieta = state.content.dieta;
    const r = dieta.racionesDiarias;
    main.innerHTML = `
      <h2 class="page-title">Tu dieta</h2>
      <p class="page-sub">Basada en tu plan de equivalentes</p>

      <div class="note-banner">${esc(dieta.notaFrutas)}</div>

      <div class="card">
        <h3>Raciones del día</h3>
        <div class="chips">
          <span class="chip"><b>${r.verduras}</b> verduras</span>
          <span class="chip"><b>${r.frutas}</b> frutas</span>
          <span class="chip"><b>${r.cereales}</b> cereales</span>
          <span class="chip"><b>${r.proteinaAnimal}</b> proteína animal</span>
          <span class="chip"><b>${r.proteinaVegetal}</b> leguminosa</span>
          <span class="chip"><b>${r.lacteos}</b> lácteos</span>
          <span class="chip"><b>${r.grasas}</b> grasas</span>
          <span class="chip"><b>${r.oleaginosas}</b> oleaginosas</span>
          <span class="chip"><b>${r.azucares}</b> azúcar</span>
        </div>
      </div>

      ${dieta.comidas.map((c) => `
        <div class="card">
          <h3>${esc(c.icono)} ${esc(c.nombre)}${c.omega3 ? ' <span class="progress-pill">+ Omega 3</span>' : ''}</h3>
          <ul class="meal-list">${c.base.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
          ${c.alternativas && c.alternativas.length ? `
            <details class="alt">
              <summary>Ver alternativas equivalentes</summary>
              ${c.alternativas.map((a) => `
                <div class="alt-group"><b>${esc(a.titulo)}</b><span>${a.opciones.map(esc).join(' · ')}</span></div>`).join('')}
            </details>` : ''}
        </div>`).join('')}

      <div class="card">
        <h3>Suplemento</h3>
        <p><b>${esc(dieta.suplemento.nombre)}</b>: ${esc(dieta.suplemento.indicacion)}</p>
        <ul class="meal-list">${dieta.suplemento.alternativas.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
      </div>

      <div class="card">
        <h3>Recomendaciones de tu instituto</h3>
        <ul class="meal-list">${dieta.recomendaciones.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      </div>

      <p class="footer-note">${esc(dieta.notaMedica)} — ${esc(dieta.fuente)}</p>
    `;
  }

  // ---------- Vista: GYM ----------
  function renderGym(main) {
    const rutinas = state.content.rutinas;
    const suggested = suggestedRoutineDay(todayStr());
    const initial = suggested || 1;

    main.innerHTML = `
      <h2 class="page-title">Rutinas</h2>
      <p class="page-sub">5 días por semana · 45–60 min</p>
      <div class="day-pills" id="gym-tabs"></div>
      <div id="gym-day"></div>
      <div class="card">
        <h3>Antes de empezar</h3>
        <ul class="meal-list">${rutinas.notas.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
      </div>
    `;

    const tabs = $('#gym-tabs');
    rutinas.dias.forEach((d) => {
      const b = document.createElement('button');
      b.className = 'day-pill' + (d.dia === initial ? ' active' : '');
      b.textContent = `Día ${d.dia}`;
      b.addEventListener('click', () => {
        tabs.querySelectorAll('.day-pill').forEach((x) => x.classList.toggle('active', x === b));
        renderGymDay(d);
      });
      tabs.appendChild(b);
    });
    renderGymDay(rutinas.dias.find((d) => d.dia === initial));
  }

  function renderGymDay(dia) {
    const box = $('#gym-day');
    box.innerHTML = `
      <div class="card">
        <h3>Día ${dia.dia} — ${esc(dia.nombre)}</h3>
        ${dia.ejercicios.map((ex, i) => `
          <div class="exercise">
            <div class="ex-head">
              <div>
                <div class="ex-name">${esc(ex.nombre)}</div>
                <div class="ex-meta">${ex.series} ${ex.series === 1 ? 'serie' : 'series'} × ${esc(ex.reps)}${ex.descanso !== '-' ? ' · descanso ' + esc(ex.descanso) : ''}</div>
              </div>
              ${ex.videoId || ex.videoQuery ? `<button class="video-btn" data-i="${i}">${ICONS.play} Video</button>` : ''}
            </div>
            <div class="video-frame hidden" data-frame="${i}"></div>
          </div>`).join('')}
      </div>
    `;
    box.querySelectorAll('.video-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.i);
        const ex = dia.ejercicios[i];
        const frame = box.querySelector(`[data-frame="${i}"]`);
        const isOpen = !frame.classList.contains('hidden');
        // Cierra los demás videos para no cargar varios iframes
        box.querySelectorAll('.video-frame').forEach((f) => { f.classList.add('hidden'); f.innerHTML = ''; });
        if (isOpen) return;
        if (ex.videoId) {
          frame.innerHTML = `
            <iframe src="https://www.youtube-nocookie.com/embed/${ex.videoId}" title="Video: ${esc(ex.nombre)}"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen loading="lazy"></iframe>
            <p class="muted" style="margin:6px 0 0;font-size:0.85rem">¿No carga? <a style="color:var(--primary)" target="_blank" rel="noopener"
              href="https://www.youtube.com/watch?v=${ex.videoId}">Ábrelo en YouTube</a></p>`;
        } else {
          frame.innerHTML = `<a class="btn btn-block" target="_blank" rel="noopener"
            href="https://www.youtube.com/results?search_query=${encodeURIComponent(ex.videoQuery)}">Buscar video en YouTube</a>`;
        }
        frame.classList.remove('hidden');
      });
    });
  }

  // ---------- Vista: PROGRESO ----------
  async function renderProgreso(main) {
    main.innerHTML = `
      <h2 class="page-title">Progreso</h2>
      <p class="page-sub">Peso, gym y constancia</p>
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
    const now = strToDate(today);
    const monday = addDays(today, -((now.getDay() + 6) % 7));
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

    // Recordatorio de laboratorios (cada 6 meses)
    let labBanner = '';
    if (settings.lastLabDate) {
      const due = strToDate(settings.lastLabDate);
      due.setMonth(due.getMonth() + 6);
      const dueStr = dateToStr(due);
      if (dueStr <= today) {
        labBanner = `<div class="note-banner">🩸 Ya tocan tus laboratorios (colesterol y triglicéridos). Último: ${esc(settings.lastLabDate)}</div>`;
      } else if (dueStr <= addDays(today, 21)) {
        labBanner = `<div class="note-banner">🩸 Tus laboratorios semestrales tocan el ${esc(dueStr)}. Ve agendando.</div>`;
      }
    }

    $('#prog-body').innerHTML = `
      ${labBanner}
      <div class="stat-grid">
        <div class="stat"><div class="num">${lastW !== null ? lastW : '—'}</div><div class="lbl">kg actual</div></div>
        <div class="stat"><div class="num">${delta !== null ? (delta > 0 ? '+' : '') + delta.toFixed(1) : '—'}</div><div class="lbl">kg en 30 días</div></div>
        <div class="stat"><div class="num">${gymWeek}/5</div><div class="lbl">gym esta semana</div></div>
        <div class="stat"><div class="num">${trackedWeekDays ? Math.round((dietWeekDays / trackedWeekDays) * 100) + '%' : '—'}</div><div class="lbl">dieta esta semana</div></div>
      </div>

      <div class="card">
        <h3>Peso</h3>
        <div class="range-pills">
          ${[30, 90, 180].map((r) => `<button class="day-pill ${state.chartRange === r ? 'active' : ''}" data-range="${r}">${r} días</button>`).join('')}
        </div>
        <div class="chart-box"><canvas id="weight-chart" role="img" aria-label="Gráfica de peso"></canvas></div>
        ${weights.length === 0 ? '<p class="muted">Aún no registras tu peso. Hazlo desde la pestaña Hoy.</p>' : ''}
      </div>

      <div class="card">
        <div class="cal-head">
          <button class="btn btn-sm" id="cal-prev" aria-label="Mes anterior">${ICONS.chevL}</button>
          <h3 id="cal-title" style="margin:0"></h3>
          <button class="btn btn-sm" id="cal-next" aria-label="Mes siguiente">${ICONS.chevR}</button>
        </div>
        <div class="cal-grid" id="cal-grid"></div>
        <div class="legend">
          <span><span class="cal-dot gym"></span> Gym</span>
          <span><span class="cal-dot diet"></span> Dieta (4+ comidas)</span>
        </div>
      </div>

      <div class="card">
        <h3>Ajustes</h3>
        <label for="set-target">Peso meta (kg)</label>
        <input type="number" id="set-target" step="0.1" value="${esc(settings.targetWeight || '')}" placeholder="Ej. 75">
        <label for="set-lab">Fecha de tus últimos laboratorios</label>
        <input type="date" id="set-lab" value="${esc(settings.lastLabDate || '')}">
        <button class="btn btn-primary btn-block" id="set-save" style="margin-top:14px">Guardar ajustes</button>
        <button class="btn btn-block" id="btn-logout" style="margin-top:10px">Cerrar sesión</button>
      </div>
    `;

    // Gráfica
    drawChart(weights, settings.targetWeight ? Number(settings.targetWeight) : null);
    $('#prog-body').querySelectorAll('[data-range]').forEach((b) => {
      b.addEventListener('click', () => {
        state.chartRange = Number(b.dataset.range);
        $('#prog-body').querySelectorAll('[data-range]').forEach((x) => x.classList.toggle('active', x === b));
        drawChart(weights, settings.targetWeight ? Number(settings.targetWeight) : null);
      });
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
    const datasets = [{
      label: 'Peso (kg)',
      data: pts.map((w) => w.kg),
      borderColor: '#F97316',
      backgroundColor: 'rgba(249, 115, 22, 0.15)',
      fill: true,
      tension: 0.3,
      pointRadius: 4,
      pointBackgroundColor: '#F97316',
    }];
    if (target && pts.length) {
      datasets.push({
        label: 'Meta',
        data: pts.map(() => target),
        borderColor: '#22C55E',
        borderDash: [6, 6],
        pointRadius: 0,
        fill: false,
      });
    }
    state.chart = new Chart(ctx, {
      type: 'line',
      data: { labels: pts.map((w) => w.date.slice(5)), datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: '#9DB0C9', maxTicksLimit: 7 }, grid: { color: 'rgba(248,250,252,0.06)' } },
          y: { ticks: { color: '#9DB0C9' }, grid: { color: 'rgba(248,250,252,0.06)' } },
        },
        plugins: { legend: { labels: { color: '#F8FAFC' } } },
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
    for (let i = 0; i < offset; i++) {
      const el = document.createElement('div');
      el.className = 'cal-cell empty';
      grid.appendChild(el);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = dateToStr(new Date(y, m, d));
      const info = data.days[ds];
      const el = document.createElement('div');
      el.className = 'cal-cell' + (ds === today ? ' today' : '');
      el.innerHTML = `<span>${d}</span><span class="cal-dots">${info && info.gym ? '<span class="cal-dot gym"></span>' : ''}${info && info.meals >= 4 ? '<span class="cal-dot diet"></span>' : ''}</span>`;
      grid.appendChild(el);
    }
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
