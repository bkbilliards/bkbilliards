const TABLES_COUNT = 6;
const DAY_RATE = 2000;
const NIGHT_RATE = 3000;
const BASE_SALARY = 6000;
const PERCENT = 0.08;

let state = JSON.parse(localStorage.getItem('sensei_state')) || {
    adminName: null,
    shiftActive: false,
    totalRevenue: 0,
    tables: Array.from({ length: TABLES_COUNT }, (_, i) => ({
        id: i + 1, active: false, startTime: null, bar: []
    }))
};

function save() {
    localStorage.setItem('sensei_state', JSON.stringify(state));
    render();
}

// Логика смены
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
        if (confirm(`ЗАКРЫТЬ СМЕНУ?\nИтого выручка: ${state.totalRevenue} ₸\nЗарплата админа: ${salary} ₸`)) {
            state.shiftActive = false;
            state.adminName = null;
            save();
            alert("Смена закрыта. Данные сохранены в отчет.");
        }
    }
}

function calculateCurrentAmount(startTime, endTime) {
    let total = 0;
    let current = new Date(startTime);
    const end = new Date(endTime);
    const diffMinutes = (end - current) / (1000 * 60);
    const roundedMinutes = Math.ceil(diffMinutes / 5) * 5; 
    const finalEnd = new Date(startTime + roundedMinutes * 60 * 1000);

    let tempTime = new Date(startTime);
    while (tempTime < finalEnd) {
        let hour = tempTime.getHours();
        let currentRate = (hour >= 11 && hour < 18) ? DAY_RATE : NIGHT_RATE;
        total += currentRate / 60;
        tempTime.setMinutes(tempTime.getMinutes() + 1);
    }
    return Math.round(total);
}

function startTable(id) {
    if (!state.shiftActive) return alert("Сначала откройте смену!");
    const table = state.tables.find(t => t.id === id);
    if (!table.active) {
        table.active = true;
        table.startTime = Date.now();
        table.bar = [];
        save();
    }
}

function stopTable(id) {
    const table = state.tables.find(t => t.id === id);
    const timeCost = calculateCurrentAmount(table.startTime, Date.now());
    const barTotal = table.bar.reduce((sum, item) => sum + item.price, 0);
    const total = timeCost + barTotal;
    
    if (confirm(`ЧЕК СТОЛА №${id}\nВремя: ${timeCost} ₸\nБар: ${barTotal} ₸\nИТОГО: ${total} ₸`)) {
        state.totalRevenue += total; // Добавляем в общую кассу смены
        table.active = false;
        table.startTime = null;
        table.bar = [];
        save();
    }
}

function addToBar(tableId) {
    const table = state.tables.find(t => t.id === tableId);
    let name = prompt("Товар:");
    let price = parseInt(prompt("Цена:"));
    if (name && price) {
        table.bar.push({ name, price });
        save();
    }
}

function render() {
    const container = document.querySelector('.hall-map');
    if (!container) return;
    container.innerHTML = '';

    // Обновляем шапку
    document.getElementById('display-admin-name').innerText = state.shiftActive ? `Админ: ${state.adminName}` : "Смена закрыта";
    document.getElementById('shift-btn').innerText = state.shiftActive ? "ЗАКРЫТЬ СМЕНУ" : "ОТКРЫТЬ СМЕНУ";
    document.getElementById('shift-stats').style.display = state.shiftActive ? "block" : "none";
    document.getElementById('stat-revenue').innerText = state.totalRevenue;
    document.getElementById('stat-salary').innerText = Math.round(state.totalRevenue * PERCENT + BASE_SALARY);

    state.tables.forEach(table => {
        const card = document.createElement('div');
        card.className = `table-card ${table.active ? 'active' : ''}`;
        
        let timeStr = "00:00:00";
        let moneyStr = 0;
        if (table.active) {
            const diff = Date.now() - table.startTime;
            const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
            const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
            const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
            timeStr = `${h}:${m}:${s}`;
            moneyStr = calculateCurrentAmount(table.startTime, Date.now());
        }

        let barTotal = table.bar.reduce((sum, item) => sum + item.price, 0);

        card.innerHTML = `
            <div class="table-num">Стол ${table.id}</div>
            <div class="timer">${timeStr}</div>
            <div class="cost">${moneyStr + barTotal} ₸</div>
            <button class="${table.active ? 'btn-stop' : 'btn-start'}" onclick="${table.active ? `stopTable(${table.id})` : `startTable(${table.id})`}">
                ${table.active ? 'ОПЛАТА' : 'ОТКРЫТЬ'}
            </button>
            <button class="btn-bar" onclick="addToBar(${table.id})" ${!table.active ? 'disabled' : ''}>+ БАР</button>
        `;
        container.appendChild(card);
    });
}

setInterval(render, 1000);
render();
