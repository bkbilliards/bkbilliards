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

const STAFF = [{ name: "Султан", pin: "1111", role: "admin" }, { name: "Дидар", pin: "1111", role: "admin" }, { name: "Хозяин", pin: "0000", role: "owner" }];
let localAuth = JSON.parse(localStorage.getItem('sensei_auth_pro')) || { isAuth: false, user: null, shiftStart: null, tableRev: 0, barRev: 0 };
let cloudState = { tables: Array.from({length: 6}, (_, i) => ({ id: i + 1, active: false, start: null, res: [] })), checks: [], archive: [], inventory: [], debts: [], history: [], ownerAcc: {} };

// Индикатор сети
db.ref('.info/connected').on('value', snap => {
    const el = document.getElementById('sync-status');
    if(el) { el.innerText = snap.val() ? '🟢' : '🔴'; }
});

dbRef.on('value', snap => {
    if (snap.val()) cloudState = snap.val();
    else saveToCloud();
    render();
});

function saveToCloud() { dbRef.set(cloudState).catch(e => console.error("Firebase write error:", e)); }
function saveLocalAuth() { localStorage.setItem('sensei_auth_pro', JSON.stringify(localAuth)); }

window.onload = () => { render(); setInterval(() => { if(localAuth.isAuth) renderTables(); }, 1000); };

function login() {
    const idx = document.getElementById('staff-select').value;
    const pin = document.getElementById('pass-input').value;
    if (STAFF[idx].pin === pin) {
        localAuth = { isAuth: true, user: STAFF[idx], shiftStart: new Date().toLocaleString(), tableRev: 0, barRev: 0 };
        saveLocalAuth(); document.getElementById('pass-input').value = ""; document.getElementById('auth-error').style.display = 'none'; render();
    } else { document.getElementById('auth-error').style.display = 'block'; }
}

function logout() {
    if (confirm("Вы точно хотите закрыть смену?")) {
        const totalRev = localAuth.tableRev + localAuth.barRev;
        const salary = localAuth.user.role === 'owner' ? 0 : Math.round(totalRev * 0.08 + 6000);
        
        if(!cloudState.history) cloudState.history = [];
        cloudState.history.push({ admin: localAuth.user.name, start: localAuth.shiftStart, end: new Date().toLocaleString(), barRev: localAuth.barRev, tableRev: localAuth.tableRev, total: totalRev, sal: salary });
        
        if(localAuth.user.role !== 'owner') {
            if(!cloudState.ownerAcc) cloudState.ownerAcc = {};
            if(!cloudState.ownerAcc[localAuth.user.name]) cloudState.ownerAcc[localAuth.user.name] = 0;
            cloudState.ownerAcc[localAuth.user.name] += salary;
        }
        saveToCloud(); localAuth = { isAuth: false, user: null, shiftStart: null, tableRev: 0, barRev: 0 }; saveLocalAuth(); render();
    }
}

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
    return Math.ceil(total / 50) * 50; 
}

function startTable(id) { const t = cloudState.tables.find(x => x.id === id); t.active = true; t.start = Date.now(); t.bar = []; saveToCloud(); }

function stopTable(id) {
    const t = cloudState.tables.find(x => x.id === id);
    const name = prompt("Имя гостя для чека:"); if (!name) return;
    createOrMergeCheck(name, id, calcCost(t.start), t.bar || []); t.active = false; t.start = null; t.bar = []; saveToCloud();
}

function commTable(id) {
    const t = cloudState.tables.find(x => x.id === id);
    const name = prompt("Коммерция. Кто проиграл?"); if (!name) return;
    createOrMergeCheck(name, id, calcCost(t.start), t.bar || []); t.start = Date.now(); t.bar = []; saveToCloud();
}

function addRes(id) { const t = cloudState.tables.find(x => x.id === id); let r = prompt("Бронь (Имя, Время):"); if(r) { if(!t.res) t.res=[]; t.res.push(r); saveToCloud(); } }
function editRes(tId, rIdx) { let t = cloudState.tables.find(x => x.id === tId); let n = prompt("Изменить:", t.res[rIdx]); if(n) { t.res[rIdx] = n; saveToCloud(); } }
function delRes(tId, rIdx) { cloudState.tables.find(x => x.id === tId).res.splice(rIdx,1); saveToCloud(); }

