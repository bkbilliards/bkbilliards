const STAFF = [
    { name: "Султан", pin: "1111", role: "admin" },
    { name: "Дидар", pin: "1111", role: "admin" },
    { name: "Другой админ...", pin: "1111", role: "extra" },
    { name: "Хозяин", pin: "0000", role: "owner" }
];

let state;

// ФУНКЦИЯ БЕЗОПАСНОЙ ЗАГРУЗКИ
function initApp() {
    try {
        const saved = localStorage.getItem('sensei_db_v5');
        state = saved ? JSON.parse(saved) : null;
        if (!state || !state.tables) throw new Error();
    } catch (e) {
        state = {
            isAuth: false,
            user: null,
            revenue: 0,
            history: [],
            inventory: [],
            debts: [],
            checks: [],
            tables: [1,2,3,4,5,6].map(id => ({ id, active: false, guest: '', start: null }))
        };
    }
    render();
}

function save() {
    localStorage.setItem('sensei_db_v5', JSON.stringify(state));
    render();
}

function checkExtra(el) {
    document.getElementById('extra-name').style.display = (STAFF[el.value].role === 'extra') ? 'block' : 'none';
}

function login() {
    const idx = document.getElementById('staff-select').value;
    const pin = document.getElementById('pass-input').value;
    const user = STAFF[idx];

    if (user.pin === pin) {
        state.user = { ...user };
        if(user.role === 'extra') {
            state.user.name = document.getElementById('extra-name').value || "Запасной";
        }
        state.isAuth = true;
        save();
    } else {
        document.getElementById('auth-error').style.display = 'block';
    }
}

function logout() {
    if(confirm("Завершить смену? Данные сохранятся.")) {
        const salary = state.user.role === 'owner' ? 0 : Math.round(state.revenue * 0.08 + 6000);
        state.history.push({ date: new Date().toLocaleString(), admin: state.user.name, rev: state.revenue, sal: salary });
        state.isAuth = false;
        state.revenue = 0;
        save();
        location.reload();
    }
}

function render() {
    const auth = document.getElementById('auth-screen');
    const app = document.getElementById('app');

    if (!state.isAuth) {
        auth.style.display = 'flex';
        app.style.display = 'none';
        const sel = document.getElementById('staff-select');
        if(sel.options.length === 0) sel.innerHTML = STAFF.map((s, i) => `<option value="${i}">${s.name}</option>`).join('');
        return;
    }

    auth.style.display = 'none';
    app.style.display = 'block';
    document.getElementById('user-display').innerText = state.user.name;
    document.getElementById('rev-val').innerText = state.revenue.toLocaleString();
    document.getElementById('salary-val').innerText = Math.round(state.revenue * 0.08 + 6000).toLocaleString();
    
    if(state.user.role === 'owner') {
        document.getElementById('owner-tab').style.display = 'block';
        document.getElementById('add-item-btn').style.display = 'block';
    }

    // Рендер столов
    document.getElementById('tables-grid').innerHTML = state.tables.map(t => `
        <div class="table-card ${t.active ? 'active' : ''}">
            <h3 class="gold-text">СТОЛ ${t.id}</h3>
            <p style="font-size:12px; color:#555;">${t.active ? '👤 ' + t.guest : 'СВОБОДЕН'}</p>
            <button onclick="toggleTable(${t.id})" class="btn-gold" style="padding:10px; background:${t.active ? '#c0392b' : '#d4af37'}; color:${t.active ? '#fff' : '#000'}">
                ${t.active ? 'СТОП' : 'ПУСК'}
            </button>
        </div>
    `).join('');
}

function toggleTable(id) {
    const t = state.tables.find(x => x.id === id);
    if (!t.active) {
        const name = prompt("Имя гостя?");
        if(name) { t.active = true; t.guest = name; t.start = Date.now(); }
    } else {
        if(confirm(`Закрыть стол №${id}?`)) {
            state.revenue += 2000; // Пример
            t.active = false;
        }
    }
    save();
}

function showPage(p, btn) {
    document.querySelectorAll('.page-content').forEach(x => x.style.display = 'none');
    document.querySelectorAll('.nav-link').forEach(x => x.classList.remove('active'));
    document.getElementById('page-' + p).style.display = 'block';
    btn.classList.add('active');
}

window.onload = initApp;
