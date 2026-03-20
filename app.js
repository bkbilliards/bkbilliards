const firebaseConfig = {
    apiKey: "AIzaSyCBGxNJfQWUqSqaExMbrayDsrHIjS5sXL8",
    authDomain: "sensei-crm-e73b4.firebaseapp.com",
    databaseURL: "https://sensei-crm-e73b4-default-rtdb.firebaseio.com",
    projectId: "sensei-crm-e73b4",
    storageBucket: "sensei-crm-e73b4.firebasestorage.app",
    messagingSenderId: "223977226546",
    appId: "1:223977226546:web:504388217da3949e60d72b"
};

try { if (!firebase.apps.length) firebase.initializeApp(firebaseConfig); } catch(e) { console.error(e); }
const db = firebase.database();
const dbRef = db.ref('sensei_erp_pro');

// ЖЕСТКАЯ ФИКСАЦИЯ ВРЕМЕНИ ДЛЯ РАСЧЕТА СМЕНЫ: 20 марта 2026, 14:00:00 (Almaty Time)
// Все чеки ДО этого времени игнорируются в текущей выручке
const SHIFT_START_BUGFIX_TIMESTAMP = 1773997200000; 

const STAFF_HARDCODED = [
    { id: "0", name: "Султан", pin: "1111", role: "admin" }, 
    { id: "1", name: "Дидар", pin: "1111", role: "admin" }, 
    { id: "owner", name: "Хозяин", pin: "0000", role: "owner" }
];

let localAuth = JSON.parse(localStorage.getItem('sensei_auth_pro')) || { isAuth: false, user: null };

let cloudState = { 
    tables: Array.from({length: 6}, (_, i) => ({ id: i + 1, active: false, start: null, res: [], bar: [] })), 
    checks: [], archive: [], inventory: [], debts: [], history: [], ownerAcc: {}, customAdmins: [], expenses: [], vips: []
};

function toArr(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    return Object.values(data);
}

dbRef.on('value', snap => {
    if (snap.exists() && snap.val()) {
        let data = snap.val();
        cloudState.tables = toArr(data.tables);
        if (cloudState.tables.length === 0) cloudState.tables = Array.from({length: 6}, (_, i) => ({ id: i + 1, active: false, start: null, res: [], bar: [] }));
        cloudState.checks = toArr(data.checks);
        cloudState.archive = toArr(data.archive);
        cloudState.inventory = toArr(data.inventory);
        cloudState.debts = toArr(data.debts);
        cloudState.history = toArr(data.history);
        cloudState.customAdmins = toArr(data.customAdmins);
        cloudState.expenses = toArr(data.expenses);
        cloudState.vips = toArr(data.vips); 
        cloudState.ownerAcc = data.ownerAcc || {};
    } else {
        saveToCloud();
    }
    
    const urlParams = new URLSearchParams(window.location.search);
    if(urlParams.get('guest') === 'true') {
        showGuestPage();
    } else {
        render();
    }
});

function saveToCloud() { dbRef.set(cloudState).catch(e => console.error(e)); }
function saveLocalAuth() { localStorage.setItem('sensei_auth_pro', JSON.stringify(localAuth)); }

window.onload = () => { 
    const urlParams = new URLSearchParams(window.location.search);
    if(urlParams.get('guest') === 'true') {
        showGuestPage();
    } else {
        render(); 
    }
    setInterval(() => { if(localAuth.isAuth) renderTables(); }, 1000); 
};

// === GUEST ===
window.showGuestPage = function() {
    document.getElementById('auth-screen').style.display = 'none';
    if(document.getElementById('app')) document.getElementById('app').style.display = 'none';
    document.getElementById('guest-app').style.display = 'block';
    renderGuestTables();
}

window.renderGuestTables = function() {
    if(!cloudState.tables) return;
    let html = '';
    toArr(cloudState.tables).forEach(t => {
        let status = t.active ? '<span style="color:var(--red);">🔴 ЗАНЯТ</span>' : '<span style="color:var(--green);">🟢 СВОБОДЕН</span>';
        html += `<div class="guest-table-card"><h3>СТОЛ ${t.id}</h3>${status}</div>`;
    });
    document.getElementById('guest-tables-list').innerHTML = html;
}

