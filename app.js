const TABLES_COUNT = 6;
const DAY_RATE = 2000;   // 11:00 - 18:00
const NIGHT_RATE = 3000; // 18:00 - 10:59

let state = JSON.parse(localStorage.getItem('sensei_state')) || {
    tables: Array.from({ length: TABLES_COUNT }, (_, i) => ({
        id: i + 1,
        active: false,
        startTime: null,
        bar: [],
        totalToPay: 0
    }))
};

function save() {
    localStorage.setItem('sensei_state', JSON.stringify(state));
    render();
}

// ФУНКЦИЯ РАСЧЕТА ДЕНЕГ
function calculateCurrentAmount(startTime, endTime) {
    let total = 0;
    let current = new Date(startTime);
    const end = new Date(endTime);

    // Округление в пользу клуба (добавляем до 5 минут к итогу)
    const diffMs = end - current;
    const diffMinutes = diffMs / (1000 * 60);
    const roundedMinutes = Math.ceil(diffMinutes / 5) * 5; // Округление до ближайших 5 минут вверх
    
    const finalEnd = new Date(startTime + roundedMinutes * 60 * 1000);

    let tempTime = new Date(startTime);
    while (tempTime < finalEnd) {
        let hour = tempTime.getHours();
        // Тариф: с 11 до 18 - 2000, в остальное время - 3000
        let currentRate = (hour >= 11 && hour < 18) ? DAY_RATE : NIGHT_RATE;
        total += currentRate / 60; // Добавляем стоимость 1 минуты
        tempTime.setMinutes(tempTime.getMinutes() + 1);
    }
    return Math.round(total);
}

function startTable(id) {
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
    const finalAmount = calculateCurrentAmount(table.startTime, Date.now());
    const barTotal = table.bar.reduce((sum, item) => sum + item.price, 0);
    
    if (confirm(`ИТОГО К ОПЛАТЕ:\nВремя: ${finalAmount} тнг\nБар: ${barTotal} тнг\n\nЗакрыть стол №${id}?`)) {
        table.active = false;
        table.startTime = null;
        table.bar = [];
        save();
    }
}

// ФУНКЦИЯ ДЛЯ БАРА (Пример: добавить Колу)
function addToBar(tableId) {
    const table = state.tables.find(t => t.id === tableId);
    const itemName = prompt("Название товара:");
    const itemPrice = parseInt(prompt("Цена товара:"));
    
    if (itemName && itemPrice) {
        table.bar.push({ name: itemName, price: itemPrice });
        save();
    }
}

function render() {
    const container = document.querySelector('.hall-map');
    if (!container) return;
    container.innerHTML = '';
    
    state.tables.forEach(table => {
        const card = document.createElement('div');
        card.className = `table-card ${table.active ? 'active' : ''}`;
        
        let timeStr = "00:00:00";
        let moneyStr = "0";
        let barTotal = table.bar.reduce((sum, item) => sum + item.price, 0);

        if (table.active) {
            const now = Date.now();
            const diff = now - table.startTime;
            const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
            const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
            const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
            timeStr = `${h}:${m}:${s}`;
            moneyStr = calculateCurrentAmount(table.startTime, now);
        }

        card.innerHTML = `
            <div class="table-num">Стол ${table.id}</div>
            <div class="timer">${timeStr}</div>
            <div class="cost">Итого: ${parseInt(moneyStr) + barTotal} ₸</div>
            <div style="font-size: 12px; color: #888; margin-bottom: 5px;">
                (Время: ${moneyStr} + Бар: ${barTotal})
            </div>
            <button class="${table.active ? 'btn-stop' : 'btn-start'}" 
                    onclick="${table.active ? `stopTable(${table.id})` : `startTable(${table.id})`}">
                ${table.active ? 'СТОП / ЧЕК' : 'ОТКРЫТЬ'}
            </button>
            <button class="btn-bar" onclick="addToBar(${table.id})" ${!table.active ? 'disabled' : ''}>+ БАР</button>
        `;
        container.appendChild(card);
    });
}

setInterval(render, 1000);
render();
