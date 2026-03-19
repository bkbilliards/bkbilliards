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

// Добавлены cashRev и qrRev для учета нала и QR
let localAuth = JSON.parse(localStorage.getItem('sensei_auth_pro')) || { isAuth: false, user: null, shiftStart: null, tableRev: 0, barRev: 0, shiftCash: 0, cashRev: 0, qrRev: 0 };
let cloudState = { tables: Array.from({length: 6}, (_, i) => ({ id: i + 1, active: false, start: null, res: [] })), checks: [], archive: [], inventory: [], debts: [], history: [], ownerAcc: {}, customAdmins: [] };

db.ref('.info/connected').on('value', snap => { const el = document.getElementById('sync-status'); if(el) el.innerText = snap.val() ? '🟢' : '🔴'; });

let lastAdminCount = -1;
let currentFilteredHistory = []; 

dbRef.on('value', snap => {
    if (snap.val()) cloudState = snap.val();
    else saveToCloud();
    render();
});

function saveToCloud() { dbRef.set(cloudState).catch(e => console.error(e)); }
function saveLocalAuth() { localStorage.setItem('sensei_auth_pro', JSON.stringify(localAuth)); }

window.onload = () => { render(); setInterval(() => { if(localAuth.isAuth) renderTables(); }, 1000); };

// === АВТОРИЗАЦИЯ И СБРОС ===
function login() {
    const val = document.getElementById('staff-select').value;
    const pin = document.getElementById('pass-input').value;
    let user = null;
    if (val === '0') user = STAFF_HARDCODED[0];
    else if (val === '1') user = STAFF_HARDCODED[1];
    else if (val === 'owner') user = STAFF_HARDCODED[2];
    else if (val.startsWith('custom_')) { let idx = parseInt(val.split('_')[1]); user = cloudState.customAdmins[idx]; }

    if (user && user.pin === pin) {
        localAuth = { isAuth: true, user: user, shiftStart: new Date().toLocaleString(), tableRev: 0, barRev: 0, shiftCash: 0, cashRev: 0, qrRev: 0 };
        saveLocalAuth(); document.getElementById('pass-input').value = ""; document.getElementById('auth-error').style.display = 'none'; render();
    } else { document.getElementById('auth-error').style.display = 'block'; }
}

// === Z-ОТЧЕТ И ЗАКРЫТИЕ СМЕНЫ ===
function logout() {
    if (!confirm("Вы хотите закрыть смену?")) return;
    document.getElementById('z-report-modal').style.display = 'flex';
}

function confirmZReport() {
    let physicalCash = parseInt(document.getElementById('z-cash-input').value) || 0;
    let expectedCash = localAuth.shiftCash || 0;
    let diff = physicalCash - expectedCash;
    
    const totalRev = localAuth.tableRev + localAuth.barRev;
    let salary = 0;
    
    if (localAuth.user.role !== 'owner') {
        if (totalRev === 0) {
            let todayStr = new Date().toLocaleDateString();
            let someoneElseWorked = (cloudState.history || []).some(h => {
                let d = h.timestamp ? new Date(h.timestamp).toLocaleDateString() : "";
                return d === todayStr && h.admin !== localAuth.user.name && h.total > 0;
            });
            salary = someoneElseWorked ? 0 : 6000;
        } else {
            salary = Math.round(totalRev * 0.08 + 6000);
        }
    }
    
    if(!cloudState.history) cloudState.history = [];
    cloudState.history.push({ 
        admin: localAuth.user.name, start: localAuth.shiftStart, end: new Date().toLocaleString(), timestamp: Date.now(), 
        barRev: localAuth.barRev, tableRev: localAuth.tableRev, total: totalRev, sal: salary,
        expectedCash: expectedCash, physicalCash: physicalCash, diff: diff,
        cashRev: localAuth.cashRev || 0, qrRev: localAuth.qrRev || 0 // Сохраняем разделение
    });
    
    if(localAuth.user.role !== 'owner') {
        if(!cloudState.ownerAcc) cloudState.ownerAcc = {};
        let currentAcc = cloudState.ownerAcc[localAuth.user.name] || 0;
        cloudState.ownerAcc[localAuth.user.name] = currentAcc + salary;
    }
    
    saveToCloud(); 
    localAuth = { isAuth: false, user: null, shiftStart: null, tableRev: 0, barRev: 0, shiftCash: 0, cashRev: 0, qrRev: 0 }; 
    saveLocalAuth(); 
    
    document.getElementById('z-report-modal').style.display = 'none';
    document.getElementById('z-cash-input').value = '';
    
    let diffMsg = diff < 0 ? `НЕДОСТАЧА: ${diff} ₸` : (diff > 0 ? `ИЗЛИШЕК: +${diff} ₸` : `КАССА ИДЕАЛЬНА`);
    alert(`Смена успешно закрыта.\n\nОжидалось наличных: ${expectedCash} ₸\nУказано вами: ${physicalCash} ₸\n${diffMsg}`);
    render();
}

