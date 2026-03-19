// === КОНФИГУРАЦИЯ FIREBASE ===
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
const dbRef = db.ref('sensei_erp_pro');

const STAFF = [
    { id: "0", name: "Султан", pin: "1111", role: "admin" }, 
    { id: "1", name: "Дидар", pin: "1111", role: "admin" }, 
    { id: "owner", name: "Хозяин", pin: "0000", role: "owner" }
];

let localAuth = JSON.parse(localStorage.getItem('sensei_auth_pro')) || { isAuth: false, user: null, tableRev: 0, barRev: 0, shiftCash: 0 };
let cloudState = { tables: Array.from({length: 6}, (_, i) => ({ id: i + 1, active: false })), checks: [], inventory: [], history: [], ownerAcc: {}, customAdmins: [] };

dbRef.on('value', snap => { if (snap.val()) cloudState = snap.val(); render(); });
function saveToCloud() { dbRef.set(cloudState); }
function saveLocalAuth() { localStorage.setItem('sensei_auth_pro', JSON.stringify(localAuth)); }

// === АВТОРИЗАЦИЯ ===
function login() {
    const val = document.getElementById('staff-select').value;
    const pin = document.getElementById('pass-input').value;
    let user = STAFF.find(s => s.id === val) || (cloudState.customAdmins || []).find(s => "c"+s.id === val);
    if (user && user.pin === pin) {
        localAuth = { isAuth: true, user: user, shiftStart: new Date().toLocaleString(), tableRev: 0, barRev: 0, shiftCash: 0 };
        saveLocalAuth(); render();
    } else alert("Ошибка!");
}

function logout() { document.getElementById('z-report-modal').style.display = 'flex'; }

function confirmZReport() {
    let physicalCash = parseInt(document.getElementById('z-cash-input').value) || 0;
    let expectedCash = localAuth.shiftCash || 0;
    let totalRev = localAuth.tableRev + localAuth.barRev;
    let salary = localAuth.user.role === 'owner' ? 0 : Math.round(totalRev * 0.08 + 6000);
    
    cloudState.history.push({ 
        admin: localAuth.user.name, start: localAuth.shiftStart, end: new Date().toLocaleString(), timestamp: Date.now(), 
        total: totalRev, sal: salary, expectedCash: expectedCash, physicalCash: physicalCash, diff: physicalCash - expectedCash 
    });
    
    if(localAuth.user.role !== 'owner') {
        cloudState.ownerAcc[localAuth.user.name] = (cloudState.ownerAcc[localAuth.user.name] || 0) + salary;
    }
    
    saveToCloud();
    localAuth = { isAuth: false }; saveLocalAuth();
    location.reload();
}

// === ЛОГИКА СТОЛОВ ===
function formatTime(ms) { 
    let s = Math.floor(ms / 1000);
    return String(Math.floor(s / 3600)).padStart(2,'0') + ":" + String(Math.floor((s % 3600) / 60)).padStart(2,'0') + ":" + String(s % 60).padStart(2,'0'); 
}

function calcCost(start) {
    let diff = (Date.now() - start) / 60000;
    let h = new Date(start).getHours();
    let rate = (h >= 11 && h < 18) ? 2000 : 3000;
    return Math.ceil((diff * (rate / 60)) / 50) * 50;
}

function startTable(id) { let t = cloudState.tables.find(x => x.id === id); t.active = true; t.start = Date.now(); t.bar = []; saveToCloud(); }

function stopTable(id) {
    let t = cloudState.tables.find(x => x.id === id);
    let name = prompt("Имя гостя:"); if(!name) return;
    createCheck(name, id, calcCost(t.start), t.bar || []);
    t.active = false; t.start = null; t.bar = []; saveToCloud();
}

function createCheck(name, tableId, timeCost, barItems) {
    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2,'0') + ":" + now.getMinutes().toString().padStart(2,'0');
    let t = cloudState.tables.find(x => x.id === tableId);
    let startStr = t ? new Date(t.start).getHours().toString().padStart(2,'0') + ":" + new Date(t.start).getMinutes().toString().padStart(2,'0') : timeStr;

    cloudState.checks.push({
        id: Date.now(), name: name, table: tableId, date: now.toLocaleDateString(),
        startTime: startStr, endTime: timeStr, timeCost: timeCost,
        barCost: barItems.reduce((s, i) => s + i.price, 0),
        bar: barItems, total: timeCost + barItems.reduce((s, i) => s + i.price, 0),
        discount: 0
    });
}