let barContext = null; 
function openBarModal(context) {
    barContext = context;
    if(!cloudState.inventory || cloudState.inventory.length === 0) return alert("Склад пуст! Добавьте товар.");
    document.getElementById('bar-modal').style.display = 'flex'; document.getElementById('bar-search').value = ''; renderBarSearch();
}

function renderBarSearch() {
    const q = document.getElementById('bar-search').value.toLowerCase();
    document.getElementById('bar-items-list').innerHTML = cloudState.inventory.filter(i => i.name.toLowerCase().includes(q)).map(i => `<div class="bar-item-row" onclick="selectBarItem('${i.name}')"><span>${i.name}</span><span class="gold-text">${i.price} ₸ (Ост: ${i.qty})</span></div>`).join('');
}

function selectBarItem(itemName) {
    let item = cloudState.inventory.find(x => x.name === itemName);
    if(item.qty <= 0) return alert("Товар закончился!");
    item.qty -= 1;
    if(barContext === 'standalone') {
        const name = prompt("Имя гостя для бара:"); if(name) createOrMergeCheck(name, "Бар", 0, [{name: item.name, price: item.price}]);
    } else {
        const t = cloudState.tables.find(x => x.id === barContext); if(!t.bar) t.bar = []; t.bar.push({name: item.name, price: item.price});
    }
    document.getElementById('bar-modal').style.display = 'none'; saveToCloud();
}

function createOrMergeCheck(name, tableId, timeCost, barItems) {
    if(!cloudState.checks) cloudState.checks = [];
    let barTotal = barItems.reduce((s, i) => s + i.price, 0);
    let exist = cloudState.checks.find(c => c.name.toLowerCase() === name.toLowerCase());

    if(exist && confirm(`Объединить с открытым чеком гостя "${exist.name}"?`)) {
        exist.timeCost += timeCost; exist.barCost += barTotal;
        if(barItems.length > 0) exist.bar = (exist.bar || []).concat(barItems);
        exist.total += (timeCost + barTotal);
        if(tableId !== "Бар") exist.details += ` + Стол ${tableId}`;
    } else {
        cloudState.checks.push({ id: Date.now(), name: name, table: tableId, date: new Date().toLocaleDateString(), timeCost: timeCost, barCost: barTotal, bar: barItems, total: timeCost + barTotal, details: `Стол ${tableId}` });
    }
}

let currentCheckIndex = null;
function openPayModal(idx) {
    currentCheckIndex = idx; let c = cloudState.checks[idx];
    document.getElementById('pay-total').innerText = c.total + " ₸"; document.getElementById('pay-info').innerText = `${c.name} | ${c.details}`;
    document.getElementById('pay-modal').style.display = 'flex';
}

function processPayment(method) {
    let c = cloudState.checks[currentCheckIndex];
    if(method === 'Долг') {
        if(!cloudState.debts) cloudState.debts = [];
        let d = cloudState.debts.find(x => x.name.toLowerCase() === c.name.toLowerCase());
        if(d) { d.total += c.total; } else { cloudState.debts.push({ name: c.name, total: c.total }); }
    }
    localAuth.tableRev += c.timeCost; localAuth.barRev += c.barCost;
    c.payMethod = method; c.admin = localAuth.user.name;
    if(!cloudState.archive) cloudState.archive = []; cloudState.archive.push(c);
    cloudState.checks.splice(currentCheckIndex, 1);
    document.getElementById('pay-modal').style.display = 'none'; saveLocalAuth(); saveToCloud();
}

function splitPayment(n) { alert(`Сумма чека: ${cloudState.checks[currentCheckIndex].total} ₸.\nПо ${Math.ceil(cloudState.checks[currentCheckIndex].total / n)} ₸ с человека.`); }
function editCheckName() { let n = prompt("Новое имя:", cloudState.checks[currentCheckIndex].name); if(n) { cloudState.checks[currentCheckIndex].name = n; document.getElementById('pay-modal').style.display = 'none'; saveToCloud(); } }

