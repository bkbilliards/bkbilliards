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

let serverTimeOffset = 0;
db.ref('.info/serverTimeOffset').on('value', snap => { serverTimeOffset = snap.val() || 0; });
const getNow = () => Date.now() + serverTimeOffset;

const STAFF_HARDCODED = [ { id: "0", name: "Султан", pin: "1111", role: "admin" }, { id: "1", name: "Дидар", pin: "1111", role: "admin" }, { id: "owner", name: "Хозяин", pin: "0000", role: "owner" } ];
let localAuth = { isAuth: false, user: null };
try { let stored = localStorage.getItem('sensei_auth_pro'); if (stored) localAuth = JSON.parse(stored); } catch(e) {}
if (!localAuth || typeof localAuth !== 'object') localAuth = { isAuth: false, user: null };

let cloudState = { tables: Array.from({length: 6}, (_, i) => ({ id: i + 1, active: false, start: null, res: [], bar: [], paused: false, accCost: 0, accTime: 0, isTournament: false })), checks: [], archive: [], inventory: [], debts: [], history: [], ownerAcc: {}, customAdmins: [], expenses: [], vips: [], onlineAdmins: {}, notifications: [], blacklist: [] };
let isDataLoaded = false; 

window.ui = {
    alert: function(msg) { let el = document.getElementById('ui-alert-text'); if(el) { el.innerText = msg; document.getElementById('ui-alert-modal').style.display = 'flex'; } else alert(msg); },
    confirm: function(msg, onYes) { let el = document.getElementById('ui-confirm-text'); if(el) { el.innerText = msg; document.getElementById('ui-confirm-yes').onclick = () => { document.getElementById('ui-confirm-modal').style.display = 'none'; onYes(); }; document.getElementById('ui-confirm-modal').style.display = 'flex'; } else { if(confirm(msg)) onYes(); } },
    prompt: function(title, fields, onConfirm) { 
        let titleEl = document.getElementById('ui-prompt-title'); 
        if(titleEl) { 
            titleEl.innerText = title; let html = ''; 
            fields.forEach((f, i) => { html += `<div class="input-group"><label>${f.label}</label><input type="${f.type||'text'}" id="ui-prompt-input-${i}" value="${f.value||''}"></div>`; }); 
            document.getElementById('ui-prompt-body').innerHTML = html; 
            document.getElementById('ui-prompt-btn').onclick = () => { 
                let vals = fields.map((f, i) => document.getElementById(`ui-prompt-input-${i}`).value.trim()); 
                if(vals.some(v => !v)) return ui.alert('Заполните все поля!'); 
                document.getElementById('ui-prompt-modal').style.display = 'none'; 
                setTimeout(() => onConfirm(vals), 50); 
            }; 
            document.getElementById('ui-prompt-modal').style.display = 'flex'; 
        } else { let res = prompt(title + " (" + fields[0].label + ")"); if(res) setTimeout(() => onConfirm([res]), 50); } 
    }
};

function toArr(data) { if (!data) return []; if (Array.isArray(data)) return data; return Object.values(data); }

dbRef.on('value', snap => {
    if (snap.exists() && snap.val()) {
        let data = snap.val(); 
        cloudState.tables = toArr(data.tables).filter(x=>x).map(t => ({...t, res: toArr(t.res), bar: toArr(t.bar)}));
        cloudState.checks = toArr(data.checks).filter(x=>x).map(c => ({...c, bar: toArr(c.bar), sessions: toArr(c.sessions)}));
        cloudState.archive = toArr(data.archive).filter(x=>x).map(c => ({...c, bar: toArr(c.bar), sessions: toArr(c.sessions)}));
        cloudState.inventory = toArr(data.inventory).filter(x=>x); 
        cloudState.debts = toArr(data.debts).filter(x=>x).map(d => ({...d, history: toArr(d.history)})); 
        cloudState.history = toArr(data.history).filter(x=>x); 
        cloudState.customAdmins = toArr(data.customAdmins).filter(x=>x); 
        cloudState.expenses = toArr(data.expenses).filter(x=>x); 
        cloudState.vips = toArr(data.vips).filter(x=>x); 
        cloudState.ownerAcc = data.ownerAcc || {}; 
        cloudState.onlineAdmins = data.onlineAdmins || {}; 
        cloudState.blacklist = toArr(data.blacklist).filter(x=>x);
    } 
    isDataLoaded = true; 
    const urlParams = new URLSearchParams(window.location.search);
    if(urlParams.get('guest') === 'true') { if(document.getElementById('guest-app') && document.getElementById('guest-app').style.display !== 'block') showGuestPage(); else renderGuestTables(); } else { render(); }
});

function saveToCloud() { if (!isDataLoaded) return; dbRef.set(cloudState).catch(e => console.error(e)); }
function saveLocalAuth() { localStorage.setItem('sensei_auth_pro', JSON.stringify(localAuth)); }

function getShiftStartTime() {
    let hist = toArr(cloudState.history).sort((a,b)=>a.timestamp - b.timestamp); 
    let fakeStart = new Date(2026, 2, 21, 14, 0, 0).getTime();
    let fakeEnd = new Date(2026, 2, 22, 10, 0, 0).getTime();
    hist = hist.filter(h => h.timestamp < fakeStart || h.timestamp > fakeEnd);
    let lastZ = (hist.length > 0) ? hist[hist.length - 1].timestamp : 0;
    if (lastZ < fakeStart && getNow() < fakeEnd) { lastZ = fakeStart; }
    return lastZ;
}

function getActiveAdminName() {
    let lastZ = getShiftStartTime();
    let currentChecks = toArr(cloudState.archive).filter(c => (c.paidAt || c.id) > lastZ && (c.admin||"") !== 'Хозяин');
    if (currentChecks.length > 0) return currentChecks[currentChecks.length - 1].admin;
    let now = getNow(); let online = toArr(cloudState.customAdmins).map(a=>a.name).concat(['Султан', 'Дидар']);
    for(let a of online) { if(cloudState.onlineAdmins && cloudState.onlineAdmins[a] && (now - cloudState.onlineAdmins[a] < 300000)) return a; }
    return 'Султан'; 
}

window.onload = () => { 
    const urlParams = new URLSearchParams(window.location.search); if(urlParams.get('guest') === 'true') showGuestPage(); else render(); 
    setInterval(() => { 
        try { 
            if(localAuth && localAuth.isAuth) { renderTables(); renderOnlineAdmins(); renderGlobalStats(); let bm = document.getElementById('table-bill-modal'); if(bm && bm.style.display === 'flex') renderTableBill(); } 
            else if (document.getElementById('guest-app') && document.getElementById('guest-app').style.display === 'block') { renderGuestTables(); } 
            else { render(); } 
        } catch(err) { console.error(err); }
    }, 1000); 
    setInterval(() => { if(localAuth && localAuth.isAuth && localAuth.user && localAuth.user.name && isDataLoaded) { dbRef.child('onlineAdmins/' + localAuth.user.name).set(getNow()); } }, 30000);
};

window.showGuestPage = function() { document.getElementById('auth-screen').style.display = 'none'; if(document.getElementById('app')) document.getElementById('app').style.display = 'none'; document.getElementById('guest-app').style.display = 'block'; let today = new Date().toISOString().split('T')[0]; if(document.getElementById('guest-date')) document.getElementById('guest-date').value = today; renderGuestTables(); }
window.renderGuestTables = function() { if(!cloudState.tables) return; let html = ''; toArr(cloudState.tables).forEach(t => { let status = t.active ? '<span style="color:var(--red); font-weight:800; font-size:16px;">🔴 ЗАНЯТ</span>' : '<span style="color:var(--green); font-weight:800; font-size:16px;">🟢 СВОБОДЕН</span>'; let resHtml = ''; if(t.res && toArr(t.res).length > 0) { let times = toArr(t.res).map(r => r.split('|')[0].trim()).join(', '); resHtml = `<div style="margin-top:15px; font-size:13px; font-weight:700; color:var(--gold); background:rgba(212,175,55,0.1); padding:8px; border-radius:8px;">⏳ Бронь: ${times}</div>`; } html += `<div class="guest-table-card"><h3 style="margin:0 0 15px; color:var(--white); font-size:22px; font-weight:900;">СТОЛ ${t.id}</h3>${status}${resHtml}</div>`; }); let el = document.getElementById('guest-tables-list'); if(el) el.innerHTML = html; }
window.submitGuestReservation = function() { let name = document.getElementById('guest-name').value.trim(); let phone = document.getElementById('guest-phone').value.trim(); let date = document.getElementById('guest-date').value; let time = document.getElementById('guest-time').value; let tableId = parseInt(document.getElementById('guest-table-num').value); if(!name || !phone || !date || !time) return ui.alert("Пожалуйста, заполните все поля!"); let dParts = date.split('-'); let shortDate = `${dParts[2]}.${dParts[1]}`; let resString = `${shortDate}, ${time} | ${name} (${phone})`; cloudState.tables = toArr(cloudState.tables); let t = cloudState.tables.find(x => x.id === tableId); if(t) { t.res = toArr(t.res); t.res.push(resString); saveToCloud(); ui.alert("Успешно! Ваша бронь отправлена."); document.getElementById('guest-name').value = ''; document.getElementById('guest-phone').value = ''; document.getElementById('guest-time').value = ''; renderGuestTables(); } }
window.submitGuestCall = function() { let tableId = document.getElementById('guest-call-table').value; cloudState.notifications = toArr(cloudState.notifications); cloudState.notifications.push({ id: getNow(), table: tableId, time: new Date(getNow()).toLocaleTimeString().slice(0,5) }); saveToCloud(); document.getElementById('guest-call-modal').style.display = 'none'; ui.alert("Администратор уведомлен!"); }
window.dismissNotification = function(id) { cloudState.notifications = toArr(cloudState.notifications).filter(n => n.id !== id); saveToCloud(); render(); }

