const TABLES_COUNT = 6;
const DAY_RATE = 2000;
const NIGHT_RATE = 3000;
const BASE_SALARY = 6000;
const PERCENT = 0.08;

const STAFF_LIST = [
    { name: "Султан", password: "1111", role: "admin" },
    { name: "Дидар", password: "1111", role: "admin" },
    { name: "Хозяин", password: "0000", role: "owner" }
];

let state = JSON.parse(localStorage.getItem('sensei_state')) || {
    activeStaffName: null,
    shiftActive: false,
    totalRevenue: 0,
    tableRevenue: 0,
    barRevenue: 0,
    unpaidChecks: [],
    debts: [],
    inventory: [], 
    shiftHistory: [], // Глобальная история всех смен
    tables: Array.from({ length: TABLES_COUNT }, (_, i) => ({
        id: i + 1, active: false, startTime: null, bar: [], clientName: "Гость"
    }))
};

function save() {
    localStorage.setItem('sensei_state', JSON.stringify(state));
    render();
}

function switchPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`page-${pageId}`).style.display = 'block';
    event.currentTarget.classList.add('active');
}

function login() {
    const idx = document.getElementById('staff-select').value;
    const pass = document.getElementById('pass-input').value;
    const user = STAFF_LIST[idx];

    if (pass === user.password) {
        state.activeStaffName = user.name;
        state.shiftActive = true;
        save();
    } else {
        document.getElementById('auth-error').style.display = 'block';
        setTimeout(() => document.getElementById('auth-error').style.display = 'none', 2000);
    }
}

function logout() {
    if (confirm("Вы уверены, что хотите закрыть смену? Данные о выручке сохранятся в историю.")) {
        const isOwner = state.activeStaffName === "Хозяин";
        const salary = isOwner ? 0 : Math.round(state.totalRevenue * PERCENT + BASE_SALARY);

        // Запись в историю
        state.shiftHistory.push({
            date: new Date().toLocaleString(),
            admin: state.activeStaffName,
            tableRev: state.tableRevenue,
            barRev: state.barRevenue,
            totalRev: state.totalRevenue,
            earned: salary,
            advance: 0
        });

        state.shiftActive = false;
        state.totalRevenue = 0;
        state.tableRevenue = 0;
        state.barRevenue = 0;
        state.activeStaffName = null;
        save();
    }
}

function renderInventory() {
    const list = document.getElementById('inventory-list');
    const search = document.getElementById('inventory-search').value.toLowerCase();
    if(!list) return;

    list.innerHTML = state.inventory
        .filter(i => i.name.toLowerCase().includes(search))
        .map(i => `
            <div style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #222;">
                <span>${i.name}</span>
                <span style="color:var(--gold)">${i.sellPrice} ₸</span>
            </div>
        `).join('');
}

function renderAdminStats() {
    const table = document.getElementById('admin-personal-history');
    const accBox = document.getElementById('accumulated-salary');
    if (!table) return;

    const myHistory = state.shiftHistory.filter(h => h.admin === state.activeStaffName);
    let totalAcc = 0;

    table.innerHTML = myHistory.map(h => {
        const net = h.earned - h.advance;
        totalAcc += net;
        return `<tr><td>${h.date}</td><td>${h.totalRev}</td><td>${h.earned}</td><td>${h.advance}</td><td>${net}</td></tr>`;
    }).join('');
    accBox.innerText = totalAcc;
}

function renderAccounting() {
    const list = document.getElementById('shift-history-list');
    if (state.activeStaffName !== "Хозяин" || !list) return;

    list.innerHTML = `
        <table class="report-table">
            <thead><tr><th>Дата</th><th>Админ</th><th>Выручка</th><th>ЗП</th><th>Действие</th></tr></thead>
            <tbody>
                ${state.shiftHistory.map((h, i) => `
                    <tr>
                        <td>${h.date}</td><td>${h.admin}</td><td>${h.totalRev}</td><td>${h.earned}</td>
                        <td><button onclick="payOut(${i})" style="color:var(--green); background:none; border:1px solid; cursor:pointer;">ВЫПЛАТИТЬ</button></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>`;
}

function payOut(index) {
    if(confirm("Удалить из списка задолженностей? (Деньги выплачены)")) {
        state.shiftHistory.splice(index, 1);
        save();
    }
}

function render() {
    if (!state.shiftActive) {
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('main-content').style.display = 'none';
        return;
    }

    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';

    const isOwner = state.activeStaffName === "Хозяин";
    document.getElementById('owner-nav-btn').style.display = isOwner ? 'block' : 'none';
    document.getElementById('btn-add-inventory').style.display = isOwner ? 'block' : 'none';

    const hall = document.querySelector('.hall-map');
    hall.innerHTML = state.tables.map(t => `
        <div class="table-card ${t.active ? 'active' : ''}">
            <div class="table-num">Стол ${t.id}</div>
            <div class="timer">${t.active ? new Date(Date.now() - t.startTime).toISOString().substr(11, 8) : '00:00:00'}</div>
            <button class="${t.active ? 'btn-stop' : 'btn-start'}" onclick="${t.active ? `closeTable(${t.id})` : `startTable(${t.id})`}">
                ${t.active ? 'СТОП' : 'ПУСК'}
            </button>
        </div>
    `).join('');

    renderInventory();
    renderAdminStats();
    renderAccounting();

    document.getElementById('display-admin-name').innerText = state.activeStaffName;
    document.getElementById('stat-revenue').innerText = state.totalRevenue;
    document.getElementById('stat-salary').innerText = isOwner ? 0 : Math.round(state.totalRevenue * PERCENT + BASE_SALARY);
    document.getElementById('role-badge').innerText = isOwner ? "ХОЗЯИН" : "АДМИН";
}

function startTable(id) {
    const t = state.tables.find(x => x.id === id);
    t.active = true;
    t.startTime = Date.now();
    save();
}

function closeTable(id) {
    const t = state.tables.find(x => x.id === id);
    const cost = 2000; // Упрощенно для теста
    state.totalRevenue += cost;
    state.tableRevenue += cost;
    t.active = false;
    save();
}

function addInventoryItem() {
    const name = prompt("Название товара:");
    const price = parseInt(prompt("Цена продажи:"));
    if(name && price) {
        state.inventory.push({ name, sellPrice: price, buyPrice: price*0.7 });
        save();
    }
}

window.onload = () => {
    document.getElementById('staff-select').innerHTML = STAFF_LIST.map((s, i) => `<option value="${i}">${s.name}</option>`).join('');
    render();
    setInterval(render, 1000);
};