function payDebt(idx) {
    let d = cloudState.debts[idx]; let sum = prompt(`Долг: ${d.total} ₸. Оплата:`);
    if(sum && !isNaN(sum)) { sum = parseInt(sum); d.total -= sum; localAuth.tableRev += sum; if(d.total <= 0) cloudState.debts.splice(idx, 1); saveLocalAuth(); saveToCloud(); }
}
function editDebt(idx) { let s=prompt("Сумма:", cloudState.debts[idx].total); if(s) { cloudState.debts[idx].total=parseInt(s); saveToCloud(); } }
function delDebt(idx) { if(confirm("Удалить?")) { cloudState.debts.splice(idx,1); saveToCloud(); } }

function addItem() { const n = prompt("Товар:"); const p = prompt("Цена:"); const q = prompt("Кол-во:"); if(n && p && q) { if(!cloudState.inventory) cloudState.inventory=[]; cloudState.inventory.push({name:n, price: parseInt(p), qty: parseInt(q)}); saveToCloud(); } }
function editItem(idx) { let q = prompt("Остаток:", cloudState.inventory[idx].qty); if(q) { cloudState.inventory[idx].qty = parseInt(q); saveToCloud(); } }
function renameItem(idx) { let n = prompt("Имя:", cloudState.inventory[idx].name); if(n) { cloudState.inventory[idx].name = n; saveToCloud(); } }
function delItem(idx) { if(confirm("Удалить?")) { cloudState.inventory.splice(idx,1); saveToCloud(); } }

function payAdmin(name) { let s = prompt(`К выплате ${name}: ${cloudState.ownerAcc[name]}₸. Выдать:`); if(s) { cloudState.ownerAcc[name] -= parseInt(s); saveToCloud(); } }
function fineAdmin(name) { let s = prompt(`Штраф ${name}:`); if(s) { cloudState.ownerAcc[name] -= parseInt(s); saveToCloud(); } }

function showTab(id, btn) {
    document.querySelectorAll('.tab-pane').forEach(x => x.style.display = 'none');
    document.querySelectorAll('.nav-link').forEach(x => x.classList.remove('active'));
    document.getElementById('tab-' + id).style.display = 'block'; btn.classList.add('active');
}

function renderTables() {
    if(!document.getElementById('tables-grid')) return;
    document.getElementById('tables-grid').innerHTML = cloudState.tables.map(t => {
        let timeStr = "00:00:00", costStr = "0";
        if(t.active) { timeStr = formatTime(Date.now() - t.start); costStr = calcCost(t.start).toLocaleString(); }
        let resHtml = (t.res || []).map((r, i) => `<div class="res-item"><span>📅 ${r}</span> <div><span onclick="editRes(${t.id},${i})" style="cursor:pointer; margin-right:10px;">✏️</span><span onclick="delRes(${t.id},${i})" style="color:var(--red); cursor:pointer;">❌</span></div></div>`).join('');
        return `<div class="table-card ${t.active ? 'active' : ''}"><div style="font-size:20px; font-weight:800; color:var(--gold);">СТОЛ ${t.id}</div><div class="timer">${timeStr}</div><div style="font-size:28px; font-weight:800; color:var(--white); margin-bottom:15px;">${costStr} ₸</div>${!t.active ? `<button onclick="startTable(${t.id})" class="btn-gold btn-large" style="margin-top:auto;">▶ ПУСК СТОЛА</button>` : `<button onclick="stopTable(${t.id})" class="btn-red" style="margin-bottom:10px;">⏹ СТОП В ЧЕК</button><div class="table-actions"><button class="btn-outline flex-1" onclick="openBarModal(${t.id})">🍸 БАР</button><button class="btn-outline flex-1" onclick="commTable(${t.id})">🔄 КОММЕРЦ</button></div>`}<button class="btn-outline" style="width:100%; margin-top:15px; border-color:#333; color:#aaa;" onclick="addRes(${t.id})">+ ДОБАВИТЬ БРОНЬ</button>${resHtml}</div>`;
    }).join('');
}

