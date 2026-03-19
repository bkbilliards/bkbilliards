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

const STAFF_FIXED = [
    { id: "0", name: "Султан", pin: "1111", role: "admin" }, 
    { id: "1", name: "Дидар", pin: "1111", role: "admin" }, 
    { id: "owner", name: "Хозяин", pin: "0000", role: "owner" }
];

let localAuth = JSON.parse(localStorage.getItem('sensei_auth_pro')) || { isAuth: false };
let cloudState = { tables: Array.from({length: 6}, (_, i) => ({ id: i + 1, active: false })), checks: [], inventory: [], history: [], customAdmins: [], ownerAcc: {} };

dbRef.on('value', snap => {
    if (snap.val()) cloudState = snap.val();
    render();
});

function saveToCloud() { dbRef.set(cloudState); }
function saveLocalAuth() { localStorage.setItem('sensei_auth_pro', JSON.stringify(localAuth)); }

function login() {
    const val = document.getElementById('staff-select').value;
    const pin = document.getElementById('pass-input').value;
    let user = STAFF_FIXED.find(s => s.id === val) || (cloudState.customAdmins || []).find(a => "c"+a.id === val);
    
    if (user && user.pin === pin) {
        localAuth = { isAuth: true, user: user, shiftStart: new Date().toLocaleString(), tableRev: 0, barRev: 0, shiftCash: 0 };
        saveLocalAuth(); render();
    } else alert("НЕВЕРНЫЙ ПАРОЛЬ");
}

function render() {
    const sel = document.getElementById('staff-select');
    if (!localAuth.isAuth && sel) {
        let h = STAFF_FIXED.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        if (cloudState.customAdmins) cloudState.customAdmins.forEach(a => h += `<option value="c${a.id}">${a.name}</option>`);
        sel.innerHTML = h;
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app').style.display = 'none';
        return;
    }

    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('user-display').innerText = localAuth.user.name;
    
    let isOwner = localAuth.user.role === 'owner';
    document.getElementById('acc-tab').style.display = isOwner ? 'block' : 'none';
    document.getElementById('owner-tab').style.display = isOwner ? 'block' : 'none';
    document.getElementById('btn-open-add-item').style.display = isOwner ? 'block' : 'none';

    renderHall();
    renderChecks();
    
    let total = localAuth.tableRev + localAuth.barRev;
    document.getElementById('global-rev').innerText = total.toLocaleString() + " ₸";
    document.getElementById('global-shift-zp').innerText = (isOwner ? 0 : Math.round(total*0.08+6000)).toLocaleString() + " ₸";
    
    if (isOwner) renderOwnerPart();
}

function renderHall() {
    document.getElementById('tables-grid').innerHTML = cloudState.tables.map(t => {
        let cost = t.active ? calcCost(t.start) : 0;
        let time = t.active ? formatTime(Date.now() - t.start) : "00:00:00";
        return `<div class="table-card ${t.active?'active':''}">
            <b class="gold-text">СТОЛ ${t.id}</b><div class="timer">${time}</div><div>${cost} ₸</div>
            <div class="table-actions">
            ${t.active ? `<button onclick="stopTable(${t.id})" class="btn-red flex-1">СТОП</button><button onclick="openBarModal(${t.id})" class="btn-outline flex-1">БАР</button>` : `<button onclick="startTable(${t.id})" class="btn-gold flex-1">ПУСК</button>`}
            </div>
        </div>`;
    }).join('');
}

function renderChecks() {
    document.getElementById('active-checks').innerHTML = (cloudState.checks || []).map((c, i) => `
        <div class="check-row">
            <div><b>${c.name}</b><br><small class="gold-text">${c.total} ₸</small></div>
            <button onclick="openPayModal(${i})" class="btn-gold" style="width:auto; padding:10px 20px;">ОПЛАТА</button>
        </div>`).join('');
}

function startTable(id) { let t = cloudState.tables.find(x => x.id === id); t.active = true; t.start = Date.now(); saveToCloud(); }
function stopTable(id) {
    let t = cloudState.tables.find(x => x.id === id);
    let name = prompt("ИМЯ ГОСТЯ:"); if(!name) return;
    if(!cloudState.checks) cloudState.checks = [];
    let barItems = t.bar || [];
    let barCost = barItems.reduce((s, i) => s + i.price, 0);
    cloudState.checks.push({ name, table: id, timeCost: calcCost(t.start), barCost, bar: barItems, total: calcCost(t.start) + barCost, discount: 0 });
    t.active = false; t.start = null; t.bar = []; saveToCloud();
}

function selectBarItem(name) {
    let item = cloudState.inventory.find(i => i.name === name);
    let qty = parseInt(prompt(`Сколько ${name}?`, "1"));
    if(!qty || qty > item.qty) return alert("Ошибка количества");
    item.qty -= qty;
    let items = Array(qty).fill({name: item.name, price: item.price});
    if(barContext === 'standalone') {
        let n = prompt("ИМЯ:"); if(n) { if(!cloudState.checks) cloudState.checks = []; cloudState.checks.push({name:n, table:'БАР', timeCost:0, barCost: item.price*qty, bar: items, total: item.price*qty}); } else item.qty += qty;
    } else {
        let t = cloudState.tables.find(x => x.id === barContext); if(!t.bar) t.bar = []; t.bar = t.bar.concat(items);
    }
    closeModal('bar-modal'); saveToCloud();
}

