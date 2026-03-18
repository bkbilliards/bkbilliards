const STAFF = [
    { name: "Султан", pin: "1111", role: "admin" },
    { name: "Дидар", pin: "1111", role: "admin" },
    { name: "Другой админ...", pin: "1111", role: "extra" },
    { name: "Хозяин", pin: "0000", role: "owner" }
];

let state;

// ФУНКЦИЯ БЕЗОПАСНОЙ ЗАГРУЗКИ (Защита от черного экрана)
function loadState() {
    try {
        const saved = localStorage.getItem('sensei_db_final');
        if (saved) {
            state = JSON.parse(saved);
        } else {
            throw new Error('No data');
        }
    } catch (e) {
        state = {
            isAuth: false,
            user: null,
            revenue: 0,
            history: [],
            inventory: [],
            debts: [],
            checks: [],
            tables: [1,2,3,4,5,6].map(id => ({ id, active: false, guest: '', start: null, reservation: '' }))
        };
    }
}

function save() {
    localStorage.setItem('sensei_db_final', JSON.stringify(state));
    render();
}

// ВХОД
function toggleExtraName() {
    const sel = document.getElementById('staff-select');
    document.getElementById('extra-name').style.display = (STAFF[sel.value].role === 'extra') ? 'block' : 'none';
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
    if(confirm("Закрыть смену? Все данные сохранятся в историю.")) {
        const salary = state.user.role === 'owner' ? 0 : Math.round(state.revenue * 0.08 + 6000);
        state.history.push({ date: new Date().toLocaleString(), admin: state.user.name, rev: state.revenue, sal: salary });
        state.isAuth = false;
        state.revenue = 0;
        state.checks = [];
        save();
        location.reload();
    }
}

// УПРАВЛЕНИЕ ЗАЛОМ
function toggleTable(id) {
    const t = state.tables.find(x => x.id === id);
    if (!t.active) {
        const name = prompt("Имя гостя?");
        if(name) { t.active = true; t.guest = name; t.start = Date.now(); }
    } else {
        if(confirm(`Закрыть стол №${id}? Чек будет перенесен в список ожидания.`)) {
            const cost = 2000; // Примерная цена
            state.checks.push({ name: t.guest, amount: cost, table: id, time: new Date().toLocaleTimeString() });
            t.active = false;
            t.guest = '';
        }
    }
    save();
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
            <button onclick="toggleTable(${t.id})" class="btn-gold" style="background:${t.active ? '#c0392b' : '#d4af37'}; color:${t.active ? '#fff' : '#000'}">
                ${t.active ? 'ЗАКРЫТЬ' : 'ОТКРЫТЬ'}
            </button>
        </div>
    `).join('');

    // Рендер чеков
    document.getElementById('active-checks').innerHTML = state.checks.map((c, i) => `
        <div class="check-row">
            <div><b>${c.name}</b> <br> <small>Стол ${c.table} | ${c.amount} ₸</small></div>
            <div>
                <button onclick="payCheck(${i})" style="background:#27ae60; color:#fff; border:none; padding:10px; border-radius:5px; cursor:pointer;">ОПЛАТА</button>
                <button onclick="toDebt(${i})" style="background:#e67e22; color:#fff; border:none; padding:10px; border-radius:5px; cursor:pointer; margin-left:5px;">ДОЛГ</button>
            </div>
        </div>
    `).join('');
}

function payCheck(i) {
    state.revenue += state.checks[i].amount;
    state.checks.splice(i, 1);
    save();
}

function toDebt(i) {
    const c = state.checks[i];
    state.debts.push({ ...c, date: new Date().toLocaleDateString() });
    state.checks.splice(i, 1);
    save();
}

function showPage(p) {
    document.querySelectorAll('.page-content').forEach(x => x.style.display = 'none');
    document.querySelectorAll('.nav-link').forEach(x => x.classList.remove('active'));
    document.getElementById('page-' + p).style.display = 'block';
    event.currentTarget.classList.add('active');
}

// Запуск
loadState();
window.onload = render;
