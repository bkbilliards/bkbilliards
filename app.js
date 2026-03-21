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

const STAFF_HARDCODED = [
    { id: "0", name: "Султан", pin: "1111", role: "admin" }, 
    { id: "1", name: "Дидар", pin: "1111", role: "admin" }, 
    { id: "owner", name: "Хозяин", pin: "0000", role: "owner" }
];

let localAuth = { isAuth: false, user: null };
try { 
    let stored = localStorage.getItem('sensei_auth_pro'); 
    if (stored) localAuth = JSON.parse(stored); 
} catch(e) {}
if (!localAuth || typeof localAuth !== 'object') localAuth = { isAuth: false, user: null };

let cloudState = { 
    tables: Array.from({length: 6}, (_, i) => ({ id: i + 1, active: false, start: null, res: [], bar: [], paused: false, accCost: 0, accTime: 0, isTournament: false })), 
    checks: [], archive: [], inventory: [], debts: [], history: [], ownerAcc: {}, customAdmins: [], expenses: [], vips: [], onlineAdmins: {}, notifications: [], blacklist: []
};

window.ui = {
    alert: function(msg) { let el = document.getElementById('ui-alert-text'); if(el) { el.innerText = msg; document.getElementById('ui-alert-modal').style.display = 'flex'; } else alert(msg); },
    confirm: function(msg, onYes) { let el = document.getElementById('ui-confirm-text'); if(el) { el.innerText = msg; document.getElementById('ui-confirm-yes').onclick = () => { document.getElementById('ui-confirm-modal').style.display = 'none'; onYes(); }; document.getElementById('ui-confirm-modal').style.display = 'flex'; } else { if(confirm(msg)) onYes(); } },
    prompt: function(title, fields, onConfirm) { let titleEl = document.getElementById('ui-prompt-title'); if(titleEl) { titleEl.innerText = title; let html = ''; fields.forEach((f, i) => { html += `<div class="input-group"><label>${f.label}</label><input type="${f.type||'text'}" id="ui-prompt-input-${i}" value="${f.value||''}"></div>`; }); document.getElementById('ui-prompt-body').innerHTML = html; document.getElementById('ui-prompt-btn').onclick = () => { let vals = fields.map((f, i) => document.getElementById(`ui-prompt-input-${i}`).value.trim()); if(vals.some(v => !v)) return ui.alert('Заполните все поля!'); document.getElementById('ui-prompt-modal').style.display = 'none'; onConfirm(vals); }; document.getElementById('ui-prompt-modal').style.display = 'flex'; } else { let res = prompt(title + " (" + fields[0].label + ")"); if(res) onConfirm([res]); } }
};

function toArr(data) { if (!data) return []; if (Array.isArray(data)) return data; return Object.values(data); }

dbRef.on('value', snap => {
    if (snap.exists() && snap.val()) {
        let data = snap.val(); cloudState.tables = toArr(data.tables);
        if (cloudState.tables.length === 0) cloudState.tables = Array.from({length: 6}, (_, i) => ({ id: i + 1, active: false, start: null, res: [], bar: [], paused: false, accCost: 0, accTime: 0, isTournament: false }));
        cloudState.checks = toArr(data.checks); cloudState.archive = toArr(data.archive); cloudState.inventory = toArr(data.inventory); cloudState.debts = toArr(data.debts); cloudState.history = toArr(data.history); cloudState.customAdmins = toArr(data.customAdmins); cloudState.expenses = toArr(data.expenses); cloudState.vips = toArr(data.vips); cloudState.ownerAcc = data.ownerAcc || {}; cloudState.onlineAdmins = data.onlineAdmins || {}; cloudState.blacklist = toArr(data.blacklist);
    } else { saveToCloud(); }
    const urlParams = new URLSearchParams(window.location.search);
    if(urlParams.get('guest') === 'true') { if(document.getElementById('guest-app') && document.getElementById('guest-app').style.display !== 'block') showGuestPage(); else renderGuestTables(); } else { render(); }
});

function saveToCloud() { 
    if (localAuth && localAuth.isAuth && localAuth.user) { 
        cloudState.onlineAdmins = cloudState.onlineAdmins || {}; 
        cloudState.onlineAdmins[localAuth.user.name] = Date.now(); 
    } 
    dbRef.set(cloudState).catch(e => console.error(e)); 
}
function saveLocalAuth() { localStorage.setItem('sensei_auth_pro', JSON.stringify(localAuth)); }

window.onload = () => { 
    const urlParams = new URLSearchParams(window.location.search); 
    if(urlParams.get('guest') === 'true') showGuestPage(); else render(); 
    
    setInterval(() => { 
        try { 
            if(localAuth && localAuth.isAuth) { 
                renderTables(); 
                renderOnlineAdmins(); 
                renderGlobalStats(); 
                let bm = document.getElementById('table-bill-modal'); 
                if(bm && bm.style.display === 'flex') renderTableBill(); 
            } else if (document.getElementById('guest-app') && document.getElementById('guest-app').style.display === 'block') { 
                renderGuestTables(); 
            } else {
                render(); // ПРИНУДИТЕЛЬНАЯ ОТРИСОВКА ВХОДА КАЖДУЮ СЕКУНДУ
            }
        } catch(err) { console.error("Ошибка таймера:", err); }
    }, 1000); 
    
    setInterval(() => { 
        if(localAuth && localAuth.isAuth && localAuth.user && localAuth.user.name) { 
            dbRef.child('onlineAdmins/' + localAuth.user.name).set(Date.now()); 
        } 
    }, 30000);
};

window.showGuestPage = function() { document.getElementById('auth-screen').style.display = 'none'; if(document.getElementById('app')) document.getElementById('app').style.display = 'none'; document.getElementById('guest-app').style.display = 'block'; let today = new Date().toISOString().split('T')[0]; if(document.getElementById('guest-date')) document.getElementById('guest-date').value = today; renderGuestTables(); }
window.renderGuestTables = function() {
    if(!cloudState.tables) return; let html = '';
    toArr(cloudState.tables).forEach(t => {
        let status = t.active ? '<span style="color:var(--red); font-weight:800; font-size:16px;">🔴 ЗАНЯТ</span>' : '<span style="color:var(--green); font-weight:800; font-size:16px;">🟢 СВОБОДЕН</span>'; let resHtml = ''; if(t.res && toArr(t.res).length > 0) { let times = toArr(t.res).map(r => r.split('|')[0].trim()).join(', '); resHtml = `<div style="margin-top:15px; font-size:13px; font-weight:700; color:var(--gold); background:rgba(212,175,55,0.1); padding:8px; border-radius:8px;">⏳ Бронь: ${times}</div>`; }
        html += `<div class="guest-table-card"><h3 style="margin:0 0 15px; color:var(--white); font-size:22px; font-weight:900;">СТОЛ ${t.id}</h3>${status}${resHtml}</div>`;
    });
    let el = document.getElementById('guest-tables-list'); if(el) el.innerHTML = html;
}
window.submitGuestReservation = function() {
    let name = document.getElementById('guest-name').value.trim(); let phone = document.getElementById('guest-phone').value.trim(); let date = document.getElementById('guest-date').value; let time = document.getElementById('guest-time').value; let tableId = parseInt(document.getElementById('guest-table-num').value);
    if(!name || !phone || !date || !time) return ui.alert("Пожалуйста, заполните все поля!");
    let dParts = date.split('-'); let shortDate = `${dParts[2]}.${dParts[1]}`; let resString = `${shortDate}, ${time} | ${name} (${phone})`;
    cloudState.tables = toArr(cloudState.tables); let t = cloudState.tables.find(x => x.id === tableId);
    if(t) { t.res = toArr(t.res); t.res.push(resString); saveToCloud(); ui.alert("Успешно! Ваша бронь отправлена."); document.getElementById('guest-name').value = ''; document.getElementById('guest-phone').value = ''; document.getElementById('guest-time').value = ''; renderGuestTables(); }
}
window.submitGuestCall = function() { let tableId = document.getElementById('guest-call-table').value; cloudState.notifications = toArr(cloudState.notifications); cloudState.notifications.push({ id: Date.now(), table: tableId, time: new Date().toLocaleTimeString().slice(0,5) }); saveToCloud(); document.getElementById('guest-call-modal').style.display = 'none'; ui.alert("Администратор уведомлен!"); }
window.dismissNotification = function(id) { cloudState.notifications = toArr(cloudState.notifications).filter(n => n.id !== id); saveToCloud(); }

window.login = function() {
    const val = document.getElementById('staff-select').value; const pin = document.getElementById('pass-input').value;
    let user = STAFF_HARDCODED.find(s => s.id === val) || toArr(cloudState.customAdmins).find(a => "custom_"+a.id === val);
    if (user && user.pin === pin) { localAuth = { isAuth: true, user: user, shiftStart: new Date().toLocaleString() }; saveLocalAuth(); document.getElementById('pass-input').value = ""; document.getElementById('auth-error').style.display = 'none'; saveToCloud(); render(); } 
    else { document.getElementById('auth-error').style.display = 'block'; }
}
window.logout = function() { document.getElementById('z-report-modal').style.display = 'flex'; }

function getCurrentShiftData() {
    let hist = toArr(cloudState.history); let lastZ = (hist.length > 0) ? hist[hist.length - 1].timestamp : 0;
    const shiftFixTime = new Date(2026, 2, 20, 14, 0, 0).getTime(); if (lastZ < shiftFixTime) { lastZ = shiftFixTime; }
    let currentChecks = toArr(cloudState.archive).filter(c => c.id > lastZ); let currentExp = toArr(cloudState.expenses).filter(e => e.id > lastZ);
    let cash = 0, qr = 0, table = 0, bar = 0, total = 0, salaryBase = 0; let debtReturns = 0, debtIssued = 0, checksCount = 0, barCostTotal = 0;
    currentChecks.forEach(c => {
        if (c.payMethod === 'Долг') { debtIssued += c.total; return; } 
        if (c.isDebtPayment) { debtReturns += c.total; if (c.payMethod === 'Наличные') cash += c.total; else if (c.payMethod === 'QR') qr += c.total; return; }
        checksCount++; let cTot = c.total || 0; total += cTot; salaryBase += cTot; 
        if (c.payMethod === 'Наличные') cash += cTot; else if (c.payMethod === 'QR') qr += cTot; else if (c.payMethod && c.payMethod.startsWith('Нал:')) { let mCash = c.payMethod.match(/Нал:\s*(\d+)/); let mQr = c.payMethod.match(/QR:\s*(\d+)/); if(mCash) cash += parseInt(mCash[1]); if(mQr) qr += parseInt(mQr[1]); }
        let discRatio = 1 - (c.discount || 0)/100; table += Math.round((c.timeCost || 0) * discRatio); let cBarSell = cTot - Math.round((c.timeCost || 0) * discRatio); bar += cBarSell;
        if(c.bar && toArr(c.bar).length > 0) { toArr(c.bar).forEach(bItem => { let bCost = bItem.cost || 0; barCostTotal += Math.round(bCost * discRatio); }); }
    });
    let expTotal = currentExp.reduce((s, e) => s + e.sum, 0); return { cash, qr, table, bar, total, salaryBase, expTotal, expectedCash: cash - expTotal, debtReturns, debtIssued, checksCount, barCostTotal };
}