window.login = function() {
    const val = document.getElementById('staff-select').value; const pin = document.getElementById('pass-input').value;
    let user = STAFF_HARDCODED.find(s => s.id === val) || toArr(cloudState.customAdmins).find(a => "custom_"+a.id === val);
    if (user && user.pin === pin) { localAuth = { isAuth: true, user: user, shiftStart: new Date().toLocaleString() }; saveLocalAuth(); document.getElementById('pass-input').value = ""; document.getElementById('auth-error').style.display = 'none'; if(isDataLoaded) dbRef.child('onlineAdmins/' + user.name).set(getNow()); render(); } 
    else { document.getElementById('auth-error').style.display = 'block'; }
}
window.logout = function() { document.getElementById('z-report-modal').style.display = 'flex'; }

function getCurrentShiftData() {
    let lastZ = getShiftStartTime();
    let currentChecks = toArr(cloudState.archive).filter(c => (c.paidAt || c.id) > lastZ); 
    let currentExp = toArr(cloudState.expenses).filter(e => e.id > lastZ);
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
    toArr(cloudState.checks).forEach(c => { moneyOnTables += (c.total || 0); }); 

    let totalDebts = toArr(cloudState.debts).reduce((s, d) => s + d.total, 0); let totalAdminOwed = 0; let adminDebtsDetails = '';
    let allAdminsList = STAFF_HARDCODED.filter(s => s.role === 'admin').map(s => s.name); toArr(cloudState.customAdmins).forEach(a => allAdminsList.push(a.name));
    allAdminsList.forEach(name => { let val = (cloudState.ownerAcc && cloudState.ownerAcc[name]) ? cloudState.ownerAcc[name] : 0; totalAdminOwed += val; if(val > 0) adminDebtsDetails += `${name}: ${val.toLocaleString()} ₸ | `; }); if(adminDebtsDetails.length > 0) adminDebtsDetails = adminDebtsDetails.slice(0, -3);

    let shiftZp = 0; if(!isOwner) { shiftZp = Math.round(shift.total * 0.08) + 6000; }
    let accZp = (cloudState.ownerAcc && cloudState.ownerAcc[localAuth.user.name]) ? cloudState.ownerAcc[localAuth.user.name] : 0;

    let html = `<button onclick="document.getElementById('expense-modal').style.display='flex'" class="btn-expense">➖ РАСХОД</button>`;
    if (isOwner) { html += `<div class="global-stat-item"><div class="stat-label">АКТИВНЫЕ СТОЛЫ</div><div class="stat-value gold-text" style="font-size:32px;">${activeTablesCount} / 6</div><div style="font-size:11px; color:var(--gray); margin-top:5px; font-weight:bold;">Ждут оплаты: ${moneyOnTables.toLocaleString()} ₸</div></div><div class="global-stat-item"><div class="stat-label">ВЫРУЧКА СМЕНЫ</div><div class="stat-value">${shift.total.toLocaleString()} ₸</div><div style="font-size:11px; color:var(--gray); margin-top:5px; font-weight:bold;">Нал: ${shift.cash.toLocaleString()} | QR: ${shift.qr.toLocaleString()}</div></div><div class="global-stat-item"><div class="stat-label" style="color:var(--red);">ДОЛГИ КЛУБУ</div><div class="stat-value" style="color:var(--red);">${totalDebts.toLocaleString()} ₸</div></div><div class="global-stat-item" style="border-right: none;"><div class="stat-label" style="color:var(--gold);">ДОЛГ ПО ЗП АДМИНАМ</div><div class="stat-value" style="color:var(--gold);">${totalAdminOwed.toLocaleString()} ₸</div><div style="font-size:10px; color:var(--gray); margin-top:5px;">${adminDebtsDetails || 'Долгов нет'}</div></div>`; } 
    else { html += `<div class="global-stat-item"><div class="stat-label">ВЫРУЧКА СМЕНЫ</div><div class="stat-value gold-text">${shift.total.toLocaleString()} ₸</div><div style="font-size:11px; color:var(--gray); margin-top:5px; font-weight:bold;">Нал: ${shift.cash.toLocaleString()} | QR: ${shift.qr.toLocaleString()}</div></div><div class="global-stat-item"><div class="stat-label">ЖДУТ ОПЛАТЫ</div><div class="stat-value">${moneyOnTables.toLocaleString()} ₸</div><div style="font-size:11px; color:var(--gray); margin-top:5px; font-weight:bold;">Столы + Чеки</div></div><div class="global-stat-item"><div class="stat-label">МОЯ ЗП СМЕНЫ</div><div class="stat-value">${shiftZp.toLocaleString()} ₸</div></div><div class="global-stat-item" style="border-right: none;"><div class="stat-label" style="color:var(--green);">МОЙ БАЛАНС (К ВЫПЛАТЕ)</div><div class="stat-value" style="color:var(--green);">${(accZp + shiftZp).toLocaleString()} ₸</div></div>`; }
    let statsBar = document.getElementById('dynamic-global-stats'); if(statsBar) statsBar.innerHTML = html;
}

window.confirmZReport = function() {
    let physicalCash = parseInt(document.getElementById('z-cash-input').value) || 0; let shift = getCurrentShiftData(); let diff = physicalCash - shift.expectedCash;
    let salary = 0; if (localAuth.user.role !== 'owner') { salary = Math.round(shift.total * 0.08) + 6000; }
    let activeAdmin = localAuth.user.role === 'owner' ? getActiveAdminName() : localAuth.user.name;
    cloudState.history = toArr(cloudState.history);
    cloudState.history.push({ id: getNow(), admin: activeAdmin, start: localAuth.shiftStart, end: new Date(getNow()).toLocaleString(), timestamp: getNow(), barRev: shift.bar, tableRev: shift.table, total: shift.total, sal: salary, expectedCash: shift.expectedCash, physicalCash: physicalCash, diff: diff, cashRev: shift.cash, qrRev: shift.qr, expTotal: shift.expTotal, debtReturns: shift.debtReturns, debtIssued: shift.debtIssued, checksCount: shift.checksCount, barCostTotal: shift.barCostTotal });
    if(localAuth.user.role !== 'owner') { if(!cloudState.ownerAcc) cloudState.ownerAcc = {}; cloudState.ownerAcc[activeAdmin] = (cloudState.ownerAcc[activeAdmin] || 0) + salary; }
    saveToCloud(); localAuth = { isAuth: false, user: null }; saveLocalAuth(); 
    let diffMsg = diff < 0 ? `НЕДОСТАЧА: ${diff} ₸` : (diff > 0 ? `ИЗЛИШЕК: +${diff} ₸` : `КАССА ИДЕАЛЬНА`); ui.alert(`Смена закрыта.\nОжидалось наличных: ${shift.expectedCash} ₸\nВ кассе: ${physicalCash} ₸\n${diffMsg}`); setTimeout(()=>location.reload(), 3000);
}

window.saveExpense = function() {
    let sum = parseInt(document.getElementById('exp-sum').value); let desc = document.getElementById('exp-desc').value; let catEl = document.getElementById('exp-category'); let cat = catEl ? catEl.value : 'Расход';
    if(!sum || !desc) return ui.alert("Заполните все поля!");
    let activeAdmin = localAuth.user.role === 'owner' ? getActiveAdminName() : localAuth.user.name;
    let fullDesc = `[${cat}] ${desc}`; cloudState.expenses = toArr(cloudState.expenses); cloudState.expenses.push({ id: getNow(), sum: sum, desc: fullDesc, admin: activeAdmin, date: new Date(getNow()).toLocaleString() }); document.getElementById('expense-modal').style.display='none'; saveToCloud(); render(); ui.alert("Расход записан на смену " + activeAdmin);
}

