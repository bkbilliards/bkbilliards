const TABLES_COUNT = 6;
const DAY_RATE = 2000;
const NIGHT_RATE = 3000;
const BASE_SALARY = 6000;
const PERCENT = 0.08;

// Список сотрудников с именами Ваших админов
const STAFF = ["Султан", "Дидар", "Запасной админ", "Хозяин"];

// Пароли для входа
const PASS_ADMIN = "1111";
const PASS_OWNER = "0000";

let currentUser = null; 

let state = JSON.parse(localStorage.getItem('sensei_state')) || {
    activeStaff: null,
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

function login() {
    const pass = document.getElementById('pass-input').value;
    if (pass === PASS_OWNER) { currentUser = 'owner'; showApp(); }
    else if (pass === PASS_ADMIN) { currentUser = 'admin'; showApp(); }
    else { document.getElementById('auth-error').style.display = 'block'; }
}

function showApp() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';
    if (currentUser === 'owner') document.getElementById('owner-section').style.display = 'block';
    render();
}

function logout() { location.reload(); }

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

function toggleShift() {
    if (!state.shiftActive) {
        let list = STAFF.map((name, i) => `${i}. ${name}`).join('\n');
        let choice = prompt("Кто выходит на смену?\n" + list);
        if (STAFF[choice]) {
            state.activeStaff = STAFF[choice];
            state.shiftActive = true;
            state.totalRevenue = 0;
            save();
        }
    } else {
        let isOwner = state.activeStaff === "Хозяин";
        let salary = isOwner ? 0 : Math.round(state.totalRevenue * PERCENT + BASE_SALARY);
        
        alert(`СМЕНА ЗАКРЫТА\nСотрудник: ${state.activeStaff}\nВыручка: ${state.totalRevenue} ₸\nЗарплата: ${salary} ₸`);
        state.shiftActive = false;
        state.activeStaff = null;
        save();
    }
}

function startTable(id) {
    if (!state.shiftActive) return alert("Сначала откройте смену!");
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

    if (confirm(`ИТОГО: ${total} ₸. Оплачено?`)) {
        state.totalRevenue += total;
    } else {
        state.debts.push({ name: table.clientName, amount: total, date: new Date().toLocaleDateString() });
    }
    table.active = false; save();
}

function addInventoryItem() {
    let name = prompt("Товар:");
    let buy = parseInt(prompt("Цена ЗАКУПА:"));
    let sell = parseInt(prompt("Цена ПРОДАЖИ:"));
    if (name && buy && sell) { state.inventory.push({ name, buyPrice: buy, sellPrice: sell }); save(); }
}

function addToBar(tableId) {
    if (state.inventory.length === 0) return alert("Склад пуст!");
    let list = state.inventory.map((item, idx) => `${idx}. ${item.name} (${item.sellPrice} ₸)`).join('\n');
    let choice = prompt("Что добавим?\n" + list);
    if (state.inventory[choice]) {
        state.tables.find(t => t.id === tableId).bar.push(state.inventory[choice]);
        save();
    }
}

function render() {
    const container = document.querySelector('.hall-map');
    container.innerHTML = '';
    state.tables.forEach(table => {
        const card = document.createElement('div');
        card.className = `table-card ${table.active ? 'active' : ''}`;
        card.setAttribute('data-id', table.id);
        let money = table.active ? calculateAmount(table.startTime, Date.now(), table.discount) : 0;
        let barSum = table.bar.reduce((s, i) => s + i.sellPrice, 0);

        card.innerHTML = `
            <div class="table-num">Стол ${table.id}</div>
            <div style="font-size:10px; color:#888;">${table.active ? `👤 ${table.clientName}` : 'Свободен'}</div>
            <div class="timer">${table.active ? new Date(Date.now() - table.startTime).toISOString().substr(11, 8) : '00:00:00'}</div>
            <div class="cost">${money + barSum} ₸</div>
            <button class="${table.active ? 'btn-stop' : 'btn-start'}" onclick="${table.active ? `stopTable(${table.id})` : `startTable(${table.id})`}">
                ${table.active ? 'ОПЛАТА' : 'ПУСК'}
            </button>
            <button class="btn-bar" onclick="addToBar(${table.id})" ${!table.active ? 'disabled' : ''}>+ БАР</button>
        `;
        container.appendChild(card);
    });

    document.getElementById('role-badge').innerText = currentUser === 'owner' ? 'ХОЗЯИН' : 'АДМИН';
    document.getElementById('display-admin-name').innerText = state.shiftActive ? `Смена: ${state.activeStaff}` : "Смена закрыта";
    document.getElementById('stat-revenue').innerText = state.totalRevenue;
    
    let currentSalary = (state.activeStaff === "Хозяин") ? 0 : Math.round(state.totalRevenue * PERCENT + BASE_SALARY);
    document.getElementById('stat-salary').innerText = state.shiftActive ? currentSalary : 0;

    document.getElementById('debt-list').innerHTML = state.debts.map(d => `<div class="item-row"><span>${d.name}</span><span>${d.amount} ₸</span></div>`).join('');
    document.getElementById('inventory-list').innerHTML = state.inventory.map(i => `<div class="item-row"><span>${i.name}</span><span>Прод: ${i.sellPrice} | Прибыль: ${i.sellPrice - i.buyPrice}</span></div>`).join('');
}

setInterval(render, 1000);