function renderGlobalStats() {
    if(!localAuth || !localAuth.isAuth) return; let shift = getCurrentShiftData(); let isOwner = localAuth.user.role === 'owner';
    let activeTablesCount = 0; let moneyOnTables = 0;
    toArr(cloudState.tables).forEach(t => { if (t.active) { activeTablesCount++; let cost = t.paused ? (t.accCost || 0) : ((t.accCost || 0) + calcCost(t.start, t.isTournament)); let barSum = toArr(t.bar).reduce((s,i)=>s+i.price,0); moneyOnTables += (cost + barSum); } });
    let totalDebts = toArr(cloudState.debts).reduce((s, d) => s + d.total, 0); let totalAdminOwed = 0; let adminDebtsDetails = '';
    let allAdminsList = STAFF_HARDCODED.filter(s => s.role === 'admin').map(s => s.name); toArr(cloudState.customAdmins).forEach(a => allAdminsList.push(a.name));
    allAdminsList.forEach(name => { let val = (cloudState.ownerAcc && cloudState.ownerAcc[name]) ? cloudState.ownerAcc[name] : 0; totalAdminOwed += val; if(val > 0) adminDebtsDetails += `${name}: ${val.toLocaleString()} ₸ | `; }); if(adminDebtsDetails.length > 0) adminDebtsDetails = adminDebtsDetails.slice(0, -3);

    let shiftZp = 0;
    if(!isOwner) { shiftZp = Math.round(shift.total * 0.08) + 6000; }
    let accZp = (cloudState.ownerAcc && cloudState.ownerAcc[localAuth.user.name]) ? cloudState.ownerAcc[localAuth.user.name] : 0;

    let html = `<button onclick="document.getElementById('expense-modal').style.display='flex'" class="btn-expense">➖ РАСХОД</button>`;
    if (isOwner) { html += `<div class="global-stat-item"><div class="stat-label">АКТИВНЫЕ СТОЛЫ</div><div class="stat-value gold-text" style="font-size:32px;">${activeTablesCount} / 6</div><div style="font-size:11px; color:var(--gray); margin-top:5px; font-weight:bold;">На столах: ${moneyOnTables.toLocaleString()} ₸</div></div><div class="global-stat-item"><div class="stat-label">ВЫРУЧКА СМЕНЫ</div><div class="stat-value">${shift.total.toLocaleString()} ₸</div><div style="font-size:11px; color:var(--gray); margin-top:5px; font-weight:bold;">Нал: ${shift.cash.toLocaleString()} | QR: ${shift.qr.toLocaleString()}</div></div><div class="global-stat-item"><div class="stat-label" style="color:var(--red);">ДОЛГИ КЛУБУ</div><div class="stat-value" style="color:var(--red);">${totalDebts.toLocaleString()} ₸</div></div><div class="global-stat-item" style="border-right: none;"><div class="stat-label" style="color:var(--gold);">ДОЛГ ПО ЗП АДМИНАМ</div><div class="stat-value" style="color:var(--gold);">${totalAdminOwed.toLocaleString()} ₸</div><div style="font-size:10px; color:var(--gray); margin-top:5px;">${adminDebtsDetails || 'Долгов нет'}</div></div>`; } 
    else { html += `<div class="global-stat-item"><div class="stat-label">ВЫРУЧКА СМЕНЫ</div><div class="stat-value gold-text">${shift.total.toLocaleString()} ₸</div><div style="font-size:11px; color:var(--gray); margin-top:5px; font-weight:bold;">Нал: ${shift.cash.toLocaleString()} | QR: ${shift.qr.toLocaleString()}</div></div><div class="global-stat-item"><div class="stat-label">ДЕНЬГИ НА СТОЛАХ</div><div class="stat-value">${moneyOnTables.toLocaleString()} ₸</div><div style="font-size:11px; color:var(--gray); margin-top:5px; font-weight:bold;">Ожидается оплата</div></div><div class="global-stat-item"><div class="stat-label">МОЯ ЗП СМЕНЫ</div><div class="stat-value">${shiftZp.toLocaleString()} ₸</div></div><div class="global-stat-item" style="border-right: none;"><div class="stat-label" style="color:var(--green);">МОЙ БАЛАНС (К ВЫПЛАТЕ)</div><div class="stat-value" style="color:var(--green);">${(accZp + shiftZp).toLocaleString()} ₸</div></div>`; }
    let statsBar = document.getElementById('dynamic-global-stats'); if(statsBar) statsBar.innerHTML = html;
}

window.confirmZReport = function() {
    let physicalCash = parseInt(document.getElementById('z-cash-input').value) || 0; let shift = getCurrentShiftData(); let diff = physicalCash - shift.expectedCash;
    let salary = 0; if (localAuth.user.role !== 'owner') { salary = Math.round(shift.total * 0.08) + 6000; }
    cloudState.history = toArr(cloudState.history);
    cloudState.history.push({ id: Date.now(), admin: localAuth.user.name, start: localAuth.shiftStart, end: new Date().toLocaleString(), timestamp: Date.now(), barRev: shift.bar, tableRev: shift.table, total: shift.total, sal: salary, expectedCash: shift.expectedCash, physicalCash: physicalCash, diff: diff, cashRev: shift.cash, qrRev: shift.qr, expTotal: shift.expTotal, debtReturns: shift.debtReturns, debtIssued: shift.debtIssued, checksCount: shift.checksCount, barCostTotal: shift.barCostTotal });
    if(localAuth.user.role !== 'owner') { if(!cloudState.ownerAcc) cloudState.ownerAcc = {}; cloudState.ownerAcc[localAuth.user.name] = (cloudState.ownerAcc[localAuth.user.name] || 0) + salary; }
    saveToCloud(); localAuth = { isAuth: false, user: null }; saveLocalAuth(); 
    let diffMsg = diff < 0 ? `НЕДОСТАЧА: ${diff} ₸` : (diff > 0 ? `ИЗЛИШЕК: +${diff} ₸` : `КАССА ИДЕАЛЬНА`); ui.alert(`Смена закрыта.\nОжидалось наличных: ${shift.expectedCash} ₸\nВ кассе: ${physicalCash} ₸\n${diffMsg}`); setTimeout(()=>location.reload(), 3000);
}

window.saveExpense = function() {
    let sum = parseInt(document.getElementById('exp-sum').value); let desc = document.getElementById('exp-desc').value; let catEl = document.getElementById('exp-category'); let cat = catEl ? catEl.value : 'Расход';
    if(!sum || !desc) return ui.alert("Заполните все поля!");
    let fullDesc = `[${cat}] ${desc}`; cloudState.expenses = toArr(cloudState.expenses); cloudState.expenses.push({ id: Date.now(), sum: sum, desc: fullDesc, admin: localAuth.user.name, date: new Date().toLocaleString() }); document.getElementById('expense-modal').style.display='none'; saveToCloud(); ui.alert("Расход записан!");
}

function reverseCheckStats(c) {
    if(c.payMethod === 'Долг' && cloudState.debts) { let debtsArr = toArr(cloudState.debts); let d = debtsArr.find(x => x.name.toLowerCase() === c.name.toLowerCase()); if(d) { d.total -= c.total; d.history = toArr(d.history); d.history.push(`Отмена чека: -${c.total}₸`); if(d.total <= 0) cloudState.debts = debtsArr.filter(x => x.name.toLowerCase() !== c.name.toLowerCase()); else cloudState.debts = debtsArr; } }
}

window.restoreArchiveCheck = function(id) {
    let hist = toArr(cloudState.history); let lastZ = (hist && hist.length > 0) ? hist[hist.length - 1].timestamp : 0; const shiftFixTime = new Date(2026, 2, 20, 14, 0, 0).getTime(); if(lastZ < shiftFixTime) lastZ = shiftFixTime;
    cloudState.archive = toArr(cloudState.archive); let cIdx = cloudState.archive.findIndex(x => x.id === id); if(cIdx === -1) return; let c = cloudState.archive[cIdx];
    if(!localAuth.user || localAuth.user.role !== 'owner') { if(c.id < lastZ) return ui.alert("Этот чек из прошлой смены! Вернуть нельзя."); }
    ui.confirm(`Вернуть чек "${c.name}" в неоплаченные?`, () => { reverseCheckStats(c); delete c.payMethod; delete c.admin; delete c.isDebtPayment; cloudState.checks = toArr(cloudState.checks); cloudState.checks.push(c); cloudState.archive.splice(cIdx, 1); saveToCloud(); });
}

window.restoreDebtCheck = function(name) {
    let arch = toArr(cloudState.archive); let hist = toArr(cloudState.history); let lastZ = (hist.length > 0) ? hist[hist.length - 1].timestamp : 0; const shiftFixTime = new Date(2026, 2, 20, 14, 0, 0).getTime(); if (lastZ < shiftFixTime) lastZ = shiftFixTime;
    let cArr = arch.filter(x => x.name.toLowerCase() === name.toLowerCase() && x.payMethod === 'Долг' && x.id > lastZ);
    if(cArr.length === 0) return ui.alert("Исходный чек не найден в текущей смене!"); let c = cArr[cArr.length - 1]; window.restoreArchiveCheck(c.id);
}

window.deleteArchiveCheck = function(ts) {
    ui.confirm("УДАЛИТЬ ЧЕК ИЗ АРХИВА НАВСЕГДА?", () => {
        cloudState.archive = toArr(cloudState.archive); let cIdx = cloudState.archive.findIndex(x => x.id === ts); if(cIdx === -1) return; let c = cloudState.archive[cIdx];
        reverseCheckStats(c); if(c.bar && toArr(c.bar).length > 0) { cloudState.inventory = toArr(cloudState.inventory); toArr(c.bar).forEach(bItem => { let invItem = cloudState.inventory.find(x => x.name === bItem.name); if(invItem) invItem.qty = (invItem.qty||0) + 1; else cloudState.inventory.push({name: bItem.name, cost: bItem.cost||0, price: bItem.price, qty: 1}); }); }
        cloudState.archive.splice(cIdx, 1); saveToCloud();
    });
}