window.submitGuestReservation = function() {
    let name = document.getElementById('guest-name').value;
    let phone = document.getElementById('guest-phone').value;
    let date = document.getElementById('guest-date').value;
    let time = document.getElementById('guest-time').value;
    let tableId = parseInt(document.getElementById('guest-table-num').value);
    if(!name || !phone || !date || !time) return alert("Заполните поля!");
    let resString = `${time} | ${name} (${phone})`;
    cloudState.tables = toArr(cloudState.tables);
    let t = cloudState.tables.find(x => x.id === tableId);
    if(t) { t.res = toArr(t.res); t.res.push(resString); saveToCloud(); alert("Бронь отправлена!"); }
}

// === CRM ===
window.login = function() {
    const val = document.getElementById('staff-select').value;
    const pin = document.getElementById('pass-input').value;
    let user = STAFF_HARDCODED.find(s => s.id === val);
    if (user && user.pin === pin) {
        localAuth = { isAuth: true, user: user, shiftStart: new Date().toLocaleString() };
        saveLocalAuth(); render();
    } else { document.getElementById('auth-error').style.display = 'block'; }
}
window.logout = function() { document.getElementById('z-report-modal').style.display = 'flex'; }

// === ИСПРАВЛЕННАЯ ЛОГИКА СМЕНЫ (УБРАН КЭШБЕК, ФИКС ВРЕМЕНИ) ===
function getCurrentShiftData() {
    // Фильтруем архив: только чеки ПОСЛЕ 20.03.2026, 14:00ч
    let currentChecks = toArr(cloudState.archive).filter(c => c.id > SHIFT_START_BUGFIX_TIMESTAMP);
    let currentExp = toArr(cloudState.expenses).filter(e => e.id > SHIFT_START_BUGFIX_TIMESTAMP);
    
    let total = currentChecks.reduce((s, c) => (c.payMethod !== 'Долг' && !c.isDebtPayment) ? s + c.total : s, 0);
    let shiftZp = Math.round(total * 0.08 + 6000);
    let expTotal = currentExp.reduce((s, e) => s + e.sum, 0);
    let debtReturns = currentChecks.reduce((s, c) => c.isDebtPayment ? s + c.total : s, 0);

    return { total, shiftZp, expTotal, expectedCash: total + debtReturns - shiftZp - expTotal };
}

window.confirmZReport = function() {
    saveToCloud(); localAuth = { isAuth: false, user: null }; saveLocalAuth(); location.reload();
}

window.saveExpense = function() {
    let sum = parseInt(document.getElementById('exp-sum').value); let desc = document.getElementById('exp-desc').value;
    if(!sum || !desc) return alert("Заполните поля!");
    cloudState.expenses = toArr(cloudState.expenses);
    cloudState.expenses.push({ id: Date.now(), sum: sum, desc: desc, admin: localAuth.user.name });
    document.getElementById('expense-modal').style.display='none'; saveToCloud();
}

// === ЗАЛ ===
window.calcCost = function(start) { 
    let startTime = new Date(start).getTime(); let currentMs = Date.now();
    let total = 0;
    while (startTime < currentMs) {
        let h = new Date(startTime).getHours();
        total += (h >= 11 && h < 18) ? 2000 / 60 : 3000 / 60;
        startTime += 60000;
    }
    return Math.ceil(total / 50) * 50; 
}
function formatTime(ms) { let s = Math.floor(ms / 1000), h = String(Math.floor(s / 3600)).padStart(2,'0'), m = String(Math.floor((s % 3600)/60)).padStart(2,'0'); return `${h}:${m}`; }

window.startTable = function(id) { cloudState.tables = toArr(cloudState.tables); let t = cloudState.tables.find(x => x.id === id); if(t) { t.active = true; t.start = Date.now(); t.bar = []; saveToCloud(); } }
window.stopTable = function(id) { cloudState.tables = toArr(cloudState.tables); let t = cloudState.tables.find(x => x.id === id); const name = prompt("Имя:"); if (!name) return; createCheck(name, id, calcCost(t.start), t.bar); t.active = false; t.bar = []; saveToCloud(); }