function calcCost(start, isTournament) { 
    if(!start) return 0; let startTime = Number(start); let endTime = getNow(); if(endTime < startTime) return 0;
    if (isTournament) { let diffHours = (endTime - startTime) / 3600000; return Math.ceil((diffHours * 1500) / 50) * 50; } 
    else { let totalCost = 0; let currentMs = startTime; while (currentMs < endTime) { let h = new Date(currentMs).getHours(); let ratePerHour = (h >= 11 && h < 18) ? 2000 : 3000; totalCost += ratePerHour / 60; currentMs += 60000; } return Math.ceil(totalCost / 50) * 50; }
}
function formatTime(ms) { if(!ms || ms<0) ms=0; let s = Math.floor(ms / 1000); let h = String(Math.floor(s / 3600)).padStart(2, '0'); let m = String(Math.floor((s % 3600) / 60)).padStart(2, '0'); let sec = String(s % 60).padStart(2, '0'); return `${h}:${m}:${sec}`; }

window.startTable = function(id) { cloudState.tables = toArr(cloudState.tables); let t = cloudState.tables.find(x => x.id === id); if(t) { t.active = true; t.start = getNow(); t.bar = []; t.paused = false; t.accCost = 0; t.accTime = 0; t.isTournament = false; saveToCloud(); render(); } }
window.pauseTable = function(id) { cloudState.tables = toArr(cloudState.tables); let t = cloudState.tables.find(x => x.id === id); if(t && t.active && !t.paused) { t.paused = true; t.accCost = (t.accCost || 0) + calcCost(t.start, t.isTournament); t.accTime = (t.accTime || 0) + (getNow() - Number(t.start)); t.start = null; saveToCloud(); render(); } }
window.resumeTable = function(id) { cloudState.tables = toArr(cloudState.tables); let t = cloudState.tables.find(x => x.id === id); if(t && t.active && t.paused) { t.paused = false; t.start = getNow(); saveToCloud(); render(); } }
window.toggleTournament = function(id) { cloudState.tables = toArr(cloudState.tables); let t = cloudState.tables.find(x => x.id === id); if(t && t.active) { t.isTournament = !t.isTournament; saveToCloud(); render(); } }

window.editTableTime = function(id) {
    let t = cloudState.tables.find(x => x.id === id); if (!t || !t.active) return;
    let currentMs = t.paused ? (t.accTime || 0) : ((t.accTime || 0) + (getNow() - Number(t.start))); let currentMins = Math.floor(currentMs / 60000);
    ui.prompt('Изменить время', [{label: `Сыграно минут (сейчас ${currentMins})`, type: 'number', value: currentMins}], (vals) => {
        let newMins = parseInt(vals[0]); if (isNaN(newMins) || newMins < 0) return ui.alert("Некорректное время!");
        let newMs = newMins * 60000; cloudState.tables = toArr(cloudState.tables); let tableToUpdate = cloudState.tables.find(x => x.id === id);
        if (tableToUpdate.paused) { tableToUpdate.accTime = newMs; tableToUpdate.accCost = calcCost(getNow() - newMs, tableToUpdate.isTournament); } 
        else { tableToUpdate.start = getNow() - newMs; tableToUpdate.accTime = 0; tableToUpdate.accCost = 0; }
        saveToCloud(); render(); ui.alert(`Время стола ${id} успешно изменено на ${newMins} мин.`);
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
        let name = vals[0]; let t = cloudState.tables.find(x => x.id === id); let currentCost = t.paused ? 0 : calcCost(t.start, t.isTournament); let totalCost = (t.accCost || 0) + currentCost; 
        createOrMergeCheck(name, id, totalCost, toArr(t.bar)); 
        t.start = getNow(); t.bar = []; t.paused = false; t.accCost = 0; t.accTime = 0; 
        document.getElementById('table-manage-modal').style.display = 'none';
        saveToCloud(); render(); ui.alert(`Счет стола ${id} закрыт на гостя "${name}". Время пошло заново!`);
    });
}

let stoppingTableId = null;
window.openStopTableModal = function(id) { 
    stoppingTableId = id; let t = cloudState.tables.find(x => x.id === id); document.getElementById('stop-table-id').innerText = id; document.getElementById('stop-new-name').value = '';
    let select = document.getElementById('stop-merge-select'); let options = `<option value="">-- Выберите чек (если хотите объединить) --</option>`;
    toArr(cloudState.checks).forEach(c => { options += `<option value="${c.id}">${c.name || 'Гость'} (${c.details})</option>`; }); select.innerHTML = options; document.getElementById('stop-table-modal').style.display = 'flex';
}

// ИСПРАВЛЕНИЕ: ЖЕЛЕЗОБЕТОННЫЙ СТОП
window.confirmStopTable = function() {
    let t = cloudState.tables.find(x => x.id === stoppingTableId);
    let newName = document.getElementById('stop-new-name').value.trim(); let mergeId = document.getElementById('stop-merge-select').value; let finalName = "";
    if (mergeId) { let c = cloudState.checks.find(x => x.id == mergeId); if (c) finalName = c.name; } else if (newName) { finalName = newName; } else { return ui.alert("Введите имя ИЛИ выберите чек для объединения!"); }
    let isBlacklisted = toArr(cloudState.blacklist).find(b => (b.name||"").toLowerCase() === finalName.toLowerCase()); if (isBlacklisted) ui.alert(`⚠️ ВНИМАНИЕ!\nГость "${finalName}" находится в ЧЕРНОМ СПИСКЕ!\nПричина: ${isBlacklisted.reason}`);
    
    let currentCost = t.paused ? 0 : calcCost(t.start, t.isTournament); let totalCost = (t.accCost || 0) + currentCost; 
    
    // 1. Формируем чек локально (БЕЗ СОХРАНЕНИЯ)
    createOrMergeCheck(finalName, t.id, totalCost, toArr(t.bar)); 
    
    // 2. Обнуляем стол локально
    t.active = false; t.start = null; t.bar = []; t.paused = false; t.accCost = 0; t.accTime = 0; t.isTournament = false; 
    
    // 3. Закрываем окно
    document.getElementById('stop-table-modal').style.display = 'none'; 
    
    // 4. ОДИН раз сохраняем и чек, и выключенный стол (ЗАЩИТА ОТ ГОНКИ ДАННЫХ)
    saveToCloud(); render(); 
}

window.moveTable = function(fromId) {
    ui.prompt('Пересадка', [{label: 'Номер нового стола (1-6)', type: 'number'}], (vals) => {
        let toId = parseInt(vals[0]); cloudState.tables = toArr(cloudState.tables); let tFrom = cloudState.tables.find(x => x.id === fromId); let tTo = cloudState.tables.find(x => x.id === toId);
        if(!tTo) return ui.alert("Такого стола нет!"); if(tTo.active) return ui.alert("Этот стол уже занят!");
        tTo.active = true; tTo.start = tFrom.start; tTo.bar = toArr(tFrom.bar); tTo.paused = tFrom.paused; tTo.accCost = tFrom.accCost; tTo.accTime = tFrom.accTime; tTo.isTournament = tFrom.isTournament; tFrom.active = false; tFrom.start = null; tFrom.bar = []; tFrom.paused = false; tFrom.accCost = 0; tFrom.accTime = 0; tFrom.isTournament = false; saveToCloud(); render();
    });
}
window.addRes = function(id) { ui.prompt('Бронь стола', [{label: 'Имя, Время (например: Аскар 19:00)'}], (vals) => { cloudState.tables = toArr(cloudState.tables); let t = cloudState.tables.find(x => x.id === id); t.res = toArr(t.res); t.res.push(vals[0]); saveToCloud(); render(); }); }
window.editRes = function(tId, rIdx) { cloudState.tables = toArr(cloudState.tables); let t = cloudState.tables.find(x => x.id === tId); ui.prompt('Изменить бронь', [{label: 'Данные брони', value: t.res[rIdx]}], (vals) => { t.res[rIdx] = vals[0]; saveToCloud(); render(); }); }
window.delRes = function(tId, rIdx) { ui.confirm("Удалить бронь?", () => { cloudState.tables = toArr(cloudState.tables); let t = cloudState.tables.find(x => x.id === tId); t.res.splice(rIdx,1); saveToCloud(); render(); }); }