function resetDatabase() {
    if(confirm("ВНИМАНИЕ!\nВы уверены, что хотите полностью ОБНОВИТЬ (ОЧИСТИТЬ) БАЗУ?\n\nВсе чеки, долги, склады, истории смен и ЗАРПЛАТЫ АДМИНОВ удалятся навсегда!")) {
        cloudState = { tables: Array.from({length: 6}, (_, i) => ({ id: i + 1, active: false, start: null, res: [] })), checks: [], archive: [], inventory: [], debts: [], history: [], ownerAcc: {}, customAdmins: [] };
        saveToCloud(); localAuth = { isAuth: false, user: null, shiftStart: null, tableRev: 0, barRev: 0, shiftCash: 0, cashRev: 0, qrRev: 0 }; saveLocalAuth();
        alert("База данных успешно очищена."); window.location.reload();
    }
}

// === УДАЛЕНИЕ СМЕНЫ ХОЗЯИНОМ ===
window.deleteHistory = function(ts) {
    if(confirm("Удалить эту смену из Бухгалтерии? Зарплата за нее не спишется с баланса администратора автоматически, это нужно сделать вручную в 'АДМИНЫ'.")) {
        cloudState.history = cloudState.history.filter(h => h.timestamp !== ts);
        saveToCloud();
        renderAccounting();
    }
}

// === УПРАВЛЕНИЕ ПЕРСОНАЛОМ ===
function addCustomAdmin() { let name = prompt("Введите имя нового администратора:"); if(!name) return; let pin = prompt(`Придумайте PIN-код для ${name}:`); if(name && pin) { if(!cloudState.customAdmins) cloudState.customAdmins = []; cloudState.customAdmins.push({name: name, pin: pin, role: "admin"}); saveToCloud(); alert(`Администратор ${name} добавлен!`); } }
function delCustomAdmin(idx) { if(confirm(`Удалить временного администратора "${cloudState.customAdmins[idx].name}"?`)) { cloudState.customAdmins.splice(idx, 1); saveToCloud(); } }
function payAdminAdvance(name) { let currentDebt = (cloudState.ownerAcc && cloudState.ownerAcc[name]) ? cloudState.ownerAcc[name] : 0; let s = prompt(`К выплате ${name}: ${currentDebt}₸.\nСумма аванса/выплаты:`); if(s && !isNaN(s)) { if(!cloudState.ownerAcc) cloudState.ownerAcc = {}; cloudState.ownerAcc[name] = currentDebt - parseInt(s); saveToCloud(); } }
function fullPayAdmin(name) { if(confirm(`Выдать полный расчет администратору ${name} и обнулить его баланс?`)) { if(!cloudState.ownerAcc) cloudState.ownerAcc = {}; cloudState.ownerAcc[name] = 0; saveToCloud(); } }
function editAdminSalary(name) { let currentDebt = (cloudState.ownerAcc && cloudState.ownerAcc[name]) ? cloudState.ownerAcc[name] : 0; let s = prompt(`Ввести новую точную сумму баланса для ${name}:`, currentDebt); if(s !== null && !isNaN(s)) { if(!cloudState.ownerAcc) cloudState.ownerAcc = {}; cloudState.ownerAcc[name] = parseInt(s); saveToCloud(); } }
function fineAdmin(name) { let currentDebt = (cloudState.ownerAcc && cloudState.ownerAcc[name]) ? cloudState.ownerAcc[name] : 0; let s = prompt(`Сумма штрафа для ${name} (отнимется от ЗП):`); if(s && !isNaN(s)) { if(!cloudState.ownerAcc) cloudState.ownerAcc = {}; cloudState.ownerAcc[name] = currentDebt - parseInt(s); saveToCloud(); } }

// === СТОЛЫ И БАР ===
function formatTime(ms) { let s = Math.floor(ms / 1000), h = String(Math.floor(s / 3600)).padStart(2, '0'), m = String(Math.floor((s % 3600) / 60)).padStart(2, '0'); return `${h}:${m}:${String(s % 60).padStart(2, '0')}`; }
function calcCost(startTime) { if (!startTime) return 0; let total = 0, current = new Date(startTime), end = new Date(); while (current < end) { let h = current.getHours(); total += ((h >= 11 && h < 18) ? 2000 : 3000) / 60; current.setMinutes(current.getMinutes() + 1); } return Math.ceil(total / 50) * 50; }

