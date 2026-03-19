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
let cloudState = { tables: Array.from({length: 6}, (_, i) => ({ id: i + 1, active: false, start: null, res: [], bar: [] })), checks: [], archive: [], inventory: [], debts: [], history: [], ownerAcc: {}, customAdmins: [], expenses: [] };

db.ref('.info/connected').on('value', snap => { const el = document.getElementById('sync-status'); if(el) el.innerText = snap.val() ? '🟢' : '🔴'; });

dbRef.on('value', snap => {
    if (snap.val()) cloudState = snap.val();
    else saveToCloud();
    render();
});

function saveToCloud() { dbRef.set(cloudState).catch(e => console.error(e)); }
function saveLocalAuth() { localStorage.setItem('sensei_auth_pro', JSON.stringify(localAuth)); }

window.onload = () => { render(); setInterval(() => { if(localAuth.isAuth) renderTables(); }, 1000); };

function login() {
    const val = document.getElementById('staff-select').value;
    const pin = document.getElementById('pass-input').value;
    let user = STAFF_HARDCODED.find(s => s.id === val) || (cloudState.customAdmins || []).find(a => "custom_"+a.id === val);

    if (user && user.pin === pin) {
        localAuth = { isAuth: true, user: user, shiftStart: new Date().toLocaleString() };
        saveLocalAuth(); document.getElementById('pass-input').value = ""; document.getElementById('auth-error').style.display = 'none'; render();
    } else { document.getElementById('auth-error').style.display = 'block'; }
}

// --- ЯДРО ПОДСЧЕТА ТЕКУЩЕЙ СМЕНЫ ---
function getCurrentShiftData() {
    let lastZ = (cloudState.history && cloudState.history.length > 0) ? cloudState.history[cloudState.history.length - 1].timestamp : 0;
    let currentChecks = (cloudState.archive || []).filter(c => c.id > lastZ);
    let currentExp = (cloudState.expenses || []).filter(e => e.id > lastZ);
    
    let cash = 0, qr = 0, table = 0, bar = 0, total = 0;
    
    currentChecks.forEach(c => {
        let cTot = c.total || 0;
        total += cTot;
        
        if (c.payMethod === 'Наличные') cash += cTot;
        else if (c.payMethod === 'QR') qr += cTot;
        else if (c.payMethod && c.payMethod.startsWith('Нал:')) {
            let mCash = c.payMethod.match(/Нал:\s*(\d+)/);
            let mQr = c.payMethod.match(/QR:\s*(\d+)/);
            if(mCash) cash += parseInt(mCash[1]);
            if(mQr) qr += parseInt(mQr[1]);
        }
        
        let discRatio = 1 - (c.discount || 0)/100;
        table += Math.round((c.timeCost || 0) * discRatio);
        bar += cTot - Math.round((c.timeCost || 0) * discRatio);
    });
    
    let expTotal = currentExp.reduce((s, e) => s + e.sum, 0);
    return { cash, qr, table, bar, total, expTotal, expectedCash: cash - expTotal };
}

// --- ЗАКРЫТИЕ СМЕНЫ ---
function logout() { document.getElementById('z-report-modal').style.display = 'flex'; }

function confirmZReport() {
    let physicalCash = parseInt(document.getElementById('z-cash-input').value) || 0;
    let shift = getCurrentShiftData();
    let diff = physicalCash - shift.expectedCash;
    
    let salary = 0;
    if (localAuth.user.role !== 'owner') {
        if (shift.total === 0) {
            let todayStr = new Date().toLocaleDateString();
            let someoneElseWorked = (cloudState.history || []).some(h => (h.timestamp ? new Date(h.timestamp).toLocaleDateString() : "") === todayStr && h.admin !== localAuth.user.name && h.total > 0);
            salary = someoneElseWorked ? 0 : 6000;
        } else {
            salary = Math.round(shift.total * 0.08 + 6000);
        }
    }
    
    if(!cloudState.history) cloudState.history = [];
    cloudState.history.push({ 
        admin: localAuth.user.name, start: localAuth.shiftStart, end: new Date().toLocaleString(), timestamp: Date.now(), 
        barRev: shift.bar, tableRev: shift.table, total: shift.total, sal: salary,
        expectedCash: shift.expectedCash, physicalCash: physicalCash, diff: diff,
        cashRev: shift.cash, qrRev: shift.qr, expTotal: shift.expTotal
    });
    
    if(localAuth.user.role !== 'owner') {
        if(!cloudState.ownerAcc) cloudState.ownerAcc = {};
        cloudState.ownerAcc[localAuth.user.name] = (cloudState.ownerAcc[localAuth.user.name] || 0) + salary;
    }
    
    saveToCloud(); localAuth = { isAuth: false }; saveLocalAuth(); 
    let diffMsg = diff < 0 ? `НЕДОСТАЧА: ${diff} ₸` : (diff > 0 ? `ИЗЛИШЕК: +${diff} ₸` : `КАССА ИДЕАЛЬНА`);
    alert(`Смена закрыта.\nОжидалось наличных (за вычетом расходов): ${shift.expectedCash} ₸\nВ кассе: ${physicalCash} ₸\n${diffMsg}`);
    location.reload();
}

