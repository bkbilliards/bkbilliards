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

let localAuth = JSON.parse(localStorage.getItem('sensei_auth_pro')) || { isAuth: false, user: null };

let cloudState = { 
    tables: Array.from({length: 6}, (_, i) => ({ id: i + 1, active: false, start: null, res: [], bar: [] })), 
    checks: [], archive: [], inventory: [], debts: [], history: [], ownerAcc: {}, customAdmins: [], expenses: [], vips: [], stockLog: [] 
};

db.ref('.info/connected').on('value', snap => { const el = document.getElementById('sync-status'); if(el) el.innerText = snap.val() ? '🟢' : '🔴'; });

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
        cloudState.stockLog = toArr(data.stockLog);
        cloudState.ownerAcc = data.ownerAcc || {};
    } else {
        saveToCloud();
    }
    render();
});

function saveToCloud() { dbRef.set(cloudState).catch(e => console.error(e)); }
function saveLocalAuth() { localStorage.setItem('sensei_auth_pro', JSON.stringify(localAuth)); }

function logStock(action, itemName, qtyChange) {
    cloudState.stockLog = toArr(cloudState.stockLog);
    cloudState.stockLog.push({
        id: Date.now(), date: new Date().toLocaleString(), admin: localAuth.user ? localAuth.user.name : 'Гость',
        action: action, item: itemName, qtyChange: qtyChange
    });
    if (cloudState.stockLog.length > 100) cloudState.stockLog.shift();
}

window.onload = () => { 
    render(); 
    setInterval(() => { 
        if(localAuth.isAuth) {
            renderTables();
            if(document.getElementById('table-bill-modal') && document.getElementById('table-bill-modal').style.display === 'flex') {
                renderTableBill();
            }
        } else {
            render(); 
        }
    }, 1000); 
};

// === ЛОГИКА САЙТА ГОСТЕЙ ===
window.showGuestPage = function() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('guest-app').style.display = 'block';
    let today = new Date().toISOString().split('T')[0];
    document.getElementById('guest-date').value = today;
}

window.hideGuestPage = function() {
    document.getElementById('guest-app').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'flex';
}

window.submitGuestReservation = function() {
    let name = document.getElementById('guest-name').value.trim();
    let phone = document.getElementById('guest-phone').value.trim();
    let date = document.getElementById('guest-date').value;
    let time = document.getElementById('guest-time').value;
    let tableId = parseInt(document.getElementById('guest-table-num').value);

    if(!name || !phone || !date || !time) return alert("Пожалуйста, заполните все поля!");

    let dParts = date.split('-');
    let shortDate = `${dParts[2]}.${dParts[1]}`;
    let resString = `${shortDate}, ${time} | ${name} (${phone})`;

    cloudState.tables = toArr(cloudState.tables);
    let t = cloudState.tables.find(x => x.id === tableId);
    if(t) {
        t.res = toArr(t.res);
        t.res.push(resString);
        saveToCloud();
        alert("Успешно! Ваша бронь отправлена администратору.");
        document.getElementById('guest-name').value = '';
        document.getElementById('guest-phone').value = '';
        document.getElementById('guest-time').value = '';
    }
}
// =============================

window.login = function() {
    const val = document.getElementById('staff-select').value;
    const pin = document.getElementById('pass-input').value;
    let user = STAFF_HARDCODED.find(s => s.id === val) || toArr(cloudState.customAdmins).find(a => "custom_"+a.id === val);

    if (user && user.pin === pin) {
        localAuth = { isAuth: true, user: user, shiftStart: new Date().toLocaleString() };
        saveLocalAuth(); document.getElementById('pass-input').value = ""; document.getElementById('auth-error').style.display = 'none'; render();
    } else { document.getElementById('auth-error').style.display = 'block'; }
}

function getCurrentShiftData() {
    let hist = toArr(cloudState.history);
    let lastZ = (hist && hist.length > 0) ? hist[hist.length - 1].timestamp : 0;
    let currentChecks = toArr(cloudState.archive).filter(c => c.id > lastZ);
    let currentExp = toArr(cloudState.expenses).filter(e => e.id > lastZ);
    
    let cash = 0, qr = 0, table = 0, bar = 0, total = 0, salaryBase = 0;
    
    currentChecks.forEach(c => {
        if (c.payMethod === 'Долг') return; 

        let cTot = c.total || 0;
        total += cTot; 
        
        if (!c.isDebtPayment) {
            salaryBase += cTot; 
        }
        
        if (c.payMethod === 'Наличные') cash += cTot;
        else if (c.payMethod === 'QR') qr += cTot;
        else if (c.payMethod && c.payMethod.startsWith('Нал:')) {
            let mCash = c.payMethod.match(/Нал:\s*(\d+)/); let mQr = c.payMethod.match(/QR:\s*(\d+)/);
            if(mCash) cash += parseInt(mCash[1]); if(mQr) qr += parseInt(mQr[1]);
        }
        
        let discRatio = 1 - (c.discount || 0)/100;
        table += Math.round((c.timeCost || 0) * discRatio);
        bar += cTot - Math.round((c.timeCost || 0) * discRatio);
    });
    
    let expTotal = currentExp.reduce((s, e) => s + e.sum, 0);
    return { cash, qr, table, bar, total, salaryBase, expTotal, expectedCash: cash - expTotal };
}

window.logout = function() { document.getElementById('z-report-modal').style.display = 'flex'; }

window.confirmZReport = function() {
    let physicalCash = parseInt(document.getElementById('z-cash-input').value) || 0;
    let shift = getCurrentShiftData();
    let diff = physicalCash - shift.expectedCash;
    
    let salary = 0;
    if (localAuth.user.role !== 'owner') {
        if (shift.salaryBase === 0) {
            let todayStr = new Date().toLocaleDateString();
            let someoneElseWorked = toArr(cloudState.history).some(h => (h.timestamp ? new Date(h.timestamp).toLocaleDateString() : "") === todayStr && h.admin !== localAuth.user.name && h.total > 0);
            salary = someoneElseWorked ? 0 : 6000;
        } else {
            salary = Math.round(shift.salaryBase * 0.08 + 6000);
        }
    }
    
    cloudState.history = toArr(cloudState.history);
    cloudState.history.push({ 
        id: Date.now(),
        admin: localAuth.user.name, start: localAuth.shiftStart, end: new Date().toLocaleString(), timestamp: Date.now(), 
        barRev: shift.bar, tableRev: shift.table, total: shift.total, sal: salary,
        expectedCash: shift.expectedCash, physicalCash: physicalCash, diff: diff, cashRev: shift.cash, qrRev: shift.qr, expTotal: shift.expTotal
    });
    
    if(localAuth.user.role !== 'owner') {
        if(!cloudState.ownerAcc) cloudState.ownerAcc = {};
        cloudState.ownerAcc[localAuth.user.name] = (cloudState.ownerAcc[localAuth.user.name] || 0) + salary;
    }
    
    saveToCloud(); localAuth = { isAuth: false, user: null }; saveLocalAuth(); 
    let diffMsg = diff < 0 ? `НЕДОСТАЧА: ${diff} ₸` : (diff > 0 ? `ИЗЛИШЕК: +${diff} ₸` : `КАССА ИДЕАЛЬНА`);
    alert(`Смена закрыта.\nОжидалось наличных (за вычетом расходов): ${shift.expectedCash} ₸\nВ кассе: ${physicalCash} ₸\n${diffMsg}`);
    location.reload();
}

window.saveExpense = function() {
    let sum = parseInt(document.getElementById('exp-sum').value); let desc = document.getElementById('exp-desc').value;
    if(!sum || !desc) return alert("Заполните все поля!");
    cloudState.expenses = toArr(cloudState.expenses);
    cloudState.expenses.push({ id: Date.now(), sum: sum, desc: desc, admin: localAuth.user.name, date: new Date().toLocaleString() });
    document.getElementById('expense-modal').style.display='none'; saveToCloud(); alert("Расход записан!");
}

