const TABLES_COUNT = 6;
const DAY_RATE = 2000;   // 11:00 - 18:00
const NIGHT_RATE = 3000; // 18:00 - 10:59
const BASE_SALARY = 6000;
const PERCENT = 0.08;

// Загрузка данных
let state = JSON.parse(localStorage.getItem('sensei_state')) || {
    adminName: null,
    shiftActive: false,
    totalRevenue: 0,
    debts: [],
    tables: Array.from({ length: TABLES_COUNT }, (_, i) => ({
        id: i + 1, active: false, startTime: null, bar: [], clientName: "Гость", discount: 0
    }))
};

function save() {
    localStorage.setItem('sensei_state', JSON.stringify(state));
    render();
}

// Функция расчета денег с округлением в пользу клуба (+5 мин)
function calculateAmount(startTime, endTime, discountPercent = 0) {
    let total = 0;
    const diffMin = Math.ceil((endTime - startTime) / (1000 * 60));
    const roundedMin = Math.ceil(diffMin / 5) * 5; // Округление вверх до 5 минут
    
    let tempTime = new Date(startTime);
    for (let i = 0; i < roundedMin; i++) {
        let hour = tempTime.getHours();
        let rate = (hour >= 11 && hour < 18) ? DAY_RATE : NIGHT_RATE;
        total += rate / 60;
        tempTime.setMinutes(tempTime.getMinutes() + 1);
    }
    
    let discountAmount = (total * discountPercent) / 100;
    return Math.round(total - discountAmount);
}

// Управление столами
function startTable(id) {
    if (!state.shiftActive) return alert("Сначала откройте смену!");
    const table = state.tables.find(t => t.id === id);
    let name = prompt("Имя клиента?", "Гость");
    let disc = parseInt(prompt("Скидка клиента %?", "0"));
    
    table.active = true;
    table.startTime = Date.now();
    table.clientName = name || "Гость";
    table.discount = disc || 0;
    table.bar = [];
    save();
}

function stopTable(id) {
    const table = state.tables.find(t => t.id === id);
    const timeCost = calculateAmount(table.startTime, Date.now(), table.discount);
    const barTotal = table.bar.reduce((sum, item) => sum + item.price, 0);
    const total = timeCost + barTotal;

    let action = confirm(`ИТОГО: ${total} ₸\n(Время: ${timeCost}, Бар: ${barTotal})\n\nНажмите ОК если оплачено полностью.\nНажмите ОТМЕНА если записать в ДОЛГ.`);
    
    if (action) {
        state.totalRevenue += total;
    } else {
        let reason = prompt("Причина долга?", "Заплатит позже");
        state.debts.push({
            name: table.clientName,
            amount: total,
            date: new Date().toLocaleDateString(),
            reason: reason || "Без уточнения"
        });
    }

    table.active = false;
    table.startTime = null;
    table.bar = [];
    save();
}

function addToBar(tableId) {
    const table = state.tables.find(t => t.id === tableId);
    let name = prompt("Название товара (например, Кола):");
    let price = parseInt(prompt("Цена:"));
    if (name && price) {
        table.bar.push({ name, price });
        save();
    }
}

// Управление сменой
function toggleShift() {
    if (!state.shiftActive) {
        let name = prompt("Введите имя администратора:");
        if (name) { 
            state.adminName = name; 
            state.shiftActive = true; 
            state.totalRevenue = 0; 
            save(); 
        }
    } else {
        let salary = Math.round(state.totalRevenue * PERCENT + BASE_SALARY);
        if (confirm(`ЗАКРЫТЬ СМЕНУ?\nАдмин: ${state.adminName}\nВыручка: ${state.totalRevenue} ₸\nЗарплата: ${salary} ₸`)) {
            state.shiftActive = false;
            state.adminName = null;
            save();
        }
    }
}

// Долги
function payDebt(index) {
    let debt = state.debts[index];
    if (confirm(`Клиент ${debt.name} оплатил долг ${debt.amount} ₸?`)) {
        state.totalRevenue += debt.amount;
        state.debts.splice(index, 1);
        save();
    }
}

function addManualDebt() {
    let name = prompt("Имя должника:");
    let sum = parseInt(prompt("Сумма долга:"));
    if (name && sum) {
        state.debts.push({ name, amount: sum, date: new Date().toLocaleDateString(), reason: "Вручную" });
        save();
    }
}

// Главный рендер
function render() {
    const container = document.querySelector('.hall-map');
    if (!container) return;
    container.innerHTML = '';

    state.tables.forEach(table => {
        const card = document.createElement('div');
        card.className = `table-card ${table.active ? 'active' : ''}`;
        
        let timeStr = "00:00:00", money = 0;
        if (table.active) {
            const diff = Date.now() - table.startTime;
            const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
            const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
            const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
            timeStr = `${h}:${m}:${s}`;
            money = calculateAmount(table.startTime, Date.now(), table.discount);
        }
        let barSum = table.bar.reduce((s, i) => s + i.price, 0);

        card.innerHTML = `
            <div class="table-num">Стол ${table.id} ${table.discount > 0 ? `<span class="discount-badge">-${table.discount}%</span>` : ''}</div>
            <div style="font-size: 12px; margin-top:5px;">${table.active ? `👤 ${table.clientName}` : 'Свободен'}</div>
            <div class="timer">${timeStr}</div>
            <div class="cost">${money + barSum} ₸</div>
            <button class="${table.active ? 'btn-stop' : 'btn-start'}" onclick="${table.active ? `stopTable(${table.id})` : `startTable(${table.id})`}">
                ${table.active ? 'ОПЛАТА' : 'ОТКРЫТЬ'}
            </button>
            <button class="btn-bar" onclick="addToBar(${table.id})" ${!table.active ? 'disabled' : ''}>+ БАР</button>
        `;
        container.appendChild(card);
    });

    const dList = document.getElementById('debt-list');
    dList.innerHTML = '';
    state.debts.forEach((d, index) => {
        dList.innerHTML += `
            <div class="debt-item">
                <div class="debt-info"><b>${d.name}</b>: ${d.amount} ₸ <br> <small>${d.date} (${d.reason})</small></div>
                <button class="btn-pay-debt" onclick="payDebt(${index})">ОПЛАТИЛ</button>
            </div>
        `;
    });

    document.getElementById('display-admin-name').innerText = state.shiftActive ? `Админ: ${state.adminName}` : "Смена закрыта";
    document.getElementById('stat-revenue').innerText = state.totalRevenue;
    document.getElementById('stat-salary').innerText = Math.round(state.totalRevenue * PERCENT + BASE_SALARY);
}

setInterval(render, 1000);
render();
