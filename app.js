// === ПОДКЛЮЧЕНИЕ FIREBASE ===
const firebaseConfig = {
    apiKey: "AIzaSyCBGxNJfQWUqSqaExMbrayDsrHIjS5sXL8",
    authDomain: "sensei-crm-e73b4.firebaseapp.com",
    databaseURL: "https://sensei-crm-e73b4-default-rtdb.firebaseio.com", // Добавлена ссылка на базу
    projectId: "sensei-crm-e73b4",
    storageBucket: "sensei-crm-e73b4.firebasestorage.app",
    messagingSenderId: "223977226546",
    appId: "1:223977226546:web:504388217da3949e60d72b"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const dbRef = db.ref('sensei_data');

const STAFF = [
    { name: "Султан", pin: "1111", role: "admin" },
    { name: "Дидар", pin: "1111", role: "admin" },
    { name: "Хозяин", pin: "0000", role: "owner" }
];

let globalState = { tables: [], checks: [], inventory: [], debts: [], history: [] };
let activeAdmin = null;
let localRevenue = 0; // Выручка текущей смены админа

// Инициализация пустых столов при первом запуске
if (globalState.tables.length === 0) {
    globalState.tables = Array.from({length: 6}, (_, i) => ({ id: i + 1, active: false, start: null, bar: [], res: [] }));
}

// СИНХРОНИЗАЦИЯ С ОБЛАКОМ
dbRef.on('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
        globalState = data;
        if (!globalState.tables) globalState.tables = Array.from({length: 6}, (_, i) => ({ id: i + 1, active: false, start: null, bar: [], res: [] }));
        if (!globalState.checks) globalState.checks = [];
        if (!globalState.inventory) globalState.inventory = [];
        if (!globalState.debts) globalState.debts = [];
    }
    render();
});

function saveToCloud() {
    dbRef.set(globalState);
}

// АВТОРИЗАЦИЯ
window.onload = () => {
    document.getElementById('staff-select').innerHTML = STAFF.map((s, i) => `<option value="${i}">${s.name}</option>`).join('');
};

function login() {
    const idx = document.getElementById('staff-select').value;
    const pin = document.getElementById('pass-input').value;
    if (STAFF[idx].pin === pin) {
        activeAdmin = STAFF[idx];
        localRevenue = 0;
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app').style.display = 'block';
        render();
    } else {
        document.getElementById('auth-error').style.display = 'block';
    }
}

function logout() {
    if (confirm("Закрыть смену?")) {
        const salary = activeAdmin.role === 'owner' ? 0 : Math.round(localRevenue * 0.08 + 6000);
        if(!globalState.history) globalState.history = [];
        globalState.history.push({
            date: new Date().toLocaleString(),
            admin: activeAdmin.name,
            rev: localRevenue,
            sal: salary
        });
        saveToCloud();
        location.reload();
    }
}

// РАСЧЕТ СТОИМОСТИ (2000 днем, 3000 ночью + Округление до 50)
function calculateCost(startTime) {
    if (!startTime) return 0;
    let total = 0;
    let current = new Date(startTime);
    const end = new Date();
    
    while (current < end) {
        let h = current.getHours();
        let ratePerHour = (h >= 11 && h < 18) ? 2000 : 3000;
        total += ratePerHour / 60; 
        current.setMinutes(current.getMinutes() + 1);
    }
    // Округление ВВЕРХ до ближайших 50 тенге
    return Math.ceil(total / 50) * 50; 
}

function formatTime(ms) {
    let s = Math.floor(ms / 1000);
    let h = String(Math.floor(s / 3600)).padStart(2, '0');
    let m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    return `${h}:${m}:${String(s % 60).padStart(2, '0')}`;
}

// УПРАВЛЕНИЕ СТОЛАМИ
function startTable(id) {
    const t = globalState.tables.find(x => x.id === id);
    t.active = true;
    t.start = Date.now();
    t.bar = [];
    saveToCloud();
}

function stopTable(id) {
    const t = globalState.tables.find(x => x.id === id);
    const name = prompt("Введите имя гостя для закрытия чека:");
    if (!name) return;

    const timeCost = calculateCost(t.start);
    createOrMergeCheck(name, id, timeCost, t.bar || []);
    
    t.active = false;
    t.start = null;
    t.bar = [];
    saveToCloud();
}