window.openExpenseLogModal = function() {
    let currentExp = [];
    if(accPeriod === 'today') {
        let lastZ = (toArr(cloudState.history).length > 0) ? toArr(cloudState.history)[toArr(cloudState.history).length - 1].timestamp : 0;
        currentExp = toArr(cloudState.expenses).filter(e => e.id > lastZ);
    } else {
        const nowTime = new Date().getTime();
        currentExp = toArr(cloudState.expenses).filter(e => {
            let diffDays = (nowTime - e.id) / (1000 * 60 * 60 * 24);
            if(accPeriod === 'week') return diffDays <= 7;
            if(accPeriod === 'month') return diffDays <= 30;
            return true;
        });
    }

    if(currentExp.length === 0) {
        document.getElementById('expense-log-list').innerHTML = '<span style="color:var(--gray); font-size:13px;">За этот период расходов нет.</span>';
    } else {
        document.getElementById('expense-log-list').innerHTML = currentExp.map(e => `
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid #1c2e22; padding:12px 0; font-size:13px;">
                <div><b style="color:var(--white);">${e.desc}</b><br><span style="color:var(--gray); font-size:11px;">${e.date} (${e.admin})</span></div>
                <div style="color:var(--red); font-weight:800; font-size:18px;">-${e.sum} ₸</div>
            </div>
        `).join('');
    }
    document.getElementById('expense-log-modal').style.display='flex';
}

window.openStockLogModal = function() {
    let slogs = toArr(cloudState.stockLog).slice().reverse();
    if(slogs.length === 0) {
        document.getElementById('stock-log-list').innerHTML = '<span style="color:var(--gray);">История пуста.</span>';
    } else {
        document.getElementById('stock-log-list').innerHTML = slogs.map(l => {
            let qtyColor = l.qtyChange > 0 ? "var(--green)" : "var(--red)";
            let qtySign = l.qtyChange > 0 ? "+" : "";
            return `<div style="border-bottom:1px solid #1c2e22; padding:10px 0; display:flex; justify-content:space-between;">
                <div><b style="color:var(--gold); font-size:14px;">${l.item}</b><br><span style="color:var(--gray); font-size:11px;">${l.date} | ${l.admin}</span><br><span style="color:var(--white); font-weight:600;">${l.action}</span></div>
                <div style="color:${qtyColor}; font-size:20px; font-weight:800;">${qtySign}${l.qtyChange}</div>
            </div>`;
        }).join('');
    }
    document.getElementById('stock-log-modal').style.display='flex';
}

window.deleteHistory = function(ts) { if(confirm("Удалить эту смену?")) { cloudState.history = toArr(cloudState.history).filter(h => h.timestamp !== ts && h.id !== ts); saveToCloud(); } }

function reverseCheckStats(c) {
    if(c.payMethod === 'Долг' && cloudState.debts) {
        let debtsArr = toArr(cloudState.debts);
        let d = debtsArr.find(x => x.name.toLowerCase() === c.name.toLowerCase());
        if(d) {
            d.total -= c.total; 
            d.history = toArr(d.history);
            d.history.push(`Отмена чека: -${c.total}₸`);
            if(d.total <= 0) cloudState.debts = debtsArr.filter(x => x.name.toLowerCase() !== c.name.toLowerCase());
            else cloudState.debts = debtsArr;
        }
    }
}

window.restoreArchiveCheck = function(id) {
    let hist = toArr(cloudState.history);
    let lastZ = (hist && hist.length > 0) ? hist[hist.length - 1].timestamp : 0;
    cloudState.archive = toArr(cloudState.archive);
    let cIdx = cloudState.archive.findIndex(x => x.id === id);
    if(cIdx === -1) return; let c = cloudState.archive[cIdx];
    
    if(!localAuth.user || localAuth.user.role !== 'owner') {
         if(c.id < lastZ) return alert("Этот чек из прошлой смены! Вернуть нельзя.");
    }

    if(confirm(`Вернуть чек "${c.name}" в неоплаченные?`)) {
        reverseCheckStats(c); delete c.payMethod; delete c.admin; delete c.isDebtPayment;
        cloudState.checks = toArr(cloudState.checks);
        cloudState.checks.push(c); cloudState.archive.splice(cIdx, 1); saveToCloud();
    }
}

window.deleteArchiveCheck = function(ts) {
    if(confirm("УДАЛИТЬ ЧЕК ИЗ АРХИВА НАВСЕГДА?")) {
        cloudState.archive = toArr(cloudState.archive);
        let cIdx = cloudState.archive.findIndex(x => x.id === ts);
        if(cIdx === -1) return; let c = cloudState.archive[cIdx];
        reverseCheckStats(c); 
        if(c.bar && toArr(c.bar).length > 0) { 
            cloudState.inventory = toArr(cloudState.inventory); 
            toArr(c.bar).forEach(bItem => { 
                let invItem = cloudState.inventory.find(x => x.name === bItem.name); 
                if(invItem) invItem.qty += 1; else cloudState.inventory.push({name: bItem.name, price: bItem.price, qty: 1}); 
                logStock('Возврат из Архива', bItem.name, 1);
            }); 
        }
        cloudState.archive.splice(cIdx, 1); saveToCloud();
    }
}

window.addCustomAdmin = function() { let name = prompt("Имя администратора:"); if(!name) return; let pin = prompt(`PIN-код:`); if(name && pin) { cloudState.customAdmins = toArr(cloudState.customAdmins); cloudState.customAdmins.push({id: Date.now(), name: name, pin: pin, role: "admin"}); saveToCloud(); } }
window.resetDatabase = function() { if(confirm("ОБНОВИТЬ БАЗУ?")) { cloudState = { tables: Array.from({length: 6}, (_, i) => ({ id: i + 1, active: false, start: null, res: [], bar:[] })), checks: [], archive: [], inventory: [], debts: [], history: [], ownerAcc: {}, customAdmins: [], expenses:[], vips: [], stockLog: [] }; saveToCloud(); location.reload(); } }

window.addVipGuest = function() {
    let name = prompt("Имя VIP гостя:"); if(!name) return;
    let discStr = prompt(`Размер скидки для "${name}" (в %, например 20):`, "20");
    if(!discStr) return; let disc = parseInt(discStr); if(isNaN(disc) || disc < 0 || disc > 100) return alert("Неверная скидка");
    cloudState.vips = toArr(cloudState.vips);
    let exist = cloudState.vips.find(v => v.name.toLowerCase() === name.toLowerCase());
    if(exist) exist.discount = disc; else cloudState.vips.push({id: Date.now(), name: name, discount: disc});
    saveToCloud(); alert(`VIP гость ${name} добавлен со скидкой ${disc}%!`);
}
window.delVipGuest = function(id) { if(confirm("Удалить VIP гостя?")) { cloudState.vips = toArr(cloudState.vips).filter(v => v.id !== id); saveToCloud(); } }

function applyVipLogic(check) {
    let vips = toArr(cloudState.vips); let vip = vips.find(v => v.name.toLowerCase() === check.name.toLowerCase());
    if (vip) { check.discount = vip.discount; check.isVip = true; } else { check.isVip = false; }
    let baseTot = check.timeCost + check.barCost; check.total = check.discount ? Math.round(baseTot * (1 - check.discount/100)) : baseTot;
}

function formatTime(ms) { if(ms<0) ms=0; let s = Math.floor(ms / 1000), h = String(Math.floor(s / 3600)).padStart(2, '0'), m = String(Math.floor((s % 3600) / 60)).padStart(2, '0'); return `${h}:${m}:${String(s % 60).padStart(2, '0')}`; }
function calcCost(start) { if(!start) return 0; let diff = Date.now() - start; if(diff<0) diff=0; let h = new Date(start).getHours(); let rate = (h >= 11 && h < 18) ? 2000 : 3000; return Math.ceil(((diff / 60000) * (rate / 60)) / 50) * 50; }

