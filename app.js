// === ПОДКЛЮЧЕНИЕ ОБЛАКА FIREBASE ===
const firebaseConfig = {
    apiKey: "AIzaSyCBGxNJfQWUqSqaExMbrayDsrHIjS5sXL8",
    authDomain: "sensei-crm-e73b4.firebaseapp.com",
    databaseURL: "https://sensei-crm-e73b4-default-rtdb.firebaseio.com", // ЭТА СТРОКА РЕШАЕТ ПРОБЛЕМУ СИНХРОНИЗАЦИИ
    projectId: "sensei-crm-e73b4",
    storageBucket: "sensei-crm-e73b4.firebasestorage.app",
    messagingSenderId: "223977226546",
    appId: "1:223977226546:web:504388217da3949e60d72b"
};

if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const db = firebase.database();
const dbRef = db.ref('sensei_club_data');

const STAFF = [
    { name: "Султан", pin: "1111", role: "admin" },
    { name: "Дидар", pin: "1111", role: "admin" },
    { name: "Хозяин", pin: "0000", role: "owner" }
];

// ПАМЯТЬ АВТОРИЗАЦИИ (Чтобы не выкидывало при обновлении страницы)
let localAuth = JSON.parse(localStorage.getItem('sensei_auth_v2')) || { isAuth: false, user: null, localRev: 0 };

let cloudState = {
    tables: Array.from({length: 6}, (_, i) => ({ id: i + 1, active: false, guest: '', start: null, res: [] })),
    checks: [], inventory: [], debts: [], history: []
};

// СИНХРОНИЗАЦИЯ С ОБЛАКОМ
dbRef.on('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
        cloudState.tables = data.tables || cloudState.tables;
        cloudState.checks = data.checks || [];
        cloudState.inventory = data.inventory || [];
        cloudState.debts = data.debts || [];
        cloudState.history = data.history || [];
    } else {
        saveToCloud();
    }
    render();
});

function saveToCloud() { dbRef.set(cloudState); }
function saveLocalAuth() { localStorage.setItem('sensei_auth_v2', JSON.stringify(localAuth)); }

window.onload = () => {
    render();
    setInterval(() => { if(localAuth.isAuth) render(); }, 1000); 
};

function login() {
    const idx = document.getElementById('staff-select').value;
    const pin = document.getElementById('pass-input').value;
    if (STAFF[idx].pin === pin) {
        localAuth.isAuth = true;
        localAuth.user = STAFF[idx];
        localAuth.localRev = 0; 
        saveLocalAuth();
        document.getElementById('pass-input').value = "";
        document.getElementById('auth-error').style.display = 'none';
        render();
    } else {
        document.getElementById('auth-error').style.display = 'block';
    }
}

function logout() {
    if (confirm("Закрыть смену?")) {
        const salary = localAuth.user.role === 'owner' ? 0 : Math.round(localAuth.localRev * 0.08 + 6000);
        cloudState.history.push({ date: new Date().toLocaleString(), admin: localAuth.user.name, rev: localAuth.localRev, sal: salary });
        saveToCloud();
        localAuth = { isAuth: false, user: null, localRev: 0 };
        saveLocalAuth();
        render();
    }
}

function formatTime(ms) {
    let s = Math.floor(ms / 1000);
    let h = String(Math.floor(s / 3600)).padStart(2, '0');
    let m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    return `${h}:${m}:${String(s % 60).padStart(2, '0')}`;
}

function calcCost(startTime) {
    if (!startTime) return 0;
    let total = 0;
    let current = new Date(startTime);
    const end = new Date();
    while (current < end) {
        let h = current.getHours();
        let ratePerHour = (h >= 11 && h < 18) ? 2000 : 3000;
        total += ratePerHour / 60; 
        current.setMinutes(current.getMinutes() + 1);
    }
    return Math.ceil(total / 50) * 50; 
}

