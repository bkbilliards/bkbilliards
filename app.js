const TABLES_COUNT = 6;
const DAY_RATE = 2000;   // 11:00 - 18:00
const NIGHT_RATE = 3000; // 18:00 - 10:59
const BASE_SALARY = 6000;
const PERCENT = 0.08;

let state = JSON.parse(localStorage.getItem('sensei_state')) || {
    adminName: null,
    shiftActive: false,
    totalRevenue: 0,
    debts: [],
    inventory: [], // Товары на складе
    tables: Array.from({ length: TABLES_COUNT }, (_, i) => ({
        id: i + 1, active: false, startTime: null, bar: [], clientName: "Гость", discount: 0
    }))
};

function save() {
    localStorage.setItem('sensei_state', JSON.stringify(state));
    render();
}

// Расчет денег с округлением +5 минут в пользу клуба
function calculateAmount(startTime, endTime, discountPercent = 0) {
    let total = 0;
    const diffMin = Math.ceil((endTime - startTime) / (1000 * 60));
    const roundedMin = Math.ceil(diffMin / 5) * 5; 
    
    let tempTime = new Date(startTime);
    for (let i = 0; i < roundedMin; i++) {
        let hour = tempTime.getHours();
        let rate = (hour >= 11 && hour < 18) ? DAY_RATE : NIGHT_RATE;
        total += rate / 60;
        tempTime.setMinutes(tempTime.getMinutes() + 1);
    }
    return Math.round(total - (total * discountPercent / 100));
}

function toggleShift() {
    if (!state.shiftActive) {
        let name = prompt("Имя админа:");
        if (name) { state.adminName = name; state.shiftActive = true; state.totalRevenue = 0; save(); }
    } else {
        let salary = Math.round(state.totalRevenue * PERCENT + BASE_SALARY);
        if (confirm(`ЗАКРЫТЬ СМЕНУ?\nВыручка: ${state.totalRevenue} ₸\nЗП: ${salary} ₸`)) {
            state.shiftActive = false; save();
        }
    }
}

function startTable(id) {
    if (!state.shiftActive) return alert("Откройте смену!");
    const table = state.tables.find(t => t.id === id);
    table.clientName = prompt("Имя клиента?", "Гость") || "Гость";
    table.discount = parseInt(prompt("Скидка %?", "0")) || 0;
    table.active = true;
    table.startTime = Date.now();
    table.bar = [];
    save();
}

function stopTable(id) {
    const table = state.tables.find(t => t.id === id);
    const timeCost = calculateAmount(table.startTime, Date.now(), table.discount);
    const barTotal = table.bar.reduce((sum, item) => sum + item.price, 0);
    const total = timeCost + barTotal;

    if (confirm(`ИТОГО: ${total} ₸. Оплачено?`)) {
        state.totalRevenue += total;
    } else {
        state.debts.push({ name: table.clientName, amount: total, date: new Date().toLocaleDateString() });
    }
    table.active = false; save();
}

// Склад: Добавить товар
function addInventoryItem() {
    let name = prompt("Название товара:");
    let price = parseInt(prompt("Цена продажи:"));
    if (name && price) { state.inventory.push({ name, price }); save(); }
}

// Бар: Выбрать из склада
function addToBar(tableId) {
    if (state.inventory.length === 0) return alert("Сначала добавьте товары на СКЛАД внизу страницы!");
    let list = state.inventory.map((item, idx) => `${idx}. ${item.name} (${item.price} ₸)`).join('\n');
    let choice = prompt("Выберите номер товара:\n" + list);
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
        let barSum = table.bar.reduce((s, i) => s + i.price, 0);

        card.innerHTML = `
            <div class="table-num">Стол ${table.id}</div>
            <div style="font-size:10px">${table.active ? table.clientName : '---'}</div>
            <div class="timer">${table.active ? new Date(Date.now() - table.startTime).toISOString().substr(11, 8) : '00:00:00'}</div>
            <div class="cost">${money + barSum} ₸</div>
            <button class="${table.active ? 'btn-stop' : 'btn-start'}" onclick="${table.active ? `stopTable(${table.id})` : `startTable(${table.id})`}">
                ${table.active ? 'ЧЕК' : 'ПУСК'}
            </button>
            <button class="btn-bar" onclick="addToBar(${table.id})" ${!table.active ? 'disabled' : ''}>+ БАР</button>
        `;
        container.appendChild(card);
    });

    // Отрисовка долгов и склада
    document.getElementById('debt-list').innerHTML = state.debts.map(d => `<div class="item-row">${d.name}: ${d.amount} ₸</div>`).join('');
    document.getElementById('inventory-list').innerHTML = state.inventory.map(i => `<div class="item-row">${i.name} - ${i.price} ₸</div>`).join('');
    document.getElementById('display-admin-name').innerText = state.shiftActive ? `Админ: ${state.adminName}` : "Смена закрыта";
    document.getElementById('stat-revenue').innerText = state.totalRevenue;
    document.getElementById('stat-salary').innerText = Math.round(state.totalRevenue * PERCENT + BASE_SALARY);
}

setInterval(render, 1000);
render();
