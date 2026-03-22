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

let cloudState = { tables: [], checks: [], archive: [], inventory: [], debts: [], history: [], ownerAcc: {}, customAdmins: [], expenses: [], vips: [], onlineAdmins: {}, notifications: [], blacklist: [] };
let isDataLoaded = false; 

window.ui = {
    alert: (msg) => { let el = document.getElementById('ui-alert-text'); if(el) { el.innerText = msg; document.getElementById('ui-alert-modal').style.display = 'flex'; } else alert(msg); },
    confirm: (msg, onYes) => { let el = document.getElementById('ui-confirm-text'); if(el) { el.innerText = msg; document.getElementById('ui-confirm-yes').onclick = () => { document.getElementById('ui-confirm-modal').style.display = 'none'; onYes(); }; document.getElementById('ui-confirm-modal').style.display = 'flex'; } else if(confirm(msg)) onYes(); },
    prompt: (title, fields, onConfirm) => {
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
        }
    }
};

function toArr(data) { if (!data) return []; if (Array.isArray(data)) return data; return Object.values(data); }

dbRef.on('value', snap => {
    if (snap.exists() && snap.val()) {
        let data = snap.val();
        cloudState.tables = toArr(data.tables).filter(x=>x).map(t => ({...t, res: toArr(t.res), bar: toArr(t.bar)}));
        if (cloudState.tables.length === 0) cloudState.tables = Array.from({length: 6}, (_, i) => ({ id: i + 1, active: false, start: null, res: [], bar: [], paused: false, accCost: 0, accTime: 0, isTournament: false }));
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
    render();
});

function saveToCloud() { if (!isDataLoaded) return; dbRef.set(cloudState); }

function getShiftStartTime() {
    let hist = toArr(cloudState.history).sort((a,b)=>a.timestamp - b.timestamp);
    const sultanShiftFix = new Date(2026, 2, 21, 16, 37, 0).getTime();
    let lastZ = (hist.length > 0) ? hist[hist.length - 1].timestamp : 0;
    return (lastZ < sultanShiftFix) ? sultanShiftFix : lastZ;
}

function getActiveAdminName() {
    let lastZ = getShiftStartTime();
    let currentChecks = toArr(cloudState.archive).filter(c => (c.paidAt || c.id) > lastZ && (c.admin||"") !== 'Хозяин');
    if (currentChecks.length > 0) return currentChecks[currentChecks.length - 1].admin;
    return 'Султан';
}

window.startTable = function(id) {
    let t = cloudState.tables.find(x => x.id === id);
    if(t) { t.active = true; t.start = getNow(); t.bar = []; t.paused = false; t.accCost = 0; t.accTime = 0; saveToCloud(); }
};

// ИСПРАВЛЕНИЕ: ЖЕЛЕЗОБЕТОННЫЙ СТОП
window.confirmStopTable = function() {
    let t = cloudState.tables.find(x => x.id === stoppingTableId);
    let newName = document.getElementById('stop-new-name').value.trim();
    let mergeId = document.getElementById('stop-merge-select').value;
    let finalName = mergeId ? cloudState.checks.find(x => x.id == mergeId).name : newName;

    if (!finalName) return ui.alert("Введите имя!");

    let cost = t.paused ? (t.accCost || 0) : ((t.accCost || 0) + calcCost(t.start, t.isTournament));
    
    // Сначала создаем чек
    createOrMergeCheck(finalName, t.id, cost, toArr(t.bar));
    
    // Затем обнуляем стол
    t.active = false; t.start = null; t.bar = []; t.paused = false; t.accCost = 0; t.accTime = 0;
    
    document.getElementById('stop-table-modal').style.display = 'none';
    saveToCloud();
};

function createOrMergeCheck(name, tableId, timeCost, barItems) {
    let bArr = toArr(barItems);
    let barTotal = bArr.reduce((s, i) => s + i.price, 0);
    let exist = cloudState.checks.find(c => (c.name||"").toLowerCase() === (name||"").toLowerCase());
    const now = new Date(getNow());
    const timeStr = now.getHours().toString().padStart(2,'0') + ":" + now.getMinutes().toString().padStart(2,'0');
    
    let t = cloudState.tables.find(x => x.id === tableId);
    let startStr = (t && t.start) ? new Date(Number(t.start)).toLocaleTimeString().slice(0,5) : timeStr;
    let sess = `[Стол ${tableId}] ${startStr}-${timeStr}: ${timeCost}₸`;

    if(exist) {
        exist.timeCost += timeCost; exist.barCost += barTotal;
        exist.bar = toArr(exist.bar).concat(bArr);
        exist.sessions = toArr(exist.sessions); exist.sessions.push(sess);
        exist.total = (exist.timeCost + exist.barCost);
    } else {
        cloudState.checks.push({
            id: getNow(), name: name, table: tableId, date: now.toLocaleDateString(),
            timeCost: timeCost, barCost: barTotal, bar: bArr, total: timeCost + barTotal,
            sessions: [sess], admin: (localAuth.user.role === 'owner' ? getActiveAdminName() : localAuth.user.name)
        });
    }
}

// ИСПРАВЛЕНИЕ: ВОЗВРАТ ИЗ ДОЛГОВ
window.restoreDebtCheck = function(name) {
    let lastZ = getShiftStartTime();
    let cIdx = cloudState.archive.findIndex(x => (x.name||"").toLowerCase() === name.toLowerCase() && x.payMethod === 'Долг' && (x.paidAt || x.id) > lastZ);
    
    if(cIdx === -1) return ui.alert("Чек не найден в этой смене!");
    
    ui.confirm(`Вернуть долг гостя "${name}" в чеки?`, () => {
        let c = cloudState.archive.splice(cIdx, 1)[0];
        delete c.payMethod; delete c.paidAt;
        
        // Удаляем из списка долгов
        cloudState.debts = cloudState.debts.filter(d => d.name.toLowerCase() !== name.toLowerCase());
        
        cloudState.checks.push(c);
        saveToCloud();
    });
};

function calcCost(start, isTournament) {
    if(!start) return 0;
    let diff = (getNow() - Number(start)) / 3600000;
    let rate = isTournament ? 1500 : (new Date(getNow()).getHours() >= 11 && new Date(getNow()).getHours() < 18 ? 2000 : 3000);
    return Math.ceil((diff * rate) / 50) * 50;
}

function formatTime(ms) {
    let s = Math.floor(ms / 1000);
    return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}

window.login = function() {
    const val = document.getElementById('staff-select').value;
    const pin = document.getElementById('pass-input').value;
    let user = STAFF_HARDCODED.find(s => s.id === val) || toArr(cloudState.customAdmins).find(a => "custom_"+a.id === val);
    if (user && user.pin === pin) {
        localAuth = { isAuth: true, user: user, shiftStart: new Date().toLocaleString() };
        localStorage.setItem('sensei_auth_pro', JSON.stringify(localAuth));
        render();
    } else ui.alert("Ошибочный PIN!");
};

window.logout = function() { document.getElementById('z-report-modal').style.display = 'flex'; };

function renderTables() {
    if(!document.getElementById('tables-grid')) return;
    document.getElementById('tables-grid').innerHTML = cloudState.tables.map(t => {
        let timeStr = "00:00:00", cost = 0;
        if(t.active) {
            let elapsed = getNow() - Number(t.start);
            timeStr = formatTime(elapsed);
            cost = calcCost(t.start, t.isTournament);
        }
        let bSum = toArr(t.bar).reduce((s,i)=>s+i.price,0);
        let btn = t.active ? `<button onclick="stoppingTableId=${t.id}; openStopTableModal(${t.id})" class="btn-red">⏹ СТОП</button>` : `<button onclick="startTable(${t.id})" class="btn-gold">▶ ПУСК</button>`;
        return `<div class="table-card ${t.active?'active':''}"><h3>СТОЛ ${t.id}</h3><div class="timer">${timeStr}</div><div class="price">${(cost+bSum)} ₸</div><div style="display:flex; gap:5px;">${btn}<button onclick="openBarModal(${t.id})" class="btn-outline">🍸 БАР</button></div></div>`;
    }).join('');
}

function render() {
    if(!localAuth.isAuth) {
        document.getElementById('auth-screen').style.display='flex';
        document.getElementById('app').style.display='none';
        let h = STAFF_HARDCODED.map(s=>`<option value="${s.id}">${s.name}</option>`).join('') + toArr(cloudState.customAdmins).map(a=>`<option value="custom_${a.id}">${a.name}</option>`).join('');
        document.getElementById('staff-select').innerHTML = h;
        return;
    }
    document.getElementById('auth-screen').style.display='none';
    document.getElementById('app').style.display='block';
    document.getElementById('user-display').innerText = localAuth.user.name;
    renderTables();
}

// Запуск интервала отрисовки
setInterval(() => { if(localAuth.isAuth) renderTables(); }, 1000);