let currentStockCategory = 'Все';
window.setStockCat = function(cat, btnElem) { currentStockCategory = cat; document.querySelectorAll('.stock-cat-btn').forEach(btn => { if(btn.innerText.trim() === btnElem.innerText.trim() || (cat==='Кухня' && btn.innerText.includes('Кухня'))) btn.classList.add('active'); else btn.classList.remove('active'); }); renderStockTab(); }
window.renderStockTab = function() {
    let invArr = toArr(cloudState.inventory); invArr.sort((a, b) => (a.name||"").localeCompare(b.name||""));
    if(currentStockCategory !== 'Все') { invArr = invArr.filter(i => (i.category || 'Прочее') === currentStockCategory); }
    let searchQ = document.getElementById('global-stock-search').value.toLowerCase(); if(searchQ) { invArr = invArr.filter(i => (i.name||"").toLowerCase().includes(searchQ)); }
    let isOwner = localAuth && localAuth.user && localAuth.user.role === 'owner';
    document.getElementById('stock-list').innerHTML = invArr.map((i) => {
        let q = i.qty || 0; let colorClass = q > 0 ? "var(--white)" : "var(--red)"; let rowClass = q < 5 ? "low-stock-row" : ""; 
        let stockBtns = isOwner ? `<button onclick="editItemQty('${i.name}')" class="btn-outline" style="padding:5px 8px; font-size:10px;">✏️ КОЛ-ВО</button><button onclick="editItemCategory('${i.name}')" class="btn-outline" style="padding:5px 8px; font-size:10px;">✏️ КАТЕГ</button><button onclick="renameItem('${i.name}')" class="btn-outline" style="padding:5px 8px; font-size:10px;">✏️ ИМЯ</button><button onclick="editItemPrice('${i.name}')" class="btn-outline" style="padding:5px 8px; font-size:10px;">✏️ ЦЕНА</button><button onclick="delItem('${i.name}')" class="btn-outline" style="padding:5px 8px; font-size:10px; border-color:rgba(255,76,76,0.5); color:var(--red);">❌</button>` : '';
        return `<tr class="${rowClass}"><td><b style="color:${colorClass}; font-size:15px;">${i.name}</b><br><span style="font-size:10px; color:var(--gold-dim);">${i.category||'Прочее'}</span></td><td><b style="font-size:18px; color:${colorClass};">${q} шт</b></td><td style="color:var(--gray); font-size:12px;">Закуп: ${i.cost||0} ₸</td><td class="gold-text"><b style="font-size:16px;">${i.price} ₸</b></td><td style="display:flex; gap:5px; flex-wrap:wrap;">${stockBtns}</td></tr>`;
    }).join('');
}
window.openSupplierModal = function() { try { let invArr = toArr(cloudState.inventory); let lowStock = invArr.filter(i => (i.qty||0) <= 10).sort((a, b) => (a.name||"").localeCompare(b.name||"")); let text = `ЗАЯВКА НА ЗАКУП (${new Date(getNow()).toLocaleDateString()}):\n\n`; lowStock.forEach(i => { text += `- ${i.name} (Остаток: ${i.qty||0}) — Нужно: ____ шт\n`; }); document.getElementById('supplier-order-text').value = text; document.getElementById('supplier-modal').style.display = 'flex'; } catch(e) { ui.alert("Окно заявки поставщику не найдено."); } }
window.copySupplierOrder = function() { let text = document.getElementById('supplier-order-text').value; navigator.clipboard.writeText(text).then(() => { ui.alert("Заявка скопирована!"); }).catch(err => { ui.alert("Не удалось скопировать."); }); }
window.editItemCategory = function(name) { cloudState.inventory = toArr(cloudState.inventory); let item = cloudState.inventory.find(i=>i.name===name); ui.prompt('Категория', [{label:'(Напитки, Кухня, Сигареты, Прочее)', value:item.category||'Прочее'}], (vals) => { item.category = vals[0]; saveToCloud(); renderStockTab(); }); }
window.editItemQty = function(name) { cloudState.inventory = toArr(cloudState.inventory); let item = cloudState.inventory.find(i=>i.name===name); ui.prompt('Количество', [{label:'Остаток', type:'number', value:item.qty||0}], (vals) => { item.qty = parseInt(vals[0]); saveToCloud(); renderStockTab(); }); }
window.renameItem = function(name) { cloudState.inventory = toArr(cloudState.inventory); let item = cloudState.inventory.find(i=>i.name===name); ui.prompt('Название', [{label:'Имя', value:item.name}], (vals) => { item.name = vals[0]; saveToCloud(); renderStockTab(); }); }
window.editItemPrice = function(name) { cloudState.inventory = toArr(cloudState.inventory); let item = cloudState.inventory.find(i=>i.name===name); ui.prompt('Цены', [{label:'Закуп (₸)', type:'number', value:item.cost||0}, {label:'Продажа (₸)', type:'number', value:item.price}], (vals) => { item.cost = parseInt(vals[0])||0; item.price = parseInt(vals[1]); saveToCloud(); renderStockTab(); }); }
window.delItem = function(name) { ui.confirm(`Удалить товар "${name}"?`, () => { cloudState.inventory = toArr(cloudState.inventory); let idx = cloudState.inventory.findIndex(i=>i.name===name); cloudState.inventory.splice(idx,1); saveToCloud(); renderStockTab(); }); }
window.saveNewItem = function() { const name = document.getElementById('new-item-name').value.trim(); const cost = parseInt(document.getElementById('new-item-cost').value) || 0; const price = parseInt(document.getElementById('new-item-price').value); const qty = parseInt(document.getElementById('new-item-qty').value); const cat = document.getElementById('new-item-category').value; if(!name || isNaN(price) || isNaN(qty)) { ui.alert("Заполните все поля корректно!"); return; } cloudState.inventory = toArr(cloudState.inventory); cloudState.inventory.push({name: name, cost: cost, price: price, qty: qty, category: cat}); document.getElementById('add-item-modal').style.display = 'none'; saveToCloud(); renderStockTab(); }

let barContext = null; let currentBarCategory = 'Все';
window.openBarModal = function(context) { barContext = context; currentBarCategory = 'Все'; document.getElementById('bar-modal').style.display = 'flex'; document.getElementById('bar-search').value = ''; updateBarCategoryUI(); renderBarSearch(); }
window.setBarCat = function(cat, btnElem) { currentBarCategory = cat; updateBarCategoryUI(); renderBarSearch(); }
function updateBarCategoryUI() { let btns = document.querySelectorAll('.bar-cat-btn'); btns.forEach(btn => { if(btn.innerText.trim() === currentBarCategory || (currentBarCategory==='Кухня' && btn.innerText.includes('Кухня'))) btn.classList.add('active'); else btn.classList.remove('active'); }); }
window.renderBarSearch = function() {
    let invArr = toArr(cloudState.inventory).filter(i => (i.qty||0) > 0); 
    if(currentBarCategory !== 'Все') { invArr = invArr.filter(i => (i.category || 'Прочее') === currentBarCategory); }
    invArr.sort((a, b) => (a.name||"").localeCompare(b.name||"")); const q = document.getElementById('bar-search').value.toLowerCase(); 
    document.getElementById('bar-items-list').innerHTML = invArr.filter(i => (i.name||"").toLowerCase().includes(q)).map(i => `<div class="bar-item-row" onclick="selectBarItem('${i.name}')"><span>${i.name}</span><span class="stock-ok">${i.price} ₸ (${i.qty||0} шт)</span></div>`).join(''); 
}

window.selectBarItem = function(itemName) {
    cloudState.inventory = toArr(cloudState.inventory); let item = cloudState.inventory.find(x => x.name === itemName); if((item.qty||0) <= 0) return ui.alert("Товар закончился!");
    ui.prompt('Добавить в счет', [{label:`Кол-во: ${item.name} (Остаток: ${item.qty||0})`, type:'number', value:'1'}], (vals) => {
        let qty = parseInt(vals[0]); if (isNaN(qty) || qty <= 0 || qty > (item.qty||0)) return ui.alert("Некорректное количество!"); item.qty -= qty;
        if (barContext === 'owner') { document.getElementById('bar-modal').style.display = 'none'; saveToCloud(); render(); ui.alert(`Списано на Хозяина: ${item.name}`); return; }
        let itemsToAdd = []; for(let i = 0; i < qty; i++) itemsToAdd.push({name: item.name, cost: item.cost||0, price: item.price});
        
        if(barContext === 'standalone') { 
            ui.prompt('Имя гостя', [{label:'Для кого бар?'}], (nameVals) => { 
                let name = nameVals[0]; if(!name) { ui.alert("Имя не введено!"); return; }
                let isBlacklisted = toArr(cloudState.blacklist).find(b => (b.name||"").toLowerCase() === name.toLowerCase()); 
                if (isBlacklisted) ui.alert(`⚠️ ВНИМАНИЕ! Гость "${name}" в ЧЕРНОМ СПИСКЕ!\nПричина: ${isBlacklisted.reason}`); 
                // Создаем локально
                createOrMergeCheck(name, "Бар", 0, itemsToAdd); 
                document.getElementById('bar-modal').style.display = 'none'; 
                // СОХРАНЯЕМ ЕДИНАЖДЫ ТУТ
                saveToCloud(); render();
            });
        } else { 
            cloudState.tables = toArr(cloudState.tables); let t = cloudState.tables.find(x => x.id === barContext); 
            t.bar = toArr(t.bar).concat(itemsToAdd); document.getElementById('bar-modal').style.display = 'none'; saveToCloud(); render(); 
        }
    });
}
let editTableId = null;
window.openEditTableBar = function(id) { editTableId = id; let t = toArr(cloudState.tables).find(x => x.id === id); let html = toArr(t.bar).map((b, i) => `<div class="edit-bar-item"><span>${b.name} (${b.price} ₸)</span> <button onclick="removeTableBarItem(${i})" class="btn-outline" style="color:var(--red); border-color:var(--red); padding:3px 8px; font-size:10px;">❌</button></div>`).join(''); document.getElementById('edit-table-bar-list').innerHTML = html || '<span style="color:var(--gray); font-size:12px;">Пусто</span>'; document.getElementById('edit-table-bar-modal').style.display = 'flex'; }
window.removeTableBarItem = function(idx) { ui.confirm("Убрать товар? Он вернется на склад.", () => { cloudState.tables = toArr(cloudState.tables); let t = cloudState.tables.find(x => x.id === editTableId); t.bar = toArr(t.bar); let item = t.bar.splice(idx, 1)[0]; cloudState.inventory = toArr(cloudState.inventory); let invItem = cloudState.inventory.find(x => x.name === item.name); if(invItem) { invItem.qty = (invItem.qty||0) + 1; } saveToCloud(); openEditTableBar(editTableId); render(); }); }