function calcCost(start, isTournament) { 
    if(!start) return 0; 
    let startTime = Number(start); let endTime = Date.now(); if(endTime < startTime) return 0;
    if (isTournament) { let diffHours = (endTime - startTime) / 3600000; return Math.ceil((diffHours * 1500) / 50) * 50; } 
    else { let totalCost = 0; let currentMs = startTime; while (currentMs < endTime) { let h = new Date(currentMs).getHours(); let ratePerHour = (h >= 11 && h < 18) ? 2000 : 3000; totalCost += ratePerHour / 60; currentMs += 60000; } return Math.ceil(totalCost / 50) * 50; }
}
function formatTime(ms) { 
    if(!ms || ms<0) ms=0; let s = Math.floor(ms / 1000); let h = String(Math.floor(s / 3600)).padStart(2, '0'); let m = String(Math.floor((s % 3600) / 60)).padStart(2, '0'); let sec = String(s % 60).padStart(2, '0'); return `${h}:${m}:${sec}`; 
}

window.startTable = function(id) { cloudState.tables = toArr(cloudState.tables); let t = cloudState.tables.find(x => x.id === id); if(t) { t.active = true; t.start = Date.now(); t.bar = []; t.paused = false; t.accCost = 0; t.accTime = 0; t.isTournament = false; saveToCloud(); } }
window.pauseTable = function(id) { cloudState.tables = toArr(cloudState.tables); let t = cloudState.tables.find(x => x.id === id); if(t && t.active && !t.paused) { t.paused = true; t.accCost = (t.accCost || 0) + calcCost(t.start, t.isTournament); t.accTime = (t.accTime || 0) + (Date.now() - Number(t.start)); t.start = null; saveToCloud(); } }
window.resumeTable = function(id) { cloudState.tables = toArr(cloudState.tables); let t = cloudState.tables.find(x => x.id === id); if(t && t.active && t.paused) { t.paused = false; t.start = Date.now(); saveToCloud(); } }
window.toggleTournament = function(id) { cloudState.tables = toArr(cloudState.tables); let t = cloudState.tables.find(x => x.id === id); if(t && t.active) { t.isTournament = !t.isTournament; saveToCloud(); } }

window.editTableTime = function(id) {
    let t = cloudState.tables.find(x => x.id === id); if (!t || !t.active) return;
    let currentMs = t.paused ? (t.accTime || 0) : ((t.accTime || 0) + (Date.now() - Number(t.start))); let currentMins = Math.floor(currentMs / 60000);
    ui.prompt('Изменить время', [{label: `Сыграно минут (сейчас ${currentMins})`, type: 'number', value: currentMins}], (vals) => {
        let newMins = parseInt(vals[0]); if (isNaN(newMins) || newMins < 0) return ui.alert("Некорректное время!");
        let newMs = newMins * 60000; cloudState.tables = toArr(cloudState.tables); let tableToUpdate = cloudState.tables.find(x => x.id === id);
        if (tableToUpdate.paused) { tableToUpdate.start = Date.now() - newMs; tableToUpdate.accCost = calcCost(tableToUpdate.start, tableToUpdate.isTournament); tableToUpdate.accTime = newMs; tableToUpdate.start = null; } 
        else { tableToUpdate.start = Date.now() - newMs; tableToUpdate.accTime = 0; tableToUpdate.accCost = 0; }
        saveToCloud(); ui.alert(`Время стола ${id} успешно изменено на ${newMins} мин.`);
    });
}

window.openTableManage = function(id) {
    managingTableId = id; let t = cloudState.tables.find(x => x.id === id); let title = document.getElementById('manage-table-title'); if(title) title.innerText = `УПРАВЛЕНИЕ (СТОЛ ${id})`;
    let pauseBtn = t.paused ? `<button onclick="resumeTable(${id}); document.getElementById('table-manage-modal').style.display='none'" class="btn-outline" style="border-color:var(--green); color:var(--green);">▶ ПРОДОЛЖИТЬ ВРЕМЯ</button>` : `<button onclick="pauseTable(${id}); document.getElementById('table-manage-modal').style.display='none'" class="btn-outline" style="border-color:var(--gold); color:var(--gold);">⏸ ПАУЗА</button>`;
    let tournBtn = t.isTournament ? `<button onclick="toggleTournament(${id}); document.getElementById('table-manage-modal').style.display='none'" class="btn-outline" style="border-color:var(--red); color:var(--red);">❌ ОТКЛЮЧИТЬ ТУРНИР</button>` : `<button onclick="toggleTournament(${id}); document.getElementById('table-manage-modal').style.display='none'" class="btn-outline" style="border-color:#3498db; color:#3498db;">🏆 ТУРНИРНЫЙ ТАРИФ (1500 ₸/ч)</button>`;
    let html = `<button onclick="openTableBill(${id}); document.getElementById('table-manage-modal').style.display='none'" class="btn-outline">📄 ПРЕДЧЕК (СЧЕТ)</button><button onclick="document.getElementById('table-manage-modal').style.display='none'; editTableTime(${id});" class="btn-outline" style="border-color:#e67e22; color:#e67e22;">⏱ ИЗМЕНИТЬ ВРЕМЯ (ВРУЧНУЮ)</button><button onclick="document.getElementById('table-manage-modal').style.display='none'; commTable(${id});" class="btn-outline">🔄 КОММЕРЦИЯ (Сброс времени)</button><button onclick="document.getElementById('table-manage-modal').style.display='none'; moveTable(${id});" class="btn-outline">➡️ ПЕРЕСАДКА НА ДРУГОЙ СТОЛ</button><button onclick="document.getElementById('table-manage-modal').style.display='none'; addRes(${id});" class="btn-outline">📅 ДОБАВИТЬ БРОНЬ</button>${pauseBtn}${tournBtn}`;
    let btnContainer = document.getElementById('manage-table-buttons'); if(btnContainer) { btnContainer.innerHTML = html; document.getElementById('table-manage-modal').style.display = 'flex'; }
}

window.commTable = function(id) {
    ui.prompt('Коммерция (Новый счет)', [{label:'Имя проигравшего гостя'}], (vals) => {
        let name = vals[0]; let t = cloudState.tables.find(x => x.id === id);
        let currentCost = t.paused ? 0 : calcCost(t.start, t.isTournament); let totalCost = (t.accCost || 0) + currentCost; 
        createOrMergeCheck(name, id, totalCost, toArr(t.bar)); t.start = Date.now(); t.bar = []; t.paused = false; t.accCost = 0; t.accTime = 0; saveToCloud(); ui.alert(`Счет стола ${id} закрыт на гостя "${name}". Время пошло заново!`);
    });
}

let stoppingTableId = null;
window.openStopTableModal = function(id) { 
    stoppingTableId = id; let t = cloudState.tables.find(x => x.id === id); document.getElementById('stop-table-id').innerText = id; document.getElementById('stop-new-name').value = '';
    let select = document.getElementById('stop-merge-select'); let options = `<option value="">-- Выберите чек (если хотите объединить) --</option>`;
    toArr(cloudState.checks).forEach(c => { options += `<option value="${c.id}">${c.name} (${c.details})</option>`; });
    select.innerHTML = options; document.getElementById('stop-table-modal').style.display = 'flex';
}

window.confirmStopTable = function() {
    let t = cloudState.tables.find(x => x.id === stoppingTableId);
    let newName = document.getElementById('stop-new-name').value.trim(); let mergeId = document.getElementById('stop-merge-select').value; let finalName = "";
    if (mergeId) { let c = cloudState.checks.find(x => x.id == mergeId); if (c) finalName = c.name; } else if (newName) { finalName = newName; } else { return ui.alert("Введите имя ИЛИ выберите чек для объединения!"); }
    let isBlacklisted = toArr(cloudState.blacklist).find(b => b.name.toLowerCase() === finalName.toLowerCase()); if (isBlacklisted) ui.alert(`⚠️ ВНИМАНИЕ!\nГость "${finalName}" находится в ЧЕРНОМ СПИСКЕ!\nПричина: ${isBlacklisted.reason}`);
    let currentCost = t.paused ? 0 : calcCost(t.start, t.isTournament); let totalCost = (t.accCost || 0) + currentCost; 
    createOrMergeCheck(finalName, t.id, totalCost, toArr(t.bar)); 
    t.active = false; t.start = null; t.bar = []; t.paused = false; t.accCost = 0; t.accTime = 0; t.isTournament = false; document.getElementById('stop-table-modal').style.display = 'none'; saveToCloud(); 
}

window.moveTable = function(fromId) {
    ui.prompt('Пересадка', [{label: 'Номер нового стола (1-6)', type: 'number'}], (vals) => {
        let toId = parseInt(vals[0]); cloudState.tables = toArr(cloudState.tables); let tFrom = cloudState.tables.find(x => x.id === fromId); let tTo = cloudState.tables.find(x => x.id === toId);
        if(!tTo) return ui.alert("Такого стола нет!"); if(tTo.active) return ui.alert("Этот стол уже занят!");
        tTo.active = true; tTo.start = tFrom.start; tTo.bar = toArr(tFrom.bar); tTo.paused = tFrom.paused; tTo.accCost = tFrom.accCost; tTo.accTime = tFrom.accTime; tTo.isTournament = tFrom.isTournament;
        tFrom.active = false; tFrom.start = null; tFrom.bar = []; tFrom.paused = false; tFrom.accCost = 0; tFrom.accTime = 0; tFrom.isTournament = false; saveToCloud();
    });
}
window.addRes = function(id) { ui.prompt('Бронь стола', [{label: 'Имя, Время (например: Аскар 19:00)'}], (vals) => { cloudState.tables = toArr(cloudState.tables); let t = cloudState.tables.find(x => x.id === id); t.res = toArr(t.res); t.res.push(vals[0]); saveToCloud(); }); }
window.editRes = function(tId, rIdx) { cloudState.tables = toArr(cloudState.tables); let t = cloudState.tables.find(x => x.id === tId); ui.prompt('Изменить бронь', [{label: 'Данные брони', value: t.res[rIdx]}], (vals) => { t.res[rIdx] = vals[0]; saveToCloud(); }); }
window.delRes = function(tId, rIdx) { ui.confirm("Удалить бронь?", () => { cloudState.tables = toArr(cloudState.tables); let t = cloudState.tables.find(x => x.id === tId); t.res.splice(rIdx,1); saveToCloud(); }); }

