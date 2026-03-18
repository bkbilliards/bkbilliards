const TABLES_COUNT = 6;
const DAY_RATE = 2000;
const NIGHT_RATE = 3000;
const BASE_SALARY = 6000;
const PERCENT = 0.08;

// Список сотрудников
const STAFF_LIST = [
    { name: "Султан", password: "1111", role: "admin" },
    { name: "Дидар", password: "1111", role: "admin" },
    { name: "Другой админ...", password: "1111", role: "extra" },
    { name: "Хозяин", password: "0000", role: "owner" }
];

let currentUser = null; 

let state = JSON.parse(localStorage.getItem('sensei_state')) || {
    activeStaffName: null,
    shiftActive: false,
    totalRevenue: 0,
    tableRevenue: 0,
    barRevenue: 0,
    unpaidChecks: [], // Текущие неоплаченные счета гостей
    debts: [],
    inventory: [], 
    tables: Array.from({ length: TABLES_COUNT }, (_, i) => ({
        id: i + 1, active: false, startTime: null, bar: [], clientName: "Гость", discount: 0, reservation: null
    }))
};

function save() {
    localStorage.setItem('sensei_state', JSON.stringify(state));
    render();
}

// Заполнение списка админов при старте
const select = document.getElementById('staff-select');
if(select) {
    STAFF_LIST.forEach((user, idx) => {
        select.innerHTML += `<option value="${idx}">${user.name}</option>`;
    });
}

function showMain() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';
    if(currentUser.role === 'owner') {
        document.getElementById('owner-nav-btn').style.display = 'block';
        document.getElementById('btn-add-inventory').style.display = 'block';
    }
}

function showAuth() {
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('main-content').style.display = 'none';
}

function switchPage(pageId) {
    const pages = document.querySelectorAll('.page');
    const navButtons = document.querySelectorAll('.nav-btn');
    pages.forEach(p => p.style.display = 'none');
    navButtons.forEach(b => b.classList.remove('active'));
    
    document.getElementById(`page-${pageId}`).style.display = 'block';
    event.currentTarget.classList.add('active');
}

function login() {
    const staffIdx = document.getElementById('staff-select').value;
    const passInput = document.getElementById('pass-input').value;
    const selectedStaff = STAFF_LIST[staffIdx];
    
    if (passInput === selectedStaff.password) {
        let finalName = selectedStaff.name;
        if (selectedStaff.role === "extra") {
            const extraName = prompt("Введите имя запасного админа:");
            finalName = extraName ? extraName : "Запасной";
        }
        state.activeStaffName = finalName;
        state.shiftActive = true;
        currentUser = selectedStaff;
        save();
        showMain();
    } else {
        const errorMsg = document.getElementById('auth-error');
        errorMsg.style.display = 'block';
        setTimeout(() => { errorMsg.style.display = 'none'; }, 2000);
    }
}

