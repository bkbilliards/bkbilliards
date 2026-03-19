const STAFF = [
    { name: "Султан", pin: "1111", role: "admin" },
    { name: "Дидар", pin: "1111", role: "admin" },
    { name: "Другой админ...", pin: "1111", role: "extra" },
    { name: "Хозяин", pin: "0000", role: "owner" }
];

let state = {
    isAuth: false, user: null, revenue: 0,
    inventory: [], debts: [], checks: [], history: [],
    tables: [1,2,3,4,5,6].map(id => ({ id, active: false, guest: '', start: null }))
};

// БЕЗОПАСНАЯ ИНИЦИАЛИЗАЦИЯ
function initApp() {
    try {
        const saved = localStorage.getItem('sensei_billiard_pro');
        if (saved) state = JSON.parse(saved);
        if (!state.tables) throw new Error();
    } catch (e) {
        console.log("Новая база данных инициализирована");
    }
    render();
}

function save() {
    localStorage.setItem('sensei_billiard_pro', JSON.stringify(state));
    render();
}

// АВТОРИЗАЦИЯ
function toggleExtraName() {
    const sel = document.getElementById('staff-select');
    document.getElementById('extra-name').style.display = (sel.value == "2") ? 'block' : 'none';
}

function login() {
    const idx = document.getElementById('staff-select').value;
    const pin = document.getElementById('pass-input').value;
    const user = STAFF[idx];

    if (user.pin === pin) {
        state.user = { ...user };
        if (idx == "2") state.user.name = document.getElementById('extra-name').value || "Запасной";
        state.isAuth = true;
        document.getElementById('pass-input').value = "";
        document.getElementById('auth-error').style.display = 'none';
        save();
    } else {
        document.getElementById('auth-error').style.display = 'block';
    }
}

function logout() {
    if (confirm("Вы точно хотите закрыть смену? Все данные будут сохранены в историю.")) {
        const salary = state.user.role === 'owner' ? 0 : Math.round(state.revenue * 0.08 + 6000);
        state.history.push({
            date: new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString(),
            admin: state.user.name,
            rev: state.revenue,
            sal: salary
        });
        state.isAuth = false;
        state.revenue = 0;
        save();
        location.reload();
    }
}

// ЛОГИКА СТОЛОВ
function formatTime(ms) {
    let s = Math.floor(ms / 1000);
    let h = String(Math.floor(s / 3600)).padStart(2, '0');
    let m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    return `${h}:${m}:${String(s % 60).padStart(2, '0')}`;
}

function calcCost(startTime) {
    let mins = Math.floor((Date.now() - startTime) / 60000);
    return Math.max(500, Math.ceil(mins * (2000 / 60))); // Тариф 2000 тг/час
}

function toggleTable(id) {
    const t = state.tables.find(x => x.id === id);
    if (!t.active) {
        const name = prompt("Введите имя гостя:");
        if (name) { t.active = true; t.guest = name; t.start = Date.now(); }
    } else {
        if (confirm(`Остановить игру за столом №${id}? Счёт перейдет в чеки ожидания оплаты.`)) {
            state.checks.push({ name: t.guest, amount: calcCost(t.start), table: id });
            t.active = false; t.guest = ''; t.start = null;
        }
    }
    save();
}

function commTable(id) {
    const t = state.tables.find(x => x.id === id);
    if (t.active && confirm("Коммерция: перенести текущий счет в чеки и обнулить таймер стола?")) {
        state.checks.push({ name: t.guest + " (Коммерция)", amount: calcCost(t.start), table: id });
        t.start = Date.now();
        save();
    }
}

// ФИНАНСЫ
function payCheck(index) {
    state.revenue += state.checks[index].amount;
    state.checks.splice(index, 1);
    save();
}

function debtCheck(index) {
    state.debts.push({
        name: state.checks[index].name,
        amount: state.checks[index].amount,
        date: new Date().toLocaleDateString()
    });
    state.checks.splice(index, 1);
    save();
}