// === СКЛАД И ФИЛЬТРЫ ===
let currentStockCategory = 'Все';
window.setStockCat = function(cat, btnElem) {
    currentStockCategory = cat;
    document.querySelectorAll('.stock-cat-btn').forEach(btn => {
        if(btn.innerText.trim() === btnElem.innerText.trim() || (cat==='Кухня' && btn.innerText.includes('Кухня'))) btn.classList.add('active'); else btn.classList.remove('active');
    });
    renderStockTab();
}

window.renderStockTab = function() {
    let invArr = toArr(cloudState.inventory); invArr.sort((a, b) => a.name.localeCompare(b.name));
    if(currentStockCategory !== 'Все') { invArr = invArr.filter(i => (i.category || 'Прочее') === currentStockCategory); }
    let searchQ = document.getElementById('global-stock-search').value.toLowerCase(); if(searchQ) { invArr = invArr.filter(i => i.name.toLowerCase().includes(searchQ)); }
    let isOwner = localAuth && localAuth.user && localAuth.user.role === 'owner';
    
    document.getElementById('stock-list').innerHTML = invArr.map((i) => {
        let q = i.qty || 0; 
        let colorClass = q > 0 ? "var(--white)" : "var(--red)"; let rowClass = q < 5 ? "low-stock-row" : ""; 
        let stockBtns = isOwner ? `<button onclick="editItemQty('${i.name}')" class="btn-outline" style="padding:5px 8px; font-size:10px;">✏️ КОЛ-ВО</button><button onclick="editItemCategory('${i.name}')" class="btn-outline" style="padding:5px 8px; font-size:10px;">✏️ КАТЕГ</button><button onclick="renameItem('${i.name}')" class="btn-outline" style="padding:5px 8px; font-size:10px;">✏️ ИМЯ</button><button onclick="editItemPrice('${i.name}')" class="btn-outline" style="padding:5px 8px; font-size:10px;">✏️ ЦЕНА</button><button onclick="delItem('${i.name}')" class="btn-outline" style="padding:5px 8px; font-size:10px; border-color:rgba(255,76,76,0.5); color:var(--red);">❌</button>` : '';
        return `<tr class="${rowClass}"><td><b style="color:${colorClass}; font-size:15px;">${i.name}</b><br><span style="font-size:10px; color:var(--gold-dim);">${i.category||'Прочее'}</span></td><td><b style="font-size:18px; color:${colorClass};">${q} шт</b></td><td style="color:var(--gray); font-size:12px;">Закуп: ${i.cost||0} ₸</td><td class="gold-text"><b style="font-size:16px;">${i.price} ₸</b></td><td style="display:flex; gap:5px; flex-wrap:wrap;">${stockBtns}</td></tr>`;
    }).join('');
}

window.openSupplierModal = function() {
    try {
        let invArr = toArr(cloudState.inventory); let lowStock = invArr.filter(i => (i.qty||0) <= 10).sort((a, b) => a.name.localeCompare(b.name));
        let text = `ЗАЯВКА НА ЗАКУП (${new Date().toLocaleDateString()}):\n\n`; lowStock.forEach(i => { text += `- ${i.name} (Остаток: ${i.qty||0}) — Нужно: ____ шт\n`; });
        document.getElementById('supplier-order-text').value = text; document.getElementById('supplier-modal').style.display = 'flex';
    } catch(e) { ui.alert("Окно заявки поставщику не найдено. Обновите index.html!"); }
}
window.copySupplierOrder = function() { let text = document.getElementById('supplier-order-text').value; navigator.clipboard.writeText(text).then(() => { ui.alert("Заявка скопирована!"); }).catch(err => { ui.alert("Не удалось скопировать."); }); }

window.editItemCategory = function(name) { cloudState.inventory = toArr(cloudState.inventory); let item = cloudState.inventory.find(i=>i.name===name); ui.prompt('Категория', [{label:'(Напитки, Кухня, Сигареты, Прочее)', value:item.category||'Прочее'}], (vals) => { item.category = vals[0]; saveToCloud(); renderStockTab(); }); }
window.editItemQty = function(name) { cloudState.inventory = toArr(cloudState.inventory); let item = cloudState.inventory.find(i=>i.name===name); ui.prompt('Количество', [{label:'Остаток', type:'number', value:item.qty||0}], (vals) => { item.qty = parseInt(vals[0]); saveToCloud(); renderStockTab(); }); }
window.renameItem = function(name) { cloudState.inventory = toArr(cloudState.inventory); let item = cloudState.inventory.find(i=>i.name===name); ui.prompt('Название', [{label:'Имя', value:item.name}], (vals) => { item.name = vals[0]; saveToCloud(); renderStockTab(); }); }
window.editItemPrice = function(name) { cloudState.inventory = toArr(cloudState.inventory); let item = cloudState.inventory.find(i=>i.name===name); ui.prompt('Цены', [{label:'Закуп (₸)', type:'number', value:item.cost||0}, {label:'Продажа (₸)', type:'number', value:item.price}], (vals) => { item.cost = parseInt(vals[0])||0; item.price = parseInt(vals[1]); saveToCloud(); renderStockTab(); }); }
window.delItem = function(name) { ui.confirm(`Удалить товар "${name}"?`, () => { cloudState.inventory = toArr(cloudState.inventory); let idx = cloudState.inventory.findIndex(i=>i.name===name); cloudState.inventory.splice(idx,1); saveToCloud(); renderStockTab(); }); }

window.saveNewItem = function() { 
    const name = document.getElementById('new-item-name').value.trim(); const cost = parseInt(document.getElementById('new-item-cost').value) || 0; const price = parseInt(document.getElementById('new-item-price').value); const qty = parseInt(document.getElementById('new-item-qty').value); const cat = document.getElementById('new-item-category').value;
    if(!name || isNaN(price) || isNaN(qty)) { ui.alert("Заполните все поля корректно!"); return; } 
    cloudState.inventory = toArr(cloudState.inventory); cloudState.inventory.push({name: name, cost: cost, price: price, qty: qty, category: cat}); document.getElementById('add-item-modal').style.display = 'none'; saveToCloud(); renderStockTab();
}

// === БАР С ФИЛЬТРАМИ ===
let barContext = null; let currentBarCategory = 'Все';
window.openBarModal = function(context) { barContext = context; currentBarCategory = 'Все'; document.getElementById('bar-modal').style.display = 'flex'; document.getElementById('bar-search').value = ''; updateBarCategoryUI(); renderBarSearch(); }
window.setBarCat = function(cat, btnElem) { currentBarCategory = cat; updateBarCategoryUI(); renderBarSearch(); }
function updateBarCategoryUI() { let btns = document.querySelectorAll('.bar-cat-btn'); btns.forEach(btn => { if(btn.innerText.trim() === currentBarCategory || (currentBarCategory==='Кухня' && btn.innerText.includes('Кухня'))) btn.classList.add('active'); else btn.classList.remove('active'); }); }
window.renderBarSearch = function() {
    let invArr = toArr(cloudState.inventory).filter(i => (i.qty||0) > 0); 
    if(currentBarCategory !== 'Все') { invArr = invArr.filter(i => (i.category || 'Прочее') === currentBarCategory); }
    invArr.sort((a, b) => a.name.localeCompare(b.name)); const q = document.getElementById('bar-search').value.toLowerCase(); 
    document.getElementById('bar-items-list').innerHTML = invArr.filter(i => i.name.toLowerCase().includes(q)).map(i => `<div class="bar-item-row" onclick="selectBarItem('${i.name}')"><span>${i.name}</span><span class="stock-ok">${i.price} ₸ (${i.qty||0} шт)</span></div>`).join(''); 
}
window.selectBarItem = function(itemName) {
    cloudState.inventory = toArr(cloudState.inventory); let item = cloudState.inventory.find(x => x.name === itemName); if((item.qty||0) <= 0) return ui.alert("Товар закончился!");
    ui.prompt('Добавить в счет', [{label:`Кол-во: ${item.name} (Остаток: ${item.qty||0})`, type:'number', value:'1'}], (vals) => {
        let qty = parseInt(vals[0]); if (isNaN(qty) || qty <= 0 || qty > (item.qty||0)) return ui.alert("Некорректное количество!"); item.qty -= qty;
        if (barContext === 'owner') { document.getElementById('bar-modal').style.display = 'none'; saveToCloud(); ui.alert(`Списано на Хозяина: ${item.name}`); return; }
        let itemsToAdd = []; for(let i = 0; i < qty; i++) itemsToAdd.push({name: item.name, cost: item.cost||0, price: item.price});
        if(barContext === 'standalone') { 
            ui.prompt('Имя гостя', [{label:'Для кого бар?'}], (nameVals) => { let name = nameVals[0]; let isBlacklisted = toArr(cloudState.blacklist).find(b => b.name.toLowerCase() === name.toLowerCase()); if (isBlacklisted) ui.alert(`⚠️ ВНИМАНИЕ! Гость "${name}" в ЧЕРНОМ СПИСКЕ!\nПричина: ${isBlacklisted.reason}`); createOrMergeCheck(name, "Бар", 0, itemsToAdd); document.getElementById('bar-modal').style.display = 'none'; saveToCloud(); });
        } else { cloudState.tables = toArr(cloudState.tables); let t = cloudState.tables.find(x => x.id === barContext); t.bar = toArr(t.bar).concat(itemsToAdd); document.getElementById('bar-modal').style.display = 'none'; saveToCloud(); }
    });
}
let editTableId = null;
window.openEditTableBar = function(id) {
    editTableId = id; let t = toArr(cloudState.tables).find(x => x.id === id); let html = toArr(t.bar).map((b, i) => `<div class="edit-bar-item"><span>${b.name} (${b.price} ₸)</span> <button onclick="removeTableBarItem(${i})" class="btn-outline" style="color:var(--red); border-color:var(--red); padding:3px 8px; font-size:10px;">❌</button></div>`).join('');
    document.getElementById('edit-table-bar-list').innerHTML = html || '<span style="color:var(--gray); font-size:12px;">Пусто</span>'; document.getElementById('edit-table-bar-modal').style.display = 'flex';
}
window.removeTableBarItem = function(idx) { ui.confirm("Убрать товар? Он вернется на склад.", () => { cloudState.tables = toArr(cloudState.tables); let t = cloudState.tables.find(x => x.id === editTableId); t.bar = toArr(t.bar); let item = t.bar.splice(idx, 1)[0]; cloudState.inventory = toArr(cloudState.inventory); let invItem = cloudState.inventory.find(x => x.name === item.name); if(invItem) { invItem.qty = (invItem.qty||0) + 1; } saveToCloud(); openEditTableBar(editTableId); }); }