window.startTable = function(id) { cloudState.tables = toArr(cloudState.tables); let t = cloudState.tables.find(x => x.id === id); if(t) { t.active = true; t.start = Date.now(); t.bar = []; saveToCloud(); } }
window.stopTable = function(id) { cloudState.tables = toArr(cloudState.tables); let t = cloudState.tables.find(x => x.id === id); const name = prompt("Имя гостя:"); if (!name) return; createOrMergeCheck(name, id, calcCost(t.start), toArr(t.bar)); t.active = false; t.start = null; t.bar = []; saveToCloud(); }
window.commTable = function(id) { cloudState.tables = toArr(cloudState.tables); let t = cloudState.tables.find(x => x.id === id); const name = prompt("Коммерция. Кто проиграл?"); if (!name) return; createOrMergeCheck(name, id, calcCost(t.start), toArr(t.bar)); t.start = Date.now(); t.bar = []; saveToCloud(); }

window.moveTable = function(fromId) {
    let toIdStr = prompt("На какой стол пересадить? (введите номер 1-6):");
    if(!toIdStr) return;
    let toId = parseInt(toIdStr);
    cloudState.tables = toArr(cloudState.tables);
    let tFrom = cloudState.tables.find(x => x.id === fromId);
    let tTo = cloudState.tables.find(x => x.id === toId);
    if(!tTo) return alert("Такого стола нет!");
    if(tTo.active) return alert("Этот стол уже занят!");

    tTo.active = true; tTo.start = tFrom.start; tTo.bar = toArr(tFrom.bar);
    tFrom.active = false; tFrom.start = null; tFrom.bar = [];
    saveToCloud();
}

window.addRes = function(id) { cloudState.tables = toArr(cloudState.tables); let t = cloudState.tables.find(x => x.id === id); let r = prompt("Бронь (Имя, Время):"); if(r) { t.res = toArr(t.res); t.res.push(r); saveToCloud(); } }
window.editRes = function(tId, rIdx) { cloudState.tables = toArr(cloudState.tables); let t = cloudState.tables.find(x => x.id === tId); t.res = toArr(t.res); let n = prompt("Изменить бронь:", t.res[rIdx]); if(n) { t.res[rIdx] = n; saveToCloud(); } }
window.delRes = function(tId, rIdx) { cloudState.tables = toArr(cloudState.tables); let t = cloudState.tables.find(x => x.id === tId); t.res = toArr(t.res); t.res.splice(rIdx,1); saveToCloud(); }

let barContext = null; 
window.openBarModal = function(context) { 
    barContext = context; 
    document.getElementById('bar-modal').style.display = 'flex'; 
    document.getElementById('bar-search').value = ''; 
    document.getElementById('bar-modal-title').innerText = context === 'owner' ? "БАР (БЕСПЛАТНО ХОЗЯИНУ)" : "МЕНЮ БАРА";
    
    let inv = toArr(cloudState.inventory).filter(i => i.qty > 0);
    let topHtml = inv.slice(0, 6).map(i => `<button class="top-bar-btn" onclick="selectBarItem('${i.name}')">${i.name}</button>`).join('');
    document.getElementById('top-bar-items').innerHTML = topHtml;
    
    renderBarSearch(); 
}

window.renderBarSearch = function() {
    let invArr = toArr(cloudState.inventory);
    if(invArr.length === 0) return;
    let sortedInv = [...invArr].sort((a,b) => { if(a.qty>0 && b.qty===0) return -1; if(a.qty===0 && b.qty>0) return 1; return 0; });
    const q = document.getElementById('bar-search').value.toLowerCase(); 
    document.getElementById('bar-items-list').innerHTML = sortedInv.filter(i => i.name.toLowerCase().includes(q)).map(i => {
        let colorClass = i.qty > 0 ? "stock-ok" : "stock-empty";
        return `<div class="bar-item-row" onclick="selectBarItem('${i.name}')"><span>${i.name}</span><span class="${colorClass}">${i.price} ₸ (${i.qty} шт)</span></div>`;
    }).join(''); 
}

window.selectBarItem = function(itemName) {
    cloudState.inventory = toArr(cloudState.inventory);
    let item = cloudState.inventory.find(x => x.name === itemName);
    if(item.qty <= 0) return alert("Товар закончился!");
    let qtyStr = prompt(`Сколько добавить?\n${item.name} (Остаток: ${item.qty} шт.)`, "1");
    if (!qtyStr) return; let qty = parseInt(qtyStr);
    if (isNaN(qty) || qty <= 0 || qty > item.qty) return alert("Некорректно!");
    
    item.qty -= qty;
    
    if (barContext === 'owner') {
        logStock('Списание (Хозяин)', item.name, -qty);
        document.getElementById('bar-modal').style.display = 'none';
        saveToCloud();
        alert(`Списано на Хозяина: ${item.name} (${qty} шт.)`);
        return;
    }

    logStock('Продажа', item.name, -qty);
    
    let itemsToAdd = []; for(let i = 0; i < qty; i++) itemsToAdd.push({name: item.name, price: item.price});
    if(barContext === 'standalone') { 
        const name = prompt("Имя гостя для бара:"); 
        if(name) {
            createOrMergeCheck(name, "Бар", 0, itemsToAdd); 
        } else { item.qty += qty; logStock('Отмена продажи', item.name, qty); return; }
    } else { 
        cloudState.tables = toArr(cloudState.tables);
        let t = cloudState.tables.find(x => x.id === barContext); 
        t.bar = toArr(t.bar).concat(itemsToAdd); 
    }
    document.getElementById('bar-modal').style.display = 'none'; saveToCloud();
}

let editTableId = null;
window.openEditTableBar = function(id) {
    editTableId = id; let t = toArr(cloudState.tables).find(x => x.id === id);
    let html = toArr(t.bar).map((b, i) => `<div class="edit-bar-item"><span>${b.name} (${b.price} ₸)</span> <button onclick="removeTableBarItem(${i})" class="btn-outline" style="color:var(--red); border-color:var(--red); padding:3px 8px; font-size:10px;">❌</button></div>`).join('');
    document.getElementById('edit-table-bar-list').innerHTML = html || '<span style="color:var(--gray); font-size:12px;">Пусто</span>';
    document.getElementById('edit-table-bar-modal').style.display = 'flex';
}
window.removeTableBarItem = function(idx) {
    if(!confirm("Убрать товар? Он вернется на склад.")) return; 
    cloudState.tables = toArr(cloudState.tables);
    let t = cloudState.tables.find(x => x.id === editTableId); 
    t.bar = toArr(t.bar); let item = t.bar.splice(idx, 1)[0];
    cloudState.inventory = toArr(cloudState.inventory); let invItem = cloudState.inventory.find(x => x.name === item.name); 
    if(invItem) invItem.qty += 1; 
    logStock('Возврат (Стол)', item.name, 1);
    saveToCloud(); openEditTableBar(editTableId); 
}

