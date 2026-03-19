const firebaseConfig = {
    apiKey: "AIzaSyCBGxNJfQWUqSqaExMbrayDsrHIjS5sXL8",
    authDomain: "sensei-crm-e73b4.firebaseapp.com",
    databaseURL: "https://sensei-crm-e73b4-default-rtdb.firebaseio.com",
    projectId: "sensei-crm-e73b4",
    storageBucket: "sensei-crm-e73b4.firebasestorage.app",
    messagingSenderId: "223977226546",
    appId: "1:223977226546:web:504388217da3949e60d72b"
};

// Инициализация
try { if (!firebase.apps.length) firebase.initializeApp(firebaseConfig); } catch(e) { console.error(e); }
const db = firebase.database();
const dbRef = db.ref('sensei_erp_pro');

// Основные сотрудники (всегда доступны)
const STAFF_HARDCODED = [
    { id: "0", name: "Султан", pin: "1111", role: "admin" }, 
    { id: "1", name: "Дидар", pin: "1111", role: "admin" }, 
    { id: "owner", name: "Хозяин", pin: "0000", role: "owner" }
];

let localAuth = JSON.parse(localStorage.getItem('sensei_auth_pro')) || { isAuth: false, user: null, shiftStart: null, tableRev: 0, barRev: 0, shiftCash: 0 };
let cloudState = { tables: Array.from({length: 6}, (_, i) => ({ id: i + 1, active: false, start: null, res: [] })), checks: [], archive: [], inventory: [], debts: [], history: [], ownerAcc: {}, customAdmins: [] };

// Синхронизация
dbRef.on('value', snap => {
    if (snap.val()) {
        cloudState = snap.val();
    } else {
        saveToCloud();
    }
    render(); // Перерисовываем экран, включая список сотрудников
});

function saveToCloud() { dbRef.set(cloudState).catch(e => console.error("Ошибка сохранения:", e)); }
function saveLocalAuth() { localStorage.setItem('sensei_auth_pro', JSON.stringify(localAuth)); }

window.onload = () => { 
    render(); 
    setInterval(() => { if(localAuth.isAuth) renderTables(); }, 1000); 
};

// Функция входа (починил выбор)
function login() {
    const select = document.getElementById('staff-select');
    const val = select.value;
    const pin = document.getElementById('pass-input').value;
    
    let user = null;
    // Ищем в основном списке
    user = STAFF_HARDCODED.find(s => s.id === val);
    
    // Если не нашли, ищем в созданных админах
    if (!user && cloudState.customAdmins) {
        user = cloudState.customAdmins.find(a => "custom_" + a.id === val);
    }

    if (user && user.pin === pin) {
        localAuth = { isAuth: true, user: user, shiftStart: new Date().toLocaleString(), tableRev: 0, barRev: 0, shiftCash: 0 };
        saveLocalAuth(); 
        document.getElementById('pass-input').value = ""; 
        render();
    } else { 
        alert("НЕВЕРНЫЙ ПАРОЛЬ!");
    }
}

// Рендеринг (починил отображение списка)
function render() {
    const select = document.getElementById('staff-select');
    if (!localAuth.isAuth && select) {
        // Очищаем и заново создаем список выбора
        let html = '';
        STAFF_HARDCODED.forEach(s => {
            html += `<option value="${s.id}">${s.name}</option>`;
        });
        if (cloudState.customAdmins) {
            cloudState.customAdmins.forEach(a => {
                html += `<option value="custom_${a.id}">${a.name}</option>`;
            });
        }
        select.innerHTML = html;
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app').style.display = 'none';
        return;
    }
    
    // Остальной код приложения
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('user-display').innerText = localAuth.user.name;
    
    // Показ вкладок для хозяина
    let isOwner = localAuth.user.role === 'owner';
    document.getElementById('acc-tab').style.display = isOwner ? 'block' : 'none';
    document.getElementById('owner-tab').style.display = isOwner ? 'block' : 'none';
    
    // Обновление статистики
    let total = localAuth.tableRev + localAuth.barRev;
    document.getElementById('global-rev').innerText = total.toLocaleString() + " ₸";
    
    renderTables();
    renderChecks();
}

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (СТАНДАРТ) ===
function showTab(id, btn) {
    document.querySelectorAll('.tab-pane').forEach(x => x.style.display = 'none');
    document.querySelectorAll('.nav-link').forEach(x => x.classList.remove('active'));
    document.getElementById('tab-' + id).style.display = 'block';
    btn.classList.add('active');
}

function renderTables() {
    const grid = document.getElementById('tables-grid');
    if(!grid) return;
    grid.innerHTML = cloudState.tables.map(t => {
        let cost = t.active ? calcCost(t.start) : 0;
        let time = t.active ? formatTime(Date.now() - t.start) : "00:00:00";
        return `<div class="table-card ${t.active ? 'active' : ''}">
            <b class="gold-text">СТОЛ ${t.id}</b>
            <div class="timer">${time}</div>
            <div style="font-size:24px; font-weight:700;">${cost} ₸</div>
            <div class="table-actions">
                ${t.active ? `<button onclick="stopTable(${t.id})" class="btn-red flex-1">СТОП</button>` : `<button onclick="startTable(${t.id})" class="btn-gold flex-1">ПУСК</button>`}
            </div>
        </div>`;
    }).join('');
}

function renderChecks() {
    const container = document.getElementById('active-checks');
    if(!container) return;
    container.innerHTML = (cloudState.checks || []).map((c, i) => `
        <div class="check-row">
            <div><b>${c.name}</b><br><small class="gold-text">${c.total} ₸</small></div>
            <button onclick="openPayModal(${i})" class="btn-gold" style="width:auto; padding:10px 20px;">ОПЛАТА</button>
        </div>
    `).join('');
}

function startTable(id) { let t = cloudState.tables.find(x => x.id === id); t.active = true; t.start = Date.now(); saveToCloud(); }
function stopTable(id) {
    let t = cloudState.tables.find(x => x.id === id);
    let name = prompt("ИМЯ ГОСТЯ:");
    if(!name) return;
    if(!cloudState.checks) cloudState.checks = [];
    cloudState.checks.push({ name, total: calcCost(t.start), table: id, date: new Date().toLocaleDateString() });
    t.active = false; t.start = null;
    saveToCloud();
}
function calcCost(start) { return Math.ceil(((Date.now() - start) / 60000 * (3000/60)) / 50) * 50; }
function formatTime(ms) { let s = Math.floor(ms/1000); return String(Math.floor(s/3600)).padStart(2,'0')+":"+String(Math.floor((s%3600)/60)).padStart(2,'0')+":"+String(s%60).padStart(2,'0'); }
function logout() { if(confirm("ЗАКРЫТЬ СМЕНУ?")) { localAuth.isAuth = false; saveLocalAuth(); location.reload(); } }