function createOrMergeCheck(name, tableId, timeCost, barItems) {
    cloudState.checks = toArr(cloudState.checks); let bArr = toArr(barItems); let barTotal = bArr.reduce((s, i) => s + i.price, 0); let exist = cloudState.checks.find(c => c.name.toLowerCase() === name.toLowerCase()); const now = new Date(); const timeStr = now.getHours().toString().padStart(2,'0') + ":" + now.getMinutes().toString().padStart(2,'0');
    if(exist) { exist.timeCost += timeCost; exist.barCost += barTotal; if(bArr.length > 0) exist.bar = toArr(exist.bar).concat(bArr); applyVipLogic(exist); if(tableId !== "Бар") exist.details += ` + Стол ${tableId}`; exist.endTime = timeStr; } else { let t = toArr(cloudState.tables).find(x => x.id === tableId); let startStr = t && t.start ? new Date(Number(t.start)).getHours().toString().padStart(2,'0') + ":" + new Date(Number(t.start)).getMinutes().toString().padStart(2,'0') : timeStr; let duration = "0ч 0м"; if(t && t.start) { let diff = now - Number(t.start); duration = Math.floor(diff/3600000) + "ч " + Math.floor((diff%3600000)/60000) + "м"; } let newCheck = { id: Date.now(), name: name, table: tableId, date: now.toLocaleDateString(), startTime: startStr, endTime: timeStr, duration: duration, timeCost: timeCost, barCost: barTotal, bar: bArr, total: timeCost + barTotal, discount: 0, details: `Стол ${tableId}` }; applyVipLogic(newCheck); cloudState.checks.push(newCheck); }
    saveToCloud();
}
window.deleteCheck = function(idx) { ui.confirm("Вы точно хотите безвозвратно УДАЛИТЬ этот чек?\nВсе товары бара из него будут возвращены на склад.", () => { cloudState.checks = toArr(cloudState.checks); cloudState.inventory = toArr(cloudState.inventory); let c = cloudState.checks[idx]; if(c.bar && toArr(c.bar).length > 0) { toArr(c.bar).forEach(bItem => { let invItem = cloudState.inventory.find(x => x.name === bItem.name); if(invItem) { invItem.qty = (invItem.qty||0) + 1; } else cloudState.inventory.push({name: bItem.name, cost: bItem.cost||0, price: bItem.price, qty: 1}); }); } cloudState.checks.splice(idx, 1); saveToCloud(); }); }
let editingCheckIdx = null;
window.openEditCheckModal = function(idx) { editingCheckIdx = idx; let c = toArr(cloudState.checks)[idx]; document.getElementById('edit-check-name').value = c.name; document.getElementById('edit-check-time').value = c.timeCost; renderEditCheckBarItems(); document.getElementById('edit-check-modal').style.display = 'flex'; }
function renderEditCheckBarItems() { let c = toArr(cloudState.checks)[editingCheckIdx]; let html = toArr(c.bar).map((b, i) => `<div class="edit-bar-item"><span>${b.name} (${b.price} ₸)</span> <button onclick="removeBarItemFromCheck(${i})" class="btn-outline" style="color:var(--red); border-color:var(--red); padding:5px 10px;">❌ Убрать</button></div>`).join(''); document.getElementById('edit-check-bar-list').innerHTML = html || '<span style="color:var(--gray); font-size:12px;">Пусто</span>'; }
window.removeBarItemFromCheck = function(itemIdx) { ui.confirm("Убрать товар из чека? Он вернется на склад.", () => { cloudState.checks = toArr(cloudState.checks); let c = cloudState.checks[editingCheckIdx]; c.bar = toArr(c.bar); let item = c.bar.splice(itemIdx, 1)[0]; c.barCost -= item.price; applyVipLogic(c); cloudState.inventory = toArr(cloudState.inventory); let invItem = cloudState.inventory.find(x => x.name === item.name); if(invItem) { invItem.qty = (invItem.qty||0) + 1; } saveToCloud(); renderEditCheckBarItems(); }); }
window.saveCheckEdit = function() { let checks = toArr(cloudState.checks); let c = checks[editingCheckIdx]; let newName = document.getElementById('edit-check-name').value; if (newName.toLowerCase() !== c.name.toLowerCase()) { let existingIdx = checks.findIndex(chk => chk.name.toLowerCase() === newName.toLowerCase() && chk.id !== c.id); if (existingIdx !== -1) { ui.confirm(`Чек с именем "${newName}" уже есть. Объединить их?`, () => { let ex = checks[existingIdx]; ex.timeCost += (parseInt(document.getElementById('edit-check-time').value) || 0); ex.barCost += c.barCost; let cBarArr = toArr(c.bar); if(cBarArr.length > 0) ex.bar = toArr(ex.bar).concat(cBarArr); applyVipLogic(ex); ex.details += ` + ${c.details}`; checks.splice(editingCheckIdx, 1); cloudState.checks = checks; document.getElementById('edit-check-modal').style.display = 'none'; saveToCloud(); }); return; } } c.name = newName; c.timeCost = parseInt(document.getElementById('edit-check-time').value) || 0; applyVipLogic(c); cloudState.checks = checks; document.getElementById('edit-check-modal').style.display = 'none'; saveToCloud(); }

// === ОПЛАТА ===
let currentCheckIndex = null;
window.openPayModal = function(idx) { currentCheckIndex = idx; let c = toArr(cloudState.checks)[idx]; let origTotal = c.timeCost + c.barCost; document.getElementById('split-info').style.display = 'none'; if(c.discount && c.discount > 0) { document.getElementById('pay-total').innerHTML = `<span style="text-decoration:line-through; font-size:24px; color:var(--gray);">${origTotal} ₸</span><br>${c.total} ₸`; document.getElementById('pay-info').innerText = `${c.name} | ${c.details} (Скидка ${c.discount}%)`; } else { document.getElementById('pay-total').innerText = c.total + " ₸"; document.getElementById('pay-info').innerText = `${c.name} | ${c.details}`; } document.getElementById('pay-main-buttons').style.display = 'flex'; document.getElementById('mix-pay-section').style.display = 'none'; document.getElementById('pay-modal').style.display = 'flex'; }
window.applyDiscount = function(pct) { cloudState.checks = toArr(cloudState.checks); let c = cloudState.checks[currentCheckIndex]; c.discount = pct; if (pct === 100) { c.timeCost = 0; c.barCost = 0; c.total = 0; c.details += " [СВОИ/ХОЗЯИН]"; document.getElementById('pay-total').innerText = "0 ₸"; document.getElementById('pay-info').innerText = `${c.name} | ${c.details} (100%)`; } else { let origTotal = c.timeCost + c.barCost; if(pct === 0) { c.total = origTotal; document.getElementById('pay-total').innerText = c.total + " ₸"; document.getElementById('pay-info').innerText = `${c.name} | ${c.details}`; } else { c.total = Math.round(origTotal * (1 - pct / 100)); document.getElementById('pay-total').innerHTML = `<span style="text-decoration:line-through; font-size:24px; color:var(--gray);">${origTotal} ₸</span><br>${c.total} ₸`; document.getElementById('pay-info').innerText = `${c.name} | ${c.details} (Скидка ${pct}%)`; } } if (document.getElementById('mix-pay-section').style.display === 'block') { calcMixQr(); } document.getElementById('split-info').style.display = 'none'; saveToCloud(); }
window.processPayment = function(method) { cloudState.checks = toArr(cloudState.checks); let c = cloudState.checks[currentCheckIndex]; c.payMethod = method; c.admin = localAuth.user.name; if(method === 'Долг') { cloudState.debts = toArr(cloudState.debts); let d = cloudState.debts.find(x => x.name.toLowerCase() === c.name.toLowerCase()); let histStr = `+${c.total}₸ (${new Date().toLocaleString()}, Админ: ${localAuth.user.name})`; if(d) { d.total += c.total; d.history = toArr(d.history); d.history.push(histStr); d.timestamp = Date.now(); if(!d.admin) d.admin = localAuth.user.name; } else { cloudState.debts.push({ name: c.name, total: c.total, history: [histStr], timestamp: Date.now(), admin: localAuth.user.name }); } } cloudState.archive = toArr(cloudState.archive); cloudState.archive.push(c); cloudState.checks.splice(currentCheckIndex, 1); document.getElementById('pay-modal').style.display = 'none'; saveToCloud(); }
window.showMixPay = function() { document.getElementById('pay-main-buttons').style.display = 'none'; document.getElementById('mix-pay-section').style.display = 'block'; document.getElementById('mix-cash-input').value = ''; document.getElementById('mix-qr-val').innerText = toArr(cloudState.checks)[currentCheckIndex].total; }
window.hideMixPay = function() { document.getElementById('pay-main-buttons').style.display = 'flex'; document.getElementById('mix-pay-section').style.display = 'none'; }
window.calcMixQr = function() { let t = toArr(cloudState.checks)[currentCheckIndex].total; let c = parseInt(document.getElementById('mix-cash-input').value) || 0; let q = t - c; document.getElementById('mix-qr-val').innerText = q < 0 ? 0 : q; }
window.fillMix = function(type) { let c = toArr(cloudState.checks)[currentCheckIndex]; let discRatio = 1 - (c.discount || 0) / 100; let tCost = Math.round(c.timeCost * discRatio); let bCost = c.total - tCost; if(type === 'timeCash') { document.getElementById('mix-cash-input').value = tCost; } else if (type === 'barCash') { document.getElementById('mix-cash-input').value = bCost; } calcMixQr(); }
window.confirmMixPay = function() { let t = toArr(cloudState.checks)[currentCheckIndex].total; let c = parseInt(document.getElementById('mix-cash-input').value) || 0; let q = t - c; if (c < 0 || q < 0) return ui.alert("Некорректная сумма наличных!"); processPayment(`Нал: ${c}₸ / QR: ${q}₸`); }
window.splitPayment = function(n) { let t = toArr(cloudState.checks)[currentCheckIndex].total; let perPerson = Math.ceil(t / n); document.getElementById('split-info').innerHTML = `Сумма на ${n}х: <b class="gold-text">${perPerson.toLocaleString()} ₸</b> с каждого`; document.getElementById('split-info').style.display = 'block'; }