let payIdx = null;
function openPayModal(idx) { payIdx = idx; let c = cloudState.checks[idx]; document.getElementById('pay-total').innerText = c.total + " ₸"; document.getElementById('pay-info').innerText = c.name; document.getElementById('pay-modal').style.display='flex'; }
function applyDiscount(pct) { let c = cloudState.checks[payIdx]; c.discount = pct; c.total = Math.round((c.timeCost + c.barCost) * (1 - pct/100)); document.getElementById('pay-total').innerText = c.total + " ₸"; }

function processPayment(method) {
    let c = cloudState.checks[payIdx];
    if(method === 'Наличные') localAuth.shiftCash += c.total;
    localAuth.tableRev += Math.round(c.timeCost * (1 - (c.discount||0)/100));
    localAuth.barRev += (c.total - Math.round(c.timeCost * (1 - (c.discount||0)/100)));
    c.payMethod = method; c.admin = localAuth.user.name; c.date = new Date().toLocaleString();
    if(!cloudState.archive) cloudState.archive = [];
    cloudState.archive.push(c); cloudState.checks.splice(payIdx, 1);
    closeModal('pay-modal'); saveLocalAuth(); saveToCloud();
}

function logout() { document.getElementById('z-report-modal').style.display='flex'; }
function confirmZReport() {
    let physical = parseInt(document.getElementById('z-cash-input').value) || 0;
    let expected = localAuth.shiftCash || 0;
    let rev = localAuth.tableRev + localAuth.barRev;
    let sal = localAuth.user.role === 'owner' ? 0 : Math.round(rev * 0.08 + 6000);
    if(!cloudState.history) cloudState.history = [];
    cloudState.history.push({ admin: localAuth.user.name, end: new Date().toLocaleString(), total: rev, sal, physical, diff: physical - expected });
    if(localAuth.user.role !== 'owner') { if(!cloudState.ownerAcc) cloudState.ownerAcc = {}; cloudState.ownerAcc[localAuth.user.name] = (cloudState.ownerAcc[localAuth.user.name] || 0) + sal; }
    saveToCloud(); localAuth = { isAuth: false }; saveLocalAuth(); location.reload();
}

// Служебные
function calcCost(s) { let d = (Date.now()-s)/60000; let r = (new Date(s).getHours() >= 11 && new Date(s).getHours() < 18) ? 2000 : 3000; return Math.ceil((d*(r/60))/50)*50; }
function formatTime(ms) { let s = Math.floor(ms/1000); return String(Math.floor(s/3600)).padStart(2,'0')+":"+String(Math.floor((s%3600)/60)).padStart(2,'0')+":"+String(s%60).padStart(2,'0'); }
function closeModal(id) { document.getElementById(id).style.display='none'; }
function showTab(id, btn) { document.querySelectorAll('.tab-pane').forEach(x => x.style.display = 'none'); document.querySelectorAll('.nav-link').forEach(x => x.classList.remove('active')); document.getElementById('tab-'+id).style.display = 'block'; btn.classList.add('active'); }
let barContext = null;
function openBarModal(ctx) { barContext = ctx; document.getElementById('bar-modal').style.display='flex'; renderBarSearch(); }
function renderBarSearch() { let q = document.getElementById('bar-search').value.toLowerCase(); document.getElementById('bar-items-list').innerHTML = (cloudState.inventory || []).filter(i => i.name.toLowerCase().includes(q)).map(i => `<div class="bar-item-row" onclick="selectBarItem('${i.name}')"><span>${i.name}</span><b>${i.price} ₸ (${i.qty})</b></div>`).join(''); }
function saveNewItem() { let n = document.getElementById('new-item-name').value; let p = parseInt(document.getElementById('new-item-price').value); let q = parseInt(document.getElementById('new-item-qty').value); if(!cloudState.inventory) cloudState.inventory = []; cloudState.inventory.push({name:n, price:p, qty:q}); closeModal('add-item-modal'); saveToCloud(); }
function addCustomAdmin() { let n = prompt("ИМЯ:"); let p = prompt("PIN:"); if(!cloudState.customAdmins) cloudState.customAdmins = []; cloudState.customAdmins.push({id: Date.now(), name:n, pin:p, role:'admin'}); saveToCloud(); }
function resetDatabase() { if(confirm("ОЧИСТИТЬ?")) { cloudState = { tables: Array.from({length: 6}, (_, i) => ({ id: i + 1, active: false })), checks: [], inventory: [], history: [], ownerAcc: {}, customAdmins: [] }; saveToCloud(); location.reload(); } }
setInterval(() => { if(localAuth.isAuth) renderHall(); }, 1000);
