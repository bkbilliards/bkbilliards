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

function login() {
    const val = document.getElementById('staff-select').value;
    const pin = document.getElementById('pass-input').value;
    let user = STAFF.find(s => s.id === val) || (cloudState.customAdmins || []).find(a => "custom_"+a.id === val);
    if (user && user.pin === pin) {
        localAuth = { isAuth: true, user: user, shiftStart: new Date().toLocaleString(), tableRev: 0, barRev: 0, shiftCash: 0 };
        saveLocalAuth(); render();
    } else document.getElementById('auth-error').style.display='block';
}

function logout() { document.getElementById('z-report-modal').style.display = 'flex'; }

function confirmZReport() {
    let physical = parseInt(document.getElementById('z-cash-input').value) || 0;
    let expected = localAuth.shiftCash || 0;
    let rev = localAuth.tableRev + localAuth.barRev;
    let salary = localAuth.user.role === 'owner' ? 0 : Math.round(rev * 0.08 + 6000);
    
    if(!cloudState.history) cloudState.history = [];
    cloudState.history.push({ 
        admin: localAuth.user.name, start: localAuth.shiftStart, end: new Date().toLocaleString(), timestamp: Date.now(), 
        total: rev, sal: salary, expected: expected, physical: physical, diff: physical - expected 
    });
    
    if(localAuth.user.role !== 'owner') {
        if(!cloudState.ownerAcc) cloudState.ownerAcc = {};
        cloudState.ownerAcc[localAuth.user.name] = (cloudState.ownerAcc[localAuth.user.name] || 0) + salary;
    }
    
    saveToCloud(); localAuth = { isAuth: false }; saveLocalAuth(); location.reload();
}

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
    let name = prompt("ИМЯ ГОСТЯ:"); if(!name) return;
    createCheck(name, id, calcCost(t.start), t.bar || []);
    t.active = false; t.start = null; t.bar = []; saveToCloud();
}

function createCheck(name, tableId, timeCost, barItems) {
    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2,'0') + ":" + now.getMinutes().toString().padStart(2,'0');
    let t = cloudState.tables.find(x => x.id === tableId);
    let startStr = t && t.start ? new Date(t.start).getHours().toString().padStart(2,'0') + ":" + new Date(t.start).getMinutes().toString().padStart(2,'0') : timeStr;
    let duration = "0ч 0м";
    if(t && t.start) {
        let diff = now - t.start;
        duration = Math.floor(diff/3600000) + "ч " + Math.floor((diff%3600000)/60000) + "м";
    }

    if(!cloudState.checks) cloudState.checks = [];
    cloudState.checks.push({
        id: Date.now(), name: name, table: tableId, date: now.toLocaleDateString(),
        startTime: startStr, endTime: timeStr, duration: duration, timeCost: timeCost,
        barCost: barItems.reduce((s, i) => s + i.price, 0),
        bar: barItems, total: timeCost + barItems.reduce((s, i) => s + i.price, 0),
        discount: 0
    });
}

function selectBarItem(name) {
    let item = cloudState.inventory.find(i => i.name === name);
    let qty = parseInt(prompt(`СКОЛЬКО ${name}?`, "1"));
    if(!qty || qty > item.qty) return alert("ОШИБКА!");
    item.qty -= qty;
    let items = Array(qty).fill({name: item.name, price: item.price});
    if(barContext === 'standalone') {
        let n = prompt("ИМЯ ГОСТЯ:"); if(n) createCheck(n, "БАР", 0, items); else item.qty += qty;
    } else {
        let t = cloudState.tables.find(x => x.id === barContext); if(!t.bar) t.bar = []; t.bar = t.bar.concat(items);
    }
    document.getElementById('bar-modal').style.display='none'; saveToCloud();
}

let payIdx = null;
function openPayModal(idx) { payIdx = idx; let c = cloudState.checks[idx]; document.getElementById('pay-total').innerText = c.total + " ₸"; document.getElementById('pay-info').innerText = c.name + " | Стол " + c.table; document.getElementById('pay-modal').style.display='flex'; }

function applyDiscount(pct) {
    let c = cloudState.checks[payIdx]; c.discount = pct;
    let base = c.timeCost + c.barCost;
    c.total = Math.round(base * (1 - pct/100));
    document.getElementById('pay-total').innerText = c.total + " ₸";
}