function createOrMergeCheck(name, tableId, timeCost, barItems) {
    cloudState.checks = toArr(cloudState.checks); let bArr = toArr(barItems); let barTotal = bArr.reduce((s, i) => s + i.price, 0); 
    let exist = cloudState.checks.find(c => (c.name||"").toLowerCase() === (name||"").toLowerCase()); 
    const now = new Date(getNow()); const timeStr = now.getHours().toString().padStart(2,'0') + ":" + now.getMinutes().toString().padStart(2,'0');
    
    let t = toArr(cloudState.tables).find(x => x.id === tableId); 
    let startStr = t && t.start ? new Date(Number(t.start)).getHours().toString().padStart(2,'0') + ":" + new Date(Number(t.start)).getMinutes().toString().padStart(2,'0') : timeStr; 
    let diffMins = 0; if (t && t.start) { diffMins = Math.floor((getNow() - Number(t.start)) / 60000); }
    let sessionStr = tableId === "Бар" ? `[Бар] ${timeStr}: ${barTotal} ₸` : `[Стол ${tableId}] ${startStr} - ${timeStr} (${diffMins} мин): ${timeCost} ₸`;

    if(exist) { 
        exist.timeCost += timeCost; exist.barCost += barTotal; if(bArr.length > 0) exist.bar = toArr(exist.bar).concat(bArr); 
        exist.sessions = toArr(exist.sessions); if(timeCost > 0 || tableId === "Бар" || bArr.length > 0) exist.sessions.push(sessionStr);
        applyVipLogic(exist); exist.endTime = timeStr; 
    } else { 
        let duration = "0ч 0м"; if(t && t.start) { let diff = getNow() - Number(t.start); duration = Math.floor(diff/3600000) + "ч " + Math.floor((diff%3600000)/60000) + "м"; } 
        let activeAdmin = localAuth.user.role === 'owner' ? getActiveAdminName() : localAuth.user.name;
        let sessionsArr = []; if(timeCost > 0 || tableId === "Бар" || bArr.length > 0) sessionsArr.push(sessionStr);
        let newCheck = { id: getNow(), name: name, table: tableId, date: now.toLocaleDateString(), startTime: startStr, endTime: timeStr, duration: duration, timeCost: timeCost, barCost: barTotal, bar: bArr, total: timeCost + barTotal, discount: 0, sessions: sessionsArr, details: `Стол ${tableId}`, admin: activeAdmin }; 
        applyVipLogic(newCheck); cloudState.checks.push(newCheck); 
    }
    // Функция больше НЕ СОХРАНЯЕТ сама по себе. Вызывающая функция должна вызвать saveToCloud(). Это решает баг!
}

window.deleteCheck = function(idx) { ui.confirm("Вы точно хотите безвозвратно УДАЛИТЬ этот чек?\nВсе товары бара из него будут возвращены на склад.", () => { cloudState.checks = toArr(cloudState.checks); cloudState.inventory = toArr(cloudState.inventory); let c = cloudState.checks[idx]; if(c.bar && toArr(c.bar).length > 0) { toArr(c.bar).forEach(bItem => { let invItem = cloudState.inventory.find(x => x.name === bItem.name); if(invItem) { invItem.qty = (invItem.qty||0) + 1; } else cloudState.inventory.push({name: bItem.name, cost: bItem.cost||0, price: bItem.price, qty: 1}); }); } cloudState.checks.splice(idx, 1); saveToCloud(); render(); }); }
let editingCheckIdx = null;

window.openEditCheckModal = function(idx) { 
    editingCheckIdx = idx; let c = toArr(cloudState.checks)[idx]; document.getElementById('edit-check-name').value = c.name; document.getElementById('edit-check-time').value = c.timeCost; renderEditCheckData(); document.getElementById('edit-check-modal').style.display = 'flex'; 
}
window.adjustCheckTimeModal = function() {
    ui.prompt('Корректировка времени', [{label: 'Сколько минут добавить? (с минусом: -15)', type: 'number'}, {label: 'По какому тарифу? (1 - 2000₸/ч, 2 - 3000₸/ч, 3 - 1500₸/ч)', type: 'number', value: '2'}], (vals) => {
        let mins = parseInt(vals[0]); if(isNaN(mins)) return ui.alert("Некорректное количество минут!");
        let rate = 3000; if(vals[1] === '1') rate = 2000; if(vals[1] === '3') rate = 1500;
        let diffCost = Math.round(mins * (rate / 60)); diffCost = Math.ceil(diffCost / 50) * 50; 
        let currentInput = document.getElementById('edit-check-time'); let currentCost = parseInt(currentInput.value) || 0; let newCost = currentCost + diffCost; if(newCost < 0) newCost = 0; currentInput.value = newCost;
        ui.alert(`Сумма пересчитана!\nРазница: ${diffCost > 0 ? '+' : ''}${diffCost} ₸.\nИтого: ${newCost} ₸.\n\nНажмите "СОХРАНИТЬ ИЗМЕНЕНИЯ", чтобы применить.`);
    });
}
window.addForgottenTableSession = function() {
    ui.prompt('Добавить забытый стол', [{label: 'Номер стола', type:'number'},{label: 'Начало (например 14:00)'},{label: 'Конец (например 15:30)'},{label: 'Сумма (₸)', type:'number'}], (vals) => {
        let table = vals[0]; let start = vals[1]; let end = vals[2]; let cost = parseInt(vals[3]);
        if(!table || !start || !end || isNaN(cost)) return ui.alert("Заполните все поля правильно!");
        let c = cloudState.checks[editingCheckIdx]; c.sessions = toArr(c.sessions); c.sessions.push(`[Стол ${table}] ${start} - ${end}: ${cost} ₸`);
        let currentInput = document.getElementById('edit-check-time'); currentInput.value = (parseInt(currentInput.value)||0) + cost;
        ui.alert("Стол добавлен! Нажмите СОХРАНИТЬ ИЗМЕНЕНИЯ."); renderEditCheckData();
    });
}
window.removeSession = function(idx) { ui.confirm("Удалить этот сеанс?", () => { let c = cloudState.checks[editingCheckIdx]; c.sessions = toArr(c.sessions); c.sessions.splice(idx, 1); saveToCloud(); renderEditCheckData(); }); }
function renderEditCheckData() { 
    let c = toArr(cloudState.checks)[editingCheckIdx]; 
    let barHtml = toArr(c.bar).map((b, i) => `<div class="edit-bar-item"><span>${b.name} (${b.price} ₸)</span> <button onclick="removeBarItemFromCheck(${i})" class="btn-outline" style="color:var(--red); border-color:var(--red); padding:5px 10px;">❌</button></div>`).join(''); 
    document.getElementById('edit-check-bar-list').innerHTML = barHtml || '<span style="color:var(--gray); font-size:12px;">Пусто</span>'; 
    let sessHtml = toArr(c.sessions).map((s, i) => `<div style="display:flex; justify-content:space-between; margin-bottom:5px; color:var(--gold-dim); font-size:12px;"><span>${s}</span><span onclick="removeSession(${i})" style="color:var(--red);cursor:pointer;">❌</span></div>`).join(''); document.getElementById('edit-check-sessions-list').innerHTML = sessHtml || 'Нет сеансов';
}
window.removeBarItemFromCheck = function(itemIdx) { ui.confirm("Убрать товар из чека? Он вернется на склад.", () => { cloudState.checks = toArr(cloudState.checks); let c = cloudState.checks[editingCheckIdx]; c.bar = toArr(c.bar); let item = c.bar.splice(itemIdx, 1)[0]; c.barCost -= item.price; applyVipLogic(c); cloudState.inventory = toArr(cloudState.inventory); let invItem = cloudState.inventory.find(x => x.name === item.name); if(invItem) { invItem.qty = (invItem.qty||0) + 1; } saveToCloud(); renderEditCheckData(); }); }
window.saveCheckEdit = function() { let checks = toArr(cloudState.checks); let c = checks[editingCheckIdx]; let newName = document.getElementById('edit-check-name').value; if (newName.toLowerCase() !== (c.name||"").toLowerCase()) { let existingIdx = checks.findIndex(chk => (chk.name||"").toLowerCase() === newName.toLowerCase() && chk.id !== c.id); if (existingIdx !== -1) { ui.confirm(`Чек с именем "${newName}" уже есть. Объединить их?`, () => { let ex = checks[existingIdx]; ex.timeCost += (parseInt(document.getElementById('edit-check-time').value) || 0); ex.barCost += c.barCost; let cBarArr = toArr(c.bar); if(cBarArr.length > 0) ex.bar = toArr(ex.bar).concat(cBarArr); ex.sessions = toArr(ex.sessions).concat(toArr(c.sessions)); applyVipLogic(ex); checks.splice(editingCheckIdx, 1); cloudState.checks = checks; document.getElementById('edit-check-modal').style.display = 'none'; saveToCloud(); render(); }); return; } } c.name = newName; c.timeCost = parseInt(document.getElementById('edit-check-time').value) || 0; applyVipLogic(c); cloudState.checks = checks; document.getElementById('edit-check-modal').style.display = 'none'; saveToCloud(); render(); }