function startTable(id) { const t = cloudState.tables.find(x => x.id === id); t.active = true; t.start = Date.now(); t.bar = []; saveToCloud(); }
function stopTable(id) { const t = cloudState.tables.find(x => x.id === id); const name = prompt("Имя гостя для чека:"); if (!name) return; createOrMergeCheck(name, id, calcCost(t.start), t.bar || []); t.active = false; t.start = null; t.bar = []; saveToCloud(); }
function commTable(id) { const t = cloudState.tables.find(x => x.id === id); const name = prompt("Коммерция. Кто проиграл?"); if (!name) return; createOrMergeCheck(name, id, calcCost(t.start), t.bar || []); t.start = Date.now(); t.bar = []; saveToCloud(); }
function addRes(id) { const t = cloudState.tables.find(x => x.id === id); let r = prompt("Бронь (Имя, Время):"); if(r) { if(!t.res) t.res=[]; t.res.push(r); saveToCloud(); } }
function editRes(tId, rIdx) { let t = cloudState.tables.find(x => x.id === tId); let n = prompt("Изменить:", t.res[rIdx]); if(n) { t.res[rIdx] = n; saveToCloud(); } }
function delRes(tId, rIdx) { cloudState.tables.find(x => x.id === tId).res.splice(rIdx,1); saveToCloud(); }

let barContext = null; 
function openBarModal(context) { barContext = context; if(!cloudState.inventory || cloudState.inventory.length === 0) return alert("Склад пуст! Добавьте товар."); document.getElementById('bar-modal').style.display = 'flex'; document.getElementById('bar-search').value = ''; renderBarSearch(); }
function renderBarSearch() { const q = document.getElementById('bar-search').value.toLowerCase(); document.getElementById('bar-items-list').innerHTML = cloudState.inventory.filter(i => i.name.toLowerCase().includes(q)).map(i => `<div class="bar-item-row" onclick="selectBarItem('${i.name}')"><span>${i.name}</span><span style="color:#f1c40f; font-weight:bold;">${i.price} ₸ (Ост: ${i.qty})</span></div>`).join(''); }

function selectBarItem(itemName) {
    let item = cloudState.inventory.find(x => x.name === itemName);
    if(item.qty <= 0) return alert("Товар закончился!");
    
    let qtyStr = prompt(`Сколько штук добавить?\nТовар: ${item.name}\nВ наличии: ${item.qty} шт.`, "1");
    if (qtyStr === null) return; 
    let qty = parseInt(qtyStr);
    if (isNaN(qty) || qty <= 0) return alert("Некорректное количество!");
    if (qty > item.qty) return alert(`Ошибка! На складе только ${item.qty} шт.`);
    
    item.qty -= qty;
    let itemsToAdd = [];
    for(let i = 0; i < qty; i++) {
        itemsToAdd.push({name: item.name, price: item.price});
    }

    if(barContext === 'standalone') { 
        const name = prompt("Имя гостя для чека бара:"); 
        if(name) {
            createOrMergeCheck(name, "Бар", 0, itemsToAdd); 
        } else {
            item.qty += qty;
            return;
        }
    } 
    else { 
        const t = cloudState.tables.find(x => x.id === barContext); 
        if(!t.bar) t.bar = []; 
        t.bar = t.bar.concat(itemsToAdd); 
    }
    document.getElementById('bar-modal').style.display = 'none'; 
    saveToCloud();
}

function createOrMergeCheck(name, tableId, timeCost, barItems) {
    if(!cloudState.checks) cloudState.checks = []; 
    let barTotal = barItems.reduce((s, i) => s + i.price, 0); 
    let exist = cloudState.checks.find(c => c.name.toLowerCase() === name.toLowerCase());
    
    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2,'0') + ":" + now.getMinutes().toString().padStart(2,'0');

    if(exist && confirm(`Объединить с чеком гостя "${exist.name}"?`)) { 
        exist.timeCost += timeCost; exist.barCost += barTotal; if(barItems.length > 0) exist.bar = (exist.bar || []).concat(barItems); 
        let baseTotal = exist.timeCost + exist.barCost; exist.total = exist.discount ? Math.round(baseTotal * (1 - exist.discount/100)) : baseTotal;
        if(tableId !== "Бар") exist.details += ` + Стол ${tableId}`; 
        exist.endTime = timeStr; // Обновляем конец
        if(exist.startTime) {
            let sParts = exist.startTime.split(":");
            let sDate = new Date(); sDate.setHours(sParts[0], sParts[1]);
            let diff = now - sDate;
            exist.duration = Math.floor(diff/3600000) + "ч " + Math.floor((diff%3600000)/60000) + "м";
        }
    } 
    else { 
        let t = cloudState.tables.find(x => x.id === tableId);
        let startStr = t && t.start ? new Date(t.start).getHours().toString().padStart(2,'0') + ":" + new Date(t.start).getMinutes().toString().padStart(2,'0') : timeStr;
        let duration = "0ч 0м";
        if(t && t.start) {
            let diff = now - t.start;
            duration = Math.floor(diff/3600000) + "ч " + Math.floor((diff%3600000)/60000) + "м";
        }

        cloudState.checks.push({ 
            id: Date.now(), name: name, table: tableId, date: now.toLocaleDateString(), 
            startTime: startStr, endTime: timeStr, duration: duration,
            timeCost: timeCost, barCost: barTotal, bar: barItems, total: timeCost + barTotal, discount: 0, details: `Стол ${tableId}` 
        }); 
    }
}

