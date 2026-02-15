(() => {
    // ===============================
    // Utilidades
    // ===============================
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    const fmtFecha = (d) => {
        if (!d) return '';
        const date = (d instanceof Date) ? d : new Date(d);
        return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
    };

    const toISODate = (d) => {
        if (!d) return '';
        const dt = (d instanceof Date) ? d : new Date(d);
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const day = String(dt.getDate()).padStart(2, '0');
        return `${dt.getFullYear()}-${m}-${day}`;
    };

    // ===============================
    // Estado
    // ===============================
    const STORAGE_KEY = 'tareas_avanzado_v2';
    const state = {
        tasks: [],
        filters: {
            estado: 'pendientes', // 'todas' | 'pendientes' | 'completadas'
            prioridad: 'todas',   // 'todas' | 'alta' | 'media' | 'baja'
            categoria: 'todas',   // 'todas' | 'personal' | ...
            busqueda: ''          // texto o #etiqueta
        },
        view: 'lista',
        editingId: null,
        calCursor: new Date() // Mes que muestra el calendario
    };

    // ===============================
    // Persistencia
    // ===============================
    function save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
    }
    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            state.tasks = raw ? JSON.parse(raw) : [];
            // normalizar fechas
            state.tasks.forEach(t => {
                if (t.fecha) t.fecha = new Date(t.fecha);
                if (t.fechaVencimiento) t.fechaVencimiento = new Date(t.fechaVencimiento);
                if (!Array.isArray(t.subtareas)) t.subtareas = [];
                if (!Array.isArray(t.historial)) t.historial = [];
            });
        } catch (_) {
            state.tasks = [];
        }
    }

    // ===============================
    // Inicialización
    // ===============================
    function init() {
        load();
        bindUI();
        renderAll();
    }

    function bindUI() {
        // Tabs
        $$('.tab').forEach(btn => {
            btn.addEventListener('click', () => cambiarVista(btn.dataset.view));
        });

        // Form alta
        $('#btn-agregar').addEventListener('click', agregarTarea);

        // Filtros
        $('#filtro-estado').addEventListener('change', (e) => { state.filters.estado = e.target.value; renderList(); });
        $('#filtro-prioridad').addEventListener('change', (e) => { state.filters.prioridad = e.target.value; renderList(); });
        $('#filtro-categoria').addEventListener('change', (e) => { state.filters.categoria = e.target.value; renderList(); });
        $('#filtro-busqueda').addEventListener('input', (e) => { state.filters.busqueda = e.target.value.trim().toLowerCase(); renderList(); });

        // Delegación eventos lista
        $('#lista-tareas').addEventListener('click', onListClick);
        $('#lista-tareas').addEventListener('change', onListChange);

        // Modal
        $$('#modal-editar .modal-close').forEach(b => b.addEventListener('click', closeModal));
        $('#modal-editar .modal-save').addEventListener('click', saveEdit);

        // Calendario
        $('#cal-prev').addEventListener('click', () => { moveCalendar(-1); });
        $('#cal-next').addEventListener('click', () => { moveCalendar(1); });
    }

    // ===============================
    // Vistas
    // ===============================
    function cambiarVista(view) {
        state.view = view;
        $$('.tab').forEach(b => {
            const active = b.dataset.view === view;
            b.classList.toggle('active', active);
            b.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        $$('.vista').forEach(v => v.classList.remove('active'));
        $(`#vista-${view}`).classList.add('active');

        // Render específico
        if (view === 'lista') renderList();
        if (view === 'calendario') renderCalendar();
        if (view === 'estadisticas') renderStats();
    }

    function renderAll() {
        renderList();
        renderCalendar();
        renderStats();
    }

    // ===============================
    // Alta / Edición / Eliminación
    // ===============================
    function leerEtiquetas(cadena) {
        if (!cadena) return [];
        return cadena.split(',').map(t => t.trim()).filter(Boolean);
    }

    function agregarTarea() {
        const texto = $('#input-tarea').value.trim();
        const prioridad = $('#input-prioridad').value;
        const categoria = $('#input-categoria').value;
        const fechaInput = $('#input-fecha').value;
        const etiquetas = leerEtiquetas($('#input-etiquetas').value);

        if (!texto) { alert('Escribe una tarea.'); return; }

        const tarea = {
            id: Date.now(),
            texto,
            completada: false,
            prioridad,
            categoria,
            fecha: new Date(),
            fechaVencimiento: fechaInput ? new Date(fechaInput) : null,
            etiquetas,
            subtareas: [],
            notas: '',
            historial: [
                { fecha: new Date(), accion: 'Tarea creada', usuario: 'Usuario' }
            ]
        };

        state.tasks.unshift(tarea);
        // limpiar form
        $('#input-tarea').value = '';
        $('#input-etiquetas').value = '';
        $('#input-fecha').value = '';

        save();
        renderAll();
    }

    function eliminarTarea(id) {
        const idx = state.tasks.findIndex(t => t.id === id);
        if (idx === -1) return;
        state.tasks.splice(idx, 1);
        save();
        renderAll();
    }

    function toggleCompleta(id) {
        const t = state.tasks.find(x => x.id === id);
        if (!t) return;
        t.completada = !t.completada;
        t.historial.push({ fecha: new Date(), accion: t.completada ? 'Marcada como completada' : 'Marcada como pendiente', usuario: 'Usuario' });
        save();
        renderAll();
    }

    function abrirModalEditar(id) {
        const t = state.tasks.find(x => x.id === id);
        if (!t) return;
        state.editingId = id;

        $('#edit-texto').value = t.texto;
        $('#edit-prioridad').value = t.prioridad;
        $('#edit-categoria').value = t.categoria;
        $('#edit-fecha').value = t.fechaVencimiento ? toISODate(t.fechaVencimiento) : '';
        $('#edit-etiquetas').value = t.etiquetas.join(', ');
        $('#edit-notas').value = t.notas || '';

        $('#modal-editar').classList.remove('hidden');
    }

    function closeModal() {
        $('#modal-editar').classList.add('hidden');
        state.editingId = null;
    }

    function saveEdit() {
        const id = state.editingId;
        if (!id) return;

        const t = state.tasks.find(x => x.id === id);
        if (!t) return;

        t.texto = $('#edit-texto').value.trim() || t.texto;
        t.prioridad = $('#edit-prioridad').value;
        t.categoria = $('#edit-categoria').value;
        const fecha = $('#edit-fecha').value;
        t.fechaVencimiento = fecha ? new Date(fecha) : null;
        t.etiquetas = leerEtiquetas($('#edit-etiquetas').value);
        t.notas = $('#edit-notas').value;

        t.historial.push({ fecha: new Date(), accion: 'Tarea editada', usuario: 'Usuario' });

        save();
        closeModal();
        renderAll();
    }

    function agregarSubtarea(id) {
        const t = state.tasks.find(x => x.id === id);
        if (!t) return;
        const texto = prompt('Texto de la subtarea:');
        if (!texto) return;
        const sub = { id: Date.now(), texto: texto.trim(), completada: false };
        t.subtareas.push(sub);
        t.historial.push({ fecha: new Date(), accion: 'Subtarea agregada', usuario: 'Usuario' });
        save();
        renderAll();
    }

    function toggleSubtarea(id, subId) {
        const t = state.tasks.find(x => x.id === id);
        if (!t) return;
        const s = t.subtareas.find(z => z.id === subId);
        if (!s) return;
        s.completada = !s.completada;
        t.historial.push({ fecha: new Date(), accion: s.completada ? 'Subtarea completada' : 'Subtarea pendiente', usuario: 'Usuario' });
        save();
        renderAll();
    }

    function verHistorial(id) {
        const t = state.tasks.find(x => x.id === id);
        if (!t) return;
        const lineas = t.historial
            .map(h => `${fmtFecha(h.fecha)} — ${h.accion}${h.usuario ? ` (${h.usuario})` : ''}`)
            .join('\n');
        alert(lineas || 'Sin eventos.');
    }

    // ===============================
    // Filtros y Render de Lista
    // ===============================
    function coincideBusqueda(t, q) {
        if (!q) return true;
        const texto = (t.texto || '').toLowerCase();
        const etiquetas = (t.etiquetas || []).map(e => `#${e.toLowerCase()}`).join(' ');
        return texto.includes(q) || etiquetas.includes(q.startsWith('#') ? q : `#${q}`);
    }

    function aplicarFiltros(tasks) {
        return tasks.filter(t => {
            if (state.filters.estado === 'pendientes' && t.completada) return false;
            if (state.filters.estado === 'completadas' && !t.completada) return false;

            if (state.filters.prioridad !== 'todas' && t.prioridad !== state.filters.prioridad) return false;
            if (state.filters.categoria !== 'todas' && t.categoria !== state.filters.categoria) return false;

            if (!coincideBusqueda(t, state.filters.busqueda)) return false;

            return true;
        });
    }

    function renderList() {
        const cont = $('#lista-tareas');
        cont.innerHTML = '';

        let items = aplicarFiltros(state.tasks);

        if (items.length === 0) {
            cont.innerHTML = `<p class="badge">No hay tareas para mostrar.</p>`;
            return;
        }

        for (const t of items) {
            const vencida = t.fechaVencimiento && (new Date() > new Date(t.fechaVencimiento)) && !t.completada;

            const card = document.createElement('div');
            card.className = `tarea-card prioridad-${t.prioridad}`;
            card.dataset.id = t.id;

            // header
            const header = document.createElement('div');
            header.className = 'tarea-header';

            const main = document.createElement('div');
            main.className = 'tarea-main';

            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.className = 'chk-tarea';
            chk.checked = !!t.completada;
            chk.dataset.action = 'toggle-tarea';

            const texto = document.createElement('span');
            texto.className = 'tarea-texto' + (t.completada ? ' completada' : '');
            texto.textContent = t.texto;

            const badge = document.createElement('span');
            badge.className = `badge prioridad-${t.prioridad}`;
            badge.textContent = t.prioridad.toUpperCase();

            main.append(chk, texto, badge);

            const acciones = document.createElement('div');
            acciones.className = 'tarea-acciones';
            acciones.innerHTML = `
        <button class="btn" data-action="editar">✏️ Editar</button>
        <button class="btn" data-action="subtarea">➕ Subtarea</button>
        <button class="btn" data-action="historial">📜 Historial</button>
        <button class="btn btn-danger" data-action="eliminar">🗑️</button>
      `;

            header.append(main, acciones);

            // info
            const info = document.createElement('div');
            info.className = 'tarea-info';
            info.innerHTML = `
        <span class="categoria">📁 ${t.categoria}</span>
        ${t.fechaVencimiento ? `<span class="fecha ${vencida ? 'vencida' : ''}">📅 ${fmtFecha(t.fechaVencimiento)}</span>` : ''}
        <span class="creada">🕒 ${fmtFecha(t.fecha)}</span>
      `;

            card.append(header, info);

            // etiquetas
            if (t.etiquetas?.length) {
                const etis = document.createElement('div');
                etis.className = 'etiquetas';
                t.etiquetas.forEach(e => {
                    const sp = document.createElement('span');
                    sp.className = 'etiqueta';
                    sp.textContent = `#${e}`;
                    etis.append(sp);
                });
                card.append(etis);
            }

            // subtareas
            if (t.subtareas?.length) {
                const subCont = document.createElement('div');
                subCont.className = 'subtareas';
                const title = document.createElement('strong');
                title.textContent = 'Subtareas:';
                subCont.append(title);

                t.subtareas.forEach(s => {
                    const row = document.createElement('div');
                    row.className = 'subtarea';
                    row.innerHTML = `
            <input type="checkbox" data-action="toggle-sub" data-id="${t.id}" data-sub="${s.id}" ${s.completada ? 'checked' : ''} />
            <span ${s.completada ? 'style="text-decoration:line-through;color:#9aa3b5"' : ''}>${s.texto}</span>
          `;
                    subCont.append(row);
                });

                card.append(subCont);
            }

            cont.append(card);
        }
    }

    function onListClick(e) {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const card = e.target.closest('.tarea-card');
        const id = Number(card?.dataset.id);
        if (!id) return;

        if (action === 'editar') abrirModalEditar(id);
        if (action === 'subtarea') agregarSubtarea(id);
        if (action === 'historial') verHistorial(id);
        if (action === 'eliminar') {
            if (confirm('¿Eliminar esta tarea?')) eliminarTarea(id);
        }
    }

    function onListChange(e) {
        const el = e.target;
        if (el.matches('input[data-action="toggle-tarea"]')) {
            const card = el.closest('.tarea-card');
            toggleCompleta(Number(card.dataset.id));
        }
        if (el.matches('input[data-action="toggle-sub"]')) {
            const id = Number(el.dataset.id);
            const sub = Number(el.dataset.sub);
            toggleSubtarea(id, sub);
        }
    }

    // ===============================
    // Calendario
    // ===============================
    function moveCalendar(delta) {
        const d = state.calCursor;
        state.calCursor = new Date(d.getFullYear(), d.getMonth() + delta, 1);
        renderCalendar();
    }

    function renderCalendar() {
        // Título
        const dt = state.calCursor;
        const titulo = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(dt);
        $('.cal-title').textContent = titulo.charAt(0).toUpperCase() + titulo.slice(1);

        const cont = $('#calendario');
        cont.innerHTML = '';

        const daysHead = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
        for (const h of daysHead) {
            const head = document.createElement('div');
            head.className = 'cal-day-head';
            head.textContent = h;
            cont.append(head);
        }

        const year = dt.getFullYear();
        const month = dt.getMonth();

        // primer día (convertir a lunes=0)
        const first = new Date(year, month, 1);
        let start = first.getDay(); // 0=dom
        start = (start === 0 ? 6 : start - 1); // 0=lun

        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // mapear tareas por día
        const porDia = new Map();
        state.tasks.forEach(t => {
            if (!t.fechaVencimiento) return;
            const d = new Date(t.fechaVencimiento);
            if (d.getMonth() === month && d.getFullYear() === year) {
                const key = d.getDate();
                if (!porDia.has(key)) porDia.set(key, []);
                porDia.get(key).push(t);
            }
        });

        // celdas vacías antes
        for (let i = 0; i < start; i++) {
            const empty = document.createElement('div');
            empty.className = 'cal-cell';
            cont.append(empty);
        }

        // días del mes
        for (let day = 1; day <= daysInMonth; day++) {
            const cell = document.createElement('div');
            cell.className = 'cal-cell';
            const n = document.createElement('div');
            n.className = 'num';
            n.textContent = day;
            cell.append(n);

            const listado = porDia.get(day) || [];
            listado.slice(0, 4).forEach(t => {
                const tag = document.createElement('div');
                tag.className = `cal-task ${t.prioridad}`;
                tag.textContent = t.texto;
                cell.append(tag);
            });
            if (listado.length > 4) {
                const more = document.createElement('div');
                more.className = 'cal-task';
                more.textContent = `+${listado.length - 4} más…`;
                cell.append(more);
            }

            cont.append(cell);
        }
    }

    // ===============================
    // Estadísticas
    // ===============================
    function renderStats() {
        const cont = $('#estadisticas');
        cont.innerHTML = '';

        const total = state.tasks.length;
        const comp = state.tasks.filter(t => t.completada).length;
        const pend = total - comp;

        const porPrioridad = { alta: 0, media: 0, baja: 0 };
        const porCategoria = {};
        state.tasks.forEach(t => {
            porPrioridad[t.prioridad] = (porPrioridad[t.prioridad] || 0) + 1;
            porCategoria[t.categoria] = (porCategoria[t.categoria] || 0) + 1;
        });

        const wrap = document.createElement('div');
        wrap.className = 'stat-grid';

        // Totales
        wrap.append(statCard('Total', total, total, total));
        wrap.append(statCard('Completadas', comp, total, comp));
        wrap.append(statCard('Pendientes', pend, total, pend));

        // Por prioridad
        wrap.append(statCard('Prioridad alta', porPrioridad.alta, total, porPrioridad.alta));
        wrap.append(statCard('Prioridad media', porPrioridad.media, total, porPrioridad.media));
        wrap.append(statCard('Prioridad baja', porPrioridad.baja, total, porPrioridad.baja));

        // Por categoría
        for (const [cat, val] of Object.entries(porCategoria)) {
            wrap.append(statCard(`Categoría: ${cat}`, val, total, val));
        }

        cont.append(wrap);
    }

    function statCard(title, value, total, current) {
        const card = document.createElement('div');
        card.className = 'stat-card';
        const pct = total ? Math.round((current / total) * 100) : 0;

        card.innerHTML = `
      <h4 class="stat-title">${title}</h4>
      <div class="stat-value">${value}</div>
      <div class="bar"><span style="width:${pct}%"></span></div>
      <div style="color:#9fb0c8; font-size:.85rem; margin-top:6px">${pct}%</div>
    `;
        return card;
    }

    // ===============================
    // Go!
    // ===============================
    init();

})();