window.openBarModal = function(context) { 
    barContext = context; document.getElementById('bar-modal').style.display = 'flex'; 
    document.getElementById('bar-search').value = ''; renderBarSearch(); 
}
window.renderBarSearch = function() {
    let invArr = toArr(cloudState.inventory).filter(i => i.qty > 0);
    const q = document.getElementById('bar-search').value.toLowerCase(); 
    document.getElementById('bar-items-list').innerHTML = invArr.filter(i => i.name.toLowerCase().includes(q)).map(i => `
        <div class="bar-item-row" onclick="selectBarItem('${i.name}')"><span>${i.name}</span><b>${i.price} ₸</b></div>
    `).join(''); 
}
window.selectBarItem = function(itemName) {
    let inv = toArr(cloudState.inventory); let item = inv.find(x => x.name === itemName); item.qty--;
    let cItem = {name: item.name, price: item.price};
    if(barContext === 'standalone') createCheck(prompt("Имя для бара:"), "Бар", 0, [cItem]);
    else { cloudState.tables = toArr(cloudState.tables); let t = cloudState.tables.find(x => x.id === barContext); t.bar = toArr(t.bar); t.bar.push(cItem); }
    document.getElementById('bar-modal').style.display = 'none'; saveToCloud();
}

function createCheck(name, table, timeCost, bar) {
    cloudState.checks = toArr(cloudState.checks);
    let check = { id: Date.now(), name, table, timeCost, barCost: toArr(bar).reduce((s,i)=>s+i.price,0), bar: toArr(bar), discount: 0 };
    let vip = toArr(cloudState.vips).find(v => v.name.toLowerCase() === name.toLowerCase());
    if(vip) check.discount = vip.discount;
    check.total = Math.round((check.timeCost + check.barCost) * (1 - check.discount/100));
    cloudState.checks.push(check);
}

let currentCheckIndex = null;
window.openPayModal = function(idx) { 
    currentCheckIndex = idx; let c = toArr(cloudState.checks)[idx]; 
    document.getElementById('pay-total').innerText = c.total + " ₸";
    document.getElementById('pay-info').innerText = `${c.name} | Стол ${c.table}`;
    document.getElementById('pay-modal').style.display = 'flex'; 
}
window.applyDiscount = function(pct) {
    let c = toArr(cloudState.checks)[currentCheckIndex]; c.discount = pct;
    c.total = Math.round((c.timeCost + c.barCost) * (1 - pct/100));
    document.getElementById('pay-total').innerText = c.total + " ₸"; saveToCloud();
}
window.processPayment = function(method) {
    cloudState.checks = toArr(cloudState.checks);
    let c = cloudState.checks[currentCheckIndex]; c.payMethod = method; c.admin = localAuth.user.name;
    if(method === 'Долг') { cloudState.debts = toArr(cloudState.debts); cloudState.debts.push({name: c.name, total: c.total, history: [`+${c.total}`]}); }
    cloudState.archive = toArr(cloudState.archive); cloudState.archive.push(c); cloudState.checks.splice(currentCheckIndex, 1);
    document.getElementById('pay-modal').style.display = 'none'; saveToCloud();
}

// === STOCK ===
window.saveNewItem = function() { 
    const name = document.getElementById('new-item-name').value; const price = parseInt(document.getElementById('new-item-price').value); const qty = parseInt(document.getElementById('new-item-qty').value); 
    if(!name || isNaN(price) || isNaN(qty)) return alert("Заполните поля!");
    cloudState.inventory = toArr(cloudState.inventory); cloudState.inventory.push({name, price, qty}); 
    document.getElementById('add-item-modal').style.display = 'none'; saveToCloud(); 
}

// === OWNER ===
window.addVipGuest = function() {
    let name = prompt("Имя VIP:"); let disc = prompt("Скидка (%):");
    if(!name || !disc) return;
    cloudState.vips = toArr(cloudState.vips); cloudState.vips.push({id: Date.now(), name, discount: parseInt(disc)});
    saveToCloud();
}
window.resetDatabase = function() { if(confirm("База будет очищена!")) { cloudState = { tables: Array.from({length: 6}, (_, i) => ({ id: i + 1, active: false, start: null, res: [], bar:[] })), checks: [], archive: [], inventory: [], debts: [], history: [], ownerAcc: {}, customAdmins: [], expenses:[], vips: [] }; saveToCloud(); location.reload(); } }