// === РЕДАКТИРОВАНИЕ И УДАЛЕНИЕ ЧЕКА ===
let editingCheckIdx = null;
function openEditCheckModal(idx) {
    editingCheckIdx = idx; let c = cloudState.checks[idx]; document.getElementById('edit-check-name').value = c.name; document.getElementById('edit-check-time').value = c.timeCost;
    renderEditCheckBarItems(); document.getElementById('edit-check-modal').style.display = 'flex';
}
function renderEditCheckBarItems() {
    let c = cloudState.checks[editingCheckIdx];
    let html = (c.bar || []).map((b, i) => `<div class="edit-bar-item"><span>${b.name} (${b.price} ₸)</span> <button onclick="removeBarItemFromCheck(${i})" class="btn-outline" style="color:var(--red); border-color:var(--red); padding:5px 10px;">❌ Убрать</button></div>`).join('');
    if(html === '') html = '<span style="color:var(--gray); font-size:12px;">Пусто</span>'; document.getElementById('edit-check-bar-list').innerHTML = html;
}
function removeBarItemFromCheck(itemIdx) {
    if(!confirm("Убрать товар из чека? Он вернется на склад.")) return;
    let c = cloudState.checks[editingCheckIdx]; let item = c.bar.splice(itemIdx, 1)[0];
    c.barCost -= item.price; let baseTotal = c.timeCost + c.barCost; c.total = c.discount ? Math.round(baseTotal * (1 - c.discount/100)) : baseTotal;
    let invItem = cloudState.inventory.find(x => x.name === item.name); if(invItem) invItem.qty += 1;
    saveToCloud(); renderEditCheckBarItems();
}
function saveCheckEdit() {
    let c = cloudState.checks[editingCheckIdx]; c.name = document.getElementById('edit-check-name').value;
    c.timeCost = parseInt(document.getElementById('edit-check-time').value) || 0; 
    let baseTotal = c.timeCost + c.barCost; c.total = c.discount ? Math.round(baseTotal * (1 - c.discount/100)) : baseTotal;
    document.getElementById('edit-check-modal').style.display = 'none'; saveToCloud();
}
function deleteCheck(idx) {
    if(confirm("Вы точно хотите безвозвратно УДАЛИТЬ этот чек?\nВсе товары бара из него будут возвращены на склад.")) {
        let c = cloudState.checks[idx];
        if(c.bar && c.bar.length > 0) { if(!cloudState.inventory) cloudState.inventory = []; c.bar.forEach(bItem => { let invItem = cloudState.inventory.find(x => x.name === bItem.name); if(invItem) invItem.qty += 1; else cloudState.inventory.push({name: bItem.name, price: bItem.price, qty: 1}); }); }
        cloudState.checks.splice(idx, 1); saveToCloud();
    }
}

// === ОПЛАТА И СКИДКИ ===
let currentCheckIndex = null;
function openPayModal(idx) { 
    currentCheckIndex = idx; let c = cloudState.checks[idx]; let origTotal = c.timeCost + c.barCost;
    if(c.discount && c.discount > 0) { document.getElementById('pay-total').innerHTML = `<span style="text-decoration:line-through; font-size:20px; color:var(--gray);">${origTotal} ₸</span><br>${c.total} ₸`; document.getElementById('pay-info').innerText = `${c.name} | ${c.details} (Скидка ${c.discount}%)`; } 
    else { document.getElementById('pay-total').innerText = c.total + " ₸"; document.getElementById('pay-info').innerText = `${c.name} | ${c.details}`; }
    document.getElementById('pay-main-buttons').style.display = 'flex'; document.getElementById('mix-pay-section').style.display = 'none'; document.getElementById('pay-modal').style.display = 'flex'; 
}

function applyDiscount(pct) {
    let c = cloudState.checks[currentCheckIndex]; c.discount = pct; let origTotal = c.timeCost + c.barCost;
    if(pct === 0) { c.total = origTotal; document.getElementById('pay-total').innerText = c.total + " ₸"; document.getElementById('pay-info').innerText = `${c.name} | ${c.details}`; } 
    else { c.total = Math.round(origTotal * (1 - pct / 100)); document.getElementById('pay-total').innerHTML = `<span style="text-decoration:line-through; font-size:20px; color:var(--gray);">${origTotal} ₸</span><br>${c.total} ₸`; document.getElementById('pay-info').innerText = `${c.name} | ${c.details} (Скидка ${pct}%)`; }
    if (document.getElementById('mix-pay-section').style.display === 'block') { calcMixQr(); } saveToCloud();
}