function createOrMergeCheck(name, tableId, timeCost, barItems) {
    cloudState.checks = toArr(cloudState.checks); 
    let bArr = toArr(barItems);
    let barTotal = bArr.reduce((s, i) => s + i.price, 0); 
    let exist = cloudState.checks.find(c => c.name.toLowerCase() === name.toLowerCase());
    const now = new Date(); const timeStr = now.getHours().toString().padStart(2,'0') + ":" + now.getMinutes().toString().padStart(2,'0');

    if(exist && confirm(`Объединить с чеком гостя "${exist.name}"?`)) { 
        exist.timeCost += timeCost; exist.barCost += barTotal; 
        if(bArr.length > 0) exist.bar = toArr(exist.bar).concat(bArr); 
        applyVipLogic(exist); 
        if(tableId !== "Бар") exist.details += ` + Стол ${tableId}`; 
        exist.endTime = timeStr;
        if(exist.startTime) { let sParts = exist.startTime.split(":"); let sDate = new Date(); sDate.setHours(sParts[0], sParts[1]); let diff = now - sDate; exist.duration = Math.floor(diff/3600000) + "ч " + Math.floor((diff%3600000)/60000) + "м"; }
    } else { 
        let t = toArr(cloudState.tables).find(x => x.id === tableId);
        let startStr = t && t.start ? new Date(t.start).getHours().toString().padStart(2,'0') + ":" + new Date(t.start).getMinutes().toString().padStart(2,'0') : timeStr;
        let duration = "0ч 0м"; if(t && t.start) { let diff = now - t.start; duration = Math.floor(diff/3600000) + "ч " + Math.floor((diff%3600000)/60000) + "м"; }
        let newCheck = { id: Date.now(), name: name, table: tableId, date: now.toLocaleDateString(), startTime: startStr, endTime: timeStr, duration: duration, timeCost: timeCost, barCost: barTotal, bar: bArr, total: timeCost + barTotal, discount: 0, details: `Стол ${tableId}` };
        applyVipLogic(newCheck); 
        cloudState.checks.push(newCheck); 
    }
}

window.deleteCheck = function(idx) {
    if(confirm("Вы точно хотите безвозвратно УДАЛИТЬ этот чек?\nВсе товары бара из него будут возвращены на склад.")) {
        cloudState.checks = toArr(cloudState.checks);
        cloudState.inventory = toArr(cloudState.inventory);
        let c = cloudState.checks[idx];
        if(c.bar && toArr(c.bar).length > 0) { 
            toArr(c.bar).forEach(bItem => { 
                let invItem = cloudState.inventory.find(x => x.name === bItem.name); 
                if(invItem) invItem.qty += 1; 
                else cloudState.inventory.push({name: bItem.name, price: bItem.price, qty: 1}); 
                logStock('Удаление чека', bItem.name, 1);
            }); 
        }
        cloudState.checks.splice(idx, 1); 
        saveToCloud();
    }
}

let editingCheckIdx = null;
window.openEditCheckModal = function(idx) { editingCheckIdx = idx; let c = toArr(cloudState.checks)[idx]; document.getElementById('edit-check-name').value = c.name; document.getElementById('edit-check-time').value = c.timeCost; renderEditCheckBarItems(); document.getElementById('edit-check-modal').style.display = 'flex'; }
function renderEditCheckBarItems() {
    let c = toArr(cloudState.checks)[editingCheckIdx];
    let html = toArr(c.bar).map((b, i) => `<div class="edit-bar-item"><span>${b.name} (${b.price} ₸)</span> <button onclick="removeBarItemFromCheck(${i})" class="btn-outline" style="color:var(--red); border-color:var(--red); padding:5px 10px;">❌ Убрать</button></div>`).join('');
    document.getElementById('edit-check-bar-list').innerHTML = html || '<span style="color:var(--gray); font-size:12px;">Пусто</span>';
}
window.removeBarItemFromCheck = function(itemIdx) {
    if(!confirm("Убрать товар из чека? Он вернется на склад.")) return;
    cloudState.checks = toArr(cloudState.checks);
    let c = cloudState.checks[editingCheckIdx]; c.bar = toArr(c.bar); let item = c.bar.splice(itemIdx, 1)[0];
    c.barCost -= item.price; 
    applyVipLogic(c); 
    cloudState.inventory = toArr(cloudState.inventory); let invItem = cloudState.inventory.find(x => x.name === item.name); if(invItem) invItem.qty += 1;
    logStock('Возврат (Чек)', item.name, 1);
    saveToCloud(); renderEditCheckBarItems();
}
window.saveCheckEdit = function() {
    let checks = toArr(cloudState.checks);
    let c = checks[editingCheckIdx]; 
    let newName = document.getElementById('edit-check-name').value;
    if (newName.toLowerCase() !== c.name.toLowerCase()) {
        let existingIdx = checks.findIndex(chk => chk.name.toLowerCase() === newName.toLowerCase() && chk.id !== c.id);
        if (existingIdx !== -1) {
            if(confirm(`Чек с именем "${newName}" уже есть. Объединить их?`)) {
                let ex = checks[existingIdx];
                ex.timeCost += (parseInt(document.getElementById('edit-check-time').value) || 0); ex.barCost += c.barCost;
                let cBarArr = toArr(c.bar); if(cBarArr.length > 0) ex.bar = toArr(ex.bar).concat(cBarArr);
                applyVipLogic(ex); 
                ex.details += ` + ${c.details}`;
                checks.splice(editingCheckIdx, 1); cloudState.checks = checks; document.getElementById('edit-check-modal').style.display = 'none'; saveToCloud(); return;
            }
        }
    }
    c.name = newName; c.timeCost = parseInt(document.getElementById('edit-check-time').value) || 0; 
    applyVipLogic(c); 
    cloudState.checks = checks; document.getElementById('edit-check-modal').style.display = 'none'; saveToCloud();
}

let currentCheckIndex = null;
window.openPayModal = function(idx) { 
    currentCheckIndex = idx; let c = toArr(cloudState.checks)[idx]; let origTotal = c.timeCost + c.barCost;
    if(c.discount && c.discount > 0) { document.getElementById('pay-total').innerHTML = `<span style="text-decoration:line-through; font-size:24px; color:var(--gray);">${origTotal} ₸</span><br>${c.total} ₸`; document.getElementById('pay-info').innerText = `${c.name} | ${c.details} (Скидка ${c.discount}%)`; } 
    else { document.getElementById('pay-total').innerText = c.total + " ₸"; document.getElementById('pay-info').innerText = `${c.name} | ${c.details}`; }
    document.getElementById('pay-main-buttons').style.display = 'flex'; document.getElementById('mix-pay-section').style.display = 'none'; document.getElementById('pay-modal').style.display = 'flex'; 
}

window.applyDiscount = function(pct) { 
    cloudState.checks = toArr(cloudState.checks); 
    let c = cloudState.checks[currentCheckIndex]; 
    c.discount = pct; 
    
    if (pct === 100) {
        c.timeCost = 0;
        c.barCost = 0;
        c.total = 0;
        c.details += " [СВОИ/ХОЗЯИН]";
        document.getElementById('pay-total').innerText = "0 ₸"; 
        document.getElementById('pay-info').innerText = `${c.name} | ${c.details} (100%)`;
    } else {
        let origTotal = c.timeCost + c.barCost; 
        if(pct === 0) { 
            c.total = origTotal; 
            document.getElementById('pay-total').innerText = c.total + " ₸"; 
            document.getElementById('pay-info').innerText = `${c.name} | ${c.details}`; 
        } else { 
            c.total = Math.round(origTotal * (1 - pct / 100)); 
            document.getElementById('pay-total').innerHTML = `<span style="text-decoration:line-through; font-size:24px; color:var(--gray);">${origTotal} ₸</span><br>${c.total} ₸`; 
            document.getElementById('pay-info').innerText = `${c.name} | ${c.details} (Скидка ${pct}%)`; 
        } 
    }
    if (document.getElementById('mix-pay-section').style.display === 'block') { calcMixQr(); } 
    saveToCloud(); 
}