function render() {
    if (!localAuth.isAuth) { document.getElementById('auth-screen').style.display='flex'; document.getElementById('app').style.display='none'; return; }
    document.getElementById('auth-screen').style.display='none'; document.getElementById('app').style.display='block';
    
    document.getElementById('user-display').innerText = localAuth.user.name;
    document.getElementById('owner-tab').style.display = localAuth.user.role === 'owner' ? 'block' : 'none';
    document.getElementById('add-item-btn').style.display = localAuth.user.role === 'owner' ? 'block' : 'none';

    renderTables();

    document.getElementById('active-checks').innerHTML = (cloudState.checks||[]).map((c, i) => {
        let bHtml = (c.bar||[]).map(b => `${b.name}(${b.price}₸)`).join(', ');
        return `<div class="check-row"><div style="flex:1;"><div><b style="font-size:18px; color:var(--gold);">${c.name}</b> <span style="font-size:12px;color:#aaa;margin-left:10px;">${c.date}</span></div><div style="font-size:13px;color:#aaa;margin-top:8px;">${c.details} (${c.timeCost} ₸) ${bHtml?`<br>🍸 Бар: ${bHtml}`:''}</div><div style="font-size:22px;font-weight:800;margin-top:10px;">${c.total} ₸</div></div><button onclick="openPayModal(${i})" class="btn-gold" style="padding:15px 30px; border-radius:12px;">ОПЛАТА</button></div>`;
    }).join('');

    document.getElementById('archive-list').innerHTML = (cloudState.archive||[]).map(a => `<tr><td style="color:#aaa;">${a.date}</td><td><b>${a.name}</b></td><td>${a.details}</td><td class="gold-text"><b>${a.total} ₸</b></td><td><span style="background:#222; padding:5px 10px; border-radius:6px; font-size:11px;">${a.payMethod}</span></td></tr>`).join('');
    document.getElementById('stock-list').innerHTML = (cloudState.inventory||[]).map((i, idx) => `<tr><td><b>${i.name}</b></td><td>${i.qty} шт</td><td class="gold-text">${i.price} ₸</td><td style="text-align:right;"><button onclick="editItem(${idx})" class="btn-outline">Изм.</button> <button onclick="delItem(${idx})" style="background:none; border:none; color:var(--red); cursor:pointer; font-size:18px; margin-left:10px;">×</button></td></tr>`).join('');
    document.getElementById('debts-list').innerHTML = (cloudState.debts||[]).map((d, i) => `<tr><td><b class="gold-text" style="font-size:16px;">${d.name}</b></td><td style="color:var(--red); font-weight:800; font-size:20px;">${d.total} ₸</td><td style="text-align:right;"><button onclick="payDebt(${i})" class="btn-outline" style="border-color:var(--green); color:var(--green);">Расчет</button> <button onclick="delDebt(${i})" style="background:none; border:none; color:var(--red); cursor:pointer; font-size:18px; margin-left:10px;">×</button></td></tr>`).join('');

    let tr = localAuth.tableRev, br = localAuth.barRev, tot = tr + br;
    document.getElementById('stat-tables').innerText = tr; document.getElementById('stat-bar').innerText = br; document.getElementById('stat-total').innerText = tot;
    document.getElementById('stat-salary').innerText = localAuth.user.role==='owner'? 0 : Math.round(tot*0.08+6000);
    document.getElementById('my-history-list').innerHTML = (cloudState.history||[]).filter(h => h.admin === localAuth.user.name).map(h => `<tr><td>${h.start}</td><td>${h.barRev} ₸</td><td>${h.tableRev} ₸</td><td class="gold-text"><b>${h.total} ₸</b></td><td style="color:var(--green);"><b>${h.sal} ₸</b></td></tr>`).join('');
    document.getElementById('history-list').innerHTML = (cloudState.history||[]).map(h => `<tr><td><b>${h.admin}</b></td><td><span style="font-size:11px; color:#aaa;">${h.start}</span></td><td class="gold-text"><b>${h.total} ₸</b></td><td>${h.sal} ₸</td></tr>`).join('');
    
    if(cloudState.ownerAcc) {
        document.getElementById('admin-salaries-list').innerHTML = Object.keys(cloudState.ownerAcc).map(name => `<div class="check-row" style="margin-bottom:10px;"><div><b style="font-size:18px;">${name}</b><br><span style="font-size:11px; color:#aaa;">ДОЛГ К ВЫПЛАТЕ:</span> <b style="color:var(--green); font-size:22px;">${cloudState.ownerAcc[name]} ₸</b></div><div><button onclick="payAdmin('${name}')" class="btn-outline" style="border-color:var(--green); color:var(--green); margin-right:10px;">Выдать ЗП/Аванс</button><button onclick="fineAdmin('${name}')" class="btn-outline" style="border-color:var(--red); color:var(--red);">Штраф</button></div></div>`).join('');
    }
}