function processPayment(method) {
    let c = cloudState.checks[currentCheckIndex];
    let finalTimeCost = c.timeCost; let finalBarCost = c.barCost;
    if(c.discount && c.discount > 0) { let ratio = 1 - (c.discount / 100); finalTimeCost = Math.round(c.timeCost * ratio); finalBarCost = c.total - finalTimeCost; c.details += ` [Скидка ${c.discount}%]`; }

    let addedCash = 0;
    let addedCashRev = 0;
    let addedQrRev = 0;
    
    if(method === 'Наличные') { 
        addedCash = c.total; 
        addedCashRev = c.total;
    }
    else if (method === 'QR') {
        addedQrRev = c.total;
    }
    else if (method.startsWith('Нал:')) { 
        let matchCash = method.match(/Нал:\s*(\d+)/); 
        let matchQr = method.match(/QR:\s*(\d+)/);
        if(matchCash) { addedCash = parseInt(matchCash[1]); addedCashRev = addedCash; }
        if(matchQr) { addedQrRev = parseInt(matchQr[1]); }
    }
    
    localAuth.shiftCash = (localAuth.shiftCash || 0) + addedCash;
    localAuth.cashRev = (localAuth.cashRev || 0) + addedCashRev;
    localAuth.qrRev = (localAuth.qrRev || 0) + addedQrRev;

    if(method === 'Долг') { 
        if(!cloudState.debts) cloudState.debts = []; 
        let d = cloudState.debts.find(x => x.name.toLowerCase() === c.name.toLowerCase()); 
        let histStr = `+${c.total}₸ (${new Date().toLocaleString()}, Админ: ${localAuth.user.name})`;
        if(d) { 
            d.total += c.total; 
            d.history.push(histStr); 
        } else { 
            cloudState.debts.push({ name: c.name, total: c.total, history: [histStr] }); 
        } 
    }
    
    localAuth.tableRev += finalTimeCost; localAuth.barRev += finalBarCost; 
    c.timeCost = finalTimeCost; c.barCost = finalBarCost; c.payMethod = method; c.admin = localAuth.user.name;

    if(!cloudState.archive) cloudState.archive = []; cloudState.archive.push(c); cloudState.checks.splice(currentCheckIndex, 1);
    document.getElementById('pay-modal').style.display = 'none'; saveLocalAuth(); saveToCloud();
}

function showMixPay() { document.getElementById('pay-main-buttons').style.display = 'none'; document.getElementById('mix-pay-section').style.display = 'block'; document.getElementById('mix-cash-input').value = ''; document.getElementById('mix-qr-val').innerText = cloudState.checks[currentCheckIndex].total; }
function hideMixPay() { document.getElementById('pay-main-buttons').style.display = 'flex'; document.getElementById('mix-pay-section').style.display = 'none'; }
function calcMixQr() { let t = cloudState.checks[currentCheckIndex].total; let c = parseInt(document.getElementById('mix-cash-input').value) || 0; let q = t - c; document.getElementById('mix-qr-val').innerText = q < 0 ? 0 : q; }
function confirmMixPay() { let t = cloudState.checks[currentCheckIndex].total; let c = parseInt(document.getElementById('mix-cash-input').value) || 0; let q = t - c; if (c < 0 || q < 0) return alert("Некорректная сумма наличных!"); processPayment(`Нал: ${c}₸ / QR: ${q}₸`); }
function splitPayment(n) { alert(`Сумма чека: ${cloudState.checks[currentCheckIndex].total} ₸.\nПо ${Math.ceil(cloudState.checks[currentCheckIndex].total / n)} ₸ с человека.`); }
function payDebt(idx) { let d = cloudState.debts[idx]; let sum = prompt(`Долг: ${d.total} ₸. Оплата:`); if(sum && !isNaN(sum)) { sum = parseInt(sum); d.total -= sum; d.history.push(`Оплата: -${sum}₸ (${new Date().toLocaleDateString()}, Админ: ${localAuth.user.name})`); localAuth.tableRev += sum; localAuth.cashRev = (localAuth.cashRev || 0) + sum; localAuth.shiftCash = (localAuth.shiftCash || 0) + sum; if(d.total <= 0) cloudState.debts.splice(idx, 1); saveLocalAuth(); saveToCloud(); } }
function delDebt(idx) { if(confirm("Удалить?")) { cloudState.debts.splice(idx,1); saveToCloud(); } }