// ОТРИСОВКА ИНТЕРФЕЙСА
function render() {
    const auth = document.getElementById('auth-screen');
    const app = document.getElementById('app');

    if (!state.isAuth) {
        auth.style.display = 'flex';
        app.style.display = 'none';
        return;
    }

    auth.style.display = 'none';
    app.style.display = 'block';

    const isOwner = state.user.role === 'owner';
    const salary = isOwner ? 0 : Math.round(state.revenue * 0.08 + 6000);

    // Шапка
    document.getElementById('user-display').innerText = state.user.name;
    document.getElementById('rev-val').innerText = state.revenue.toLocaleString();
    document.getElementById('salary-val').innerText = salary.toLocaleString();
    document.getElementById('owner-tab').style.display = isOwner ? 'block' : 'none';
    document.getElementById('add-item-btn').style.display = isOwner ? 'block' : 'none';

    // Столы
    document.getElementById('tables-grid').innerHTML = state.tables.map(t => {
        let timeStr = "00:00:00";
        let costStr = "0";
        if (t.active && t.start) {
            let diff = Date.now() - t.start;
            timeStr = formatTime(diff);
            costStr = calcCost(t.start).toLocaleString();
        }
        return `
            <div class="table-card ${t.active ? 'active' : ''}">
                <div class="gold-text" style="font-weight:bold; font-size:18px;">СТОЛ ${t.id}</div>
                <div style="font-size:11px; color:#888; margin-top:5px;">${t.active ? '👤 ГОСТЬ: ' + t.guest : 'СВОБОДЕН'}</div>
                <div class="timer">${timeStr}</div>
                <div class="gold-text" style="font-size:22px; font-weight:bold; margin-bottom:15px;">${costStr} ₸</div>
                <button onclick="toggleTable(${t.id})" class="${t.active ? 'btn-red' : 'btn-gold'}">${t.active ? 'СТОП (РАСЧЕТ)' : 'ПУСК'}</button>
                ${t.active ? `
                <div class="btn-action-group">
                    <button class="btn-outline" onclick="alert('Бронь включена')">БРОНЬ</button>
                    <button class="btn-outline" onclick="commTable(${t.id})">КОММЕРЦИЯ</button>
                </div>` : ''}
            </div>
        `;
    }).join('');

    // Чеки (Ожидание)
    document.getElementById('active-checks').innerHTML = state.checks.length === 0 
        ? '<p style="text-align:center; color:#666; font-size:12px;">Нет неоплаченных чеков</p>' 
        : state.checks.map((c, i) => `
        <div class="check-row">
            <div><b class="gold-text">${c.name}</b> <br> <span style="font-size:12px; color:#aaa;">Стол ${c.table} | Сумма: ${c.amount} ₸</span></div>
            <div>
                <button onclick="payCheck(${i})" style="background:#2ecc71; border:none; padding:10px 15px; border-radius:6px; color:#000; font-weight:bold; cursor:pointer;">ОПЛАТИТЬ</button>
                <button onclick="debtCheck(${i})" style="background:#c0392b; border:none; padding:10px 15px; border-radius:6px; color:#fff; font-weight:bold; cursor:pointer; margin-left:5px;">В ДОЛГ</button>
            </div>
        </div>
    `).join('');

    // Личная статистика админа
    let accSalary = 0;
    const myHistory = state.history.filter(h => h.admin === state.user.name);
    document.getElementById('my-history-list').innerHTML = myHistory.map(h => {
        accSalary += h.sal;
        return `<tr><td>${h.date}</td><td>${h.rev} ₸</td><td class="gold-text">${h.sal} ₸</td></tr>`;
    }).join('');
    document.getElementById('acc-salary').innerText = accSalary.toLocaleString();

    // Остальные списки
    document.getElementById('debts-list').innerHTML = state.debts.map(d => `<tr><td>${d.name}</td><td style="color:#e74c3c; font-weight:bold;">${d.amount} ₸</td><td>${d.date}</td></tr>`).join('');
    document.getElementById('global-history-list').innerHTML = state.history.map(h => `<tr><td>${h.date}</td><td>${h.admin}</td><td>${h.rev} ₸</td><td class="gold-text">${h.sal} ₸</td></tr>`).join('');
    renderStock();
}

function showTab(id, btn) {
    document.querySelectorAll('.tab-pane').forEach(x => x.style.display = 'none');
    document.querySelectorAll('.nav-link').forEach(x => x.classList.remove('active'));
    document.getElementById('tab-' + id).style.display = 'block';
    btn.classList.add('active');
}

function renderStock() {
    const list = document.getElementById('stock-list');
    const q = document.getElementById('stock-search').value.toLowerCase();
    list.innerHTML = state.inventory.filter(i => i.name.toLowerCase().includes(q)).map(i => `
        <tr><td>${i.name}</td><td class="gold-text">${i.price} ₸</td><td><button style="background:var(--card-bg); border:1px solid var(--gold); color:var(--gold); padding:5px 15px; border-radius:4px; cursor:pointer;">Продать</button></td></tr>
    `).join('');
}

function addItem() {
    const name = prompt("Название товара:");
    const price = prompt("Цена продажи:");
    if(name && price) { state.inventory.push({name, price: parseInt(price)}); save(); }
}

// ЗАПУСК ПРОГРАММЫ
window.onload = () => {
    initApp();
    setInterval(() => { if(state.isAuth) render(); }, 1000); // Таймер каждую секунду
};