// === ОПЛАТА ===
let currentCheckIndex = null;
window.openPayModal = function(idx) { currentCheckIndex = idx; let c = toArr(cloudState.checks)[idx]; let origTotal = c.timeCost + c.barCost; document.getElementById('split-info').style.display = 'none'; if(c.discount && c.discount > 0) { document.getElementById('pay-total').innerHTML = `<span style="text-decoration:line-through; font-size:24px; color:var(--gray);">${origTotal} ₸</span><br>${c.total} ₸`; document.getElementById('pay-info').innerText = `${c.name} | ${c.details} (Скидка ${c.discount}%)`; } else { document.getElementById('pay-total').innerText = c.total + " ₸"; document.getElementById('pay-info').innerText = `${c.name} | ${c.details}`; } document.getElementById('pay-main-buttons').style.display = 'flex'; document.getElementById('mix-pay-section').style.display = 'none'; document.getElementById('pay-modal').style.display = 'flex'; }
window.applyDiscount = function(pct) { cloudState.checks = toArr(cloudState.checks); let c = cloudState.checks[currentCheckIndex]; c.discount = pct; if (pct === 100) { c.timeCost = 0; c.barCost = 0; c.total = 0; c.details += " [СВОИ/ХОЗЯИН]"; document.getElementById('pay-total').innerText = "0 ₸"; document.getElementById('pay-info').innerText = `${c.name} | ${c.details} (100%)`; } else { let origTotal = c.timeCost + c.barCost; if(pct === 0) { c.total = origTotal; document.getElementById('pay-total').innerText = c.total + " ₸"; document.getElementById('pay-info').innerText = `${c.name} | ${c.details}`; } else { c.total = Math.round(origTotal * (1 - pct / 100)); document.getElementById('pay-total').innerHTML = `<span style="text-decoration:line-through; font-size:24px; color:var(--gray);">${origTotal} ₸</span><br>${c.total} ₸`; document.getElementById('pay-info').innerText = `${c.name} | ${c.details} (Скидка ${pct}%)`; } } if (document.getElementById('mix-pay-section').style.display === 'block') { calcMixQr(); } document.getElementById('split-info').style.display = 'none'; saveToCloud(); render(); }

window.processPayment = function(method) { 
    cloudState.checks = toArr(cloudState.checks); let c = cloudState.checks[currentCheckIndex]; c.payMethod = method; 
    c.paidAt = getNow(); // ИСПРАВЛЕНИЕ: Точное время оплаты
    let activeAdmin = localAuth.user.role === 'owner' ? getActiveAdminName() : localAuth.user.name; c.admin = activeAdmin; 
    if(method === 'Долг') { cloudState.debts = toArr(cloudState.debts); let d = cloudState.debts.find(x => (x.name||"").toLowerCase() === (c.name||"").toLowerCase()); let histStr = `+${c.total}₸ (${new Date(getNow()).toLocaleString()}, Админ: ${activeAdmin})`; if(d) { d.total += c.total; d.history = toArr(d.history); d.history.push(histStr); d.timestamp = getNow(); if(!d.admin) d.admin = activeAdmin; } else { cloudState.debts.push({ name: c.name, total: c.total, history: [histStr], timestamp: getNow(), admin: activeAdmin }); } } 
    cloudState.archive = toArr(cloudState.archive); cloudState.archive.push(c); cloudState.checks.splice(currentCheckIndex, 1); document.getElementById('pay-modal').style.display = 'none'; saveToCloud(); render(); 
}

window.showMixPay = function() { document.getElementById('pay-main-buttons').style.display = 'none'; document.getElementById('mix-pay-section').style.display = 'block'; document.getElementById('mix-cash-input').value = ''; document.getElementById('mix-qr-val').innerText = toArr(cloudState.checks)[currentCheckIndex].total; }
window.hideMixPay = function() { document.getElementById('pay-main-buttons').style.display = 'flex'; document.getElementById('mix-pay-section').style.display = 'none'; }
window.calcMixQr = function() { let t = toArr(cloudState.checks)[currentCheckIndex].total; let c = parseInt(document.getElementById('mix-cash-input').value) || 0; let q = t - c; document.getElementById('mix-qr-val').innerText = q < 0 ? 0 : q; }
window.fillMix = function(type) { let c = toArr(cloudState.checks)[currentCheckIndex]; let discRatio = 1 - (c.discount || 0) / 100; let tCost = Math.round(c.timeCost * discRatio); let bCost = c.total - tCost; if(type === 'timeCash') { document.getElementById('mix-cash-input').value = tCost; } else if (type === 'barCash') { document.getElementById('mix-cash-input').value = bCost; } calcMixQr(); }
window.confirmMixPay = function() { let t = toArr(cloudState.checks)[currentCheckIndex].total; let c = parseInt(document.getElementById('mix-cash-input').value) || 0; let q = t - c; if (c < 0 || q < 0) return ui.alert("Некорректная сумма наличных!"); processPayment(`Нал: ${c}₸ / QR: ${q}₸`); }
window.splitPayment = function(n) { let t = toArr(cloudState.checks)[currentCheckIndex].total; let perPerson = Math.ceil(t / n); document.getElementById('split-info').innerHTML = `Сумма на ${n}х: <b class="gold-text">${perPerson.toLocaleString()} ₸</b> с каждого`; document.getElementById('split-info').style.display = 'block'; }

window.payPartialDebt = function() {
    let t = toArr(cloudState.checks)[currentCheckIndex].total;
    ui.prompt('Частично в долг', [{label: `Сумма ОПЛАТЫ (из ${t} ₸)`, type: 'number'}, {label: 'Метод оплаты (Нал / QR)', value: 'Нал'}], (vals) => {
        let paid = parseInt(vals[0]); if (isNaN(paid) || paid < 0 || paid >= t) return ui.alert("Сумма должна быть меньше общей!");
        let method = vals[1] || 'Наличные'; let debtAmount = t - paid; let c = cloudState.checks[currentCheckIndex]; let activeAdmin = localAuth.user.role === 'owner' ? getActiveAdminName() : localAuth.user.name;
        cloudState.debts = toArr(cloudState.debts); let d = cloudState.debts.find(x => (x.name||"").toLowerCase() === (c.name||"").toLowerCase()); let histStr = `+${debtAmount}₸ (Остаток с чека, Админ: ${activeAdmin})`;
        if (d) { d.total += debtAmount; d.history = toArr(d.history); d.history.push(histStr); d.timestamp = getNow(); } else { cloudState.debts.push({ name: c.name, total: debtAmount, history: [histStr], timestamp: getNow(), admin: activeAdmin }); }
        c.payMethod = method; c.admin = activeAdmin; c.total = paid; c.details += ` (В долг: ${debtAmount}₸)`; c.paidAt = getNow(); cloudState.archive = toArr(cloudState.archive); cloudState.archive.push(c); cloudState.checks.splice(currentCheckIndex, 1); document.getElementById('pay-modal').style.display = 'none'; saveToCloud(); render(); ui.alert(`Оплата ${paid} ₸ принята.\n${debtAmount} ₸ переведено в ДОЛГИ.`);
    });
}