window.processPayment = function(method) {
    cloudState.checks = toArr(cloudState.checks);
    let c = cloudState.checks[currentCheckIndex]; c.payMethod = method; c.admin = localAuth.user.name;

    if(method === 'Долг') { 
        cloudState.debts = toArr(cloudState.debts);
        let d = cloudState.debts.find(x => x.name.toLowerCase() === c.name.toLowerCase()); 
        let histStr = `+${c.total}₸ (${new Date().toLocaleString()}, Админ: ${localAuth.user.name})`;
        if(d) { 
            d.total += c.total; 
            d.history = toArr(d.history); d.history.push(histStr); 
            d.timestamp = Date.now();
            d.admin = localAuth.user.name;
        } else { 
            cloudState.debts.push({ name: c.name, total: c.total, history: [histStr], timestamp: Date.now(), admin: localAuth.user.name }); 
        } 
    }
    
    cloudState.archive = toArr(cloudState.archive);
    cloudState.archive.push(c); cloudState.checks.splice(currentCheckIndex, 1);
    document.getElementById('pay-modal').style.display = 'none'; saveToCloud();
}

window.showMixPay = function() { document.getElementById('pay-main-buttons').style.display = 'none'; document.getElementById('mix-pay-section').style.display = 'block'; document.getElementById('mix-cash-input').value = ''; document.getElementById('mix-qr-val').innerText = toArr(cloudState.checks)[currentCheckIndex].total; }
window.hideMixPay = function() { document.getElementById('pay-main-buttons').style.display = 'flex'; document.getElementById('mix-pay-section').style.display = 'none'; }
window.calcMixQr = function() { let t = toArr(cloudState.checks)[currentCheckIndex].total; let c = parseInt(document.getElementById('mix-cash-input').value) || 0; let q = t - c; document.getElementById('mix-qr-val').innerText = q < 0 ? 0 : q; }

window.fillMix = function(type) {
    let c = toArr(cloudState.checks)[currentCheckIndex];
    let discRatio = 1 - (c.discount || 0) / 100;
    let tCost = Math.round(c.timeCost * discRatio);
    let bCost = c.total - tCost;
    if(type === 'timeCash') {
        document.getElementById('mix-cash-input').value = tCost;
    } else if (type === 'barCash') {
        document.getElementById('mix-cash-input').value = bCost;
    }
    calcMixQr();
}

window.confirmMixPay = function() { let t = toArr(cloudState.checks)[currentCheckIndex].total; let c = parseInt(document.getElementById('mix-cash-input').value) || 0; let q = t - c; if (c < 0 || q < 0) return alert("Некорректная сумма наличных!"); processPayment(`Нал: ${c}₸ / QR: ${q}₸`); }

window.payDebt = function(idx) { 
    cloudState.debts = toArr(cloudState.debts);
    let d = cloudState.debts[idx]; 
    let sumStr = prompt(`Долг: ${d.total} ₸.\n\nСколько вносит клиент?`); 
    if(!sumStr) return;
    let sum = parseInt(sumStr);
    if(isNaN(sum) || sum <= 0 || sum > d.total) return alert("Некорректная сумма!");
    
    let methodStr = prompt("Как оплатили?\n1 - Наличные\n2 - QR", "1");
    if(!methodStr) return;
    let method = methodStr === '2' ? 'QR' : 'Наличные';

    let comm = Math.round(sum * 0.08);
    if (d.admin) {
        if(!cloudState.ownerAcc) cloudState.ownerAcc = {};
        cloudState.ownerAcc[d.admin] = (cloudState.ownerAcc[d.admin] || 0) + comm;
        alert(`Админу "${d.admin}" начислено 8% (${comm} ₸) на баланс.`);
    }

    d.total -= sum; 
    let timeStr = new Date().toLocaleTimeString().slice(0,5);
    d.history = toArr(d.history);
    d.history.push(`Оплата: -${sum}₸ (${new Date().toLocaleDateString()} ${timeStr}, ${method})`); 
    
    cloudState.archive = toArr(cloudState.archive);
    cloudState.archive.push({
        id: Date.now(), name: "Возврат долга: " + d.name, table: "ДОЛГ", date: new Date().toLocaleDateString(),
        timeCost: 0, barCost: 0, total: sum, payMethod: method, admin: localAuth.user.name, details: "Погашение долга",
        isDebtPayment: true 
    });

    if(d.total <= 0) {
        alert("Долг оплачен. Ждет проверки Хозяина.");
    } 
    saveToCloud(); 
}

window.deductDebtFromAdmin = function(idx) {
    cloudState.debts = toArr(cloudState.debts);
    let d = cloudState.debts[idx];
    if(confirm(`Удержать долг (${d.total} ₸) из ЗП администратора ${d.admin || 'Неизвестно'}?`)) {
        if(d.admin) {
            if(!cloudState.ownerAcc) cloudState.ownerAcc = {};
            cloudState.ownerAcc[d.admin] = (cloudState.ownerAcc[d.admin] || 0) - d.total;
        }
        d.total = 0;
        d.history = toArr(d.history); d.history.push(`УДЕРЖАНО С АДМИНА: ${d.admin}`);
        saveToCloud();
        alert("Долг успешно удержан из ЗП!");
    }
}

window.delDebt = function(idx) { if(confirm("Хозяин, удалить этот долг навсегда?")) { cloudState.debts = toArr(cloudState.debts); cloudState.debts.splice(idx,1); saveToCloud(); } }

window.openAddItemModal = function() { document.getElementById('add-item-modal').style.display = 'flex'; document.getElementById('new-item-name').value = ''; document.getElementById('new-item-price').value = ''; document.getElementById('new-item-qty').value = ''; }
window.saveNewItem = function() { const name = document.getElementById('new-item-name').value.trim(); const price = parseInt(document.getElementById('new-item-price').value); const qty = parseInt(document.getElementById('new-item-qty').value); if(!name || isNaN(price) || isNaN(qty)) { alert("Заполните все поля корректно!"); return; } cloudState.inventory = toArr(cloudState.inventory); cloudState.inventory.push({name: name, price: price, qty: qty}); logStock('Новый товар', name, qty); document.getElementById('add-item-modal').style.display = 'none'; saveToCloud(); }
window.editItemQty = function(idx) { cloudState.inventory = toArr(cloudState.inventory); let oldQty = cloudState.inventory[idx].qty; let q = prompt("Новый остаток товара:", oldQty); if(q !== null && q !== "") { let newQty = parseInt(q); cloudState.inventory[idx].qty = newQty; logStock('Изменение остатка', cloudState.inventory[idx].name, newQty - oldQty); saveToCloud(); } }
window.renameItem = function(idx) { cloudState.inventory = toArr(cloudState.inventory); let n = prompt("Новое название товара:", cloudState.inventory[idx].name); if(n) { cloudState.inventory[idx].name = n; saveToCloud(); } }
window.editItemPrice = function(idx) { cloudState.inventory = toArr(cloudState.inventory); let p = prompt("Новая цена продажи:", cloudState.inventory[idx].price); if(p !== null && p !== "") { cloudState.inventory[idx].price = parseInt(p); saveToCloud(); } }
window.delItem = function(idx) { if(confirm(`Удалить товар?`)) { cloudState.inventory = toArr(cloudState.inventory); let item = cloudState.inventory[idx]; logStock('Удаление товара', item.name, -item.qty); cloudState.inventory.splice(idx,1); saveToCloud(); } }

window.showTab = function(id, btn) { document.querySelectorAll('.tab-pane').forEach(x => x.style.display = 'none'); document.querySelectorAll('.nav-link').forEach(x => x.classList.remove('active')); document.getElementById('tab-'+id).style.display = 'block'; btn.classList.add('active'); }