function commTable(id) {
    const t = globalState.tables.find(x => x.id === id);
    const name = prompt("Коммерция. Введите имя ПРОИГРАВШЕГО:");
    if (!name) return;

    const timeCost = calculateCost(t.start);
    createOrMergeCheck(name, id, timeCost, t.bar || []);
    
    t.start = Date.now(); // Обнуляем таймер, игра продолжается
    t.bar = [];
    saveToCloud();
}

function addBarToTable(id) {
    const t = globalState.tables.find(x => x.id === id);
    if (!globalState.inventory || globalState.inventory.length === 0) return alert("Склад пуст");
    
    let itemsStr = globalState.inventory.map((item, i) => `${i}. ${item.name} (${item.price} ₸) [Ост: ${item.qty}]`).join('\n');
    let choice = prompt("Выберите номер товара:\n" + itemsStr);
    let item = globalState.inventory[choice];
    
    if (item && item.qty > 0) {
        item.qty -= 1;
        if(!t.bar) t.bar = [];
        t.bar.push({ name: item.name, price: item.price });
        saveToCloud();
    } else {
        alert("Ошибка: товар не найден или закончился.");
    }
}

// УМНЫЕ ЧЕКИ (СЛИЯНИЕ)
function createOrMergeCheck(name, tableId, timeCost, barItems) {
    let existing = globalState.checks.find(c => c.name.toLowerCase() === name.toLowerCase());
    
    let barTotal = barItems.reduce((sum, item) => sum + item.price, 0);
    
    if (existing && confirm(`Найден открытый чек на имя "${existing.name}". Объединить счета?`)) {
        existing.timeCost += timeCost;
        if(barItems.length > 0) existing.bar = (existing.bar || []).concat(barItems);
        existing.total += (timeCost + barTotal);
        existing.details += ` + Стол ${tableId}`;
    } else {
        globalState.checks.push({
            name: name,
            table: tableId,
            details: `Стол ${tableId}`,
            timeCost: timeCost,
            bar: barItems,
            total: timeCost + barTotal,
            date: new Date().toLocaleTimeString()
        });
    }
}

function sellBarOnly() {
    const name = prompt("Имя гостя (для чека):");
    if(!name) return;
    
    let itemsStr = globalState.inventory.map((item, i) => `${i}. ${item.name} (${item.price} ₸)`).join('\n');
    let choice = prompt("Выберите номер товара:\n" + itemsStr);
    let item = globalState.inventory[choice];
    
    if (item && item.qty > 0) {
        item.qty -= 1;
        createOrMergeCheck(name, "Бар", 0, [{ name: item.name, price: item.price }]);
        saveToCloud();
    }
}

// ОПЛАТА И ДОЛГИ
function payCheck(i) {
    localRevenue += globalState.checks[i].total;
    globalState.checks.splice(i, 1);
    saveToCloud();
    render(); // Для обновления ЗП
}

function toDebt(i) {
    globalState.debts.push({ ...globalState.checks[i], date: new Date().toLocaleDateString() });
    globalState.checks.splice(i, 1);
    saveToCloud();
}

// БРОНЬ
function addRes(id) {
    const t = globalState.tables.find(x => x.id === id);
    const text = prompt("Бронь (Имя и Время, например: Айдар 10:00):");
    if(text) {
        if(!t.res) t.res = [];
        t.res.push(text);
        saveToCloud();
    }
}
function removeRes(tId, rIdx) {
    globalState.tables.find(x => x.id === tId).res.splice(rIdx, 1);
    saveToCloud();
}

// СКЛАД
function addItem() {
    const name = prompt("Название товара:");
    const price = prompt("Цена продажи:");
    const qty = prompt("Количество на складе:");
    if(name && price && qty) {
        globalState.inventory.push({name, price: parseInt(price), qty: parseInt(qty)});
        saveToCloud();
    }
}

