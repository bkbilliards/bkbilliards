const STAFF = [
    { name: "Султан", pass: "1111", role: "admin" },
    { name: "Дидар", pass: "2222", role: "admin" },
    { name: "Хозяин", pass: "0000", role: "owner" }
];

let state = JSON.parse(localStorage.getItem('sensei_state')) || {
    isAuth: false,
    currentUser: null,
    revenue: 0,
    history: [],
    inventory: [],
    tables: Array.from({length: 6}, (_, i) => ({ id: i + 1, active: false, time: 0 }))
};

function save() {
    localStorage.setItem('sensei_state', JSON.stringify(state));
    render();
}

function login() {
    const idx = document.getElementById('staff-select').value;
    const pass = document.getElementById('pass-input').value;
    if (STAFF[idx].pass === pass) {
        state.isAuth = true;
        state.currentUser = STAFF[idx];
        save();
    } else {
        document.getElementById('auth-error').style.display = 'block';
    }
}

function logout() {
    if (confirm("Закрыть смену? Данные сохранятся в историю.")) {
        const salary = state.currentUser.role === 'owner' ? 0 : Math.round(state.revenue * 0.08 + 6000);
        state.history.push({
            date: new Date().toLocaleDateString(),
            name: state.currentUser.name,
            rev: state.revenue,
            salary: salary
        });
        state.isAuth = false;
        state.revenue = 0;
        save();
        location.reload();
    }
}

function render() {
    const auth = document.getElementById('auth-screen');
    const main = document.getElementById('main-content');
    
    if (!state.isAuth) {
        auth.style.display = 'flex';
        main.style.display = 'none';
        return;
    }

    auth.style.display = 'none';
    main.style.display = 'block';

    // Рендер столов
    document.querySelector('.tables-grid').innerHTML = state.tables.map(t => `
        <div class="table-card ${t.active ? 'active' : ''}">
            <h4 class="gold-text">Стол ${t.id}</h4>
            <div class="timer" style="font-size: 24px; margin: 15px 0;">${t.active ? 'В ИГРЕ' : 'СВОБОДЕН'}</div>
            <button onclick="toggleTable(${t.id})" class="${t.active ? 'btn-exit' : 'btn-login'}" style="margin-top:0">
                ${t.active ? 'СТОП' : 'ПУСК'}
            </button>
        </div>
    `).join('');

    document.getElementById('display-admin-name').innerText = state.currentUser.name;
    document.getElementById('stat-revenue').innerText = state.revenue;
    document.getElementById('owner-nav-btn').style.display = state.currentUser.role === 'owner' ? 'block' : 'none';
    
    // Рендер личной истории
    const myHist = state.history.filter(h => h.name === state.currentUser.name);
    document.getElementById('admin-personal-history').innerHTML = myHist.map(h => `
        <tr><td>${h.date}</td><td>${h.rev} ₸</td><td>${h.salary} ₸</td></tr>
    `).join('');
}

function toggleTable(id) {
    const t = state.tables.find(x => x.id === id);
    if (t.active) state.revenue += 2000; // Пример начисления
    t.active = !t.active;
    save();
}

function addInventoryItem() {
    const n = prompt("Название товара:");
    const p = prompt("Цена продажи:");
    if(n && p) {
        state.inventory.push({n, p});
        save();
    }
}

window.onload = () => {
    const sel = document.getElementById('staff-select');
    sel.innerHTML = STAFF.map((s, i) => `<option value="${i}">${s.name}</option>`).join('');
    render();
};