let accPeriod = 'today'; 
window.setAccPeriod = function(period, btn) { accPeriod = period; document.querySelectorAll('.acc-filter').forEach(x => x.classList.remove('active')); btn.classList.add('active'); renderAccounting(); }
window.exportToExcel = function() {
    if(currentFilteredHistory.length === 0) return alert("Нет данных для скачивания за этот период.");
    let csv = '\uFEFF'; csv += "АДМИН;НАЧАЛО;КОНЕЦ;БАР (ТНГ);СТОЛЫ (ТНГ);КАССА ОБЩАЯ (ТНГ);НАЛИЧНЫЕ В КАССЕ (ТНГ);НЕДОСТАЧА/ИЗЛИШЕК;ВЫДАНО ЗП (ТНГ)\n";
    currentFilteredHistory.forEach(h => { csv += `${h.admin};${h.start};${h.end};${h.barRev||0};${h.tableRev||0};${h.total||0};${h.physicalCash||0};${h.diff||0};${h.sal||0}\n`; });
    let a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = `Бухгалтерия_SENSEI_${accPeriod}.csv`; a.click();
}

window.payAdminAdvance = function(name) { let currentDebt = (cloudState.ownerAcc && cloudState.ownerAcc[name]) ? cloudState.ownerAcc[name] : 0; let s = prompt(`К выплате ${name}: ${currentDebt}₸.\nСумма аванса/выплаты:`); if(s && !isNaN(s)) { if(!cloudState.ownerAcc) cloudState.ownerAcc = {}; cloudState.ownerAcc[name] = currentDebt - parseInt(s); saveToCloud(); } }
window.fullPayAdmin = function(name) { if(confirm(`Выдать полный расчет администратору ${name} и обнулить его баланс?`)) { if(!cloudState.ownerAcc) cloudState.ownerAcc = {}; cloudState.ownerAcc[name] = 0; saveToCloud(); } }
window.editAdminSalary = function(name) { let currentDebt = (cloudState.ownerAcc && cloudState.ownerAcc[name]) ? cloudState.ownerAcc[name] : 0; let s = prompt(`Ввести новую точную сумму баланса для ${name}:`, currentDebt); if(s !== null && !isNaN(s)) { if(!cloudState.ownerAcc) cloudState.ownerAcc = {}; cloudState.ownerAcc[name] = parseInt(s); saveToCloud(); } }
window.fineAdmin = function(name) { let currentDebt = (cloudState.ownerAcc && cloudState.ownerAcc[name]) ? cloudState.ownerAcc[name] : 0; let s = prompt(`Сумма штрафа для ${name} (отнимется от ЗП):`); if(s && !isNaN(s)) { if(!cloudState.ownerAcc) cloudState.ownerAcc = {}; cloudState.ownerAcc[name] = currentDebt - parseInt(s); saveToCloud(); } }

function renderAccounting() {
    let histArr = toArr(cloudState.history);
    if(histArr.length === 0) return;
    const now = new Date(); const todayStr = now.toLocaleDateString(); const nowTime = now.getTime();
    
    currentFilteredHistory = histArr.filter(h => {
        if(accPeriod === 'all') return true;
        let shiftDateStr = h.timestamp ? new Date(h.timestamp).toLocaleDateString() : h.end.split(',')[0].trim(); 
        if(accPeriod === 'today') return shiftDateStr === todayStr;
        if(!h.timestamp) return true; 
        let diffDays = (nowTime - h.timestamp) / (1000 * 60 * 60 * 24);
        if(accPeriod === 'week') return diffDays <= 7;
        if(accPeriod === 'month') return diffDays <= 30;
        if(accPeriod === 'year') return diffDays <= 365;
        return true;
    });

    let tRev = 0, bRev = 0, tblRev = 0, sal = 0, expTotal = 0;
    currentFilteredHistory.forEach(h => { tRev += (h.total || 0); bRev += (h.barRev || 0); tblRev += (h.tableRev || 0); sal += (h.sal || 0); expTotal += (h.expTotal || 0); });

    document.getElementById('acc-trev').innerText = tRev.toLocaleString() + " ₸"; 
    document.getElementById('acc-details').innerText = `Бар: ${bRev} ₸ | Столы: ${tblRev} ₸`;
    document.getElementById('acc-sal').innerText = (sal + expTotal).toLocaleString() + " ₸"; 
    document.getElementById('acc-net').innerText = (tRev - sal - expTotal).toLocaleString() + " ₸";
    
    document.getElementById('history-list').innerHTML = currentFilteredHistory.map(h => {
        let diffColor = h.diff < 0 ? 'var(--red)' : (h.diff > 0 ? 'var(--green)' : 'var(--gray)');
        let zReportHtml = h.expectedCash !== undefined ? `<br><span style="font-size:10px; color:${diffColor};">Нал: ${h.physicalCash} (Разница: ${h.diff})</span>` : '';
        let expStr = h.expTotal > 0 ? `<br><span style="color:var(--red); font-size:10px;">Расход: -${h.expTotal}</span>` : '';
        return `<tr><td><b>${h.admin}</b></td><td><span style="font-size:11px; color:var(--gray);">${h.start} - ${h.end}</span></td><td><span style="font-size:11px; color:var(--gray);">Нал: ${h.cashRev||0}<br>QR: ${h.qrRev||0}</span></td><td><b class="gold-text">${h.total} ₸</b>${zReportHtml}${expStr}</td><td><b style="color:var(--green);">${h.sal} ₸</b></td><td><button onclick="deleteHistory(${h.timestamp})" class="btn-red" style="padding:6px 10px; font-size:12px; width:auto;">🗑️</button></td></tr>`;
    }).join('');
}

let currentBillTableId = null;
window.openTableBill = function(id) { currentBillTableId = id; renderTableBill(); document.getElementById('table-bill-modal').style.display = 'flex'; }
function renderTableBill() {
    if (!currentBillTableId) return; let t = toArr(cloudState.tables).find(x => x.id === currentBillTableId); if (!t) return;
    document.getElementById('table-bill-id').innerText = t.id;
    let cost = 0; let timeStr = "00:00:00";
    if(t.active) { timeStr = formatTime(Date.now() - t.start); cost = calcCost(t.start); }
    document.getElementById('table-bill-time-val').innerText = cost.toLocaleString() + " ₸";
    let barSum = 0; let html = toArr(t.bar).map((b, i) => { barSum += b.price; return `<div class="edit-bar-item"><span>${b.name} (${b.price} ₸)</span> <button onclick="removeTableBarItem(${i})" class="btn-outline" style="color:var(--red); border-color:var(--red); padding:3px 8px; font-size:10px;">❌</button></div>`; }).join('');
    document.getElementById('table-bill-bar-list').innerHTML = html || '<span style="color:var(--gray); font-size:12px;">Пусто</span>'; document.getElementById('table-bill-bar-sum').innerText = barSum.toLocaleString(); document.getElementById('table-bill-total').innerText = (cost + barSum).toLocaleString();
}