function saveExpense() {
    let sum = parseInt(document.getElementById('exp-sum').value);
    let desc = document.getElementById('exp-desc').value;
    if(!sum || !desc) return alert("Заполните все поля!");
    if(!cloudState.expenses) cloudState.expenses = [];
    cloudState.expenses.push({ id: Date.now(), sum: sum, desc: desc, admin: localAuth.user.name, date: new Date().toLocaleString() });
    document.getElementById('expense-modal').style.display='none';
    saveToCloud(); alert("Расход записан!");
}

function deleteHistory(ts) {
    if(confirm("Удалить эту смену из Бухгалтерии?")) {
        cloudState.history = cloudState.history.filter(h => h.timestamp !== ts);
        saveToCloud();
    }
}
function deleteArchiveCheck(ts) {
    if(confirm("УДАЛИТЬ ЧЕК ИЗ АРХИВА? Внимание: выручка смены изменится!")) {
        cloudState.archive = cloudState.archive.filter(c => c.id !== ts);
        saveToCloud();
    }
}

// === УПРАВЛЕНИЕ АДМИНАМИ ===
function addCustomAdmin() { let name = prompt("Имя администратора:"); if(!name) return; let pin = prompt(`PIN-код:`); if(name && pin) { if(!cloudState.customAdmins) cloudState.customAdmins = []; cloudState.customAdmins.push({id: Date.now(), name: name, pin: pin, role: "admin"}); saveToCloud(); } }
function resetDatabase() { if(confirm("ОБНОВИТЬ (ОЧИСТИТЬ) БАЗУ?")) { cloudState = { tables: Array.from({length: 6}, (_, i) => ({ id: i + 1, active: false, start: null, res: [], bar:[] })), checks: [], archive: [], inventory: [], debts: [], history: [], ownerAcc: {}, customAdmins: [], expenses:[] }; saveToCloud(); location.reload(); } }

// === СТОЛЫ И БАР ===
function formatTime(ms) { if(ms<0) ms=0; let s = Math.floor(ms / 1000), h = String(Math.floor(s / 3600)).padStart(2, '0'), m = String(Math.floor((s % 3600) / 60)).padStart(2, '0'); return `${h}:${m}:${String(s % 60).padStart(2, '0')}`; }
function calcCost(start) { if(!start) return 0; let diff = Date.now() - start; if(diff<0) diff=0; let h = new Date(start).getHours(); let rate = (h >= 11 && h < 18) ? 2000 : 3000; return Math.ceil(((diff / 60000) * (rate / 60)) / 50) * 50; }

function startTable(id) { let t = cloudState.tables.find(x => x.id === id); t.active = true; t.start = Date.now(); t.bar = []; saveToCloud(); }
function stopTable(id) { let t = cloudState.tables.find(x => x.id === id); const name = prompt("Имя гостя:"); if (!name) return; createOrMergeCheck(name, id, calcCost(t.start), t.bar || []); t.active = false; t.start = null; t.bar = []; saveToCloud(); }
function commTable(id) { let t = cloudState.tables.find(x => x.id === id); const name = prompt("Коммерция. Кто проиграл?"); if (!name) return; createOrMergeCheck(name, id, calcCost(t.start), t.bar || []); t.start = Date.now(); t.bar = []; saveToCloud(); }

let barContext = null; 
function openBarModal(context) { barContext = context; document.getElementById('bar-modal').style.display = 'flex'; document.getElementById('bar-search').value = ''; renderBarSearch(); }
function renderBarSearch() {
    if(!cloudState.inventory) return;
    // УМНЫЙ СКЛАД: Сортировка (пустые внизу)
    let sortedInv = [...cloudState.inventory].sort((a,b) => { if(a.qty>0 && b.qty===0) return -1; if(a.qty===0 && b.qty>0) return 1; return 0; });
    const q = document.getElementById('bar-search').value.toLowerCase(); 
    document.getElementById('bar-items-list').innerHTML = sortedInv.filter(i => i.name.toLowerCase().includes(q)).map(i => {
        let colorClass = i.qty > 0 ? "stock-ok" : "stock-empty";
        return `<div class="bar-item-row" onclick="selectBarItem('${i.name}')"><span>${i.name}</span><span class="${colorClass}">${i.price} ₸ (${i.qty} шт)</span></div>`;
    }).join(''); 
}