function processPayment(method) {
    let c = cloudState.checks[payIdx];
    if(method === 'Наличные') localAuth.shiftCash += c.total;
    let disc = (1 - (c.discount||0)/100);
    localAuth.tableRev += Math.round(c.timeCost * disc);
    localAuth.barRev += (c.total - Math.round(c.timeCost * disc));
    c.payMethod = method; c.admin = localAuth.user.name;
    if(!cloudState.archive) cloudState.archive = [];
    cloudState.archive.push(c); cloudState.checks.splice(payIdx, 1);
    document.getElementById('pay-modal').style.display='none'; saveLocalAuth(); saveToCloud();
}

function openFullCheck(idx) {
    let c = cloudState.checks[idx];
    document.getElementById('bill-date').innerText = c.date + " " + c.endTime;
    document.getElementById('bill-guest').innerText = c.name;
    document.getElementById('bill-table-num').innerText = c.table;
    document.getElementById('bill-start').innerText = c.startTime;
    document.getElementById('bill-end').innerText = c.endTime;
    document.getElementById('bill-duration').innerText = c.duration;
    
    let grouped = {};
    (c.bar || []).forEach(i => { grouped[i.name] = grouped[i.name] || {q:0, p:i.price}; grouped[i.name].q++; });
    document.getElementById('bill-items-body').innerHTML = Object.keys(grouped).map(k => `<tr><td>${k}</td><td>${grouped[k].q}</td><td>${grouped[k].p}</td><td>${grouped[k].q*grouped[k].p}</td></tr>`).join('');
    
    document.getElementById('bill-time-sum').innerText = c.timeCost;
    document.getElementById('bill-bar-sum').innerText = c.barCost;
    document.getElementById('bill-total').innerText = c.total;
    if(c.discount > 0) { document.getElementById('bill-discount-row').style.display='block'; document.getElementById('bill-discount-val').innerText = c.discount; }
    else document.getElementById('bill-discount-row').style.display='none';
    document.getElementById('full-check-modal').style.display='flex';
}

function render() {
    if(!localAuth.isAuth) {
        let opts = STAFF.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        (cloudState.customAdmins || []).forEach(a => { opts += `<option value="custom_${a.id}">${a.name}</option>`; });
        document.getElementById('staff-select').innerHTML = opts;
        document.getElementById('auth-screen').style.display='flex'; return;
    }
    document.getElementById('app').style.display='block';
    document.getElementById('user-display').innerText = localAuth.user.name;
    
    let isOwner = localAuth.user.role === 'owner';
    document.getElementById('acc-tab').style.display = isOwner ? 'block' : 'none';
    document.getElementById('owner-tab').style.display = isOwner ? 'block' : 'none';
    document.getElementById('btn-open-add-item').style.display = isOwner ? 'block' : 'none';

    document.getElementById('tables-grid').innerHTML = cloudState.tables.map(t => {
        let cost = t.active ? calcCost(t.start) : 0;
        let time = t.active ? formatTime(Date.now() - t.start) : "00:00:00";
        return `<div class="table-card ${t.active?'active':''}">
            <b class="gold-text">СТОЛ ${t.id}</b><div class="timer">${time}</div><div style="font-size:24px;font-weight:700;">${cost} ₸</div>
            <div class="table-actions">
            ${t.active ? `<button onclick="stopTable(${t.id})" class="btn-red flex-1">СТОП</button><button onclick="openBarModal(${t.id})" class="btn-outline flex-1">БАР</button>` : `<button onclick="startTable(${t.id})" class="btn-gold flex-1">ПУСК</button>`}
            </div>
        </div>`;
    }).join('');

    document.getElementById('active-checks').innerHTML = (cloudState.checks || []).map((c, i) => `
        <div class="check-row">
            <div><b>${c.name}</b><br><small class="gold-text">${c.total} ₸</small></div>
            <div style="display:flex; gap:8px;">
                <button onclick="openPayModal(${i})" class="btn-gold" style="padding:8px 15px;">💸</button>
                <button onclick="openFullCheck(${i})" class="btn-outline">📄</button>
                ${isOwner ? `<button onclick="deleteCheck(${i})" class="btn-outline" style="color:var(--red); border-color:var(--red);">🗑️</button>` : ''}
            </div>
        </div>`).join('');

    document.getElementById('global-rev').innerText = (localAuth.tableRev + localAuth.barRev).toLocaleString() + " ₸";
    document.getElementById('global-shift-zp').innerText = (localAuth.user.role === 'owner' ? 0 : Math.round((localAuth.tableRev + localAuth.barRev) * 0.08 + 6000)).toLocaleString() + " ₸";
    
    if(isOwner) {
        renderAccounting();
        document.getElementById('stock-list').innerHTML = (cloudState.inventory || []).map((i, idx) => `<tr><td>${i.name}</td><td>${i.qty}</td><td>${i.price}</td><td><button onclick="deleteItem(${idx})" class="btn-red" style="padding:5px;">❌</button></td></tr>`).join('');
        document.getElementById('custom-admins-list').innerHTML = (cloudState.customAdmins || []).map(a => `<div class="dash-card" style="padding:10px;">${a.name} (PIN: ${a.pin})</div>`).join('');
    }
}