// РЕНДЕР ИНТЕРФЕЙСА
function render() {
    if (!activeAdmin) return;

    document.getElementById('user-display').innerText = activeAdmin.name;
    document.getElementById('rev-val').innerText = localRevenue.toLocaleString();
    document.getElementById('salary-val').innerText = (activeAdmin.role === 'owner' ? 0 : Math.round(localRevenue * 0.08 + 6000)).toLocaleString();
    document.getElementById('owner-tab').style.display = activeAdmin.role === 'owner' ? 'block' : 'none';
    document.getElementById('add-item-btn').style.display = activeAdmin.role === 'owner' ? 'block' : 'none';

    // Столы
    document.getElementById('tables-grid').innerHTML = globalState.tables.map(t => {
        let timeStr = "00:00:00", costStr = "0";
        let barSum = (t.bar || []).reduce((s, i) => s + i.price, 0);

        if(t.active) {
            let diff = Date.now() - t.start;
            timeStr = formatTime(diff);
            costStr = (calculateCost(t.start) + barSum).toLocaleString();
        }

        let resHtml = (t.res || []).map((r, i) => `<div style="display:flex; justify-content:space-between; margin-top:5px;"><span>${i+1}. ${r}</span> <span onclick="removeRes(${t.id}, ${i})" style="color:var(--red); cursor:pointer;">❌</span></div>`).join('');

        return `
            <div class="table-card ${t.active ? 'active' : ''}">
                <div class="gold-text" style="font-weight:bold; font-size:18px;">СТОЛ ${t.id}</div>
                <div class="timer">${timeStr}</div>
                <div class="gold-text" style="font-size:24px; font-weight:bold; margin-bottom:10px;">${costStr} ₸</div>
                
                ${!t.active ? `
                    <button onclick="startTable(${t.id})" class="btn-gold">ПУСК</button>
                ` : `
                    <button onclick="stopTable(${t.id})" class="btn-red">СТОП</button>
                    <div class="btn-action-group">
                        <button class="btn-outline" onclick="addBarToTable(${t.id})">+ БАР</button>
                        <button class="btn-outline" onclick="commTable(${t.id})">КОММЕРЦ</button>
                    </div>
                `}
                
                <button class="btn-outline" style="width:100%; margin-top:10px; border-color:#555; color:#888;" onclick="addRes(${t.id})">+ ДОБАВИТЬ БРОНЬ</button>
                <div class="res-list">${resHtml}</div>
            </div>
        `;
    }).join('');

    // Чеки
    document.getElementById('active-checks').innerHTML = globalState.checks.map((c, i) => {
        let barHtml = (c.bar || []).map(b => `${b.name} (${b.price}₸)`).join(', ');
        return `
        <div class="check-row">
            <div style="flex:1;">
                <div class="check-header"><b class="gold-text">${c.name}</b> <span>${c.date}</span></div>
                <div style="font-size:12px; color:#aaa; margin-bottom:5px;">${c.details} | Время: ${c.timeCost} ₸</div>
                ${barHtml ? `<div style="font-size:12px; color:#aaa;">Бар: ${barHtml}</div>` : ''}
                <div class="gold-text" style="font-size:18px; font-weight:bold; margin-top:10px;">ИТОГО: ${c.total} ₸</div>
            </div>
            <div style="display:flex; flex-direction:column; gap:5px; margin-left:20px;">
                <button onclick="payCheck(${i})" style="background:var(--green); border:none; padding:10px; border-radius:6px; color:#000; font-weight:bold; cursor:pointer;">ОПЛАТИТЬ</button>
                <button onclick="toDebt(${i})" style="background:var(--red); border:none; padding:10px; border-radius:6px; color:#fff; font-weight:bold; cursor:pointer;">В ДОЛГ</button>
            </div>
        </div>
    `}).join('');

    // Склад, Долги, Бухгалтерия
    if(globalState.inventory) {
        document.getElementById('stock-list').innerHTML = globalState.inventory.map((i, idx) => `<tr><td>${i.name}</td><td>${i.qty} шт</td><td class="gold-text">${i.price} ₸</td><td><button onclick="prompt('Новый остаток:'); alert('В разработке')" class="btn-outline">Изм.</button></td></tr>`).join('');
    }
    if(globalState.debts) {
        document.getElementById('debts-list').innerHTML = globalState.debts.map(d => `<tr><td>${d.name}</td><td class="gold-text">${d.total} ₸</td><td>${d.date}</td><td><button class="btn-outline">Погасить</button></td></tr>`).join('');
    }
    if(globalState.history) {
        document.getElementById('history-list').innerHTML = globalState.history.map(h => `<tr><td>${h.date}</td><td>${h.admin}</td><td>${h.rev} ₸</td><td class="gold-text">${h.sal} ₸</td></tr>`).join('');
    }
}

function showTab(id, btn) {
    document.querySelectorAll('.tab-content').forEach(x => x.style.display = 'none');
    document.querySelectorAll('.nav-link').forEach(x => x.classList.remove('active'));
    document.getElementById('tab-' + id).style.display = 'block';
    btn.classList.add('active');
}

setInterval(() => { if(activeAdmin) render(); }, 1000);
