const STAFF = [
    { name: "Султан", pin: "1111", role: "admin" },
    { name: "Дидар", pin: "1111", role: "admin" },
    { name: "Другой админ...", pin: "1111", role: "extra" },
    { name: "Хозяин", pin: "0000", role: "owner" }
];

let state;

function initApp() {
    try {
        const saved = localStorage.getItem('sensei_v6');
        state = saved ? JSON.parse(saved) : null;
        if (!state || !state.tables) throw new Error();
    } catch (e) {
        state = {
            isAuth: false, user: null, revenue: 0, history: [], inventory: [], debts: [], checks: [],
            tables: [1,2,3,4,5,6].map(id => ({ id, active: false, guest: '', start: null, reservation: '' }))
        };
    }
    render();
}

function save() {
    localStorage.setItem('sensei_v6', JSON.stringify(state));
    render();
}

function login() {
    const idx = document.getElementById('staff-select').value;
    const pin = document.getElementById('pass-input').value;
    const user = STAFF[idx];
    if (user.pin === pin) {
        state.user = { ...user };
        if(user.role === 'extra') state.user.name = document.getElementById('extra-name').value || "Запасной";
        state.isAuth = true;
        save();
    } else {
        document.getElementById('auth-error').style.display = 'block';
    }
}

function logout() {
    if(confirm("Завершить смену?")) {
        const salary = state.user.role === 'owner' ? 0 : Math.round(state.revenue * 0.08 + 6000);
        state.history.push({ date: new Date().toLocaleString(), admin: state.user.name, rev: state.revenue, sal: salary });
        state.isAuth = false; state.revenue = 0; save(); location.reload();
    }
}

function toggleTable(id) {
    const t = state.tables.find(x => x.id === id);
    if (!t.active) {
        const name = prompt("Имя гостя?");
        if(name) { t.active = true; t.guest = name; t.start = Date.now(); }
    } else {
        if(confirm(`Закрыть стол №${id}?`)) {
            const cost = calculateCost(t.start);
            state.checks.push({ name: t.guest, amount: cost, table: id, time: new Date().toLocaleTimeString() });
            t.active = false; t.guest = ''; t.start = null;
        }
    }
    save();
}

function calculateCost(startTime) {
    const minutes = Math.floor((Date.now() - startTime) / 60000);
    return Math.max(500, Math.ceil(minutes * (2000 / 60))); // 2000 в час
}

function render() {
    if (!state.isAuth) {
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app').style.display = 'none';
        document.getElementById('staff-select').innerHTML = STAFF.map((s, i) => `<option value="${i}">${s.name}</option>`).join('');
        return;
    }
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('user-display').innerText = state.user.name;
    document.getElementById('rev-val').innerText = state.revenue.toLocaleString();
    document.getElementById('salary-val').innerText = Math.round(state.revenue * 0.08 + 6000).toLocaleString();
    
    if(state.user.role === 'owner') document.getElementById('owner-tab').style.display = 'block';

    const grid = document.getElementById('tables-grid');
    grid.innerHTML = state.tables.map(t => {
        let timeDisplay = "00:00:00";
        let costDisplay = "0";
        if (t.active && t.start) {
            const diff = Date.now() - t.start;
            timeDisplay = new Date(diff).toISOString().substr(11, 8);
            costDisplay = calculateCost(t.start);
        }
        return `
            <div class="table-card ${t.active ? 'active' : ''}">
                <div class="table-num">СТОЛ ${t.id}</div>
                <div style="font-size:10px; color:#aaa;">${t.active ? '👤 ' + t.guest : 'СВОБОДЕН'}</div>
                <div class="timer" id="timer-${t.id}">${timeDisplay}</div>
                <div class="gold-text" style="font-weight:bold; margin-bottom:10px;">${costDisplay} ₸</div>
                <button onclick="toggleTable(${t.id})" class="btn-gold" style="background:${t.active ? '#8b0000' : '#d4af37'}; color:${t.active ? '#fff' : '#000'}">
                    ${t.active ? 'СТОП' : 'ПУСК'}
                </button>
                <div class="btn-action-group">
                    <button class="btn-small-gold" onclick="alert('Бронь')">БРОНЬ</button>
                    <button class="btn-small-gold" onclick="alert('Коммерция')">КОММЕРЦ</button>
                </div>
            </div>
        `;
    }).join('');

    document.getElementById('active-checks').innerHTML = state.checks.map((c, i) => `
        <div class="check-row">
            <div><b>${c.name}</b> <br> <small>Стол ${c.table} | ${c.amount} ₸</small></div>
            <button onclick="payCheck(${i})" class="btn-gold" style="width:auto; padding:5px 15px;">ОПЛАТА</button>
        </div>
    `).join('');
}

function payCheck(i) {
    state.revenue += state.checks[i].amount;
    state.checks.splice(i, 1);
    save();
}

function showPage(p, btn) {
    document.querySelectorAll('.page-content').forEach(x => x.style.display = 'none');
    document.querySelectorAll('.nav-link').forEach(x => x.classList.remove('active'));
    document.getElementById('page-' + p).style.display = 'block';
    btn.classList.add('active');
}

window.onload = initApp;
setInterval(() => { if(state.isAuth) render(); }, 1000); // Обновление таймеров каждую секунду