// === RENDER ===
function showTab(id, btn) { document.querySelectorAll('.tab-pane').forEach(x => x.style.display = 'none'); document.querySelectorAll('.nav-link').forEach(x => x.classList.remove('active')); document.getElementById('tab-'+id).style.display = 'block'; btn.classList.add('active'); }

function renderTables() {
    let tablesArr = toArr(cloudState.tables);
    if(tablesArr.length === 0) return;
    document.getElementById('tables-grid').innerHTML = tablesArr.map(t => {
        let timeStr = "00:00", cost = 0; if(t.active) { timeStr = formatTime(Date.now() - t.start); cost = calcCost(t.start); }
        let barSum = toArr(t.bar).reduce((s,i)=>s+i.price,0);
        return `<div class="table-card ${t.active ? 'active' : ''}"><div>СТОЛ ${t.id}</div><div class="timer">${timeStr}</div><div style="font-size:28px;">${(cost + barSum)} ₸</div>${!t.active ? `<button onclick="startTable(${t.id})" class="btn-gold btn-large">▶ ПУСК</button>` : `<button onclick="stopTable(${t.id})" class="btn-red">⏹ СТОП</button><div class="table-actions"><button class="btn-outline flex-1" onclick="openBarModal(${t.id})">🍸 БАР</button></div>`}</div>`;
    }).join('');
}

function render() {
    let staffSelect = document.getElementById('staff-select');
    if(staffSelect && staffSelect.innerHTML === "") {
        let html = '<option value="0">Султан</option><option value="1">Дидар</option><option value="owner">Хозяин</option>';
        staffSelect.innerHTML = html;
    }

    if (!localAuth.isAuth) { document.getElementById('auth-screen').style.display='flex'; document.getElementById('app').style.display='none'; return; }
    document.getElementById('auth-screen').style.display='none'; document.getElementById('app').style.display='block';
    document.getElementById('user-display').innerText = localAuth.user.name;
    let isOwner = localAuth.user.role === 'owner';
    document.getElementById('acc-tab').style.display = isOwner ? 'block' : 'none';
    document.getElementById('owner-tab').style.display = isOwner ? 'block' : 'none';

    renderTables();
    let shift = getCurrentShiftData();
    document.getElementById('global-rev').innerText = shift.total.toLocaleString() + " ₸";
    document.getElementById('global-shift-zp').innerText = shift.shiftZp.toLocaleString() + " ₸";
    document.getElementById('global-total-zp').innerText = shift.shiftZp.toLocaleString() + " ₸";

    document.getElementById('active-checks').innerHTML = toArr(cloudState.checks).map((c, i) => `
        <div class="check-row"><div style="flex:1;"><b>${c.name}</b> (${c.total} ₸) [Стол ${c.table}]</div><button onclick="openPayModal(${i})" class="btn-gold">ОПЛАТА</button></div>
    `).join('');
    
    document.getElementById('archive-list').innerHTML = toArr(cloudState.archive).slice().reverse().map(a => `<tr><td>${new Date(a.id).toLocaleTimeString().slice(0,5)}</td><td>${a.name}</td><td>Стол ${a.table}</td><td>${a.total} ₸</td><td>${a.payMethod}</td></tr>`).join('');
    document.getElementById('stock-list').innerHTML = toArr(cloudState.inventory).map((i) => `<tr><td>${i.name}</td><td>${i.qty} шт</td><td>${i.price} ₸</td></tr>`).join('');
    document.getElementById('debts-list').innerHTML = toArr(cloudState.debts).map((d) => `<tr><td>${d.name}</td><td>${d.total} ₸</td><td>${toArr(d.history).join(', ')}</td></tr>`).join('');
    
    if(isOwner) {
        document.getElementById('acc-trev').innerText = shift.total.toLocaleString();
        document.getElementById('acc-sal').innerText = (shift.shiftZp + shift.expTotal).toLocaleString();
        document.getElementById('acc-net').innerText = (shift.total - shift.shiftZp - shift.expTotal).toLocaleString();
        document.getElementById('vip-guests-list').innerHTML = toArr(cloudState.vips).map((v) => `<span class="btn-outline">${v.name} (-${v.discount}%)</span>`).join('');
    }
}