function renderTables() {
    if(!document.getElementById('tables-grid')) return;
    document.getElementById('tables-grid').innerHTML = toArr(cloudState.tables).map(t => {
        let timeStr = "00:00:00", cost = 0;
        if(t.active) { timeStr = formatTime(Date.now() - t.start); cost = calcCost(t.start); }
        let barSum = 0; let barHtml = '';
        let bArr = toArr(t.bar);
        if(t.active && bArr.length > 0) {
            let grouped = {}; bArr.forEach(i => { grouped[i.name] = grouped[i.name] || {q:0, p:i.price}; grouped[i.name].q++; });
            barHtml = `<div class="mini-bar-list">` + Object.keys(grouped).map(k => { barSum += grouped[k].q*grouped[k].p; return `<div class="mini-bar-item"><span>${k} x${grouped[k].q}</span><span>${grouped[k].q*grouped[k].p}</span></div>`; }).join('') + `<div style="text-align:right; font-weight:bold; margin-top:5px; color:var(--gold);">Сумма: ${barSum} ₸ <button onclick="openEditTableBar(${t.id})" style="background:none; border:none; font-size:14px; margin-left:5px; cursor:pointer;">⚙️</button></div></div>`;
        }
        let totalDisplay = cost !== 0 ? (cost + barSum) : barSum;
        let resHtml = toArr(t.res).map((r, i) => `<div class="res-item"><span>📅 ${r}</span> <div><span onclick="editRes(${t.id},${i})" style="cursor:pointer; margin-right:10px;">✏️</span><span onclick="delRes(${t.id},${i})" style="color:var(--red); cursor:pointer;">❌</span></div></div>`).join('');
        return `<div class="table-card ${t.active ? 'active' : ''}"><div style="font-size:22px; font-weight:800; color:var(--gold);">СТОЛ ${t.id}</div><div class="timer">${timeStr}</div><div style="font-size:28px; font-weight:800; color:var(--white); margin-bottom:15px;">${totalDisplay.toLocaleString()} ₸</div>${barHtml}${!t.active ? `<button onclick="startTable(${t.id})" class="btn-gold btn-large shadow-gold" style="margin-top:auto;">▶ ПУСК СТОЛА</button>` : `<button onclick="stopTable(${t.id})" class="btn-red" style="margin-bottom:10px;">⏹ СТОП В ЧЕК</button><div class="table-actions"><button class="btn-outline flex-1" onclick="openBarModal(${t.id})">🍸 БАР</button><button class="btn-outline flex-1" onclick="openTableBill(${t.id})">📄 СЧЕТ</button><button class="btn-outline flex-1" onclick="commTable(${t.id})">🔄 КОММЕРЦ</button><button class="btn-outline flex-1" onclick="moveTable(${t.id})">➡️ ПЕРЕСАДКА</button></div>`}<button class="btn-outline" style="width:100%; margin-top:15px; border-color:var(--border); color:var(--gray);" onclick="addRes(${t.id})">+ ДОБАВИТЬ БРОНЬ</button>${resHtml}</div>`;
    }).join('');
}

window.openFullCheck = function(idx) {
    let checks = toArr(cloudState.checks);
    let c = checks[idx]; document.getElementById('bill-date').innerText = c.date + " " + (c.endTime || ''); document.getElementById('bill-guest').innerText = c.name; document.getElementById('bill-table-num').innerText = c.table; document.getElementById('bill-start').innerText = c.startTime || '--:--'; document.getElementById('bill-end').innerText = c.endTime || '--:--'; document.getElementById('bill-duration').innerText = c.duration || '--ч --м';
    let grouped = {}; toArr(c.bar).forEach(i => { grouped[i.name] = grouped[i.name] || {q:0, p:i.price}; grouped[i.name].q++; });
    document.getElementById('bill-items-body').innerHTML = Object.keys(grouped).map(k => `<tr><td style="padding:8px 0;">${k}</td><td style="padding:8px 0;">${grouped[k].q}</td><td style="padding:8px 0;">${grouped[k].p}</td><td style="padding:8px 0;">${grouped[k].q*grouped[k].p}</td></tr>`).join('');
    document.getElementById('bill-time-sum').innerText = c.timeCost; document.getElementById('bill-bar-sum').innerText = c.barCost; document.getElementById('bill-total').innerText = c.total;
    if(c.discount > 0) { document.getElementById('bill-discount-row').style.display='block'; document.getElementById('bill-discount-val').innerText = c.discount; } else document.getElementById('bill-discount-row').style.display='none';
    document.getElementById('full-check-modal').style.display='flex';
}