// === БАР С КОЛИЧЕСТВОМ ===
let barContext = null;
function openBarModal(ctx) { barContext = ctx; document.getElementById('bar-modal').style.display='flex'; renderBarSearch(); }
function renderBarSearch() {
    let q = document.getElementById('bar-search').value.toLowerCase();
    document.getElementById('bar-items-list').innerHTML = (cloudState.inventory || []).filter(i => i.name.toLowerCase().includes(q)).map(i => `
        <div class="bar-item-row" onclick="selectBarItem('${i.name}')"><span>${i.name}</span><b>${i.price} ₸ (${i.qty})</b></div>
    `).join('');
}
function selectBarItem(name) {
    let item = cloudState.inventory.find(i => i.name === name);
    let qty = parseInt(prompt(`Сколько ${name}?`, "1"));
    if(!qty || qty > item.qty) return alert("Ошибка количества!");
    item.qty -= qty;
    let items = Array(qty).fill({name: item.name, price: item.price});
    if(barContext === 'standalone') {
        let n = prompt("Имя гостя:"); if(n) createCheck(n, "Бар", 0, items); else item.qty += qty;
    } else {
        let t = cloudState.tables.find(x => x.id === barContext); t.bar = (t.bar || []).concat(items);
    }
    document.getElementById('bar-modal').style.display='none'; saveToCloud();
}

// === ОПЛАТА И СКИДКИ ===
let payIdx = null;
function openPayModal(idx) { payIdx = idx; let c = cloudState.checks[idx]; document.getElementById('pay-total').innerText = c.total + " ₸"; document.getElementById('pay-info').innerText = c.name; document.getElementById('pay-modal').style.display='flex'; }

function applyDiscount(pct) {
    let c = cloudState.checks[payIdx]; c.discount = pct;
    let base = c.timeCost + c.barCost;
    c.total = Math.round(base * (1 - pct/100));
    document.getElementById('pay-total').innerText = c.total + " ₸";
}

function processPayment(method) {
    let c = cloudState.checks[payIdx];
    if(method === 'Наличные') localAuth.shiftCash += c.total;
    localAuth.tableRev += Math.round(c.timeCost * (1 - (c.discount||0)/100));
    localAuth.barRev += (c.total - Math.round(c.timeCost * (1 - (c.discount||0)/100)));
    c.payMethod = method; c.admin = localAuth.user.name;
    cloudState.archive.push(c); cloudState.checks.splice(payIdx, 1);
    document.getElementById('pay-modal').style.display='none'; saveLocalAuth(); saveToCloud();
}

// === ПРОФЕССИОНАЛЬНЫЙ ЧЕК ===
function openFullCheck(idx) {
    let c = cloudState.checks[idx];
    document.getElementById('bill-date').innerText = c.date + " " + c.endTime;
    document.getElementById('bill-guest').innerText = c.name;
    document.getElementById('bill-table-num').innerText = c.table;
    document.getElementById('bill-start').innerText = c.startTime;
    document.getElementById('bill-end').innerText = c.endTime;
    
    let grouped = {};
    c.bar.forEach(i => { grouped[i.name] = grouped[i.name] || {q:0, p:i.price}; grouped[i.name].q++; });
    document.getElementById('bill-items-body').innerHTML = Object.keys(grouped).map(k => `<tr><td>${k}</td><td>${grouped[k].q}</td><td>${grouped[k].p}</td><td>${grouped[k].q*grouped[k].p}</td></tr>`).join('');
    
    document.getElementById('bill-time-sum').innerText = c.timeCost;
    document.getElementById('bill-bar-sum').innerText = c.barCost;
    document.getElementById('bill-total').innerText = c.total;
    document.getElementById('full-check-modal').style.display='flex';
}