window.payDebt = function(idx) { cloudState.debts = toArr(cloudState.debts); let d = cloudState.debts[idx]; ui.prompt('Погашение долга', [{label: 'Сколько вносит клиент? (Долг: ' + d.total + ' ₸)', type: 'number'}, {label: 'Метод оплаты (Нал/QR)', value: 'Нал'}], (vals) => { let sum = parseInt(vals[0]); if(isNaN(sum) || sum <= 0 || sum > d.total) return ui.alert("Некорректная сумма!"); let method = vals[1] || 'Наличные'; let comm = Math.round(sum * 0.08); if (d.admin) { if(!cloudState.ownerAcc) cloudState.ownerAcc = {}; cloudState.ownerAcc[d.admin] = (cloudState.ownerAcc[d.admin] || 0) + comm; ui.alert(`Админу "${d.admin}" начислено 8% (${comm} ₸) на баланс.`); } d.total -= sum; let timeStr = new Date().toLocaleTimeString().slice(0,5); d.history = toArr(d.history); d.history.push(`Оплата: -${sum}₸ (${new Date().toLocaleDateString()} ${timeStr}, ${method})`); cloudState.archive = toArr(cloudState.archive); cloudState.archive.push({ id: Date.now(), name: "Возврат долга: " + d.name, table: "ДОЛГ", date: new Date().toLocaleDateString(), timeCost: 0, barCost: 0, total: sum, payMethod: method, admin: localAuth.user.name, details: "Погашение долга", isDebtPayment: true }); if(d.total <= 0) { d.needsConfirmation = true; ui.alert("Долг оплачен. Ждет подтверждения Хозяина."); } saveToCloud(); renderDebtsTab(); }); }
window.confirmDebtReturn = function(idx) { ui.confirm("Вы забрали деньги из кассы? Подтвердить и удалить долг навсегда?", () => { cloudState.debts = toArr(cloudState.debts); cloudState.debts.splice(idx, 1); saveToCloud(); renderDebtsTab(); }); }
window.deductDebtFromAdmin = function(idx) { cloudState.debts = toArr(cloudState.debts); let d = cloudState.debts[idx]; ui.confirm(`Удержать долг (${d.total} ₸) из ЗП администратора ${d.admin || 'Неизвестно'}?`, () => { if(d.admin) { if(!cloudState.ownerAcc) cloudState.ownerAcc = {}; cloudState.ownerAcc[d.admin] = (cloudState.ownerAcc[d.admin] || 0) - d.total; } d.total = 0; d.history = toArr(d.history); d.history.push(`УДЕРЖАНО С АДМИНА: ${d.admin}`); saveToCloud(); ui.alert("Долг успешно удержан из ЗП!"); renderDebtsTab(); }); }
window.delDebt = function(idx) { ui.confirm("Хозяин, удалить этот долг навсегда?", () => { cloudState.debts = toArr(cloudState.debts); cloudState.debts.splice(idx,1); saveToCloud(); renderDebtsTab(); }); }

window.addCustomAdmin = function() { ui.prompt('Новый администратор', [{label:'Имя'}, {label:'PIN-код', type:'number'}], (vals) => { cloudState.customAdmins = toArr(cloudState.customAdmins); cloudState.customAdmins.push({id: Date.now(), name: vals[0], pin: vals[1], role: "admin"}); saveToCloud(); render(); }); }
window.resetDatabase = function() { ui.confirm("ОЧИСТИТЬ БАЗУ ПОЛНОСТЬЮ?", () => { cloudState = { tables: Array.from({length: 6}, (_, i) => ({ id: i + 1, active: false, start: null, res: [], bar:[], paused: false, accCost: 0, accTime: 0, isTournament: false })), checks: [], archive: [], inventory: [], debts: [], history: [], ownerAcc: {}, customAdmins: [], expenses:[], vips: [], onlineAdmins: {}, notifications: [], blacklist: [] }; saveToCloud(); location.reload(); }); }
window.addVipGuest = function() { ui.prompt('VIP Гость', [{label:'Имя'}, {label:'Скидка (%)', type:'number'}], (vals) => { let name = vals[0]; let disc = parseInt(vals[1]); if(isNaN(disc) || disc < 0 || disc > 100) return ui.alert("Неверная скидка"); cloudState.vips = toArr(cloudState.vips); let exist = cloudState.vips.find(v => v.name.toLowerCase() === name.toLowerCase()); if(exist) exist.discount = disc; else cloudState.vips.push({id: Date.now(), name: name, discount: disc}); saveToCloud(); ui.alert(`VIP гость ${name} добавлен со скидкой ${disc}%!`); render(); }); }
window.delVipGuest = function(id) { ui.confirm("Удалить VIP гостя?", () => { cloudState.vips = toArr(cloudState.vips).filter(v => v.id !== id); saveToCloud(); render(); }); }

window.addBlacklist = function() { ui.prompt('Черный список', [{label:'Имя проблемного гостя'}, {label:'Причина (за что?)'}], (vals) => { cloudState.blacklist = toArr(cloudState.blacklist); cloudState.blacklist.push({id: Date.now(), name: vals[0], reason: vals[1]}); saveToCloud(); ui.alert(`Гость ${vals[0]} добавлен в Черный список!`); render(); }); }
window.delBlacklist = function(id) { ui.confirm("Удалить из черного списка?", () => { cloudState.blacklist = toArr(cloudState.blacklist).filter(b => b.id !== id); saveToCloud(); render(); }); }
function applyVipLogic(check) { let vips = toArr(cloudState.vips); let vip = vips.find(v => v.name.toLowerCase() === check.name.toLowerCase()); if (vip) { check.discount = vip.discount; check.isVip = true; } else { check.isVip = false; } let baseTot = check.timeCost + check.barCost; check.total = check.discount ? Math.round(baseTot * (1 - check.discount/100)) : baseTot; }
window.showTab = function(id, btn) { document.querySelectorAll('.tab-pane').forEach(x => x.style.display = 'none'); document.querySelectorAll('.nav-link').forEach(x => x.classList.remove('active')); document.getElementById('tab-'+id).style.display = 'block'; btn.classList.add('active'); if(id === 'stock') renderStockTab(); if(id === 'debts') renderDebtsTab(); }

let accPeriod = 'today'; 
window.setAccPeriod = function(period, btn) { accPeriod = period; document.querySelectorAll('.acc-filter').forEach(x => x.classList.remove('active')); btn.classList.add('active'); renderAccounting(); }
window.exportToExcel = function() {
    if(currentFilteredHistory.length === 0) return ui.alert("Нет данных для скачивания за этот период."); let csv = '\uFEFF'; csv += "АДМИН;ДАТА НАЧАЛА;ДАТА КОНЦА;КОЛ-ВО ЧЕКОВ;БАР (ТНГ);СЕБЕСТОИМОСТЬ БАРА (ТНГ);СТОЛЫ (ТНГ);РАСХОДЫ/ИЗЪЯТИЯ (ТНГ);ВЫДАНО В ДОЛГ (ТНГ);ВОЗВРАТ ДОЛГОВ (ТНГ);ОЖИДАЕМАЯ КАССА (ТНГ);ФАКТ В КАССЕ (ТНГ);РАЗНИЦА КАССЫ (ТНГ);ВЫДАНО ЗП (ТНГ);ИСТИННАЯ ПРИБЫЛЬ ХОЗЯИНА (ТНГ)\n";
    currentFilteredHistory.forEach(h => { let net = (h.total||0) - (h.sal||0) - (h.expTotal||0) - (h.barCostTotal||0); csv += `${h.admin};${h.start};${h.end};${h.checksCount||0};${h.barRev||0};${h.barCostTotal||0};${h.tableRev||0};${h.expTotal||0};${h.debtIssued||0};${h.debtReturns||0};${h.expectedCash||0};${h.physicalCash||0};${h.diff||0};${h.sal||0};${net}\n`; }); let a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = `Бухгалтерия_SENSEI_${accPeriod}.csv`; a.click();
}

function renderAccounting() {
    let histArr = toArr(cloudState.history); if(histArr.length === 0) return; const now = new Date(); const todayStr = now.toLocaleDateString(); const nowTime = now.getTime();
    currentFilteredHistory = histArr.filter(h => { if(accPeriod === 'all') return true; let shiftDateStr = h.timestamp ? new Date(h.timestamp).toLocaleDateString() : h.end.split(',')[0].trim(); if(accPeriod === 'today') return shiftDateStr === todayStr; if(!h.timestamp) return true; let diffDays = (nowTime - h.timestamp) / (1000 * 60 * 60 * 24); if(accPeriod === 'week') return diffDays <= 7; if(accPeriod === 'month') return diffDays <= 30; if(accPeriod === 'year') return diffDays <= 365; return true; });
    let tRev = 0, bRev = 0, tblRev = 0, sal = 0, expTotal = 0; let debtRet = 0, debtIss = 0, checksCount = 0, barCostTot = 0; let adminStats = {};
    currentFilteredHistory.forEach(h => { tRev += (h.total || 0); bRev += (h.barRev || 0); tblRev += (h.tableRev || 0); sal += (h.sal || 0); expTotal += (h.expTotal || 0); debtRet += (h.debtReturns || 0); debtIss += (h.debtIssued || 0); checksCount += (h.checksCount || 0); barCostTot += (h.barCostTotal || 0); if(!adminStats[h.admin]) adminStats[h.admin] = 0; adminStats[h.admin] += (h.total || 0); });
    document.getElementById('acc-trev').innerText = tRev.toLocaleString() + " ₸"; document.getElementById('acc-bar-cost').innerText = barCostTot.toLocaleString() + " ₸"; document.getElementById('acc-sal').innerText = (sal + expTotal).toLocaleString() + " ₸"; let netProfit = tRev - sal - expTotal - barCostTot; document.getElementById('acc-net').innerText = netProfit.toLocaleString() + " ₸";
    let avgCheck = checksCount > 0 ? Math.round(tRev / checksCount) : 0; let barPct = tRev > 0 ? Math.round((bRev / tRev) * 100) : 0; let tblPct = tRev > 0 ? Math.round((tblRev / tRev) * 100) : 0; let topAdmin = "---"; let maxRev = 0; for(let a in adminStats) { if(adminStats[a] > maxRev) { maxRev = adminStats[a]; topAdmin = a; } }
    let avgCheckEl = document.getElementById('acc-avg-check'); if(avgCheckEl) avgCheckEl.innerText = avgCheck.toLocaleString() + " ₸"; let accDebtRetEl = document.getElementById('acc-debt-ret'); if(accDebtRetEl) accDebtRetEl.innerText = debtRet.toLocaleString() + " ₸"; let accDebtIssEl = document.getElementById('acc-debt-iss'); if(accDebtIssEl) accDebtIssEl.innerText = debtIss.toLocaleString() + " ₸"; let accChecksCountEl = document.getElementById('acc-checks-count'); if(accChecksCountEl) accChecksCountEl.innerText = checksCount; let accBarPctEl = document.getElementById('acc-bar-pct'); if(accBarPctEl) accBarPctEl.innerText = barPct + "%"; let accTblPctEl = document.getElementById('acc-tbl-pct'); if(accTblPctEl) accTblPctEl.innerText = tblPct + "%"; let accTopAdminEl = document.getElementById('acc-top-admin'); if(accTopAdminEl) accTopAdminEl.innerText = topAdmin;
    document.getElementById('history-list').innerHTML = currentFilteredHistory.slice().reverse().map(h => { let diffColor = h.diff < 0 ? 'var(--red)' : (h.diff > 0 ? 'var(--green)' : 'var(--gray)'); let zReportHtml = h.expectedCash !== undefined ? `<br><span style="font-size:10px; color:${diffColor};">Нал: ${h.physicalCash} (Разница: ${h.diff})</span>` : ''; return `<tr><td><b>${h.admin}</b></td><td><span style="font-size:11px; color:var(--gray);">${h.start} - ${h.end}</span></td><td><span style="font-size:11px; color:var(--gray);">Нал: ${h.cashRev||0}<br>QR: ${h.qrRev||0}</span></td><td><b class="gold-text">${h.total} ₸</b>${zReportHtml}</td><td><b style="color:var(--green);">${h.sal} ₸</b></td><td><button onclick="deleteHistory(${h.timestamp})" class="btn-red" style="padding:6px 10px; font-size:12px; width:auto;">🗑️</button></td></tr>`; }).join('');
}