function selectBarItem(itemName) {
    let item = cloudState.inventory.find(x => x.name === itemName);
    if(item.qty <= 0) return alert("Товар закончился!");
    let qtyStr = prompt(`Сколько добавить?\n${item.name} (Остаток: ${item.qty} шт.)`, "1");
    if (!qtyStr) return; 
    let qty = parseInt(qtyStr);
    if (isNaN(qty) || qty <= 0 || qty > item.qty) return alert("Некорректно!");
    item.qty -= qty;
    
    let itemsToAdd = []; for(let i = 0; i < qty; i++) itemsToAdd.push({name: item.name, price: item.price});

    if(barContext === 'standalone') { 
        const name = prompt("Имя гостя для бара:"); 
        if(name) createOrMergeCheck(name, "Бар", 0, itemsToAdd); else { item.qty += qty; return; }
    } else { 
        let t = cloudState.tables.find(x => x.id === barContext); if(!t.bar) t.bar = []; t.bar = t.bar.concat(itemsToAdd); 
    }
    document.getElementById('bar-modal').style.display = 'none'; saveToCloud();
}

let editTableId = null;
function openEditTableBar(id) {
    editTableId = id; let t = cloudState.tables.find(x => x.id === id);
    let html = (t.bar || []).map((b, i) => `<div class="edit-bar-item"><span>${b.name} (${b.price} ₸)</span> <button onclick="removeTableBarItem(${i})" class="btn-outline" style="color:var(--red); border-color:var(--red); padding:3px 8px; font-size:10px;">❌</button></div>`).join('');
    document.getElementById('edit-table-bar-list').innerHTML = html || '<span style="color:var(--gray); font-size:12px;">Пусто</span>';
    document.getElementById('edit-table-bar-modal').style.display = 'flex';
}
function removeTableBarItem(idx) {
    let t = cloudState.tables.find(x => x.id === editTableId);
    let item = t.bar.splice(idx, 1)[0];
    let invItem = cloudState.inventory.find(x => x.name === item.name); if(invItem) invItem.qty += 1;
    saveToCloud(); openEditTableBar(editTableId); // re-render
}

function createOrMergeCheck(name, tableId, timeCost, barItems) {
    if(!cloudState.checks) cloudState.checks = []; let barTotal = barItems.reduce((s, i) => s + i.price, 0); 
    let exist = cloudState.checks.find(c => c.name.toLowerCase() === name.toLowerCase());
    const now = new Date(); const timeStr = now.getHours().toString().padStart(2,'0') + ":" + now.getMinutes().toString().padStart(2,'0');

    if(exist && confirm(`Объединить с чеком гостя "${exist.name}"?`)) { 
        exist.timeCost += timeCost; exist.barCost += barTotal; if(barItems.length > 0) exist.bar = (exist.bar || []).concat(barItems); 
        let baseTotal = exist.timeCost + exist.barCost; exist.total = exist.discount ? Math.round(baseTotal * (1 - exist.discount/100)) : baseTotal;
        if(tableId !== "Бар") exist.details += ` + Стол ${tableId}`; 
        exist.endTime = timeStr;
        if(exist.startTime) {
            let sParts = exist.startTime.split(":"); let sDate = new Date(); sDate.setHours(sParts[0], sParts[1]);
            let diff = now - sDate; exist.duration = Math.floor(diff/3600000) + "ч " + Math.floor((diff%3600000)/60000) + "м";
        }
    } else { 
        let t = cloudState.tables.find(x => x.id === tableId);
        let startStr = t && t.start ? new Date(t.start).getHours().toString().padStart(2,'0') + ":" + new Date(t.start).getMinutes().toString().padStart(2,'0') : timeStr;
        let duration = "0ч 0м";
        if(t && t.start) { let diff = now - t.start; duration = Math.floor(diff/3600000) + "ч " + Math.floor((diff%3600000)/60000) + "м"; }
        cloudState.checks.push({ id: Date.now(), name: name, table: tableId, date: now.toLocaleDateString(), startTime: startStr, endTime: timeStr, duration: duration, timeCost: timeCost, barCost: barTotal, bar: barItems, total: timeCost + barTotal, discount: 0, details: `Стол ${tableId}` }); 
    }
}

