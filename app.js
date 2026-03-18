const TABLES_COUNT = 6;
const DAY_RATE = 2000;
const NIGHT_RATE = 3000;
const BASE_SALARY = 6000;
const PERCENT = 0.08;

// Пароли (можно изменить здесь)
const PASS_ADMIN = "1111";
const PASS_OWNER = "0000";

let currentUser = null; // Роль текущего пользователя

let state = JSON.parse(localStorage.getItem('sensei_state')) || {
    adminName: null,
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

// ЛОГИКА ВХОДА
function login() {
    const pass = document.getElementById('pass-input').value;
    if (pass === PASS_OWNER) {
        currentUser = 'owner';
        showApp();
    } else if (pass === PASS_ADMIN) {
        currentUser = 'admin';
        showApp();
    } else {
        document.getElementById('auth-error').style.display = 'block';
    }
}

function showApp() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';
    if (currentUser === 'owner') {
        document.getElementById('owner-section').style.display = 'block';
    }
    render();
}

function logout() { location.reload(); }

// РАСЧЕТ ДЕНЕГ (+5 мин в пользу клуба)
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

// УПРАВЛЕНИЕ СТОЛАМИ
function startTable(id) {
    if (!state.shiftActive) return alert("Откройте смену!");
    const table = state.tables.find(t => t.id === id);
    table.clientName = prompt("Имя клиента?") || "Гость";
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

    if (confirm(`ИТОГО: ${total} ₸. Оплачено полностью?`)) {
        state.totalRevenue += total;
    } else {
        state.debts.push({ name: table.clientName, amount: total, date: new Date().toLocaleDateString() });
    }
    table.active = false; save();
}

// СКЛАД (С закупкой и продажей)
function addInventoryItem() {
    if (currentUser !== 'owner') return alert("Только Хозяин может менять склад!");
    let name = prompt("Наименование товара:");
    let buy = parseInt(prompt("Цена ЗАКУПА (за сколько купили):"));
    let sell = parseInt(prompt("Цена ПРОДАЖИ (для клиента):"));
    if (name && buy && sell) {
        state.inventory.push({ name, buyPrice: buy, sellPrice: sell });
        save();
    }
}

function addToBar(tableId) {
    if (state.inventory.length === 0) return alert("Склад пуст!");
    let list = state.inventory.map((item, idx) => `${idx}. ${item.name} (${item.sellPrice} ₸)`).join('\n');
    let choice = prompt("Выберите номер товара:\n" + list);
    if (state.inventory[choice]) {
        state.tables.find(t => t.id === tableId).bar.push(state.inventory[choice]);
        save();
    }
}

function toggleShift() {
    if (!state.shiftActive) {
        let name = prompt("Имя администратора:");
        if (name) { state.adminName = name; state.shiftActive = true; state.totalRevenue = 0; save(); }
    } else {
        let salary = Math.round(state.totalRevenue * PERCENT + BASE_SALARY);
        alert(`СМЕНА ЗАКРЫТА\nВыручка: ${state.totalRevenue} ₸\nЗП: ${salary} ₸`);
        state.shiftActive = false; save();
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
            <div style="font-size:10px">${table.active ? table.clientName : 'Свободен'}</div>
            <div class="timer">${table.active ? new Date(Date.now() - table.startTime).toISOString().substr(11, 8) : '00:00:00'}</div>
            <div class="cost">${money + barSum} ₸</div>
            <button class="${table.active ? 'btn-stop' : 'btn-start'}" onclick="${table.active ? `stopTable(${table.id})` : `startTable(${table.id})`}">
                ${table.active ? 'ЧЕК' : 'ПУСК'}
            </button>
            <button class="btn-bar" onclick="addToBar(${table.id})" ${!table.active ? 'disabled' : ''}>+ БАР</button>
        `;
        container.appendChild(card);
    });

    document.getElementById('role-badge').innerText = currentUser === 'owner' ? 'ХОЗЯИН' : 'АДМИН';
    document.getElementById('display-admin-name').innerText = state.shiftActive ? state.adminName : "---";
    document.getElementById('stat-revenue').innerText = state.totalRevenue;
    document.getElementById('stat-salary').innerText = Math.round(state.totalRevenue * PERCENT + BASE_SALARY);
    
    document.getElementById('debt-list').innerHTML = state.debts.map(d => `<div class="item-row">${d.name}: ${d.amount} ₸</div>`).join('');
    
    // На складе Хозяин видит прибыль (маржу)
    document.getElementById('inventory-list').innerHTML = state.inventory.map(i => `
        <div class="item-row">
            <span>${i.name}</span>
            <span>Купили: ${i.buyPrice} | Прод: ${i.sellPrice} | <b>Прибыль: ${i.sellPrice - i.buyPrice}</b></span>
        </div>
    `).join('');
}

setInterval(render, 1000);