// === СКЛАД ===
function openAddItemModal() { document.getElementById('add-item-modal').style.display = 'flex'; document.getElementById('new-item-name').value = ''; document.getElementById('new-item-price').value = ''; document.getElementById('new-item-qty').value = ''; }
function saveNewItem() { const name = document.getElementById('new-item-name').value.trim(); const price = parseInt(document.getElementById('new-item-price').value); const qty = parseInt(document.getElementById('new-item-qty').value); if(!name || isNaN(price) || isNaN(qty)) { alert("Заполните все поля корректно!"); return; } if(!cloudState.inventory) cloudState.inventory = []; cloudState.inventory.push({name: name, price: price, qty: qty}); document.getElementById('add-item-modal').style.display = 'none'; saveToCloud(); }
function editItemQty(idx) { let q = prompt("Новый остаток товара:", cloudState.inventory[idx].qty); if(q !== null && q !== "") { cloudState.inventory[idx].qty = parseInt(q); saveToCloud(); } }
function renameItem(idx) { let n = prompt("Новое название товара:", cloudState.inventory[idx].name); if(n) { cloudState.inventory[idx].name = n; saveToCloud(); } }
function editItemPrice(idx) { let p = prompt("Новая цена продажи:", cloudState.inventory[idx].price); if(p !== null && p !== "") { cloudState.inventory[idx].price = parseInt(p); saveToCloud(); } }
function delItem(idx) { if(confirm(`Удалить товар "${cloudState.inventory[idx].name}" со склада?`)) { cloudState.inventory.splice(idx,1); saveToCloud(); } }

function showTab(id, btn) { document.querySelectorAll('.tab-pane').forEach(x => x.style.display = 'none'); document.querySelectorAll('.nav-link').forEach(x => x.classList.remove('active')); document.getElementById('tab-'+id).style.display = 'block'; btn.classList.add('active'); }

// === БУХГАЛТЕРИЯ (ХОЗЯИН) И EXCEL ===
let accPeriod = 'today'; 
function setAccPeriod(period, btn) { accPeriod = period; document.querySelectorAll('.acc-filter').forEach(x => x.classList.remove('active')); btn.classList.add('active'); renderAccounting(); }
function exportToExcel() {
    if(currentFilteredHistory.length === 0) return alert("Нет данных для скачивания за этот период.");
    let csv = '\uFEFF'; csv += "АДМИН;НАЧАЛО;КОНЕЦ;БАР (ТНГ);СТОЛЫ (ТНГ);КАССА ОБЩАЯ (ТНГ);НАЛИЧНЫЕ В КАССЕ (ТНГ);НЕДОСТАЧА/ИЗЛИШЕК;ВЫДАНО ЗП (ТНГ)\n";
    currentFilteredHistory.forEach(h => { csv += `${h.admin};${h.start};${h.end};${h.barRev||0};${h.tableRev||0};${h.total||0};${h.physicalCash||0};${h.diff||0};${h.sal||0}\n`; });
    let a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = `Бухгалтерия_SENSEI_${accPeriod}.csv`; a.click();
}

