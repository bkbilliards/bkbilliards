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

let currentUser = null; 
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
    render();
}

// ФУНКЦИЯ ЗАПОЛНЕНИЯ СПИСКА ИМЕН
function initStaffList() {
    const select = document.getElementById('staff-select');
    if (select) {
        select.innerHTML = STAFF.map((user, idx) => `<option value="${idx}">${user.name}</option>`).join('');
    }
}

function login() {
    const staffIdx = document.getElementById('staff-select').value;
    const passInput = document.getElementById('pass-input').value;
    const errorMsg = document.getElementById('auth-error');
    const selectedStaff = STAFF[staffIdx];
    
    if (passInput === selectedStaff.password) {
        state.activeStaffName = selectedStaff.name;
        state.shiftActive = true;
        currentUser = selectedStaff;
        save();
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('main-content').style.display = 'block';
    } else {
        errorMsg.style.display = 'block';
        setTimeout(() => { errorMsg.style.display = 'none'; }, 2000);
    }
}

function logout() {
    let isOwner = state.activeStaffName === "Хозяин";
    let salary = isOwner ? 0 : Math.round(state.totalRevenue * PERCENT + BASE_SALARY);
    let finalNet = state.totalRevenue - salary;
    const report = `👤 ${state.activeStaffName}\n💰 Выручка: ${state.totalRevenue} ₸\n💵 Зарплата: ${salary} ₸\n✅ ИТОГО В КАССУ: ${finalNet} ₸`;
    if (confirm(report + "\n\nЗавершить смену?")) {
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

function startTable(id) {
    const table = state.tables.find(t => t.id === id);
    table.clientName = prompt("Имя гостя?") || "Гость";
    table.discount = parseInt(prompt("Скидка %?")) || 0;
    table.active = true;
    table.startTime = Date.now();
    table.bar = [];
    save();
}

function stopTable(id) {
    const table = state.tables.find(t => t.id === id);
    const timeCost = calculateAmount(table.startTime, Date.now(), table.discount);
    const barTotal = table.bar.reduce((sum, item) => sum + item.sellPrice, 0);
    const total = timeCost + barTotal;
    if (confirm(`ИТОГО: ${total} ₸\nОплачено?`)) { state.totalRevenue += total; }
    else { state.debts.push({ name: table.clientName, amount: total, date: new Date().toLocaleDateString() }); }
    table.active = false; save();
}

function addInventoryItem() {
    let name = prompt("Товар:");
    let buy = parseInt(prompt("Закуп:"));
    let sell = parseInt(prompt("Продажа:"));
    if (name && buy && sell) { state.inventory.push({ name, buyPrice: buy, sellPrice: sell }); save(); }
}

function addToBar(tableId) {
    if (state.inventory.length === 0) return alert("Склад пуст!");
    let list = state.inventory.map((item, idx) => `${idx}. ${item.name} (${item.sellPrice} ₸)`).join('\n');
    let choice = prompt("Что купили?\n" + list);
    if (state.inventory[choice]) { state.tables.find(t => t.id === tableId).bar.push(state.inventory[choice]); save(); }
}

function render() {
    if (state.shiftActive && !currentUser) {
        currentUser = STAFF.find(user => user.name === state.activeStaffName);
    }
    const container = document.querySelector('.hall-map');
    if(!container) return;
    container.innerHTML = state.tables.map(table => {
        let money = table.active ? calculateAmount(table.startTime, Date.now(), table.discount) : 0;
        let barSum = table.bar.reduce((s, i) => s + i.sellPrice, 0);
        return `<div class="table-card ${table.active ? 'active' : ''}" data-id="${table.id}"><div class="table-num">Стол ${table.id}</div><div style="font-size:10px; color:#888;">${table.active ? `👤 ${table.clientName}` : 'Свободен'}</div><div class="timer">${table.active ? new Date(Date.now() - table.startTime).toISOString().substr(11, 8) : '00:00:00'}</div><div class="cost">${money + barSum} ₸</div><button class="${table.active ? 'btn-stop' : 'btn-start'}" onclick="${table.active ? `stopTable(${table.id})` : `startTable(${table.id})`}">${table.active ? 'ОПЛАТА' : 'ПУСК'}</button><button class="btn-bar" onclick="addToBar(${table.id})" ${!table.active ? 'disabled' : ''}>+ БАР</button></div>`;
    }).join('');

    if(state.shiftActive) {
        document.getElementById('role-badge').innerText = currentUser.role === 'owner' ? 'ХОЗЯИН' : 'АДМИН';
        document.getElementById('display-admin-name').innerText = state.activeStaffName;
        document.getElementById('stat-revenue').innerText = state.totalRevenue;
        let salary = (state.activeStaffName === "Хозяин") ? 0 : Math.round(state.totalRevenue * PERCENT + BASE_SALARY);
        document.getElementById('stat-salary').innerText = salary;
        if (currentUser.role === 'owner') document.getElementById('owner-section').style.display = 'block';
    }
    document.getElementById('debt-list').innerHTML = state.debts.map(d => `<div class="item-row"><span>${d.name}</span><span>${d.amount} ₸</span></div>`).join('');
    document.getElementById('inventory-list').innerHTML = state.inventory.map(i => `<div class="item-row"><span>${i.name}</span><span>Прибыль: ${i.sellPrice - i.buyPrice} ₸</span></div>`).join('');
}

// ЭТА СТРОКА ЗАПУСКАЕТ ВСЁ ПРИ ЗАГРУЗКЕ
window.onload = () => {
    initStaffList();
    if(state.shiftActive) {
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('main-content').style.display = 'block';
    }
    render();
    setInterval(render, 1000);
};