function logout() {
    if(state.unpaidChecks.length > 0) {
        if(!confirm(`⚠️ ВНИМАНИЕ: В кассе остались неоплаченные чеки (${state.unpaidChecks.length} шт). \nВы точно хотите закрыть смену без расчета? Они будут потеряны!`)){
            return;
        }
    }

    let isOwner = state.activeStaffName === "Хозяин";
    let salary = isOwner ? 0 : Math.round(state.totalRevenue * PERCENT + BASE_SALARY);
    
    // Чистая прибыль по бару (Цена продажи - Цена закупа)
    let barProfit = state.inventory.reduce((sum, item) => sum + (item.sellPrice - item.buyPrice), 0);
    
    const report = `
=== ИТОГОВЫЙ ОТЧЕТ ===
👤 Админ: ${state.activeStaffName}
💰 Выручка (Столы): ${state.tableRevenue} ₸
💰 Выручка (Бар): ${state.barRevenue} ₸
🏆 Выручка ВСЕГО: ${state.totalRevenue} ₸
--------------------------
💵 ЗП Админа (8% + 6000): ${salary} ₸
✅ ИНКАССАЦИЯ (В кассу): ${state.totalRevenue - salary} ₸
--------------------------
📈 Чистая прибыль (Бар): ${barProfit} ₸
======================`;

    if (confirm(report + "\n\nЗавершить смену?")) {
        state.shiftActive = false;
        state.activeStaffName = null;
        state.totalRevenue = 0;
        state.tableRevenue = 0;
        state.barRevenue = 0;
        state.unpaidChecks = [];
        state.tables.forEach(t => t.active = false); // Сбросить столы
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

function renderTable(table) {
    let money = table.active ? calculateAmount(table.startTime, Date.now(), table.discount) : 0;
    let barSum = table.bar.reduce((s, i) => s + i.sellPrice, 0);
    let timeStr = table.active ? new Date(Date.now() - table.startTime).toISOString().substr(11, 8) : "00:00:00";
    
    return `
        <div class="table-card ${table.active ? 'active' : ''}" data-id="${table.id}">
            <div class="table-num">Стол ${table.id}</div>
            <div style="font-size:10px; color:#888;">${table.active ? `👤 ${table.clientName}` : 'Свободен'}</div>
            <div class="timer">${timeStr}</div>
            <div class="cost">${money + barSum} ₸</div>
            
            ${table.reservation ? `<div class="table-reservation-text">📅 ${table.reservation}</div>` : ''}

            <div class="card-actions">
                <button class="btn-comm" onclick="${table.active ? `commTable(${table.id})` : `startTable(${table.id})`}" ${!table.active ? 'disabled' : ''}>${table.active ? 'КОММЕРЦ' : '---'}</button>
                <button class="btn-reserve" onclick="reserveTable(${table.id})">БРОНЬ</button>
            </div>
            
            <button class="${table.active ? 'btn-stop' : 'btn-start'}" onclick="${table.active ? `closeTable(${table.id})` : `startTable(${table.id})`}">
                ${table.active ? 'ЗАКРЫТЬ' : 'ПУСК'}
            </button>
            <button class="btn-bar" onclick="addToBar(${table.id})" ${!table.active ? 'disabled' : ''}>+ БАР</button>
        </div>`;
}

// УПРАВЛЕНИЕ СТОЛАМИ И ЧЕКАМИ (Этап 1)
function commTable(id) {
    const table = state.tables.find(t => t.id === id);
    const timeCost = calculateAmount(table.startTime, Date.now(), table.discount);
    
    if (confirm(`КОММЕРЦИЯ\nЧек на: ${timeCost} ₸\nЗаписать его в неоплаченные чеки на имя ${table.clientName} и перезапустить время?`)) {
        // Записать чек
        state.unpaidChecks.push({
            name: table.clientName,
            tableId: id,
            timeCost: timeCost,
            bar: [], // При коммерции бар не закрывается, всё на игроке
            date: new Date().toLocaleTimeString(),
            reason: "Коммерция"
        });
        // Перезапустить время
        table.startTime = Date.now();
        save();
    }
}

function reserveTable(id) {
    const table = state.tables.find(t => t.id === id);
    let name = prompt("Имя гостя?");
    let time = prompt("Время (например, 19:00)?");
    if(name && time) {
        table.reservation = `${name} (${time})`;
        save();
    } else {
        table.reservation = null; // Снять бронь
        save();
    }
}

function closeTable(id) {
    const table = state.tables.find(t => t.id === id);
    const timeCost = calculateAmount(table.startTime, Date.now(), table.discount);
    const barTotal = table.bar.reduce((sum, item) => sum + item.sellPrice, 0);
    const total = timeCost + barTotal;

    if (confirm(`ИТОГО К ОПЛАТЕ: ${total} ₸\nВремя: ${timeCost} ₸\nБар: ${barTotal} ₸\n\nВНИМАНИЕ: Нажмите ОК, чтобы записать этот чек в "Текущие неоплаченные чеки" на имя ${table.clientName}. Гость рассчитается при выходе.`)) {
        // Создать чек и добавить в неоплаченные
        state.unpaidChecks.push({
            name: table.clientName,
            tableId: id,
            timeCost: timeCost,
            bar: table.bar, // Весь бар уходит в чек
            date: new Date().toLocaleTimeString(),
            reason: "Обычное"
        });
        table.active = false;
        table.bar = [];
        table.reservation = null;
        save();
    }
}

// ЧЕКИ (Этап 1 и 2)
function payCheck(index) {
    const check = state.unpaidChecks[index];
    const total = check.timeCost + check.bar.reduce((s, i) => s + i.sellPrice, 0);
    
    if(confirm(`Гость ${check.name} оплатил чек (${total} ₸)?`)) {
        state.totalRevenue += total;
        state.tableRevenue += check.timeCost;
        state.barRevenue += check.bar.reduce((s, i) => s + i.sellPrice, 0);
        state.unpaidChecks.splice(index, 1);
        save();
    }
}

function payCheckDebt(index) {
    const check = state.unpaidChecks[index];
    const total = check.timeCost + check.bar.reduce((s, i) => s + i.sellPrice, 0);
    
    if(confirm(`Записать чек (${total} ₸) гостя ${check.name} в ДОЛГ?`)) {
        state.debts.push({
            name: check.name,
            amount: total,
            date: new Date().toLocaleDateString(),
            reason: `Чек Стол ${check.tableId} (${check.reason})`
        });
        state.unpaidChecks.splice(index, 1);
        save();
    }
}

// Группировка чеков по имени для отображения
function renderChecks() {
    const dCheckList = document.getElementById('open-checks-list');
    if(!dCheckList) return;
    dCheckList.innerHTML = '';
    
    if(state.unpaidChecks.length === 0) {
        dCheckList.innerHTML = '<p style="color:#666; font-size:12px; text-align:center;">Нет неоплаченных чеков.</p>';
        return;
    }

    // Сгруппировать чеки по имени
    const grouped = {};
    state.unpaidChecks.forEach(check => {
        if(!grouped[check.name]) grouped[check.name] = [];
        grouped[check.name].push(check);
    });

    // Отрисовать сгруппированные чеки
    for(let name in grouped) {
        const checks = grouped[name];
        let sumTotal = 0;
        let details = checks.map((c, i) => {
            let total = c.timeCost + c.bar.reduce((s, i) => s + i.sellPrice, 0);
            sumTotal += total;
            return `Чек Стол ${c.tableId}: ${total}₸ (Время: ${c.timeCost}₸, Бар: ${c.bar.reduce((s, i) => s + i.sellPrice, 0)}₸, ${c.date})`;
        }).join('<br>');
        
        dCheckList.innerHTML += `
            <div class="check-item ${checks.length > 1 ? 'summed' : ''}">
                <div class="check-info">
                    <span class="check-name">Гость: ${name} ${checks.length > 1 ? `<small style="color:#aaa">(${checks.length} игр/переходов)</small>` : ''}</span><br>
                    ${details}
                </div>
                <div class="check-sum">${sumTotal} ₸</div>
                <div class="check-actions">
                    <button class="btn-pay-cash" onclick="payGroupedChecks('${name}')">ОПЛАТА</button>
                    <button class="btn-debt" onclick="debtGroupedChecks('${name}')">В ДОЛГ</button>
                </div>
            </div>`;
    }
}

// Оплата и долг сразу по всем чекам имени
function payGroupedChecks(name) {
    const checks = state.unpaidChecks.filter(c => c.name === name);
    const sumTotal = checks.reduce((sum, check) => sum + (check.timeCost + check.bar.reduce((s, i) => s + i.sellPrice, 0)), 0);
    
    if(confirm(`Клиент ${name} оплатил общую сумму за все чеки (${sumTotal} ₸)?`)) {
        checks.forEach(check => {
            state.totalRevenue += (check.timeCost + check.bar.reduce((s, i) => s + i.sellPrice, 0));
            state.tableRevenue += check.timeCost;
            state.barRevenue += check.bar.reduce((s, i) => s + i.sellPrice, 0);
        });
        state.unpaidChecks = state.unpaidChecks.filter(c => c.name !== name); // Убрать все чеки по имени
        save();
    }
}

function debtGroupedChecks(name) {
    const checks = state.unpaidChecks.filter(c => c.name === name);
    const sumTotal = checks.reduce((sum, check) => sum + (check.timeCost + check.bar.reduce((s, i) => s + i.sellPrice, 0)), 0);
    
    if(confirm(`Записать общую сумму задолженности клиента ${name} (${sumTotal} ₸) в ДОЛГ?`)) {
        state.debts.push({
            name: name,
            amount: sumTotal,
            date: new Date().toLocaleDateString(),
            reason: `Чеки группы (${checks.length} шт)`
        });
        state.unpaidChecks = state.unpaidChecks.filter(c => c.name !== name);
        save();
    }
}

// ... (остальной код calculateAmount, addToBar, addInventoryItem, window.onload без изменений)
// Просто добавлю renderTable и renderChecks в render.

function render() {
    if (state.shiftActive && !currentUser) {
        currentUser = STAFF_LIST.find(user => user.name === state.activeStaffName);
    }
    
    const containerHall = document.querySelector('.hall-map');
    if(!containerHall) return;
    containerHall.innerHTML = state.tables.map(table => renderTable(table)).join('');

    renderChecks(); // Отрисовать Текущие Чеки

    // Обновить Долги и Бухгалтерию (База для Этапа 2 и 3)
    document.getElementById('debt-list').innerHTML = state.debts.map(d => `<div class="item-row"><span>${d.name}: ${d.amount} ₸ (${d.date}, ${d.reason})</span></div>`).join('');
    document.getElementById('inventory-list').innerHTML = state.inventory.map(i => `<div class="item-row"><span>${i.name}</span><span>Прибыль: ${i.sellPrice - i.buyPrice}</span></div>`).join('');

    if(state.shiftActive) {
        document.getElementById('display-admin-name').innerText = state.activeStaffName;
        document.getElementById('stat-revenue').innerText = state.totalRevenue;
        let salary = (state.activeStaffName === "Хозяин") ? 0 : Math.round(state.totalRevenue * PERCENT + BASE_SALARY);
        document.getElementById('stat-salary').innerText = salary;
        document.getElementById('role-badge').innerText = state.activeStaffName === "Хозяин" ? "ХОЗЯИН" : "АДМИН";
    }
}

// Функции для Бармена
function startTable(id) {
    if(!confirm("Запустить время за столом?")) return;
    const table = state.tables.find(t => t.id === id);
    table.clientName = prompt("Имя гостя?") || "Гость";
    table.discount = parseInt(prompt("Скидка %?")) || 0;
    table.active = true;
    table.startTime = Date.now();
    table.bar = [];
    save();
}

function addToBar(tableId) {
    if (!state.inventory.length) return alert("Склад пуст! Добавьте товары под паролем Хозяина.");
    let list = state.inventory.map((item, i) => `${i}. ${item.name} (${item.sellPrice})`).join('\n');
    let choice = prompt(list);
    if (state.inventory[choice]) { 
        // Здесь можно доработать, чтобы бар привязывался к чеку, а не столу в Этапе 2
        state.tables.find(t => t.id === tableId).bar.push(state.inventory[choice]); save(); 
    }
}

function addInventoryItem() {
    let name = prompt("Товар:"), buy = parseInt(prompt("Закуп:")), sell = parseInt(prompt("Продажа:"));
    if (name && buy && sell) { state.inventory.push({ name, buyPrice: buy, sellPrice: sell }); save(); }
}

window.onload = () => {
    const select = document.getElementById('staff-select');
    if(select) {
        select.innerHTML = STAFF_LIST.map((s, i) => `<option value="${i}">${s.name}</option>`).join('');
    }
    if (state.shiftActive) showMain(); else showAuth();
    
    render();
    setInterval(render, 1000); // Это запускает живое время
};