// === РЕНДЕРИНГ ===
function render() {
    if(!localAuth.isAuth) {
        let opts = STAFF.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        (cloudState.customAdmins || []).forEach(a => { opts += `<option value="c${a.id}">${a.name}</option>`; });
        document.getElementById('staff-select').innerHTML = opts;
        document.getElementById('auth-screen').style.display='flex'; return;
    }
    document.getElementById('auth-screen').style.display='none';
    document.getElementById('app').style.display='block';
    document.getElementById('user-display').innerText = localAuth.user.name;
    
    // Показ вкладок хозяина
    let isOwner = localAuth.user.role === 'owner';
    document.getElementById('acc-tab').style.display = isOwner ? 'block' : 'none';
    document.getElementById('owner-tab').style.display = isOwner ? 'block' : 'none';
    document.getElementById('btn-open-add-item').style.display = isOwner ? 'block' : 'none';

    // Рендер столов
    document.getElementById('tables-grid').innerHTML = cloudState.tables.map(t => {
        let cost = t.active ? calcCost(t.start) : 0;
        let time = t.active ? formatTime(Date.now() - t.start) : "00:00:00";
        return `<div class="table-card ${t.active?'active':''}">
            <b>СТОЛ ${t.id}</b><div class="timer">${time}</div><div>${cost} ₸</div>
            ${t.active ? `<button onclick="stopTable(${t.id})" class="btn-red">СТОП</button><button onclick="openBarModal(${t.id})" class="btn-outline">БАР</button>` : `<button onclick="startTable(${t.id})" class="btn-gold">ПУСК</button>`}
        </div>`;
    }).join('');

    // Рендер чеков
    document.getElementById('active-checks').innerHTML = (cloudState.checks || []).map((c, i) => `
        <div class="check-row">
            <div><b>${c.name}</b><br><small>${c.total} ₸</small></div>
            <div style="display:flex; gap:5px;">
                <button onclick="openPayModal(${i})" class="btn-gold" style="padding:5px 10px; width:auto;">💸</button>
                <button onclick="openFullCheck(${i})" class="btn-outline">📄</button>
                ${isOwner ? `<button onclick="deleteCheck(${i})" class="btn-outline" style="color:red">🗑️</button>` : ''}
            </div>
        </div>
    `).join('');

    document.getElementById('global-rev').innerText = (localAuth.tableRev + localAuth.barRev).toLocaleString();
    
    if(isOwner) renderAccounting();
}

// Запуск интервала для таймеров
setInterval(() => { if(localAuth.isAuth) render(); }, 1000);

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ХОЗЯИНА ===
function renderAccounting() {
    let rev = 0, sal = 0;
    cloudState.history.forEach(h => { rev += h.total; sal += h.sal; });
    document.getElementById('acc-trev').innerText = rev.toLocaleString();
    document.getElementById('acc-sal').innerText = sal.toLocaleString();
    document.getElementById('acc-net').innerText = (rev - sal).toLocaleString();
    document.getElementById('history-list').innerHTML = cloudState.history.map(h => `<tr><td>${h.admin}</td><td>${h.end}</td><td>${h.total} (Diff: ${h.diff})</td><td>${h.sal}</td></tr>`).join('');
}

function deleteCheck(i) { if(confirm("Удалить?")) { cloudState.checks.splice(i,1); saveToCloud(); } }
function resetDatabase() { if(confirm("СБРОС?")) { cloudState = { tables: Array.from({length: 6}, (_, i) => ({ id: i + 1, active: false })), checks: [], inventory: [], history: [], ownerAcc: {}, customAdmins: [] }; saveToCloud(); location.reload(); } }
function saveNewItem() { let n = document.getElementById('new-item-name').value; let p = parseInt(document.getElementById('new-item-price').value); let q = parseInt(document.getElementById('new-item-qty').value); cloudState.inventory.push({name:n, price:p, qty:q}); document.getElementById('add-item-modal').style.display='none'; saveToCloud(); }
function addCustomAdmin() { let n = prompt("Имя:"); let p = prompt("PIN:"); cloudState.customAdmins.push({id: Date.now(), name:n, pin:p, role:'admin'}); saveToCloud(); }