function toggleTable(id) {
    const t = cloudState.tables.find(x => x.id === id);
    if (!t.active) {
        const name = prompt("Имя гостя:");
        if (name) { t.active = true; t.guest = name; t.start = Date.now(); saveToCloud(); }
    } else {
        if (confirm(`Завершить игру на столе №${id}? Счёт перейдет в чеки.`)) {
            cloudState.checks.push({ name: t.guest, table: id, amount: calcCost(t.start), date: new Date().toLocaleTimeString() });
            t.active = false; t.start = null; saveToCloud();
        }
    }
}

function commTable(id) {
    const t = cloudState.tables.find(x => x.id === id);
    if(t.active && confirm("Перенести счет в чеки и обнулить таймер стола?")) {
        cloudState.checks.push({ name: t.guest + " (Коммерция)", table: id, amount: calcCost(t.start), date: new Date().toLocaleTimeString() });
        t.start = Date.now(); saveToCloud();
    }
}

function payCheck(i) {
    localAuth.localRev += cloudState.checks[i].amount;
    cloudState.checks.splice(i, 1);
    saveLocalAuth(); saveToCloud();
}

function toDebt(i) {
    cloudState.debts.push({ ...cloudState.checks[i], date: new Date().toLocaleDateString() });
    cloudState.checks.splice(i, 1);
    saveToCloud();
}

// === ЛОГИКА КАЛЬКУЛЯТОРА ИГРОКОВ ===
let calcMode = 1;
function setCalcMode(mode) {
    calcMode = mode;
    document.getElementById('btn-mode-1').className = mode === 1 ? 'btn-gold' : 'btn-outline';
    document.getElementById('btn-mode-2').className = mode === 2 ? 'btn-gold' : 'btn-outline';
}

function runCalculator() {
    const rate = parseInt(document.getElementById('calc-rate').value) || 0;
    const names = Array.from(document.querySelectorAll('.p-name')).map(i => i.value.trim() || "Игрок");
    const scores = Array.from(document.querySelectorAll('.p-score')).map(i => parseInt(i.value) || 0);
    let resHtml = "";

    if (calcMode === 1) { // Каждый сам за себя (круговой расчет)
        let active = [];
        for(let i=0; i<4; i++) {
            if(document.querySelectorAll('.p-score')[i].value !== "") {
                active.push({name: names[i], score: scores[i]});
            }
        }
        if(active.length < 2) return alert("Введите очки минимум 2 игроков!");

        let deltas = [];
        for(let i=0; i<active.length; i++) {
            let next = (i+1) % active.length;
            let diff = active[i].score - active[next].score; 
            deltas.push({name: active[i].name, diff: diff});
        }

        let creditors = deltas.filter(d => d.diff > 0).map(d => ({name: d.name, val: d.diff}));
        let debtors = deltas.filter(d => d.diff < 0).map(d => ({name: d.name, val: Math.abs(d.diff)}));

        let results = [];
        let c = 0, d = 0;
        while(c < creditors.length && d < debtors.length) {
            let cred = creditors[c], debt = debtors[d];
            let amount = Math.min(cred.val, debt.val);
            results.push(`<b>${debt.name}</b> платит <b>${cred.name}</b>: ${amount} * ${rate} = <span class="gold-text">${amount * rate} ₸</span>`);
            cred.val -= amount; debt.val -= amount;
            if(cred.val === 0) c++; if(debt.val === 0) d++;
        }
        resHtml = results.join('<br><br>');
    } else { // 2 на 2
        let t1 = scores[0] + scores[1], t2 = scores[2] + scores[3];
        let diff = t1 - t2;
        if (diff > 0) resHtml = `Команда 2 (<b>${names[2]} и ${names[3]}</b>) платит Команде 1 (<b>${names[0]} и ${names[1]}</b>):<br>Разница ${diff} * ${rate} = <span class="gold-text">${diff * rate} ₸</span>`;
        else if (diff < 0) resHtml = `Команда 1 (<b>${names[0]} и ${names[1]}</b>) платит Команде 2 (<b>${names[2]} и ${names[3]}</b>):<br>Разница ${Math.abs(diff)} * ${rate} = <span class="gold-text">${Math.abs(diff) * rate} ₸</span>`;
        else resHtml = "Ничья! Никто никому не должен.";
    }
    document.getElementById('calc-result').innerHTML = resHtml;
}