function render() {
    let selectElem = document.getElementById('staff-select');
    
    if (!localAuth.isAuth) { 
        let adminsArr = toArr(cloudState.customAdmins);
        let expectedCount = 3 + adminsArr.length;

        if (selectElem && selectElem.options.length !== expectedCount) {
            let html = '<option value="0">Султан</option><option value="1">Дидар</option><option value="owner">Хозяин</option>';
            adminsArr.forEach((a) => { html += `<option value="custom_${a.id}">${a.name}</option>`; });
            let curVal = selectElem.value;
            selectElem.innerHTML = html; 
            if (curVal) selectElem.value = curVal;
        }

        if (document.getElementById('guest-app') && document.getElementById('guest-app').style.display !== 'block') {
            document.getElementById('auth-screen').style.display='flex'; 
        }
        document.getElementById('app').style.display='none'; 
        return; 
    }
    
    document.getElementById('auth-screen').style.display='none'; 
    if(document.getElementById('guest-app')) document.getElementById('guest-app').style.display='none';
    document.getElementById('app').style.display='block';
    
    document.getElementById('user-display').innerText = localAuth.user.name;
    
    let isOwner = localAuth.user.role === 'owner';
    document.getElementById('owner-tab').style.display = isOwner ? 'block' : 'none';
    document.getElementById('acc-tab').style.display = isOwner ? 'block' : 'none';
    document.getElementById('btn-open-add-item').style.display = isOwner ? 'block' : 'none';
    document.getElementById('btn-stock-log').style.display = isOwner ? 'block' : 'none';

    renderTables();

    let shift = getCurrentShiftData();
    
    let shiftZp = 0;
    if(!isOwner) {
        if(shift.salaryBase === 0) {
            let todayStr = new Date().toLocaleDateString();
            let someoneElseWorked = toArr(cloudState.history).some(h => (h.timestamp ? new Date(h.timestamp).toLocaleDateString() : "") === todayStr && h.admin !== localAuth.user.name && h.total > 0);
            shiftZp = someoneElseWorked ? 0 : 6000;
        } else {
            shiftZp = Math.round(shift.salaryBase * 0.08 + 6000);
        }
    }
    
    let accZp = (cloudState.ownerAcc && cloudState.ownerAcc[localAuth.user.name]) ? cloudState.ownerAcc[localAuth.user.name] : 0;
    
    document.getElementById('global-rev').innerHTML = shift.total.toLocaleString() + " ₸<br><span style='font-size:11px; color:var(--gray); font-weight:700; letter-spacing:1px;'>НАЛ: " + shift.cash.toLocaleString() + " | QR: " + shift.qr.toLocaleString() + "</span>";
    document.getElementById('global-shift-zp').innerText = shiftZp.toLocaleString() + " ₸";
    document.getElementById('global-total-zp').innerText = isOwner ? "---" : (accZp + shiftZp).toLocaleString() + " ₸";

    let lowStockCount = toArr(cloudState.inventory).filter(i => i.qty < 5).length;
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
        
        let histArr = toArr(cloudState.history);
        let lastZ = (histArr && histArr.length > 0) ? histArr[histArr.length - 1].timestamp : 0;
        let restoreBtn = (a.id > lastZ || isOwner) ? `<button onclick="restoreArchiveCheck(${a.id})" class="btn-outline" style="padding:6px 10px; font-size:11px; margin-right:8px; border-color:var(--gold-dim); color:var(--gold);">↩️ ВЕРНУТЬ</button>` : '';
        let delBtn = isOwner ? `<button onclick="deleteArchiveCheck(${a.id})" class="btn-red" style="padding:6px 10px; font-size:11px;">🗑️</button>` : '';
        
        return `<tr><td style="color:var(--gray); font-size:12px;">${a.date} ${a.endTime||''}</td><td><b style="color:var(--white); font-size:15px;">${a.name}</b></td><td style="font-size:12px; line-height:1.4;">${a.details}<br><span style="color:var(--gray);">${timeInfo}</span><br><span style="color:var(--gold);">${barInfo}</span></td><td>Столы: ${a.timeCost}₸<br>Бар: ${a.barCost}₸<br><b class="gold-text" style="font-size:18px;">${a.total} ₸</b></td><td><span style="background:#16261c; color:var(--green); padding:6px 10px; border-radius:8px; font-size:11px; font-weight:800;">${a.payMethod}</span></td><td style="font-weight:600;">${a.admin}</td><td><div style="display:flex;">${restoreBtn}${delBtn}</div></td></tr>`;
    }).join('');
    
    document.getElementById('stock-list').innerHTML = toArr(cloudState.inventory).map((i, idx) => {
        let colorClass = i.qty > 0 ? "var(--white)" : "var(--red)";
        let stockBtns = isOwner ? `<button onclick="editItemQty(${idx})" class="btn-outline" style="padding:8px 12px; font-size:11px;">✏️ КОЛ-ВО</button><button onclick="renameItem(${idx})" class="btn-outline" style="padding:8px 12px; font-size:11px;">✏️ ИМЯ</button><button onclick="editItemPrice(${idx})" class="btn-outline" style="padding:8px 12px; font-size:11px;">✏️ ЦЕНА</button><button onclick="delItem(${idx})" class="btn-outline" style="padding:8px 12px; font-size:11px; width:auto; margin-top:0; border-color:rgba(255,76,76,0.5); color:var(--red);">❌</button>` : '';
        return `<tr><td><b style="color:${colorClass}; font-size:16px;">${i.name}</b></td><td><b style="font-size:18px; color:${colorClass};">${i.qty} шт</b></td><td class="gold-text"><b style="font-size:18px;">${i.price} ₸</b></td><td style="display:flex; gap:8px; flex-wrap:wrap;">${stockBtns}</td></tr>`;
    }).join('');
    
    let debtsArr = toArr(cloudState.debts);
    let totalDebtsSum = 0;
    
    let debtsHtml = debtsArr.map((d, i) => {
        totalDebtsSum += d.total;
        
        let ts = d.timestamp || Date.now();
        let deadline = ts + (15 * 24 * 60 * 60 * 1000);
        let diff = deadline - Date.now();
        
        let warningHtml = '';
        let penaltyBtn = '';
        
        if (diff < 0 && d.total > 0) {
            let daysOver = Math.floor(Math.abs(diff) / (1000 * 60 * 60 * 24));
            warningHtml = `<br><span style="display:inline-block; margin-top:5px; background:rgba(255,76,76,0.1); color:var(--red); padding:4px 8px; border-radius:6px; font-size:11px; font-weight:800;">⚠️ ПРОСРОЧЕНО: ${daysOver} дн.</span>`;
            if(isOwner) penaltyBtn = `<button onclick="deductDebtFromAdmin(${i})" class="btn-outline" style="border-color:var(--red); color:var(--red); margin-top:8px; width:100%; font-size:11px;">УДЕРЖАТЬ С АДМИНА</button>`;
        } else if (d.total > 0) {
            let dLeft = Math.floor(diff / (1000 * 60 * 60 * 24));
            let hLeft = Math.floor((diff / (1000 * 60 * 60)) % 24);
            warningHtml = `<br><span style="display:inline-block; margin-top:5px; background:rgba(212,175,55,0.1); color:var(--gold); padding:4px 8px; border-radius:6px; font-size:11px; font-weight:700;">⏳ До расчета: ${dLeft} дн. ${hLeft} ч.</span>`;
        }

        let delBtn = isOwner ? `<button onclick="delDebt(${i})" class="btn-outline" style="border-color:rgba(255,76,76,0.5); color:var(--red); width:100%; margin-top:8px; font-size:11px;">УДАЛИТЬ ДОЛГ</button>` : '';
        let payBtn = d.total > 0 ? `<button onclick="payDebt(${i})" class="btn-outline" style="border-color:var(--green); color:var(--green); width:100%; font-size:13px;">ВНЕСТИ РАСЧЕТ</button>` : `<span style="display:block; text-align:center; background:rgba(46,204,113,0.1); border:1px solid var(--green); color:var(--green); padding:10px; border-radius:10px; font-size:12px; font-weight:800;">✅ ОПЛАЧЕНО<br><span style="font-size:10px; font-weight:500;">Ждет проверки Хозяина</span></span>`;

        return `<tr>
            <td><b class="gold-text" style="font-size:18px;">${d.name}</b><br><span style="font-size:11px; color:var(--gray);">Выдал: <b style="color:var(--white);">${d.admin || '---'}</b></span>${warningHtml}</td>
            <td style="color:var(--red); font-weight:800; font-size:24px;">${d.total.toLocaleString()} ₸</td>
            <td><span style="font-size:12px; color:var(--gray); line-height:1.5;">${toArr(d.history).join('<br>')}</span></td>
            <td style="text-align:right; vertical-align:middle; width:180px;">
                ${payBtn} 
                ${penaltyBtn}
                ${delBtn}
            </td>
        </tr>`;
    }).join('');
    
    if(debtsArr.length > 0) {
        debtsHtml += `<tr><td colspan="3" style="text-align:right; font-size:14px; color:var(--gray);"><b>ОБЩАЯ СУММА ДОЛГОВ КЛУБА:</b></td><td style="color:var(--red); font-size:28px; font-weight:900;">${totalDebtsSum.toLocaleString()} ₸</td></tr>`;
    }
    document.getElementById('debts-list').innerHTML = debtsHtml;
    
    document.getElementById('my-history-list').innerHTML = toArr(cloudState.history).filter(h => h.admin === localAuth.user.name).map(h => {
        let delMyShiftBtn = isOwner ? `<button onclick="deleteHistory(${h.timestamp})" class="btn-red" style="padding:6px 10px; font-size:12px; width:auto; margin-left:10px;">🗑️</button>` : '';
        return `<tr><td>${h.start}</td><td>${h.end}</td><td><span style="font-size:11px; color:var(--gray);">Нал: ${h.cashRev||0}<br>QR: ${h.qrRev||0}</span></td><td class="gold-text"><b>${h.total} ₸</b></td><td style="color:var(--green);"><b>${h.sal} ₸</b>${delMyShiftBtn}</td></tr>`;
    }).join('');
    
    if(isOwner) {
        renderAccounting();
        
        document.getElementById('vip-guests-list').innerHTML = toArr(cloudState.vips).map((v) => `<span style="background:rgba(212,175,55,0.1); border:1px solid var(--gold); padding:8px 15px; border-radius:8px; display:inline-flex; align-items:center; gap:10px; color:var(--gold); font-weight:700;">${v.name} <span class="vip-badge">-${v.discount}%</span> <span onclick="delVipGuest(${v.id})" style="color:var(--red); cursor:pointer; font-weight:bold; font-size:18px;">×</span></span>`).join('');
        
        document.getElementById('custom-admins-list').innerHTML = toArr(cloudState.customAdmins).map((a, i) => `<span style="background:#16261c; border:1px solid var(--border); padding:10px 18px; border-radius:12px; display:inline-flex; align-items:center; gap:12px; font-weight:600;">${a.name} <span onclick="delCustomAdmin(${i})" style="color:var(--red); cursor:pointer; font-weight:bold; font-size:18px;">×</span></span>`).join('');
        
        if(cloudState.ownerAcc) {
            document.getElementById('admin-salaries-list').innerHTML = Object.keys(cloudState.ownerAcc).map(name => {
                let debt = cloudState.ownerAcc[name];
                return `<div class="check-row"><div><b style="font-size:20px; color:var(--white);">${name}</b><br><span style="font-size:12px; color:var(--gray);">ДОЛГ К ВЫПЛАТЕ:</span> <b style="color:var(--green); font-size:28px; display:block; margin-top:8px;">${debt.toLocaleString()} ₸</b></div><div style="display:flex; flex-direction:column; gap:8px;"><button onclick="payAdminAdvance('${name}')" class="btn-outline" style="border-color:var(--green); color:var(--green); font-size:12px;">АВАНС</button><button onclick="fullPayAdmin('${name}')" class="btn-gold" style="padding:12px; font-size:12px;">ПОЛНЫЙ РАСЧЕТ</button><button onclick="editAdminSalary('${name}')" class="btn-outline" style="font-size:12px;">ИЗМЕНИТЬ ЦИФРУ</button><button onclick="fineAdmin('${name}')" class="btn-outline" style="border-color:var(--red); color:var(--red); font-size:12px;">ШТРАФ</button></div></div>`;
            }).join('');
        }
    }
}