window.renderDebtsTab = function() {
    let debtsArr = toArr(cloudState.debts); let searchQ = document.getElementById('debts-search').value.toLowerCase(); if(searchQ) { debtsArr = debtsArr.filter(d => (d.name||"").toLowerCase().includes(searchQ)); }
    document.getElementById('debts-list').innerHTML = debtsArr.map((d) => {
        let originalIndex = toArr(cloudState.debts).findIndex(x => x.name === d.name); let ts = d.timestamp || Date.now(); let deadline = ts + (15 * 24 * 60 * 60 * 1000); let diff = deadline - Date.now();
        let warningHtml = ''; let penaltyBtn = ''; let isOwner = localAuth.user && localAuth.user.role === 'owner';
        if (d.needsConfirmation) { if (isOwner) penaltyBtn = `<button onclick="confirmDebtReturn(${originalIndex})" class="btn-gold shadow-gold" style="width:100%; margin-top:8px; font-size:12px;">✅ ПОДТВЕРДИТЬ</button>`; } 
        else if (diff < 0 && d.total > 0) { let daysOver = Math.floor(Math.abs(diff) / (1000 * 60 * 60 * 24)); warningHtml = `<br><span style="display:inline-block; margin-top:5px; background:rgba(255,76,76,0.1); color:var(--red); padding:4px 8px; border-radius:6px; font-size:11px; font-weight:800;">⚠️ ПРОСРОЧЕНО: ${daysOver} дн.</span>`; if(isOwner) penaltyBtn = `<button onclick="deductDebtFromAdmin(${originalIndex})" class="btn-outline" style="border-color:var(--red); color:var(--red); margin-top:8px; width:100%; font-size:11px;">УДЕРЖАТЬ С АДМИНА</button>`; } 
        else if (d.total > 0) { let dLeft = Math.floor(diff / (1000 * 60 * 60 * 24)); let hLeft = Math.floor((diff / (1000 * 60 * 60)) % 24); warningHtml = `<br><span style="display:inline-block; margin-top:5px; background:rgba(212,175,55,0.1); color:var(--gold); padding:4px 8px; border-radius:6px; font-size:11px; font-weight:700;">⏳ До расчета: ${dLeft} дн. ${hLeft} ч.</span>`; }
        let delBtn = isOwner ? `<button onclick="delDebt(${originalIndex})" class="btn-outline" style="border-color:rgba(255,76,76,0.5); color:var(--red); width:100%; margin-top:8px; font-size:11px;">УДАЛИТЬ ДОЛГ</button>` : ''; let payBtn = '';
        if (d.needsConfirmation) { payBtn = `<span style="display:block; text-align:center; background:rgba(46,204,113,0.1); border:1px solid var(--green); color:var(--green); padding:10px; border-radius:10px; font-size:12px; font-weight:800;">✅ ОПЛАЧЕНО<br><span style="font-size:10px; font-weight:500;">Ждет проверки Хозяина</span></span>`; } 
        else if (d.total > 0) { payBtn = `<button onclick="payDebt(${originalIndex})" class="btn-outline" style="border-color:var(--green); color:var(--green); width:100%; font-size:13px;">ВНЕСТИ РАСЧЕТ</button>`; }
        let lastZ = getShiftStartTime(); let isFreshDebt = (d.timestamp > lastZ && d.total > 0); let returnCheckBtn = isFreshDebt ? `<button onclick="restoreDebtCheck(${originalIndex})" class="btn-outline" style="border-color:var(--gold-dim); color:var(--gold); width:100%; margin-top:8px; font-size:11px;">↩️ ОТМЕНИТЬ (ОШИБКА)</button>` : '';
        return `<tr><td><b class="gold-text" style="font-size:18px;">${d.name}</b><br><span style="font-size:11px; color:var(--gray);">Выдал: <b style="color:var(--white);">${d.admin || 'Неизвестно'}</b></span>${warningHtml}</td><td style="color:var(--red); font-weight:800; font-size:24px;">${d.total.toLocaleString()} ₸</td><td><span style="font-size:12px; color:var(--gray); line-height:1.5;">${toArr(d.history).join('<br>')}</span></td><td style="text-align:right; vertical-align:middle; width:180px;">${payBtn}${penaltyBtn}${returnCheckBtn}${delBtn}</td></tr>`;
    }).join('');
}
window.payDebt = function(idx) { cloudState.debts = toArr(cloudState.debts); let d = cloudState.debts[idx]; ui.prompt('Погашение долга', [{label: 'Сколько вносит клиент? (Долг: ' + d.total + ' ₸)', type: 'number'}, {label: 'Метод оплаты (Нал/QR)', value: 'Нал'}], (vals) => { let sum = parseInt(vals[0]); if(isNaN(sum) || sum <= 0 || sum > d.total) return ui.alert("Некорректная сумма!"); let method = vals[1] || 'Наличные'; let comm = Math.round(sum * 0.08); if (d.admin) { if(!cloudState.ownerAcc) cloudState.ownerAcc = {}; cloudState.ownerAcc[d.admin] = (cloudState.ownerAcc[d.admin] || 0) + comm; ui.alert(`Админу "${d.admin}" начислено 8% (${comm} ₸) на баланс.`); } d.total -= sum; let timeStr = new Date(getNow()).toLocaleTimeString().slice(0,5); d.history = toArr(d.history); d.history.push(`Оплата: -${sum}₸ (${new Date(getNow()).toLocaleDateString()} ${timeStr}, ${method})`); let activeAdmin = localAuth.user.role === 'owner' ? getActiveAdminName() : localAuth.user.name; cloudState.archive = toArr(cloudState.archive); cloudState.archive.push({ id: getNow(), name: "Возврат долга: " + d.name, table: "ДОЛГ", date: new Date(getNow()).toLocaleDateString(), timeCost: 0, barCost: 0, total: sum, payMethod: method, admin: activeAdmin, details: "Погашение долга", isDebtPayment: true, paidAt: getNow() }); if(d.total <= 0) { d.needsConfirmation = true; ui.alert("Долг оплачен. Ждет подтверждения Хозяина."); } saveToCloud(); renderDebtsTab(); render(); }); }
window.confirmDebtReturn = function(idx) { ui.confirm("Вы забрали деньги из кассы? Подтвердить и удалить долг навсегда?", () => { cloudState.debts = toArr(cloudState.debts); cloudState.debts.splice(idx, 1); saveToCloud(); renderDebtsTab(); render(); }); }
window.deductDebtFromAdmin = function(idx) { cloudState.debts = toArr(cloudState.debts); let d = cloudState.debts[idx]; ui.confirm(`Удержать долг (${d.total} ₸) из ЗП администратора ${d.admin || 'Неизвестно'}?`, () => { if(d.admin) { if(!cloudState.ownerAcc) cloudState.ownerAcc = {}; cloudState.ownerAcc[d.admin] = (cloudState.ownerAcc[d.admin] || 0) - d.total; } d.total = 0; d.history = toArr(d.history); d.history.push(`УДЕРЖАНО С АДМИНА: ${d.admin}`); saveToCloud(); ui.alert("Долг успешно удержан из ЗП!"); renderDebtsTab(); render(); }); }
window.delDebt = function(idx) { ui.confirm("Хозяин, удалить этот долг навсегда?", () => { cloudState.debts = toArr(cloudState.debts); cloudState.debts.splice(idx,1); saveToCloud(); renderDebtsTab(); render(); }); }

window.gAdv = function(n, d) { ui.prompt('Аванс', [{label:`Аванс для ${n}`, type:'number'}], v=>{ let x=parseInt(v[0]); if(!isNaN(x)&&x>0){cloudState.ownerAcc[n]=d-x;saveToCloud();render();} }); };
window.cBal = function(n) { ui.prompt('Баланс', [{label:'Новый баланс', type:'number'}], v=>{ let x=parseInt(v[0]); if(!isNaN(x)){cloudState.ownerAcc[n]=x;saveToCloud();render();} }); };
window.iPen = function(n, d) { ui.prompt('Штраф', [{label:'Сумма штрафа', type:'number'}], v=>{ let x=parseInt(v[0]); if(!isNaN(x)&&x>0){cloudState.ownerAcc[n]=d-x;saveToCloud();render();} }); };
window.fPay = function(n) { ui.confirm(`Расчет ${n}?`, ()=>{cloudState.ownerAcc[n]=0;saveToCloud();render();}); };

