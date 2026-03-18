const TABLES_COUNT = 6;
const DAY_RATE = 2000;
const NIGHT_RATE = 3000;
const BASE_SALARY = 6000;
const PERCENT = 0.08;

const STAFF = [
    { name: "Султан", password: "1111", role: "admin" },
    { name: "Дидар", password: "1111", role: "admin" },
    { name: "Запасной", password: "1111", role: "admin" },
    { name: "Хозяин", password: "0000", role: "owner" }
];

let state = JSON.parse(localStorage.getItem('sensei_state')) || {
    activeStaffName: null,
    shiftActive: false,
    totalRevenue: 0,
    debts: [],
    inventory: [], 
    tables: Array.from({ length: TABLES_COUNT }, (_, i) => ({
        id: i + 1, active: false, startTime: null, bar: [], clientName: "Гость", discount: 0
    }))
};

function save() {
    localStorage.setItem('sensei_state', JSON.stringify(state));
}

function showMain() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';
    const currentStaff = STAFF.find(s => s.name === state.activeStaffName);
    if (currentStaff && currentStaff.role === 'owner') {
        document.getElementById('owner-section').style.display = 'block';
    } else {
        document.getElementById('owner-section').style.display = 'none';
    }
}

function showAuth() {
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('main-content').style.display = 'none';
}

function login() {
    const staffIdx = document.getElementById('staff-select').value;
    const passInput = document.getElementById('pass-input').value;
    const selectedStaff = STAFF[staffIdx];
    
    if (passInput === selectedStaff.password) {
        state.activeStaffName = selectedStaff.name;
        state.shiftActive = true;
        save();
        showMain();
        render();
    } else {
        document.getElementById('auth-error').style.display = 'block';
        setTimeout(() => { document.getElementById('auth-error').style.display = 'none'; }, 2000);
    }
}

function logout() {
    let salary = state.activeStaffName === "Хозяин" ? 0 : Math.round(state.totalRevenue * PERCENT + BASE_SALARY);
    if (confirm(`Выручка: ${state.totalRevenue} ₸\nЗарплата: ${salary} ₸\nЗакрыть смену?`)) {
        state.shiftActive = false;
        state.activeStaffName = null;
        state.totalRevenue = 0;
        save();
        location.reload();
    }
}

function calculateAmount(startTime, endTime, discountPercent = 0) {
    let total = 0;
    const diffMin = Math.ceil((endTime - startTime) / (1000 * 60));
    const roundedMin = Math.ceil(diffMin / 5) * 5; 
    let tempTime = new Date(startTime);
    for (let i = 0; i < roundedMin; i++) {
        let hour = tempTime.getHours();
        total += ((hour >= 11 && hour < 18) ? DAY_RATE : NIGHT_RATE) / 60;
        tempTime.setMinutes(tempTime.getMinutes() + 1);
    }
    return Math.round(total - (total * discountPercent / 100));
}

function render() {
    if (!state.shiftActive) return;

    const container = document.querySelector('.hall-map');
    if (!container) return;
    
    container.innerHTML = state.tables.map(table => {
        let money = table.active ? calculateAmount(table.startTime, Date.now(), table.discount) : 0;
        let barSum = table.bar.reduce((s, i) => s + i.sellPrice, 0);
        let timeStr = "00:00:00";
        if (table.active) {
            let diff = Date.now() - table.startTime;
            timeStr = new Date(diff).toISOString().substr(11, 8);
        }
        return `
            <div class="table-card ${table.active ? 'active' : ''}" data-id="${table.id}">
                <div class="table-num">Стол ${table.id}</div>
                <div style="font-size:10px; color:#888;">${table.active ? `👤 ${table.clientName}` : 'Свободен'}</div>
                <div class="timer">${timeStr}</div>
                <div class="cost">${money + barSum} ₸</div>
                <button class="${table.active ? 'btn-stop' : 'btn-start'}" onclick="${table.active ? `stopTable(${table.id})` : `startTable(${table.id})`}">
                    ${table.active ? 'ОПЛАТА' : 'ПУСК'}
                </button>
                <button class="btn-bar" onclick="addToBar(${table.id})" ${!table.active ? 'disabled' : ''}>+ БАР</button>
            </div>`;
    }).join('');

    document.getElementById('display-admin-name').innerText = state.activeStaffName;
    document.getElementById('stat-revenue').innerText = state.totalRevenue;
    let salary = state.activeStaffName === "Хозяин" ? 0 : Math.round(state.totalRevenue * PERCENT + BASE_SALARY);
    document.getElementById('stat-salary').innerText = salary;
    document.getElementById('role-badge').innerText = state.activeStaffName === "Хозяин" ? "ХОЗЯИН" : "АДМИН";
    document.getElementById('debt-list').innerHTML = state.debts.map(d => `<div class="item-row"><span>${d.name}</span><span>${d.amount} ₸</span></div>`).join('');
    document.getElementById('inventory-list').innerHTML = state.inventory.map(i => `<div class="item-row"><span>${i.name}</span><span>Прибыль: ${i.sellPrice - i.buyPrice}</span></div>`).join('');
}

function startTable(id) {
    const table = state.tables.find(t => t.id === id);
    table.clientName = prompt("Имя?") || "Гость";
    table.discount = parseInt(prompt("Скидка %?")) || 0;
    table.active = true;
    table.startTime = Date.now();
    table.bar = [];
    save();
    render();
}

function stopTable(id) {
    const table = state.tables.find(t => t.id === id);
    const total = calculateAmount(table.startTime, Date.now(), table.discount) + table.bar.reduce((s, i) => s + i.sellPrice, 0);
    if (confirm(`К оплате: ${total} ₸. Оплачено?`)) { state.totalRevenue += total; }
    else { state.debts.push({ name: table.clientName, amount: total, date: new Date().toLocaleDateString() }); }
    table.active = false;
    save();
    render();
}

function addInventoryItem() {
    let name = prompt("Товар:"), buy = parseInt(prompt("Закуп:")), sell = parseInt(prompt("Продажа:"));
    if (name && buy && sell) { state.inventory.push({ name, buyPrice: buy, sellPrice: sell }); save(); render(); }
}

function addToBar(tableId) {
    if (!state.inventory.length) return alert("Склад пуст!");
    let list = state.inventory.map((item, i) => `${i}. ${item.name} (${item.sellPrice})`).join('\n');
    let choice = prompt(list);
    if (state.inventory[choice]) { state.tables.find(t => t.id === tableId).bar.push(state.inventory[choice]); save(); render(); }
}

window.onload = () => {
    document.getElementById('staff-select').innerHTML = STAFF.map((s, i) => `<option value="${i}">${s.name}</option>`).join('');
    if (state.shiftActive) showMain(); else showAuth();
    render();
    setInterval(render, 1000); // Это запускает живое время
};