// === РЕДАКТИРОВАНИЕ ЧЕКА И УМНОЕ СЛИЯНИЕ ===
let editingCheckIdx = null;
function openEditCheckModal(idx) { editingCheckIdx = idx; let c = cloudState.checks[idx]; document.getElementById('edit-check-name').value = c.name; document.getElementById('edit-check-time').value = c.timeCost; renderEditCheckBarItems(); document.getElementById('edit-check-modal').style.display = 'flex'; }
function renderEditCheckBarItems() {
    let c = cloudState.checks[editingCheckIdx];
    let html = (c.bar || []).map((b, i) => `<div class="edit-bar-item"><span>${b.name} (${b.price} ₸)</span> <button onclick="removeBarItemFromCheck(${i})" class="btn-outline" style="color:var(--red); border-color:var(--red); padding:5px 10px;">❌ Убрать</button></div>`).join('');
    document.getElementById('edit-check-bar-list').innerHTML = html || '<span style="color:var(--gray); font-size:12px;">Пусто</span>';
}
function removeBarItemFromCheck(itemIdx) {
    if(!confirm("Убрать товар? Он вернется на склад.")) return;
    let c = cloudState.checks[editingCheckIdx]; let item = c.bar.splice(itemIdx, 1)[0];
    c.barCost -= item.price; let baseTotal = c.timeCost + c.barCost; c.total = c.discount ? Math.round(baseTotal * (1 - c.discount/100)) : baseTotal;
    let invItem = cloudState.inventory.find(x => x.name === item.name); if(invItem) invItem.qty += 1;
    saveToCloud(); renderEditCheckBarItems();
}
function saveCheckEdit() {
    let c = cloudState.checks[editingCheckIdx]; 
    let newName = document.getElementById('edit-check-name').value;
    
    // Умное слияние
    if (newName.toLowerCase() !== c.name.toLowerCase()) {
        let existingIdx = cloudState.checks.findIndex(chk => chk.name.toLowerCase() === newName.toLowerCase() && chk.id !== c.id);
        if (existingIdx !== -1) {
            if(confirm(`Чек с именем "${newName}" уже есть. Объединить их?`)) {
                let ex = cloudState.checks[existingIdx];
                ex.timeCost += (parseInt(document.getElementById('edit-check-time').value) || 0);
                ex.barCost += c.barCost;
                if(c.bar && c.bar.length > 0) ex.bar = (ex.bar || []).concat(c.bar);
                let bTot = ex.timeCost + ex.barCost; ex.total = ex.discount ? Math.round(bTot * (1 - ex.discount/100)) : bTot;
                ex.details += ` + ${c.details}`;
                cloudState.checks.splice(editingCheckIdx, 1); // удаляем старый
                document.getElementById('edit-check-modal').style.display = 'none'; saveToCloud(); return;
            }
        }
    }
    
    c.name = newName;
    c.timeCost = parseInt(document.getElementById('edit-check-time').value) || 0; 
    let baseTotal = c.timeCost + c.barCost; c.total = c.discount ? Math.round(baseTotal * (1 - c.discount/100)) : baseTotal;
    document.getElementById('edit-check-modal').style.display = 'none'; saveToCloud();
}
function deleteCheck(idx) {
    if(confirm("УДАЛИТЬ ЧЕК?\nТовары вернутся на склад.")) {
        let c = cloudState.checks[idx];
        if(c.bar && c.bar.length > 0) { if(!cloudState.inventory) cloudState.inventory = []; c.bar.forEach(bItem => { let invItem = cloudState.inventory.find(x => x.name === bItem.name); if(invItem) invItem.qty += 1; else cloudState.inventory.push({name: bItem.name, price: bItem.price, qty: 1}); }); }
        cloudState.checks.splice(idx, 1); saveToCloud();
    }
}

// === ОПЛАТА ===
let currentCheckIndex = null;
function openPayModal(idx) { 
    currentCheckIndex = idx; let c = cloudState.checks[idx]; let origTotal = c.timeCost + c.barCost;
    if(c.discount > 0) { document.getElementById('pay-total').innerHTML = `<span style="text-decoration:line-through; font-size:20px; color:var(--gray);">${origTotal} ₸</span><br>${c.total} ₸`; document.getElementById('pay-info').innerText = `${c.name} | ${c.details} (-${c.discount}%)`; } 
    else { document.getElementById('pay-total').innerText = c.total + " ₸"; document.getElementById('pay-info').innerText = `${c.name} | ${c.details}`; }
    document.getElementById('pay-main-buttons').style.display = 'flex'; document.getElementById('mix-pay-section').style.display = 'none'; document.getElementById('pay-modal').style.display = 'flex'; 
}

function applyDiscount(pct) {
    let c = cloudState.checks[currentCheckIndex]; c.discount = pct; let origTotal = c.timeCost + c.barCost;
    if(pct === 0) { c.total = origTotal; document.getElementById('pay-total').innerText = c.total + " ₸"; document.getElementById('pay-info').innerText = `${c.name} | ${c.details}`; } 
    else { c.total = Math.round(origTotal * (1 - pct / 100)); document.getElementById('pay-total').innerHTML = `<span style="text-decoration:line-through; font-size:20px; color:var(--gray);">${origTotal} ₸</span><br>${c.total} ₸`; document.getElementById('pay-info').innerText = `${c.name} | ${c.details} (-${pct}%)`; }
    if (document.getElementById('mix-pay-section').style.display === 'block') calcMixQr(); saveToCloud();
}

function processPayment(method) {
    let c = cloudState.checks[currentCheckIndex];
    let disc = (1 - (c.discount||0)/100);
    c.timeCost = Math.round(c.timeCost * disc); c.barCost = c.total - c.timeCost; c.payMethod = method; c.admin = localAuth.user.name;

    if(method === 'Долг') { 
        if(!cloudState.debts) cloudState.debts = []; let d = cloudState.debts.find(x => x.name.toLowerCase() === c.name.toLowerCase()); 
        let histStr = `+${c.total}₸ (${new Date().toLocaleString()}, Админ: ${localAuth.user.name})`;
        if(d) { d.total += c.total; d.history.push(histStr); } else { cloudState.debts.push({ name: c.name, total: c.total, history: [histStr] }); } 
    }
    
    if(!cloudState.archive) cloudState.archive = []; cloudState.archive.push(c); cloudState.checks.splice(currentCheckIndex, 1);
    document.getElementById('pay-modal').style.display = 'none'; saveToCloud();
}