window.addCustomAdmin = function() { ui.prompt('Новый администратор', [{label:'Имя'}, {label:'PIN-код', type:'number'}], (vals) => { cloudState.customAdmins = toArr(cloudState.customAdmins); cloudState.customAdmins.push({id: getNow(), name: vals[0], pin: vals[1], role: "admin"}); saveToCloud(); render(); }); }
window.resetDatabase = function() { ui.confirm("ОЧИСТИТЬ БАЗУ ПОЛНОСТЬЮ?", () => { cloudState = { tables: Array.from({length: 6}, (_, i) => ({ id: i + 1, active: false, start: null, res: [], bar:[], paused: false, accCost: 0, accTime: 0, isTournament: false })), checks: [], archive: [], inventory: [], debts: [], history: [], ownerAcc: {}, customAdmins: [], expenses:[], vips: [], onlineAdmins: {}, notifications: [], blacklist: [] }; saveToCloud(); location.reload(); }); }
window.addVipGuest = function() { ui.prompt('VIP Гость', [{label:'Имя'}, {label:'Скидка (%)', type:'number'}], (vals) => { let name = vals[0]; let disc = parseInt(vals[1]); if(isNaN(disc) || disc < 0 || disc > 100) return ui.alert("Неверная скидка"); cloudState.vips = toArr(cloudState.vips); let exist = cloudState.vips.find(v => (v.name||"").toLowerCase() === name.toLowerCase()); if(exist) exist.discount = disc; else cloudState.vips.push({id: getNow(), name: name, discount: disc}); saveToCloud(); ui.alert(`VIP гость ${name} добавлен со скидкой ${disc}%!`); render(); }); }
window.delVipGuest = function(id) { ui.confirm("Удалить VIP гостя?", () => { cloudState.vips = toArr(cloudState.vips).filter(v => v.id !== id); saveToCloud(); render(); }); }
window.addBlacklist = function() { ui.prompt('Черный список', [{label:'Имя проблемного гостя'}, {label:'Причина (за что?)'}], (vals) => { cloudState.blacklist = toArr(cloudState.blacklist); cloudState.blacklist.push({id: getNow(), name: vals[0], reason: vals[1]}); saveToCloud(); ui.alert(`Гость ${vals[0]} добавлен в Черный список!`); render(); }); }
window.delBlacklist = function(id) { ui.confirm("Удалить из черного списка?", () => { cloudState.blacklist = toArr(cloudState.blacklist).filter(b => b.id !== id); saveToCloud(); render(); }); }
function applyVipLogic(check) { let vips = toArr(cloudState.vips); let vip = vips.find(v => (v.name||"").toLowerCase() === (check.name||"").toLowerCase()); if (vip) { check.discount = vip.discount; check.isVip = true; } else { check.isVip = false; } let baseTot = check.timeCost + check.barCost; check.total = check.discount ? Math.round(baseTot * (1 - check.discount/100)) : baseTot; }
window.showTab = function(id, btn) { document.querySelectorAll('.tab-pane').forEach(x => x.style.display = 'none'); document.querySelectorAll('.nav-link').forEach(x => x.classList.remove('active')); document.getElementById('tab-'+id).style.display = 'block'; btn.classList.add('active'); if(id === 'stock') renderStockTab(); if(id === 'debts') renderDebtsTab(); }

let accPeriod = 'today'; window.setAccPeriod = function(period, btn) { accPeriod = period; document.querySelectorAll('.acc-filter').forEach(x => x.classList.remove('active')); btn.classList.add('active'); renderAccounting(); }
window.exportToExcel = function() {
    if(currentFilteredHistory.length === 0) return ui.alert("Нет данных для скачивания за этот период."); let csv = '\uFEFF'; csv += "АДМИН;ДАТА НАЧАЛА;ДАТА КОНЦА;КОЛ-ВО ЧЕКОВ;БАР (ТНГ);СЕБЕСТОИМОСТЬ БАРА (ТНГ);СТОЛЫ (ТНГ);РАСХОДЫ/ИЗЪЯТИЯ (ТНГ);ВЫДАНО В ДОЛГ (ТНГ);ВОЗВРАТ ДОЛГОВ (ТНГ);ОЖИДАЕМАЯ КАССА (ТНГ);ФАКТ В КАССЕ (ТНГ);РАЗНИЦА КАССЫ (ТНГ);ВЫДАНО ЗП (ТНГ);ИСТИННАЯ ПРИБЫЛЬ ХОЗЯИНА (ТНГ)\n";
    currentFilteredHistory.forEach(h => { let net = (h.total||0) - (h.sal||0) - (h.expTotal||0) - (h.barCostTotal||0); csv += `${h.admin};${h.start};${h.end};${h.checksCount||0};${h.barRev||0};${h.barCostTotal||0};${h.tableRev||0};${h.expTotal||0};${h.debtIssued||0};${h.debtReturns||0};${h.expectedCash||0};${h.physicalCash||0};${h.diff||0};${h.sal||0};${net}\n`; }); let a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = `Бухгалтерия_SENSEI_${accPeriod}.csv`; a.click();
}
function renderAccounting() {
    let histArr = toArr(cloudState.history); if(histArr.length === 0) return; const nowTime = getNow(); const todayStr = new Date(nowTime).toLocaleDateString();
    currentFilteredHistory = histArr.filter(h => { if(accPeriod === 'all') return true; let shiftDateStr = h.timestamp ? new Date(h.timestamp).toLocaleDateString() : h.end.split(',')[0].trim(); if(accPeriod === 'today') return shiftDateStr === todayStr; if(!h.timestamp) return true; let diffDays = (nowTime - h.timestamp) / (1000 * 60 * 60 * 24); if(accPeriod === 'week') return diffDays <= 7; if(accPeriod === 'month') return diffDays <= 30; if(accPeriod === 'year') return diffDays <= 365; return true; });
    let tRev = 0, bRev = 0, tblRev = 0, sal = 0, expTotal = 0; let debtRet = 0, debtIss = 0, checksCount = 0, barCostTot = 0; let adminStats = {};
    currentFilteredHistory.forEach(h => { tRev += (h.total || 0); bRev += (h.barRev || 0); tblRev += (h.tableRev || 0); sal += (h.sal || 0); expTotal += (h.expTotal || 0); debtRet += (h.debtReturns || 0); debtIss += (h.debtIssued || 0); checksCount += (h.checksCount || 0); barCostTot += (h.barCostTotal || 0); if(!adminStats[h.admin]) adminStats[h.admin] = 0; adminStats[h.admin] += (h.total || 0); });
    document.getElementById('acc-trev').innerText = tRev.toLocaleString() + " ₸"; document.getElementById('acc-bar-cost').innerText = barCostTot.toLocaleString() + " ₸"; document.getElementById('acc-sal').innerText = (sal + expTotal).toLocaleString() + " ₸"; let netProfit = tRev - sal - expTotal - barCostTot; document.getElementById('acc-net').innerText = netProfit.toLocaleString() + " ₸";
    let avgCheck = checksCount > 0 ? Math.round(tRev / checksCount) : 0; let barPct = tRev > 0 ? Math.round((bRev / tRev) * 100) : 0; let tblPct = tRev > 0 ? Math.round((tblRev / tRev) * 100) : 0; let topAdmin = "---"; let maxRev = 0; for(let a in adminStats) { if(adminStats[a] > maxRev) { maxRev = adminStats[a]; topAdmin = a; } }
    let avgCheckEl = document.getElementById('acc-avg-check'); if(avgCheckEl) avgCheckEl.innerText = avgCheck.toLocaleString() + " ₸"; let accDebtRetEl = document.getElementById('acc-debt-ret'); if(accDebtRetEl) accDebtRetEl.innerText = debtRet.toLocaleString() + " ₸"; let accDebtIssEl = document.getElementById('acc-debt-iss'); if(accDebtIssEl) accDebtIssEl.innerText = debtIss.toLocaleString() + " ₸"; let accChecksCountEl = document.getElementById('acc-checks-count'); if(accChecksCountEl) accChecksCountEl.innerText = checksCount; let accBarPctEl = document.getElementById('acc-bar-pct'); if(accBarPctEl) accBarPctEl.innerText = barPct + "%"; let accTblPctEl = document.getElementById('acc-tbl-pct'); if(accTblPctEl) accTblPctEl.innerText = tblPct + "%"; let accTopAdminEl = document.getElementById('acc-top-admin'); if(accTopAdminEl) accTopAdminEl.innerText = topAdmin;
    document.getElementById('history-list').innerHTML = currentFilteredHistory.slice().reverse().map(h => { let diffColor = h.diff < 0 ? 'var(--red)' : (h.diff > 0 ? 'var(--green)' : 'var(--gray)'); let zReportHtml = h.expectedCash !== undefined ? `<br><span style="font-size:10px; color:${diffColor};">Нал: ${h.physicalCash} (Разница: ${h.diff})</span>` : ''; return `<tr><td><b>${h.admin}</b></td><td><span style="font-size:11px; color:var(--gray);">${h.start} - ${h.end}</span></td><td><span style="font-size:11px; color:var(--gray);">Нал: ${h.cashRev||0}<br>QR: ${h.qrRev||0}</span></td><td><b class="gold-text">${h.total} ₸</b>${zReportHtml}</td><td><b style="color:var(--green);">${h.sal} ₸</b></td><td><button onclick="deleteHistory(${h.timestamp})" class="btn-red" style="padding:6px 10px; font-size:12px; width:auto;">🗑️</button></td></tr>`; }).join('');
}
window.deleteHistory = function(ts) { ui.confirm("Удалить эту смену из архива?", () => { cloudState.history = toArr(cloudState.history).filter(h => h.timestamp !== ts); saveToCloud(); renderAccounting(); }); }