// === ОТРИСОВКА СТОЛОВ И ЧЕКОВ ===
let currentBillTableId = null;
window.openTableBill = function(id) { try { currentBillTableId = id; renderTableBill(); document.getElementById('table-bill-modal').style.display = 'flex'; } catch(e) { console.error(e); ui.alert("Окно счета не найдено. Обновите index.html!"); } }
function renderTableBill() {
    if (!currentBillTableId) return; let t = toArr(cloudState.tables).find(x => x.id === currentBillTableId); if (!t) return;
    document.getElementById('table-bill-id').innerText = t.id;
    let cost = t.paused ? (t.accCost || 0) : ((t.accCost || 0) + calcCost(t.start, t.isTournament)); 
    document.getElementById('table-bill-time-val').innerText = cost.toLocaleString() + " ₸";
    let barSum = 0; 
    let html = toArr(t.bar).map((b, i) => { barSum += b.price; return `<div class="edit-bar-item"><span>${b.name} (${b.price} ₸)</span> <button onclick="removeTableBarItemFromBill(${i})" class="btn-outline" style="color:var(--red); border-color:var(--red); padding:3px 8px; font-size:10px;">❌</button></div>`; }).join('');
    document.getElementById('table-bill-bar-list').innerHTML = html || '<span style="color:var(--gray); font-size:12px;">Пусто</span>'; 
    document.getElementById('table-bill-bar-sum').innerText = barSum.toLocaleString(); 
    document.getElementById('table-bill-total').innerText = (cost + barSum).toLocaleString();
}
window.removeTableBarItemFromBill = function(idx) { ui.confirm("Убрать товар? Он вернется на склад.", () => { cloudState.tables = toArr(cloudState.tables); let t = cloudState.tables.find(x => x.id === currentBillTableId); t.bar = toArr(t.bar); let item = t.bar.splice(idx, 1)[0]; cloudState.inventory = toArr(cloudState.inventory); let invItem = cloudState.inventory.find(x => x.name === item.name); if(invItem) invItem.qty = (invItem.qty||0) + 1; saveToCloud(); renderTableBill(); }); }
window.openFullCheck = function(idx) { let checks = toArr(cloudState.checks); if(!checks || !checks[idx]) return; let c = checks[idx]; openFullCheckObj(c); }
window.openArchiveFullCheck = function(id) { let c = toArr(cloudState.archive).find(x => x.id === id); if(c) openFullCheckObj(c); }
window.openFullCheckObj = function(c) {
    try {
        if(!c) return;
        document.getElementById('bill-date').innerText = c.date + " " + (c.endTime || ''); document.getElementById('bill-guest').innerText = c.name; document.getElementById('bill-table-num').innerText = c.table; document.getElementById('bill-start').innerText = c.startTime || '--:--'; document.getElementById('bill-end').innerText = c.endTime || '--:--'; document.getElementById('bill-duration').innerText = c.duration || '--ч --м';
        let grouped = {}; toArr(c.bar).forEach(i => { grouped[i.name] = grouped[i.name] || {q:0, p:i.price}; grouped[i.name].q++; });
        document.getElementById('bill-items-body').innerHTML = Object.keys(grouped).map(k => `<tr><td style="padding:10px 0;">${k}</td><td style="padding:10px 0;">${grouped[k].q}</td><td style="padding:10px 0;">${grouped[k].p}</td><td style="padding:10px 0;">${grouped[k].q*grouped[k].p}</td></tr>`).join('');
        document.getElementById('bill-time-sum').innerText = c.timeCost; document.getElementById('bill-bar-sum').innerText = c.barCost; document.getElementById('bill-total').innerText = c.total;
        if(c.discount > 0) { document.getElementById('bill-discount-row').style.display='block'; document.getElementById('bill-discount-val').innerText = c.discount; } else document.getElementById('bill-discount-row').style.display='none';
        document.getElementById('full-check-modal').style.display='flex';
    } catch(e) { console.error(e); ui.alert("Окно чека не найдено. Обновите index.html!"); }
}

function renderOnlineAdmins() {
    let onlineHtml = ''; let now = Date.now();
    let allAdminsList = STAFF_HARDCODED.filter(s => s.role === 'admin').map(s => s.name);
    toArr(cloudState.customAdmins).forEach(a => allAdminsList.push(a.name));
    allAdminsList.forEach(admin => {
        let lastSeen = cloudState.onlineAdmins[admin] || 0; let isOnline = (now - lastSeen < 300000); 
        let color = isOnline ? 'var(--green)' : 'var(--red)'; let statusText = isOnline ? 'онлайн' : 'офлайн';
        onlineHtml += `<span style="font-size:13px; color:var(--white); margin-right:15px; font-weight:700;"><span style="color:${color}; font-size:16px; vertical-align:middle;">●</span> ${admin} - ${statusText}</span>`;
    });
    let indicator = document.getElementById('online-admins-indicator'); if(indicator) indicator.innerHTML = onlineHtml;
}

function renderTables() {
    if(!document.getElementById('tables-grid')) return;
    let tablesArr = toArr(cloudState.tables);
    if(tablesArr.length === 0) return;
    
    document.getElementById('tables-grid').innerHTML = tablesArr.map(t => {
        let timeStr = "00:00:00", cost = 0; 
        let timerColorClass = 'timer-normal'; // УМНЫЕ ЦВЕТА
        
        if(t.active) { 
            let st = Number(t.start);
            let elapsedMs = t.paused ? (t.accTime || 0) : ((t.accTime || 0) + (Date.now() - st));
            timeStr = formatTime(elapsedMs); 
            cost = t.paused ? (t.accCost || 0) : ((t.accCost || 0) + calcCost(st, t.isTournament)); 
            
            let elapsedHours = elapsedMs / 3600000;
            if(elapsedHours >= 5) timerColorClass = 'timer-danger';
            else if(elapsedHours >= 3) timerColorClass = 'timer-warning';
        }
        
        let barSum = 0; let barHtml = ''; let bArr = toArr(t.bar);
        if(t.active && bArr.length > 0) {
            let grouped = {}; bArr.forEach(i => { grouped[i.name] = grouped[i.name] || {q:0, p:i.price}; grouped[i.name].q++; });
            barHtml = `<div class="mini-bar-list">` + Object.keys(grouped).map(k => { barSum += grouped[k].q*grouped[k].p; return `<div class="mini-bar-item"><span>${k} x${grouped[k].q}</span><span>${grouped[k].q*grouped[k].p}</span></div>`; }).join('') + `<div style="text-align:right; font-weight:bold; margin-top:5px; color:var(--gold);">Сумма: ${barSum} ₸ <button onclick="openEditTableBar(${t.id})" style="background:none; border:none; font-size:14px; margin-left:5px; cursor:pointer;">⚙️</button></div></div>`;
        }
        let totalDisplay = cost !== 0 ? (cost + barSum) : barSum;
        let resHtml = toArr(t.res).map((r, i) => `<div class="res-item"><span>📅 ${r}</span> <div><span onclick="editRes(${t.id},${i})" style="cursor:pointer; margin-right:10px;">✏️</span><span onclick="delRes(${t.id},${i})" style="color:var(--red); cursor:pointer;">❌</span></div></div>`).join('');
        
        let cardStyle = t.paused ? 'border: 2px solid var(--gold); background: rgba(212,175,55,0.1);' : '';
        let tournBadge = t.isTournament ? `<div style="background:var(--gold); color:#000; font-size:10px; padding:2px 6px; border-radius:4px; display:inline-block; margin-bottom:5px; font-weight:800;">🏆 ТУРНИР (1500₸/ч)</div>` : '';

        // МИНИМАЛИЗМ КНОПОК
        let buttonsHtml = '';
        if(!t.active) {
            buttonsHtml = `<button onclick="startTable(${t.id})" class="btn-gold btn-large shadow-gold" style="margin-top:auto;">▶ ПУСК СТОЛА</button>`;
        } else {
            buttonsHtml = `
                <div style="display:flex; gap:10px; margin-top:auto;">
                    <button onclick="openStopTableModal(${t.id})" class="btn-red" style="flex:2; padding:15px; font-size:14px; border-radius:12px;">⏹ СТОП</button>
                    <button onclick="openBarModal(${t.id})" class="btn-outline" style="flex:2; padding:15px; font-size:14px; border-radius:12px; background:rgba(212,175,55,0.1); border:none; color:var(--gold);">🍸 БАР</button>
                    <button onclick="openTableManage(${t.id})" class="btn-outline" style="flex:1; padding:15px; font-size:20px; border-radius:12px; display:flex; align-items:center; justify-content:center; border-color:rgba(255,255,255,0.1); color:var(--gray);">⚙️</button>
                </div>
            `;
        }

        return `<div class="table-card ${t.active ? 'active' : ''}" style="${cardStyle}"><div style="font-size:22px; font-weight:800; color:var(--gold);">СТОЛ ${t.id} ${t.paused ? '(ПАУЗА)' : ''}</div>${tournBadge}<div class="timer ${timerColorClass}">${timeStr}</div><div style="font-size:28px; font-weight:800; color:var(--white); margin-bottom:15px;">${totalDisplay.toLocaleString()} ₸</div>${barHtml}${buttonsHtml}<button class="btn-outline" style="width:100%; margin-top:15px; border-color:var(--border); color:var(--gray);" onclick="addRes(${t.id})">+ ДОБАВИТЬ БРОНЬ</button>${resHtml}</div>`;
    }).join('');
}

