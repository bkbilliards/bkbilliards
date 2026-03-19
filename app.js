// === ПОДКЛЮЧЕНИЕ ОБЛАКА FIREBASE ===
const firebaseConfig = {
    apiKey: "AIzaSyCBGxNJfQWUqSqaExMbrayDsrHIjS5sXL8",
    authDomain: "sensei-crm-e73b4.firebaseapp.com",
    databaseURL: "https://sensei-crm-e73b4-default-rtdb.firebaseio.com",
    projectId: "sensei-crm-e73b4",
    storageBucket: "sensei-crm-e73b4.firebasestorage.app",
    messagingSenderId: "223977226546",
    appId: "1:223977226546:web:504388217da3949e60d72b"
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const dbRef = db.ref('sensei_erp_v1');

const STAFF = [{ name: "Султан", pin: "1111", role: "admin" }, { name: "Дидар", pin: "1111", role: "admin" }, { name: "Хозяин", pin: "0000", role: "owner" }];
let localAuth = JSON.parse(localStorage.getItem('sensei_auth_v5')) || { isAuth: false, user: null, shiftStart: null, tableRev: 0, barRev: 0 };
let cloudState = { tables: Array.from({length: 6}, (_, i) => ({ id: i + 1, active: false, start: null, res: [] })), checks: [], archive: [], inventory: [], debts: [], history: [], ownerAcc: {} };

dbRef.on('value', (snap) => {
    if (snap.val()) cloudState = snap.val();
    else saveToCloud();
    render();
});
function saveToCloud() { dbRef.set(cloudState); }
function saveLocalAuth() { localStorage.setItem('sensei_auth_v5', JSON.stringify(localAuth)); }

window.onload = () => { render(); setInterval(() => { if(localAuth.isAuth) renderTables(); }, 1000); };

function login() {
    const idx = document.getElementById('staff-select').value;
    const pin = document.getElementById('pass-input').value;
    if (STAFF[idx].pin === pin) {
        localAuth = { isAuth: true, user: STAFF[idx], shiftStart: new Date().toLocaleString(), tableRev: 0, barRev: 0 };
        saveLocalAuth(); document.getElementById('pass-input').value = ""; render();
    } else { document.getElementById('auth-error').style.display = 'block'; }
}

function logout() {
    if (confirm("Закрыть смену?")) {
        const totalRev = localAuth.tableRev + localAuth.barRev;
        const salary = localAuth.user.role === 'owner' ? 0 : Math.round(totalRev * 0.08 + 6000);
        
        if(!cloudState.history) cloudState.history = [];
        cloudState.history.push({ admin: localAuth.user.name, start: localAuth.shiftStart, end: new Date().toLocaleString(), barRev: localAuth.barRev, tableRev: localAuth.tableRev, total: totalRev, sal: salary });
        
        // Накопление ЗП для хозяина
        if(localAuth.user.role !== 'owner') {
            if(!cloudState.ownerAcc) cloudState.ownerAcc = {};
            if(!cloudState.ownerAcc[localAuth.user.name]) cloudState.ownerAcc[localAuth.user.name] = 0;
            cloudState.ownerAcc[localAuth.user.name] += salary;
        }

        saveToCloud();
        localAuth = { isAuth: false, user: null, shiftStart: null, tableRev: 0, barRev: 0 };
        saveLocalAuth(); render();
    }
}

// === ЛОГИКА ТАРИФОВ И ВРЕМЕНИ ===
function formatTime(ms) {
    let s = Math.floor(ms / 1000), h = String(Math.floor(s / 3600)).padStart(2, '0'), m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    return `${h}:${m}:${String(s % 60).padStart(2, '0')}`;
}

function calcCost(startTime) {
    if (!startTime) return 0;
    let total = 0, current = new Date(startTime), end = new Date();
    while (current < end) {
        let h = current.getHours();
        total += ((h >= 11 && h < 18) ? 2000 : 3000) / 60; 
        current.setMinutes(current.getMinutes() + 1);
    }
    return Math.ceil(total / 50) * 50; // Округление до 50 ₸
}

// === СТОЛЫ ===
function startTable(id) {
    const t = cloudState.tables.find(x => x.id === id);
    t.active = true; t.start = Date.now(); t.bar = []; saveToCloud();
}

function stopTable(id) {
    const t = cloudState.tables.find(x => x.id === id);
    const name = prompt("Введите имя гостя (для чека):");
    if (!name) return;
    const tCost = calcCost(t.start);
    createOrMergeCheck(name, id, tCost, t.bar || [], t.start);
    t.active = false; t.start = null; t.bar = []; saveToCloud();
}

function commTable(id) {
    const t = cloudState.tables.find(x => x.id === id);
    const name = prompt("Коммерция. Имя проигравшего:");
    if (!name) return;
    createOrMergeCheck(name, id, calcCost(t.start), t.bar || [], t.start);
    t.start = Date.now(); t.bar = []; saveToCloud();
}

function addRes(id) {
    const t = cloudState.tables.find(x => x.id === id);
    let r = prompt("Бронь (Имя, Время):"); if(r) { if(!t.res) t.res=[]; t.res.push(r); saveToCloud(); }
}
function editRes(tId, rIdx) {
    let t = cloudState.tables.find(x => x.id === tId);
    let n = prompt("Изменить бронь:", t.res[rIdx]); if(n) { t.res[rIdx] = n; saveToCloud(); }
}
function delRes(tId, rIdx) { cloudState.tables.find(x => x.id === tId).res.splice(rIdx,1); saveToCloud(); }

// === БАР (МОДАЛКА) ===
let barContext = null; 
function openBarModal(context) {
    barContext = context;
    if(!cloudState.inventory || cloudState.inventory.length === 0) return alert("Склад пуст");
    document.getElementById('bar-modal').style.display = 'flex';
    document.getElementById('bar-search').value = '';
    renderBarSearch();
}

function renderBarSearch() {
    const q = document.getElementById('bar-search').value.toLowerCase();
    const list = document.getElementById('bar-items-list');
    list.innerHTML = cloudState.inventory.filter(i => i.name.toLowerCase().includes(q)).map((i, idx) => `
        <div class="bar-item-row" onclick="selectBarItem('${i.name}')">
            <span>${i.name}</span><span class="gold-text">${i.price} ₸ (Ост: ${i.qty})</span>
        </div>
    `).join('');
}

function selectBarItem(itemName) {
    let item = cloudState.inventory.find(x => x.name === itemName);
    if(item.qty <= 0) return alert("Товар закончился!");
    item.qty -= 1;

    if(barContext === 'standalone') {
        const name = prompt("Имя гостя для бара:");
        if(name) createOrMergeCheck(name, "Бар", 0, [{name: item.name, price: item.price}], null);
    } else {
        const t = cloudState.tables.find(x => x.id === barContext);
        if(!t.bar) t.bar = [];
        t.bar.push({name: item.name, price: item.price});
    }
    document.getElementById('bar-modal').style.display = 'none';
    saveToCloud();
}

// === УМНЫЕ ЧЕКИ (СЛИЯНИЕ) ===
function createOrMergeCheck(name, tableId, timeCost, barItems, startMs) {
    if(!cloudState.checks) cloudState.checks = [];
    let barTotal = barItems.reduce((s, i) => s + i.price, 0);
    let exist = cloudState.checks.find(c => c.name.toLowerCase() === name.toLowerCase());

    if(exist && confirm(`Объединить с открытым чеком гостя "${exist.name}"?`)) {
        exist.timeCost += timeCost;
        exist.barCost += barTotal;
        if(barItems.length > 0) exist.bar = (exist.bar || []).concat(barItems);
        exist.total += (timeCost + barTotal);
        if(tableId !== "Бар") exist.details += ` + Стол ${tableId}`;
    } else {
        let startTimeStr = startMs ? new Date(startMs).toLocaleTimeString() : "";
        cloudState.checks.push({
            id: Date.now(), name: name, table: tableId, date: new Date().toLocaleDateString(), startStr: startTimeStr, endStr: new Date().toLocaleTimeString(),
            timeCost: timeCost, barCost: barTotal, bar: barItems, total: timeCost + barTotal, details: `Стол ${tableId}`
        });
    }
}

// === ОПЛАТА ===
let currentCheckIndex = null;
function openPayModal(idx) {
    currentCheckIndex = idx;
    let c = cloudState.checks[idx];
    document.getElementById('pay-total').innerText = c.total + " ₸";
    document.getElementById('pay-info').innerText = `Гость: ${c.name} | Стол: ${c.table}`;
    document.getElementById('pay-modal').style.display = 'flex';
}

function processPayment(method) {
    let c = cloudState.checks[currentCheckIndex];
    if(method === 'Долг') {
        if(!cloudState.debts) cloudState.debts = [];
        let d = cloudState.debts.find(x => x.name.toLowerCase() === c.name.toLowerCase());
        if(d) {
            d.total += c.total; d.history.push(`+${c.total}₸ (${c.date})`);
        } else {
            cloudState.debts.push({ name: c.name, total: c.total, history: [`+${c.total}₸ (${c.date})`] });
        }
    }
    
    // Выручка считается, даже если долг (по ТЗ)
    localAuth.tableRev += c.timeCost;
    localAuth.barRev += c.barCost;
    
    c.payMethod = method;
    c.admin = localAuth.user.name;
    if(!cloudState.archive) cloudState.archive = [];
    cloudState.archive.push(c);
    
    cloudState.checks.splice(currentCheckIndex, 1);
    document.getElementById('pay-modal').style.display = 'none';
    saveLocalAuth(); saveToCloud();
}

function splitPayment(n) {
    let c = cloudState.checks[currentCheckIndex];
    alert(`Сумма чека: ${c.total} ₸.\nПри разделении на ${n} чел, каждый платит по ${Math.ceil(c.total / n)} ₸.`);
}

function editCheckName() {
    let c = cloudState.checks[currentCheckIndex];
    let n = prompt("Новое имя:", c.name);
    if(n) { c.name = n; document.getElementById('pay-modal').style.display = 'none'; saveToCloud(); }
}

// === ДОЛГИ И СКЛАД ===
function payDebt(idx) {
    let d = cloudState.debts[idx];
    let sum = prompt(`Долг: ${d.total} ₸. Введите сумму оплаты (можно частично):`);
    if(sum && !isNaN(sum)) {
        sum = parseInt(sum);
        d.total -= sum;
        d.history.push(`Оплата: -${sum}₸`);
        localAuth.tableRev += sum; // Плюсуем в кассу
        if(d.total <= 0) cloudState.debts.splice(idx, 1);
        saveLocalAuth(); saveToCloud();
    }
}
function editDebt(idx) { let s=prompt("Новая сумма:", cloudState.debts[idx].total); if(s) { cloudState.debts[idx].total=parseInt(s); saveToCloud(); } }
function delDebt(idx) { if(confirm("Удалить должника?")) { cloudState.debts.splice(idx,1); saveToCloud(); } }

function addItem() {
    const name = prompt("Название товара:"); const price = prompt("Цена:"); const qty = prompt("Количество:");
    if(name && price && qty) { if(!cloudState.inventory) cloudState.inventory=[]; cloudState.inventory.push({name, price: parseInt(price), qty: parseInt(qty)}); saveToCloud(); }
}
function editItem(idx) {
    let i = cloudState.inventory[idx];
    let q = prompt("Новый остаток:", i.qty); if(q) { i.qty = parseInt(q); saveToCloud(); }
}
function renameItem(idx) { let n = prompt("Новое имя:", cloudState.inventory[idx].name); if(n) { cloudState.inventory[idx].name = n; saveToCloud(); } }
function delItem(idx) { if(confirm("Удалить товар?")) { cloudState.inventory.splice(idx,1); saveToCloud(); } }

// === БУХГАЛТЕРИЯ ===
function payAdmin(name) {
    let s = prompt(`К выплате ${name}: ${cloudState.ownerAcc[name]}₸. Введите сумму выплаты/аванса:`);
    if(s) { cloudState.ownerAcc[name] -= parseInt(s); saveToCloud(); }
}
function fineAdmin(name) {
    let s = prompt(`Штраф для ${name} (отнимется от ЗП):`);
    if(s) { cloudState.ownerAcc[name] -= parseInt(s); saveToCloud(); }
}

// === ОТРИСОВКА ===
function showTab(id, btn) {
    document.querySelectorAll('.tab-pane').forEach(x => x.style.display = 'none');
    document.querySelectorAll('.nav-link').forEach(x => x.classList.remove('active'));
    document.getElementById('tab-' + id).style.display = 'block';
    btn.classList.add('active');
}

function renderTables() {
    document.getElementById('tables-grid').innerHTML = cloudState.tables.map(t => {
        let timeStr = "00:00:00", costStr = "0";
        if(t.active) { timeStr = formatTime(Date.now() - t.start); costStr = calcCost(t.start).toLocaleString(); }
        let resHtml = (t.res || []).map((r, i) => `<div class="res-item"><span>${i+1}. ${r}</span> <div><span onclick="editRes(${t.id},${i})" style="color:var(--gold); cursor:pointer; margin-right:5px;">✏️</span><span onclick="delRes(${t.id},${i})" style="color:var(--red); cursor:pointer;">❌</span></div></div>`).join('');
        return `
            <div class="table-card ${t.active ? 'active' : ''}">
                <div class="gold-text" style="font-size:18px; font-weight:bold;">СТОЛ ${t.id}</div>
                <div class="timer">${timeStr}</div>
                <div class="gold-text" style="font-size:24px; font-weight:bold; margin-bottom:10px;">${costStr} ₸</div>
                ${!t.active ? `<button onclick="startTable(${t.id})" class="btn-gold">ПУСК</button>` : `<button onclick="stopTable(${t.id})" class="btn-red">СТОП</button><div class="btn-action-group"><button class="btn-outline" onclick="openBarModal(${t.id})">БАР</button><button class="btn-outline" onclick="commTable(${t.id})">КОММЕРЦ</button></div>`}
                <button class="btn-outline" style="width:100%; margin-top:10px; border-color:#333; color:#888;" onclick="addRes(${t.id})">+ БРОНЬ</button>
                ${resHtml}
            </div>
        `;
    }).join('');
}

function render() {
    if (!localAuth.isAuth) { document.getElementById('auth-screen').style.display='flex'; document.getElementById('app').style.display='none'; return; }
    document.getElementById('auth-screen').style.display='none'; document.getElementById('app').style.display='block';
    
    document.getElementById('user-display').innerText = localAuth.user
