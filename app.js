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
    shiftHistory: [],
    tables: Array.from({ length: TABLES_COUNT }, (_, i) => ({
        id: i + 1, active: false, startTime: null, bar: [], clientName: "Гость"
    }))
};

function save() {
    localStorage.setItem('sensei_state', JSON.stringify(state));
    render();
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
    }
}

function logout() {
    if (confirm("Закрыть смену?")) {
        const isOwner = state.activeStaffName === "Хозяин";
        const salary = isOwner ? 0 : Math.round(state.totalRevenue * PERCENT + BASE_SALARY);

        state.shiftHistory.push({
            date: new Date().toLocaleDateString(),
            admin: state.activeStaffName,
            totalRev: state.totalRevenue,
            earned: salary,
            advance: 0
        });

        state.shiftActive = false;
        state.activeStaffName = null;
        state.totalRevenue = 0;
        save();
        location.reload();
    }
}

function render() {
    const auth = document.getElementById('auth-screen');
    const main = document.getElementById('main-content');

    // ГЛАВНОЕ ИСПРАВЛЕНИЕ: Если смена не активна — только вход!
    if (!state.shiftActive) {
        auth.style.display = 'flex';
        main.style.display = 'none';
        return;
    }

    auth.style.display = 'none';
    main.style.display = 'block';

    const isOwner = state.activeStaffName === "Хозяин";
    document.getElementById('owner-nav-btn').style.display = isOwner ? 'block' : 'none';
    document.getElementById('btn-add-inventory').style.display = isOwner ? 'block' : 'none';

    // Рендер столов
    document.querySelector('.hall-map').innerHTML = state.tables.map(t => `
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
    if(isOwner) renderAccounting();

    document.getElementById('display-admin-name').innerText = state.activeStaffName;
    document.getElementById('stat-revenue').innerText = state.totalRevenue;
    document.getElementById('stat-salary').innerText = isOwner ? 0 : Math.round(state.totalRevenue * PERCENT + BASE_SALARY);
    document.getElementById('role-badge').innerText = isOwner ? "ХОЗЯИН" : "АДМИН";
}

// Вспомогательные функции (Склад, Статистика)
function renderInventory() {
    const list = document.getElementById('inventory-list');
    const search = document.getElementById('inventory-search').value.toLowerCase();
    list.innerHTML = state.inventory.filter(i => i.name.toLowerCase().includes(search))
        .map(i => `<div class="report-table"><td>${i.name}</td><td>${i.sellPrice} ₸</td></div>`).join('');
}

function renderAdminStats() {
    const myHistory = state.shiftHistory.filter(h => h.admin === state.activeStaffName);
    let total = 0;
    document.getElementById('admin-personal-history').innerHTML = myHistory.map(h => {
        total += h.earned;
        return `<tr><td>${h.date}</td><td>${h.totalRev}</td><td>${h.earned}</td><td>0</td><td>${h.earned}</td></tr>`;
    }).join('');
    document.getElementById('accumulated-salary').innerText = total;
}

function renderAccounting() {
    document.getElementById('shift-history-list').innerHTML = `<table class="report-table">
        ${state.shiftHistory.map((h, i) => `<tr><td>${h.date}</td><td>${h.admin}</td><td>${h.totalRev}</td><td><button onclick="payOut(${i})">ОК</button></td></tr>`).join('')}
    </table>`;
}

function startTable(id) {
    const t = state.tables.find(x => x.id === id);
    t.active = true; t.startTime = Date.now(); save();
}

function closeTable(id) {
    const t = state.tables.find(x => x.id === id);
    state.totalRevenue += 2000; t.active = false; save();
}

function payOut(i) { state.shiftHistory.splice(i, 1); save(); }

function addInventoryItem() {
    const n = prompt("Название:"); const p = prompt("Цена:");
    if(n && p) { state.inventory.push({name: n, sellPrice: parseInt(p)}); save(); }
}

function switchPage(p) {
    document.querySelectorAll('.page').forEach(x => x.style.display = 'none');
    document.querySelectorAll('.nav-btn').forEach(x => x.classList.remove('active'));
    document.getElementById(`page-${p}`).style.display = 'block';
    event.currentTarget.classList.add('active');
}

window.onload = () => {
    document.getElementById('staff-select').innerHTML = STAFF_LIST.map((s, i) => `<option value="${i}">${s.name}</option>`).join('');
    render();
    setInterval(render, 1000);
};