function render() {
    let selectElem = document.getElementById('staff-select');
    if (!localAuth || !localAuth.isAuth) { 
        let html = '<option value="0">Султан</option><option value="1">Дидар</option><option value="owner">Хозяин</option>';
        toArr(cloudState.customAdmins).forEach((a, i) => { html += `<option value="custom_${a.id}">${a.name}</option>`; });
        if(selectElem && selectElem.innerHTML !== html) { let curVal = selectElem.value; selectElem.innerHTML = html; if (curVal && selectElem.querySelector(`option[value="${curVal}"]`)) { selectElem.value = curVal; } }
        let gApp = document.getElementById('guest-app'); let aScreen = document.getElementById('auth-screen'); let mainApp = document.getElementById('app');
        if (gApp && gApp.style.display !== 'block') { if(aScreen) aScreen.style.display='flex'; }
        if(mainApp) mainApp.style.display='none'; 
        return; 
    }
    
    document.getElementById('auth-screen').style.display='none'; 
    if(document.getElementById('guest-app')) document.getElementById('guest-app').style.display='none';
    document.getElementById('app').style.display='block';
    
    document.getElementById('user-display').innerText = localAuth.user.name;
    let isOwner = localAuth.user.role === 'owner';
    document.getElementById('owner-tab').style.display = isOwner ? 'block' : 'none';
    document.getElementById('acc-tab').style.display = isOwner ? 'block' : 'none';

    renderTables();
    renderGlobalStats();

    if(isOwner) {
        let allAdminsList = STAFF_HARDCODED.filter(s => s.role === 'admin').map(s => s.name);
        toArr(cloudState.customAdmins).forEach(a => allAdminsList.push(a.name));
        let adminSalariesHtml = '';
        allAdminsList.forEach(name => {
            let debt = (cloudState.ownerAcc && cloudState.ownerAcc[name]) ? cloudState.ownerAcc[name] : 0;
            adminSalariesHtml += `<div class="check-row"><div><b style="font-size:20px; color:var(--white);">${name}</b><br><span style="font-size:12px; color:var(--gray);">ДОЛГ К ВЫПЛАТЕ:</span> <b style="color:var(--green); font-size:28px; display:block; margin-top:8px;">${debt.toLocaleString()} ₸</b></div><div style="display:flex; flex-direction:column; gap:8px;"><button onclick="ui.prompt('Аванс', [{label:'Аванс для ${name} (Долг: ${debt}₸)', type:'number'}], (v)=>{if(!isNaN(parseInt(v[0]))){cloudState.ownerAcc['${name}']=debt-parseInt(v[0]);saveToCloud();render();}})" class="btn-outline" style="border-color:var(--green); color:var(--green); font-size:12px;">АВАНС</button><button onclick="ui.confirm('Выдать полный расчет?', ()=>{cloudState.ownerAcc['${name}']=0;saveToCloud();render();})" class="btn-gold" style="padding:12px; font-size:12px;">ПОЛНЫЙ РАСЧЕТ</button><button onclick="ui.prompt('Изменить баланс', [{label:'Новый баланс', type:'number', value:${debt}}], (v)=>{if(!isNaN(parseInt(v[0]))){cloudState.ownerAcc['${name}']=parseInt(v[0]);saveToCloud();render();}})" class="btn-outline" style="font-size:12px;">ИЗМЕНИТЬ ЦИФРУ</button><button onclick="ui.prompt('Штраф', [{label:'Сумма штрафа', type:'number'}], (v)=>{if(!isNaN(parseInt(v[0]))){cloudState.ownerAcc['${name}']=debt-parseInt(v[0]);saveToCloud();render();}})" class="btn-outline" style="border-color:var(--red); color:var(--red); font-size:12px;">ШТРАФ</button></div></div>`;
        });
        let salariesListEl = document.getElementById('admin-salaries-list');
        if (salariesListEl) salariesListEl.innerHTML = adminSalariesHtml;
    }

    let lowStockCount = toArr(cloudState.inventory).filter(i => (i.qty||0) < 5).length;
    let sBadge = document.getElementById('stock-badge');
    if(sBadge) { if(lowStockCount > 0) { sBadge.style.display = 'inline-flex'; sBadge.innerText = lowStockCount; } else { sBadge.style.display = 'none'; } }

    document.getElementById('active-checks').innerHTML = toArr(cloudState.checks).map((c, i) => { 
        let bHtml = toArr(c.bar).map(b => `${b.name}`).join(', '); 
        let vipBadge = c.isVip ? '<span class="vip-badge">VIP</span>' : '';
        let discountHtml = (c.discount && c.discount > 0) ? `<span style="color:var(--red); font-size:14px; font-weight:800; margin-left:10px;">-${c.discount}%</span>` : '';
        let timeInfo = (c.startTime && c.endTime && c.duration) ? `<br><span style="font-size:12px;color:var(--gray); font-weight:600;">🕒 ${c.startTime} - ${c.endTime} (${c.duration})</span>` : '';
        let adminButtons = `<button onclick="openEditCheckModal(${i})" class="btn-outline" style="border-color:#555; color:#aaa; font-size:11px;">⚙️ РЕДАКТИРОВАТЬ</button>`;
        if (isOwner) adminButtons += `<button onclick="deleteCheck(${i})" class="btn-outline" style="border-color:rgba(255,76,76,0.5); color:var(--red); font-size:11px;">🗑️ УДАЛИТЬ ЧЕК</button>`;
        return `<div class="check-row"><div style="flex:1;"><div><b style="font-size:22px; color:var(--gold);">${c.name}</b> ${vipBadge} <span style="font-size:12px;color:var(--gray);margin-left:10px;">${c.date}</span></div><div style="font-size:14px;color:var(--gray);margin-top:10px; line-height:1.4;">${c.details} (${c.timeCost} ₸) ${timeInfo} ${bHtml?`<br><span style="color:var(--white);">🍸 Бар: ${bHtml} (${c.barCost} ₸)</span>`:''}</div><div style="font-size:28px;font-weight:800;margin-top:15px; color:var(--white);">${c.total} ₸ ${discountHtml}</div></div><div style="display:flex; flex-direction:column; gap:8px;"><button onclick="openPayModal(${i})" class="btn-gold shadow-gold" style="padding:15px; border-radius:14px;">ОПЛАТА</button><button onclick="openFullCheck(${i})" class="btn-outline">📄 ЧЕК</button>${adminButtons}</div></div>`; 
    }).join('');
    
    document.getElementById('archive-list').innerHTML = toArr(cloudState.archive).slice().reverse().map(a => {
        let barInfo = ''; let bArr = toArr(a.bar); if(bArr.length>0) { let gr = {}; bArr.forEach(i=>{gr[i.name]=gr[i.name]||{q:0}; gr[i.name].q++;}); barInfo = Object.keys(gr).map(k=>`${k} x${gr[k].q}`).join(', '); }
        let timeInfo = a.startTime ? `🕒 ${a.startTime}-${a.endTime} (${a.duration})` : '';
        let histArr = toArr(cloudState.history); let lastZ = (histArr && histArr.length > 0) ? histArr[histArr.length - 1].timestamp : 0;
        const shiftFixTime = new Date(2026, 2, 20, 14, 0, 0).getTime(); if(lastZ < shiftFixTime) lastZ = shiftFixTime;
        
        let restoreBtn = (a.id > lastZ || isOwner) ? `<button onclick="restoreArchiveCheck(${a.id})" class="btn-outline" style="padding:6px 10px; font-size:11px; margin-right:8px; border-color:var(--gold-dim); color:var(--gold);">↩️ ВЕРНУТЬ В ЗАЛ</button>` : '';
        let delBtn = isOwner ? `<button onclick="deleteArchiveCheck(${a.id})" class="btn-red" style="padding:6px 10px; font-size:11px;">🗑️</button>` : '';
        return `<tr><td style="color:var(--gray); font-size:12px;">${a.date} ${a.endTime||''}</td><td><b style="color:var(--white); font-size:15px;">${a.name}</b></td><td style="font-size:12px; line-height:1.4;">${a.details}<br><span style="color:var(--gray);">${timeInfo}</span><br><span style="color:var(--gold);">${barInfo}</span></td><td>Столы: ${a.timeCost}₸<br>Бар: ${a.barCost}₸<br><b class="gold-text" style="font-size:18px;">${a.total} ₸</b></td><td><span style="background:#16261c; color:var(--green); padding:6px 10px; border-radius:8px; font-size:11px; font-weight:800;">${a.payMethod}</span></td><td><div style="display:flex;"><button onclick="openArchiveFullCheck(${a.id})" class="btn-outline" style="padding:6px 10px; font-size:11px; margin-right:8px;">📄 ЧЕК</button>${restoreBtn}${delBtn}</div></td></tr>`;
    }).join('');
    
    if(document.getElementById('tab-stock').style.display === 'block') { renderStockTab(); }
    if(document.getElementById('tab-debts').style.display === 'block') { renderDebtsTab(); }
    
    if(isOwner) {
        document.getElementById('vip-guests-list').innerHTML = toArr(cloudState.vips).map((v) => `<span style="background:rgba(212,175,55,0.1); border:1px solid var(--gold); padding:8px 15px; border-radius:8px; display:inline-flex; align-items:center; gap:10px; color:var(--gold); font-weight:700;">${v.name} <span class="vip-badge">-${v.discount}%</span> <span onclick="delVipGuest(${v.id})" style="color:var(--red); cursor:pointer; font-weight:bold; font-size:18px;">×</span></span>`).join('');
        document.getElementById('custom-admins-list').innerHTML = toArr(cloudState.customAdmins).map((a, i) => `<span style="background:#16261c; border:1px solid var(--border); padding:10px 18px; border-radius:12px; display:inline-flex; align-items:center; gap:12px; font-weight:600;">${a.name} <span onclick="delCustomAdmin(${i})" style="color:var(--red); cursor:pointer; font-weight:bold; font-size:18px;">×</span></span>`).join('');
        document.getElementById('blacklist-guests-list').innerHTML = toArr(cloudState.blacklist).map((b) => `<span style="background:rgba(255,76,76,0.1); border:1px solid var(--red); padding:8px 15px; border-radius:8px; display:inline-flex; align-items:center; gap:10px; color:var(--red); font-weight:700;">${b.name} <span style="color:#fff; font-size:11px; font-weight:normal;">(${b.reason})</span> <span onclick="delBlacklist(${b.id})" style="color:var(--white); cursor:pointer; font-weight:bold; font-size:18px;">×</span></span>`).join('');
    }
}
