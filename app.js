const STAFF = [
    { name: "Султан", pin: "1111", role: "admin" },
    { name: "Дидар", pin: "2222", role: "admin" },
    { name: "Другой админ...", pin: "1111", role: "extra" },
    { name: "Хозяин", pin: "0000", role: "owner" }
];

let state = JSON.parse(localStorage.getItem('sensei_final_v1')) || {
    isAuth: false,
    user: null,
    revenue: 0,
    history: [],
    inventory: [],
    debts: [],
    checks: [],
    tables: [1,2,3,4,5,6].map(id => ({ id, active: false, guest: '', start: null }))
};

function save() {
    localStorage.setItem('sensei_final_v1', JSON.stringify(state));
    render();
}

// АВТОРИЗАЦИЯ
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
    if(confirm("Закрыть смену?")) {
        const salary = state.user.role === 'owner' ? 0 : Math.round(state.revenue * 0.08 + 6000);
        state.history.push({
            date: new Date().toLocaleString(),
            admin: state.user.name,
            rev: state.revenue,
            salary: salary
        });
        state.isAuth = false;
        state.revenue = 0;
        save();
        location.reload();
    }
}

// УПРАВЛЕНИЕ СТОЛАМИ
function startTable(id) {
    const t = state.tables.find(x => x.id === id);
    const name = prompt("Имя гостя?");
    if(name) {
        t.active = true;
        t.guest = name;
        t.start = Date.now();
        save();
    }
}

function stopTable(id) {
    const t = state.tables.find(x => x.id === id);
    if(confirm(`Завершить игру за столом ${id}? Чек будет перенесен в список ожидания.`)) {
        const cost = 2000; // Здесь будет твоя формула времени
        state.checks.push({
            name: t.guest,
            amount: cost,
            table: id,
            time: new Date().toLocaleTimeString()
        });
        t.active = false;
        t.guest = '';
        save();
    }
}

// РЕНДЕР
function render() {
    if (!state.isAuth) {
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app').style.display = 'none';
        const sel = document.getElementById('staff-select');
        if(!sel.options.length) sel.innerHTML = STAFF.map((s, i) => `<option value="${i}">${s.name}</option>`).join('');
        return;
    }

    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
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
            <button onclick="${t.active ? `stopTable(${t.id})` : `startTable(${t.id})`}" class="btn-gold">
                ${t.active ? 'СТОП' : 'ПУСК'}
            </button>
        </div>
    `).join('');

    // Рендер чеков
    document.getElementById('active-checks').innerHTML = state.checks.map((c, i) => `
        <div class="check-row">
            <div><b>${c.name}</b> <br> <small>Стол ${c.table} | ${c.amount} ₸</small></div>
            <div>
                <button class="btn-pay" onclick="payCheck(${i})">ОПЛАТА</button>
                <button class="btn-debt" onclick="toDebt(${i})">ДОЛГ</button>
            </div>
        </div>
    `).join('');

    renderStock();
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

function renderStock() {
    const list = document.getElementById('stock-list');
    const search = document.getElementById('stock-search').value.toLowerCase();
    list.innerHTML = state.inventory.filter(x => x.name.toLowerCase().includes(search)).map(i => `
        <tr><td>${i.name}</td><td>${i.price} ₸</td><td><button onclick="buyItem('${i.name}')">ПРОДАТЬ</button></td></tr>
    `).join('');
}

function addItem() {
    const name = prompt("Название:");
    const price = prompt("Цена:");
    if(name && price) { state.inventory.push({name, price: parseInt(price)}); save(); }
}

function showTab(id) {
    document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
    document.querySelectorAll('.tab-link').forEach(l => l.classList.remove('active'));
    document.getElementById('tab-' + id).style.display = 'block';
    event.currentTarget.classList.add('active');
}

window.onload = render;