function renderAccounting() {
    if(!cloudState.history) return;
    const now = new Date(); const todayStr = now.toLocaleDateString(); const nowTime = now.getTime();
    
    currentFilteredHistory = cloudState.history.filter(h => {
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

    let tRev = 0, bRev = 0, tblRev = 0, sal = 0;
    currentFilteredHistory.forEach(h => { tRev += (h.total || 0); bRev += (h.barRev || 0); tblRev += (h.tableRev || 0); sal += (h.sal || 0); });

    document.getElementById('acc-trev').innerText = tRev.toLocaleString(); document.getElementById('acc-brev').innerText = bRev.toLocaleString(); document.getElementById('acc-tblrev').innerText = tblRev.toLocaleString(); document.getElementById('acc-sal').innerText = sal.toLocaleString(); document.getElementById('acc-net').innerText = (tRev - sal).toLocaleString();
    
    document.getElementById('history-list').innerHTML = currentFilteredHistory.map(h => {
        let diffColor = h.diff < 0 ? 'var(--red)' : (h.diff > 0 ? 'var(--green)' : 'var(--gray)');
        let zReportHtml = h.expectedCash !== undefined ? `<br><span style="font-size:10px; color:${diffColor};">Z-Отчет: ${h.physicalCash} (Разница: ${h.diff})</span>` : '';
        return `<tr><td><b>${h.admin}</b></td><td><span style="font-size:11px; color:var(--gray);">${h.start} - ${h.end}</span></td><td><span style="font-size:11px; color:var(--gray);">Нал: ${h.cashRev||0}<br>QR: ${h.qrRev||0}</span></td><td><b class="gold-text">${h.total} ₸</b>${zReportHtml}</td><td><b style="color:var(--green);">${h.sal} ₸</b></td><td><button onclick="deleteHistory(${h.timestamp})" class="btn-red" style="padding:8px; font-size:12px; width:auto;">🗑️</button></td></tr>`;
    }).join('');
}

function renderTables() {
    if(!document.getElementById('tables-grid')) return;
    document.getElementById('tables-grid').innerHTML = cloudState.tables.map(t => {
        let timeStr = "00:00:00", costStr = "0";
        if(t.active) { timeStr = formatTime(Date.now() - t.start); costStr = calcCost(t.start).toLocaleString(); }
        let resHtml = (t.res || []).map((r, i) => `<div class="res-item"><span>📅 ${r}</span> <div><span onclick="editRes(${t.id},${i})" style="cursor:pointer; margin-right:10px;">✏️</span><span onclick="delRes(${t.id},${i})" style="color:var(--red); cursor:pointer;">❌</span></div></div>`).join('');
        return `<div class="table-card ${t.active ? 'active' : ''}"><div style="font-size:22px; font-weight:800; color:var(--gold);">СТОЛ ${t.id}</div><div class="timer">${timeStr}</div><div style="font-size:28px; font-weight:800; color:var(--white); margin-bottom:15px;">${costStr} ₸</div>${!t.active ? `<button onclick="startTable(${t.id})" class="btn-gold btn-large shadow-gold" style="margin-top:auto;">▶ ПУСК СТОЛА</button>` : `<button onclick="stopTable(${t.id})" class="btn-red" style="margin-bottom:10px;">⏹ СТОП В ЧЕК</button><div class="table-actions"><button class="btn-outline flex-1" onclick="openBarModal(${t.id})">🍸 БАР</button><button class="btn-outline flex-1" onclick="commTable(${t.id})">🔄 КОММЕРЦ</button></div>`}<button class="btn-outline" style="width:100%; margin-top:15px; border-color:var(--border); color:var(--gray);" onclick="addRes(${t.id})">+ ДОБАВИТЬ БРОНЬ</button>${resHtml}</div>`;
    }).join('');
}

function render() {
    if (!localAuth.isAuth) { 
        let currentAdminCount = cloudState.customAdmins ? cloudState.customAdmins.length : 0;
        if(currentAdminCount !== lastAdminCount) {
            let html = '<option value="0">Султан</option><option value="1">Дидар</option><option value="owner">Хозяин</option>';
            (cloudState.customAdmins || []).forEach((a, i) => { html += `<option value="custom_${i}">${a.name}</option>`; });
            let selectElem = document.getElementById('staff-select');
            if(selectElem) { selectElem.innerHTML = html; lastAdminCount = currentAdminCount; }
        }
        document.getElementById('auth-screen').style.display='flex'; document.getElementById('app').style.display='none'; return; 
    }
    
    document.getElementById('auth-screen').style.display='none'; document.getElementById('app').style.display='block';
    
    document.getElementById('user-display').innerText = localAuth.user.name;
    
    document.getElementById('owner-tab').style.display = localAuth.user.role === 'owner' ? 'block' : 'none';
    document.getElementById('acc-tab').style.display = localAuth.user.role === 'owner' ? 'block' : 'none';
    document.getElementById('btn-open-add-item').style.display = localAuth.user.role === 'owner' ? 'block' : 'none';

    renderTables();

    let tr = localAuth.tableRev, br = localAuth.barRev, tot = tr + br;
    
    let shiftZp = 0;
    if(localAuth.user.role !== 'owner') {
        if(tot === 0) {
            let todayStr = new Date().toLocaleDateString();
            let someoneElseWorked = (cloudState.history || []).some(h => {
                let d = h.timestamp ? new Date(h.timestamp).toLocaleDateString() : "";
                return d === todayStr && h.admin !== localAuth.user.name && h.total > 0;
            });
            shiftZp = someoneElseWorked ? 0 : 6000;
        } else {
            shiftZp = Math.round(tot * 0.08 + 6000);
        }
    }
    
    let accZp = (cloudState.ownerAcc && cloudState.ownerAcc[localAuth.user.name]) ? cloudState.ownerAcc[localAuth.user.name] : 0;
    
    document.getElementById('global-rev').innerHTML = tot.toLocaleString() + " ₸<br><span style='font-size:11px; color:var(--gray); font-weight:500; letter-spacing:1px;'>НАЛ: " + (localAuth.cashRev||0).toLocaleString() + " | QR: " + (localAuth.qrRev||0).toLocaleString() + "</span>";
    document.getElementById('global-shift-zp').innerText = shiftZp.toLocaleString() + " ₸";
    document.getElementById('global-total-zp').innerText = localAuth.user.role === 'owner' ? "---" : (accZp + shiftZp).toLocaleString() + " ₸";

    document.getElementById('active-checks').innerHTML = (cloudState.checks||[]).map((c, i) => { 
        let bHtml = (c.bar||[]).map(b => `${b.name}`).join(', '); 
        let discountHtml = (c.discount && c.discount > 0) ? `<span style="color:var(--red); font-size:14px; font-weight:bold; margin-left:10px;">-${c.discount}%</span>` : '';
        let timeInfo = (c.startTime && c.endTime && c.duration) ? `<br><span style="font-size:11px;color:var(--gray);">🕒 ${c.startTime} - ${c.endTime} (${c.duration})</span>` : '';
        
        let adminButtons = '';
        if (localAuth.user.role === 'owner') {
            adminButtons = `<button onclick="openEditCheckModal(${i})" class="btn-outline" style="border-color:#444; color:#aaa; font-size:10px;">⚙️ РЕДАКТИРОВАТЬ</button><button onclick="deleteCheck(${i})" class="btn-outline" style="border-color:var(--red); color:var(--red); font-size:10px;">🗑️ УДАЛИТЬ ЧЕК</button>`;
        }

        return `<div class="check-row"><div style="flex:1;"><div><b style="font-size:20px; color:var(--gold);">${c.name}</b> <span style="font-size:11px;color:var(--gray);margin-left:10px;">${c.date}</span></div><div style="font-size:13px;color:var(--gray);margin-top:8px;">${c.details} (${c.timeCost} ₸) ${timeInfo} ${bHtml?`<br>🍸 Бар: ${bHtml} (${c.barCost} ₸)`:''}</div><div style="font-size:24px;font-weight:800;margin-top:10px;">${c.total} ₸ ${discountHtml}</div></div><div style="display:flex; flex-direction:column; gap:5px;"><button onclick="openPayModal(${i})" class="btn-gold shadow-gold" style="padding:15px; border-radius:12px;">ОПЛАТА</button>${adminButtons}</div></div>`; 
    }).join('');
    
    document.getElementById('archive-list').innerHTML = (cloudState.archive||[]).map(a => `<tr><td style="color:var(--gray);">${a.date}</td><td><b style="color:var(--white);">${a.name}</b></td><td>${a.details}</td><td>Столы: ${a.timeCost}₸<br>Бар: ${a.barCost}₸</td><td class="gold-text"><b>${a.total} ₸</b></td><td><span style="background:var(--border); color:var(--gold); padding:6px 10px; border-radius:6px; font-size:11px; font-weight:600;">${a.payMethod}</span></td><td>${a.admin}</td></tr>`).join('');
    document.getElementById('stock-list').innerHTML = (cloudState.inventory||[]).map((i, idx) => {
        let stockBtns = localAuth.user.role === 'owner' ? `<button onclick="editItemQty(${idx})" class="btn-outline" style="padding:6px 10px; font-size:10px;">✏️ КОЛ-ВО</button><button onclick="renameItem(${idx})" class="btn-outline" style="padding:6px 10px; font-size:10px;">✏️ ИМЯ</button><button onclick="editItemPrice(${idx})" class="btn-outline" style="padding:6px 10px; font-size:10px;">✏️ ЦЕНА</button><button onclick="delItem(${idx})" class="btn-red" style="padding:6px 10px; font-size:10px; width:auto; margin-top:0;">❌</button>` : '';
        return `<tr><td><b style="color:var(--white);">${i.name}</b></td><td><b style="font-size:16px;">${i.qty} шт</b></td><td class="gold-text"><b style="font-size:16px;">${i.price} ₸</b></td><td style="display:flex; gap:5px; flex-wrap:wrap;">${stockBtns}</td></tr>`;
    }).join('');
    document.getElementById('debts-list').innerHTML = (cloudState.debts||[]).map((d, i) => `<tr><td><b class="gold-text" style="font-size:16px;">${d.name}</b></td><td style="color:var(--red); font-weight:800; font-size:20px;">${d.total} ₸</td><td><span style="font-size:11px; color:var(--gray);">${(d.history||[]).join('<br>')}</span></td><td style="text-align:right;"><button onclick="payDebt(${i})" class="btn-outline" style="border-color:var(--green); color:var(--green);">Расчет</button> <button onclick="delDebt(${i})" style="background:none; border:none; color:var(--red); cursor:pointer; font-size:22px; margin-left:10px;">×</button></td></tr>`).join('');
    
    // Статистика для самого админа (с разбивкой НАЛ/QR)
    document.getElementById('my-history-list').innerHTML = (cloudState.history||[]).filter(h => h.admin === localAuth.user.name).map(h => `<tr><td>${h.start}</td><td>${h.end}</td><td><span style="font-size:11px; color:var(--gray);">Нал: ${h.cashRev||0}<br>QR: ${h.qrRev||0}</span></td><td class="gold-text"><b>${h.total} ₸</b></td><td style="color:var(--green);"><b>${h.sal} ₸</b></td></tr>`).join('');
    
    if(localAuth.user.role === 'owner') {
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