function showMixPay() { document.getElementById('pay-main-buttons').style.display = 'none'; document.getElementById('mix-pay-section').style.display = 'block'; document.getElementById('mix-cash-input').value = ''; document.getElementById('mix-qr-val').innerText = cloudState.checks[currentCheckIndex].total; }
function hideMixPay() { document.getElementById('pay-main-buttons').style.display = 'flex'; document.getElementById('mix-pay-section').style.display = 'none'; }
function calcMixQr() { let t = cloudState.checks[currentCheckIndex].total; let c = parseInt(document.getElementById('mix-cash-input').value) || 0; let q = t - c; document.getElementById('mix-qr-val').innerText = q < 0 ? 0 : q; }
function confirmMixPay() { let t = cloudState.checks[currentCheckIndex].total; let c = parseInt(document.getElementById('mix-cash-input').value) || 0; let q = t - c; if (c < 0 || q < 0) return alert("Ошибка!"); processPayment(`Нал: ${c}₸ / QR: ${q}₸`); }
function payDebt(idx) { let d = cloudState.debts[idx]; let sum = prompt(`Долг: ${d.total} ₸. Оплата (Наличными):`); if(sum && !isNaN(sum)) { sum = parseInt(sum); d.total -= sum; d.history.push(`Оплата: -${sum}₸ (${new Date().toLocaleDateString()}, Админ: ${localAuth.user.name})`); if(d.total <= 0) cloudState.debts.splice(idx, 1); saveToCloud(); } }

// === СКЛАД ===
function openAddItemModal() { document.getElementById('add-item-modal').style.display = 'flex'; document.getElementById('new-item-name').value = ''; document.getElementById('new-item-price').value = ''; document.getElementById('new-item-qty').value = ''; }
function saveNewItem() { const name = document.getElementById('new-item-name').value.trim(); const price = parseInt(document.getElementById('new-item-price').value); const qty = parseInt(document.getElementById('new-item-qty').value); if(!name || isNaN(price) || isNaN(qty)) return alert("Заполните поля!"); if(!cloudState.inventory) cloudState.inventory = []; cloudState.inventory.push({name, price, qty}); document.getElementById('add-item-modal').style.display = 'none'; saveToCloud(); }
function editItemQty(idx) { let q = prompt("Новый остаток:", cloudState.inventory[idx].qty); if(q !== null && q !== "") { cloudState.inventory[idx].qty = parseInt(q); saveToCloud(); } }
function renameItem(idx) { let n = prompt("Новое название:", cloudState.inventory[idx].name); if(n) { cloudState.inventory[idx].name = n; saveToCloud(); } }
function editItemPrice(idx) { let p = prompt("Новая цена:", cloudState.inventory[idx].price); if(p !== null && p !== "") { cloudState.inventory[idx].price = parseInt(p); saveToCloud(); } }
function delItem(idx) { if(confirm(`Удалить товар?`)) { cloudState.inventory.splice(idx,1); saveToCloud(); } }

function showTab(id, btn) { document.querySelectorAll('.tab-pane').forEach(x => x.style.display = 'none'); document.querySelectorAll('.nav-link').forEach(x => x.classList.remove('active')); document.getElementById('tab-'+id).style.display = 'block'; btn.classList.add('active'); }

let accPeriod = 'today'; 
function setAccPeriod(p, btn) { accPeriod = p; document.querySelectorAll('.acc-filter').forEach(x => x.classList.remove('active')); btn.classList.add('active'); renderAccounting(); }