function showTab(id, btn) {
    document.querySelectorAll('.tab-pane').forEach(x => x.style.display = 'none');
    document.querySelectorAll('.nav-link').forEach(x => x.classList.remove('active'));
    document.getElementById('tab-' + id).style.display = 'block';
    btn.classList.add('active');
}

function render() {
    const auth = document.getElementById('auth-screen');
    const app = document.getElementById('app');

    if (!localAuth.isAuth) {
        auth.style.display = 'flex'; app.style.display = 'none'; return;
    }

    auth.style.display = 'none'; app.style.display = 'block';
    document.getElementById('user-display').innerText = localAuth.user.name;
    document.getElementById('rev-val').innerText = localAuth.localRev.toLocaleString();
    document.getElementById('salary-val').innerText = (localAuth.user.role === 'owner' ? 0 : Math.round(localAuth.localRev * 0.08 + 6000)).toLocaleString();
    document.getElementById('owner-tab').style.display = localAuth.user.role === 'owner' ? 'block' : 'none';

    document.getElementById('tables-grid').innerHTML = cloudState.tables.map(t => {
        let timeStr = "00:00:00", costStr = "0";
        if(t.active) { let diff = Date.now() - t.start; timeStr = formatTime(diff); costStr = calcCost(t.start).toLocaleString(); }
        return `
            <div class="table-card ${t.active ? 'active' : ''}">
                <div class="gold-text" style="font-weight:bold; font-size:18px;">СТОЛ ${t.id}</div>
                <div style="font-size:11px; color:#888; margin-top:5px;">${t.active ? '👤 ГОСТЬ: ' + t.guest : 'СВОБОДЕН'}</div>
                <div class="timer">${timeStr}</div>
                <div class="gold-text" style="font-size:24px; font-weight:bold; margin-bottom:15px;">${costStr} ₸</div>
                <button onclick="toggleTable(${t.id})" class="${t.active ? 'btn-red' : 'btn-gold'}">${t.active ? 'СТОП (В ЧЕК)' : 'ПУСК'}</button>
                ${t.active ? `<button class="btn-outline" style="width:100%; margin-top:5px;" onclick="commTable(${t.id})">КОММЕРЦИЯ</button>` : ''}
            </div>
        `;
    }).join('');

    document.getElementById('active-checks').innerHTML = cloudState.checks.map((c, i) => `
        <div class="check-row">
            <div><b class="gold-text">${c.name}</b> <br> <span style="font-size:12px; color:#aaa;">Стол ${c.table} | Сумма: ${c.amount} ₸</span></div>
            <div>
                <button onclick="payCheck(${i})" style="background:var(--green); border:none; padding:10px; border-radius:6px; font-weight:bold; cursor:pointer;">ОПЛАТИТЬ</button>
                <button onclick="toDebt(${i})" style="background:var(--red); border:none; padding:10px; border-radius:6px; color:#fff; font-weight:bold; cursor:pointer; margin-left:5px;">В ДОЛГ</button>
            </div>
        </div>
    `).join('');

    document.getElementById('my-history-list').innerHTML = cloudState.history.filter(h => h.admin === localAuth.user.name).map(h => `<tr><td>${h.date}</td><td>${h.rev} ₸</td><td class="gold-text">${h.sal} ₸</td></tr>`).join('');
    document.getElementById('history-list').innerHTML = cloudState.history.map(h => `<tr><td>${h.date}</td><td>${h.admin}</td><td>${h.rev} ₸</td><td class="gold-text">${h.sal} ₸</td></tr>`).join('');
}
