const STAFF = [
    { name: "Султан", pin: "1111", role: "admin" },
    { name: "Дидар", pin: "2222", role: "admin" },
    { name: "Хозяин", pin: "0000", role: "owner" }
];

let state = JSON.parse(localStorage.getItem('sensei_v8')) || {
    isAuth: false, user: null, revenue: 0,
    inventory: [], debts: [], checks: [], history: [],
    tables: [1,2,3,4,5,6].map(id => ({ id, active: false, guest: '', start: null }))
};

function save() { localStorage.setItem('sensei_v8', JSON.stringify(state)); render(); }

function login() {
    const idx = document.getElementById('staff-select').value;
    const pin = document.getElementById('pass-input').value;
    if (STAFF[idx].pin === pin) {
        state.isAuth = true; state.user = STAFF[idx]; save();
    } else {
        document.getElementById('auth-error').style.display = 'block';
    }
}

function logout() {
    if(confirm("Закрыть смену?")) {
        const salary = state.user.role === 'owner' ? 0 : Math.round(state.revenue * 0.08 + 6000);
        state.history.push({ date: new Date().toLocaleDateString(), admin: state.user.name, rev: state.revenue, sal: salary });
        state.isAuth = false; state.revenue = 0; save(); location.reload();
    }
}

function formatTime(ms) {
    let s = Math.floor(ms / 1000);
    let h = String(Math.floor(s / 3600)).padStart(2, '0');
    let m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    return `${h}:${m}:${String(s % 60).padStart(2, '0')}`;
}

function calcMoney(ms) {
    let mins = Math.floor(ms / 60000);
    return Math.max(500, Math.ceil(mins * (2000 / 60))); // 2000 тг/час
}

function toggleTable(id) {
    const t = state.tables.find(x => x.id === id);
    if (!t.active) {
        const name = prompt("Имя гостя?");
        if(name) { t.active = true; t.guest = name; t.start = Date.now(); }
    } else {
        if(confirm(`Закрыть стол №${id}? Чек уйдет в ожидание.`)) {
            state.checks.push({ name: t.guest, amount: calcMoney(Date.now() - t.start), table: id });
            t.active = false; t.guest = ''; t.start = null;
        }
    }
    save();
}

function commTable(id) {
    const t = state.tables.find(x => x.id === id);
    if(t.active && confirm("Коммерция: записать текущий счет и сбросить таймер?")) {
        state.checks.push({ name: t.guest + " (Коммерция)", amount: calcMoney(Date.now() - t.start), table: id });
        t.start = Date.now(); // Сброс таймера
        save();
    }
}

function payCheck(i) { state.revenue += state.checks[i].amount; state.checks.splice(i, 1); save(); }
function toDebt(i) { state.debts.push({ ...state.checks[i], date: new Date().toLocaleDateString() }); state.checks.splice(i, 1); save(); }

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
    document.getElementById('owner-tab').style.display = state.user.role === 'owner' ? 'block' : 'none';

    document.getElementById('tables-grid').innerHTML = state.tables.map(t => {
        let timeStr = "00:00:00", moneyStr = "0";
        if(t.active) {
            let diff = Date.now() - t.start;
            timeStr = formatTime(diff);
            moneyStr = calcMoney(diff).toLocaleString();
        }
        return `
            <div class="table-card ${t.active ? 'active' : ''}">
                <div class="gold-text" style="font-weight:bold; font-size:18px;">СТОЛ ${t.id}</div>
                <div style="font-size:10px; color:#888;">${t.active ? '👤 ' + t.guest : 'СВОБОДЕН'}</div>
                <div class="timer">${timeStr}</div>
                <div class="gold-text" style="font-size:20px; font-weight:bold;">${moneyStr} ₸</div>
                <button onclick="toggleTable(${t.id})" class="${t.active ? 'btn-red' : 'btn-gold'}">${t.active ? 'СТОП' : 'ПУСК'}</button>
                ${t.active ? `<div class="btn-group"><button class="btn-small" onclick="alert('Бронь')">БРОНЬ</button><button class="btn-small" onclick="commTable(${t.id})">КОММЕРЦ</button></div>` : ''}
            </div>
        `;
    }).join('');

    document.getElementById('active-checks').innerHTML = state.checks.map((c, i) => `
        <div class="check-row">
            <div><b>${c.name}</b><br><small>Стол ${c.table} | ${c.amount} ₸</small></div>
            <div>
                <button onclick="payCheck(${i})" style="background:#2ecc71; border:none; padding:8px; border-radius:5px; color:#fff; cursor:pointer;">ОПЛАТА</button>
                <button onclick="toDebt(${i})" style="background:#e74c3c; border:none; padding:8px; border-radius:5px; color:#fff; cursor:pointer;">ДОЛГ</button>
            </div>
        </div>
    `).join('');

    document.getElementById('stock-list').innerHTML = state.inventory.map(i => `<tr><td>${i.name}</td><td>${i.price} ₸</td></tr>`).join('');
    document.getElementById('debts-list').innerHTML = state.debts.map(d => `<tr><td>${d.name}</td><td>${d.amount} ₸</td><td>${d.date}</td></tr>`).join('');
    document.getElementById('history-list').innerHTML = state.history.map(h => `<tr><td>${h.date}</td><td>${h.admin}</td><td>${h.rev} ₸</td><td>${h.sal} ₸</td></tr>`).join('');
}

function showTab(id, btn) {
    document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
    document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + id).style.display = 'block';
    btn.classList.add('active');
}

function addStock() {
    let n = prompt("Товар:"), p = prompt("Цена:");
    if(n && p) { state.inventory.push({name: n, price: p}); save(); }
}

window.onload = () => { render(); setInterval(() => { if(state.isAuth) render(); }, 1000); };