function renderAccounting() {
    if(!cloudState.history) return;
    const now = new Date(); const todayStr = now.toLocaleDateString(); const nowTime = now.getTime();
    
    let filtered = cloudState.history.filter(h => {
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
    filtered.forEach(h => { tRev += (h.total || 0); bRev += (h.barRev || 0); tblRev += (h.tableRev || 0); sal += (h.sal || 0); expTotal += (h.expTotal || 0); });

    document.getElementById('acc-trev').innerText = tRev.toLocaleString() + " ₸"; 
    document.getElementById('acc-details').innerText = `Бар: ${bRev} ₸ | Столы: ${tblRev} ₸`;
    document.getElementById('acc-sal').innerText = (sal + expTotal).toLocaleString() + " ₸"; 
    document.getElementById('acc-net').innerText = (tRev - sal - expTotal).toLocaleString() + " ₸";
    
    document.getElementById('history-list').innerHTML = filtered.map(h => {
        let diffColor = h.diff < 0 ? 'var(--red)' : (h.diff > 0 ? 'var(--green)' : 'var(--gray)');
        let expStr = h.expTotal > 0 ? `<br><span style="color:var(--red); font-size:10px;">Расход: -${h.expTotal}</span>` : '';
        return `<tr><td><b>${h.admin}</b></td><td><span style="font-size:11px; color:var(--gray);">${h.start} - ${h.end}</span></td><td><span style="font-size:11px; color:var(--gray);">Нал: ${h.cashRev||0}<br>QR: ${h.qrRev||0}</span></td><td><b class="gold-text">${h.total} ₸</b><br><span style="font-size:10px; color:${diffColor};">Нал в кассе: ${h.physicalCash} (Разн: ${h.diff})</span>${expStr}</td><td><b style="color:var(--green);">${h.sal} ₸</b></td><td><button onclick="deleteHistory(${h.timestamp})" class="btn-red" style="padding:6px 10px; font-size:12px; width:auto;">🗑️</button></td></tr>`;
    }).join('');
}

function renderTables() {
    if(!document.getElementById('tables-grid')) return;
    document.getElementById('tables-grid').innerHTML = cloudState.tables.map(t => {
        let cost = t.active ? calcCost(t.start) : 0;
        let time = t.active ? formatTime(Date.now() - t.start) : "00:00:00";
        
        // Товары бара под столом
        let barSum = 0; let barHtml = '';
        if(t.active && t.bar && t.bar.length > 0) {
            let grouped = {};
            t.bar.forEach(i => { grouped[i.name] = grouped[i.name] || {q:0, p:i.price}; grouped[i.name].q++; });
            barHtml = `<div class="mini-bar-list">` + Object.keys(grouped).map(k => { barSum += grouped[k].q*grouped[k].p; return `<div class="mini-bar-item"><span>${k} x${grouped[k].q}</span><span>${grouped[k].q*grouped[k].p}</span></div>`; }).join('') + `<div style="text-align:right; font-weight:bold; margin-top:5px; color:var(--gold);">Сумма: ${barSum} ₸ <button onclick="openEditTableBar(${t.id})" style="background:none; border:none; font-size:14px; margin-left:5px; cursor:pointer;">⚙️</button></div></div>`;
        }
        let totalDisplay = cost + barSum;

        let resHtml = (t.res || []).map((r, i) => `<div class="res-item"><span>📅 ${r}</span> <div><span onclick="editRes(${t.id},${i})" style="cursor:pointer; margin-right:10px;">✏️</span><span onclick="delRes(${t.id},${i})" style="color:var(--red); cursor:pointer;">❌</span></div></div>`).join('');
        
        return `<div class="table-card ${t.active ? 'active' : ''}"><div style="font-size:22px; font-weight:800; color:var(--gold);">СТОЛ ${t.id}</div><div class="timer">${time}</div><div style="font-size:28px; font-weight:800; color:var(--white); margin-bottom:15px;">${totalDisplay} ₸</div>${barHtml}${!t.active ? `<button onclick="startTable(${t.id})" class="btn-gold btn-large shadow-gold" style="margin-top:auto;">▶ ПУСК СТОЛА</button>` : `<button onclick="stopTable(${t.id})" class="btn-red" style="margin-bottom:10px;">⏹ СТОП В ЧЕК</button><div class="table-actions"><button class="btn-outline flex-1" onclick="openBarModal(${t.id})">🍸 БАР</button><button class="btn-outline flex-1" onclick="commTable(${t.id})">🔄 КОММЕРЦ</button></div>`}<button class="btn-outline" style="width:100%; margin-top:15px; border-color:var(--border); color:var(--gray);" onclick="addRes(${t.id})">+ ДОБАВИТЬ БРОНЬ</button>${resHtml}</div>`;
    }).join('');
}

function openFullCheck(idx) {
    let c = cloudState.checks[idx]; document.getElementById('bill-date').innerText = c.date + " " + c.endTime; document.getElementById('bill-guest').innerText = c.name; document.getElementById('bill-table-num').innerText = c.table; document.getElementById('bill-start').innerText = c.startTime; document.getElementById('bill-end').innerText = c.endTime; document.getElementById('bill-duration').innerText = c.duration;
    let grouped = {}; (c.bar || []).forEach(i => { grouped[i.name] = grouped[i.name] || {q:0, p:i.price}; grouped[i.name].q++; });
    document.getElementById('bill-items-body').innerHTML = Object.keys(grouped).map(k => `<tr><td>${k}</td><td>${grouped[k].q}</td><td>${grouped[k].p}</td><td>${grouped[k].q*grouped[k].p}</td></tr>`).join('');
    document.getElementById('bill-time-sum').innerText = c.timeCost; document.getElementById('bill-bar-sum').innerText = c.barCost; document.getElementById('bill-total').innerText = c.total;
    if(c.discount > 0) { document.getElementById('bill-discount-row').style.display='block'; document.getElementById('bill-discount-val').innerText = c.discount; } else document.getElementById('bill-discount-row').style.display='none';
    document.getElementById('full-check-modal').style.display='flex';
}

function render() {
    if (!localAuth.isAuth) { 
        let html = STAFF_HARDCODED.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        (cloudState.customAdmins || []).forEach((a) => { html += `<option value="custom_${a.id}">${a.name}</option>`; });
        let sel = document.getElementById('staff-select'); if(sel) sel.innerHTML = html;
        document.getElementById('auth-screen').style.display='flex'; document.getElementById('app').style.display='none'; return; 
    }
    
    document.getElementById('auth-screen').style.display='none'; document.getElementById('app').style.display='block';
    document.getElementById('user-display').innerText = localAuth.user.name;
    
    let isOwner = localAuth.user.role === 'owner';
    document.getElementById('owner-tab').style.display = isOwner ? 'block' : 'none';
    document.getElementById('acc-tab').style.display = isOwner ? 'block' : 'none';
    document.getElementById('btn-open-add-item').style.display = isOwner ? 'block' : 'none';
    document.getElementById('th-archive-del').style.display = isOwner ? 'table-cell' : 'none';

    renderTables();

    // Считаем онлайн-статистику смены из Облака
    let shift = getCurrentShiftData();
    let shiftZp = 0;
    if(!isOwner) {
        if(shift.total === 0) {
            let todayStr = new Date().toLocaleDateString();
            let someoneElseWorked = (cloudState.history || []).some(h => (h.timestamp ? new Date(h.timestamp).toLocaleDateString() : "") === todayStr && h.admin !== localAuth.user.name && h.total > 0);
            shiftZp = someoneElseWorked ? 0 : 6000;
        } else { shiftZp = Math.round(shift.total * 0.08 + 6000); }
    }
    
    let accZp = (cloudState.ownerAcc && cloudState.ownerAcc[localAuth.user.name]) ? cloudState.ownerAcc[localAuth.user.name] : 0;
    
    document.getElementById('global-rev').innerHTML = shift.total.toLocaleString() + " ₸<br><span style='font-size:11px; color:var(--gray);'>Нал: " + shift.cash.toLocaleString() + " | QR: " + shift.qr.toLocaleString() + "</span>";
    document.getElementById('global-shift-zp').innerText = shiftZp.toLocaleString() + " ₸";
    document.getElementById('global-total-zp').innerText = isOwner ? "---" : (accZp + shiftZp).toLocaleString() + " ₸";

    document.getElementById('active-checks').innerHTML = (cloudState.checks||[]).map((c, i) => { 
        let bHtml = (c.bar||[]).map(b => `${b.name}`).join(', '); let discountHtml = (c.discount && c.discount > 0) ? `<span style="color:var(--red); font-size:14px; font-weight:bold; margin-left:10px;">-${c.discount}%</span>` : '';
        let timeInfo = (c.startTime && c.endTime && c.duration) ? `<br><span style="font-size:11px;color:var(--gray);">🕒 ${c.startTime} - ${c.endTime} (${c.duration})</span>` : '';
        
        let adminButtons = `<button onclick="openEditCheckModal(${i})" class="btn-outline" style="border-color:#444; color:#aaa; font-size:10px;">⚙️ РЕДАКТИРОВАТЬ</button>`;
        if (isOwner) adminButtons += `<button onclick="deleteCheck(${i})" class="btn-outline" style="border-color:var(--red); color:var(--red); font-size:10px;">🗑️ УДАЛИТЬ ЧЕК</button>`;

        return `<div class="check-row"><div style="flex:1;"><div><b style="font-size:20px; color:var(--gold);">${c.name}</b> <span style="font-size:11px;color:var(--gray);margin-left:10px;">${c.date}</span></div><div style="font-size:13px;color:var(--gray);margin-top:8px;">${c.details} (${c.timeCost} ₸) ${timeInfo} ${bHtml?`<br>🍸 Бар: ${bHtml} (${c.barCost} ₸)`:''}</div><div style="font-size:24px;font-weight:800;margin-top:10px;">${c.total} ₸ ${discountHtml}</div></div><div style="display:flex; flex-direction:column; gap:5px;"><button onclick="openPayModal(${i})" class="btn-gold shadow-gold" style="padding:15px; border-radius:12px;">ОПЛАТА</button><button onclick="openFullCheck(${i})" class="btn-outline">📄 ЧЕК</button>${adminButtons}</div></div>`; 
    }).join('');
    
    document.getElementById('archive-list').innerHTML = (cloudState.archive||[]).map(a => {
        let barInfo = ''; if(a.bar && a.bar.length>0) { let gr = {}; a.bar.forEach(i=>{gr[i.name]=gr[i.name]||{q:0}; gr[i.name].q++;}); barInfo = Object.keys(gr).map(k=>`${k} x${gr[k].q}`).join(', '); }
        let timeInfo = a.startTime ? `🕒 ${a.startTime}-${a.endTime} (${a.duration})` : '';
        let delBtn = isOwner ? `<td><button onclick="deleteArchiveCheck(${a.id})" class="btn-red" style="padding:4px 8px; font-size:10px;">🗑️</button></td>` : '';
        return `<tr><td style="color:var(--gray); font-size:11px;">${a.date} ${a.endTime||''}</td><td><b style="color:var(--white);">${a.name}</b></td><td style="font-size:11px;">${a.details}<br><span style="color:var(--gray);">${timeInfo}</span><br><span style="color:var(--gold);">${barInfo}</span></td><td>Столы: ${a.timeCost}₸<br>Бар: ${a.barCost}₸<br><b class="gold-text">${a.total} ₸</b></td><td><span style="background:var(--border); color:var(--gold); padding:4px; border-radius:4px; font-size:10px;">${a.payMethod}</span></td><td>${a.admin}</td>${delBtn}</tr>`;
    }).join('');
    
    document.getElementById('stock-list').innerHTML = (cloudState.inventory||[]).map((i, idx) => {
        let colorClass = i.qty > 0 ? "var(--white)" : "var(--red)";
        let stockBtns = isOwner ? `<button onclick="editItemQty(${idx})" class="btn-outline" style="padding:6px 10px; font-size:10px;">✏️ КОЛ-ВО</button><button onclick="renameItem(${idx})" class="btn-outline" style="padding:6px 10px; font-size:10px;">✏️ ИМЯ</button><button onclick="editItemPrice(${idx})" class="btn-outline" style="padding:6px 10px; font-size:10px;">✏️ ЦЕНА</button><button onclick="delItem(${idx})" class="btn-red" style="padding:6px 10px; font-size:10px; width:auto; margin-top:0;">❌</button>` : '';
        return `<tr><td><b style="color:${colorClass};">${i.name}</b></td><td><b style="font-size:16px; color:${colorClass};">${i.qty} шт</b></td><td class="gold-text"><b style="font-size:16px;">${i.price} ₸</b></td><td style="display:flex; gap:5px; flex-wrap:wrap;">${stockBtns}</td></tr>`;
    }).join('');
    
    document.getElementById('debts-list').innerHTML = (cloudState.debts||[]).map((d, i) => `<tr><td><b class="gold-text" style="font-size:16px;">${d.name}</b></td><td style="color:var(--red); font-weight:800; font-size:20px;">${d.total} ₸</td><td><span style="font-size:11px; color:var(--gray);">${(d.history||[]).join('<br>')}</span></td><td style="text-align:right;"><button onclick="payDebt(${i})" class="btn-outline" style="border-color:var(--green); color:var(--green);">Расчет</button> <button onclick="delDebt(${i})" style="background:none; border:none; color:var(--red); cursor:pointer; font-size:22px; margin-left:10px;">×</button></td></tr>`).join('');
    
    document.getElementById('my-history-list').innerHTML = (cloudState.history||[]).filter(h => h.admin === localAuth.user.name).map(h => `<tr><td>${h.start}</td><td>${h.end}</td><td><span style="font-size:11px; color:var(--gray);">Нал: ${h.cashRev||0}<br>QR: ${h.qrRev||0}</span></td><td class="gold-text"><b>${h.total} ₸</b></td><td style="color:var(--green);"><b>${h.sal} ₸</b></td></tr>`).join('');
    
    if(isOwner) {
        renderAccounting();
        document.getElementById('custom-admins-list').innerHTML = (cloudState.customAdmins||[]).map((a, i) => `<span style="background:#111; border:1px solid var(--border); padding:8px 15px; border-radius:8px; display:inline-flex; align-items:center; gap:10px;">${a.name} <span onclick="delCustomAdmin(${i})" style="color:var(--red); cursor:pointer; font-weight:bold;">×</span></span>`).join('');
        if(cloudState.ownerAcc) {
            document.getElementById('admin-salaries-list').innerHTML = Object.keys(cloudState.ownerAcc).map(name => {
                let debt = cloudState.ownerAcc[name];
                return `<div class="check-row"><div><b style="font-size:20px; color:var(--white);">${name}</b><br><span style="font-size:11px; color:var(--gray);">ДОЛГ К ВЫПЛАТЕ:</span> <b style="color:var(--green); font-size:24px; display:block; margin-top:5px;">${debt} ₸</b></div><div style="display:flex; flex-direction:column; gap:5px;"><button onclick="payAdminAdvance('${name}')" class="btn-outline" style="border-color:var(--green); color:var(--green);">АВАНС</button><button onclick="fullPayAdmin('${name}')" class="btn-gold" style="padding:10px;">ПОЛНЫЙ РАСЧЕТ</button><button onclick="editAdminSalary('${name}')" class="btn-outline">ИЗМЕНИТЬ ЦИФРУ</button><button onclick="fineAdmin('${name}')" class="btn-outline" style="border-color:var(--red); color:var(--red);">ШТРАФ</button></div></div>`;
            }).join('');
        }
    }
}