// Вспомогательные
let barContext = null;
function openBarModal(ctx) { barContext = ctx; document.getElementById('bar-modal').style.display='flex'; renderBarSearch(); }
function renderBarSearch() {
    let q = document.getElementById('bar-search').value.toLowerCase();
    document.getElementById('bar-items-list').innerHTML = (cloudState.inventory || []).filter(i => i.name.toLowerCase().includes(q)).map(i => `<div class="bar-item-row" onclick="selectBarItem('${i.name}')"><span>${i.name}</span><b>${i.price} ₸ (${i.qty})</b></div>`).join('');
}
function renderAccounting() {
    let rev = 0, sal = 0;
    (cloudState.history || []).forEach(h => { rev += h.total; sal += h.sal; });
    document.getElementById('acc-trev').innerText = rev.toLocaleString();
    document.getElementById('acc-sal').innerText = sal.toLocaleString();
    document.getElementById('acc-net').innerText = (rev - sal).toLocaleString();
    document.getElementById('history-list').innerHTML = (cloudState.history || []).map(h => `<tr><td>${h.admin}</td><td>${h.end}</td><td>${h.physical} (${h.diff})</td><td>${h.sal}</td></tr>`).join('');
}
function showTab(id, btn) { document.querySelectorAll('.tab-pane').forEach(x => x.style.display = 'none'); document.querySelectorAll('.nav-link').forEach(x => x.classList.remove('active')); document.getElementById('tab-'+id).style.display = 'block'; btn.classList.add('active'); }
function deleteCheck(i) { if(confirm("УДАЛИТЬ?")) { cloudState.checks.splice(i,1); saveToCloud(); } }
function resetDatabase() { if(confirm("СБРОС?")) { cloudState = { tables: Array.from({length: 6}, (_, i) => ({ id: i + 1, active: false })), checks: [], inventory: [], history: [], ownerAcc: {}, customAdmins: [] }; saveToCloud(); location.reload(); } }
function saveNewItem() { let n = document.getElementById('new-item-name').value; let p = parseInt(document.getElementById('new-item-price').value); let q = parseInt(document.getElementById('new-item-qty').value); if(!cloudState.inventory) cloudState.inventory = []; cloudState.inventory.push({name:n, price:p, qty:q}); document.getElementById('add-item-modal').style.display='none'; saveToCloud(); }
function deleteItem(idx) { cloudState.inventory.splice(idx,1); saveToCloud(); }
function addCustomAdmin() { let n = prompt("ИМЯ:"); let p = prompt("PIN:"); if(!cloudState.customAdmins) cloudState.customAdmins = []; cloudState.customAdmins.push({id: Date.now(), name:n, pin:p, role:'admin'}); saveToCloud(); }
function exportToExcel() { alert("Экспорт готов..."); }
function setAccPeriod(p, btn) { document.querySelectorAll('.acc-filter').forEach(x => x.classList.remove('active')); btn.classList.add('active'); render(); }

setInterval(() => { if(localAuth.isAuth) render(); }, 1000);
