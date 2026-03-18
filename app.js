const STAFF = [
    { name: "Султан", pass: "1111", role: "admin" },
    { name: "Дидар", pass: "2222", role: "admin" },
    { name: "Хозяин", pass: "0000", role: "owner" }
];

let state = JSON.parse(localStorage.getItem('sensei_db')) || {
    isLoggedIn: false,
    user: null,
    revenue: 0,
    history: [],
    inventory: [],
    tables: Array.from({length: 6}, (_, i) => ({ id: i + 1, active: false }))
};

function save() {
    localStorage.setItem('sensei_db', JSON.stringify(state));
    render();
}

function login() {
    const idx = document.getElementById('staff-select').value;
    const pass = document.getElementById('pass-input').value;
    if (STAFF[idx].pass === pass) {
        state.isLoggedIn = true;
        state.user = STAFF[idx];
        save();
    } else {
        document.getElementById('auth-error').style.display = 'block';
    }
}

function logout() {
    if (confirm("Вы уверены, что хотите закрыть смену?")) {
        const salary = state.user.role === 'owner' ? 0 : Math.round(state.revenue * 0.08 + 6000);
        state.history.push({
            date: new Date().toLocaleDateString(),
            admin: state.user.name,
            rev: state.revenue,
            salary: salary
        });
        state.isLoggedIn = false;
        state.user = null;
        state.revenue = 0;
        save();
        location.reload();
    }
}

function render() {
    const auth = document.getElementById('auth-screen');
    const main = document.getElementById('main-content');
    
    if (!state.isLoggedIn) {
        auth.style.display = 'flex';
        main.style.display = 'none';
        return;
    }

    auth.style.display = 'none';
    main.style.display = 'block';

    document.getElementById('display-admin-name').innerText = state.user.name;
    document.getElementById('stat-revenue').innerText = state.revenue;
    document.getElementById('stat-salary').innerText = state.user.role === 'owner' ? 0 : Math.round(state.revenue * 0.08 + 6000);
    
    // Рендер столов
    document.querySelector('.tables-grid').innerHTML = state.tables.map(t => `
        <div class="table-card ${t.active ? 'active' : ''}">
            <h3 class="gold-text">Стол ${t.id}</h3>
            <p>${t.active ? 'ИГРАЕТ' : 'СВОБОДЕН'}</p>
            <button onclick="toggleTable(${t.id})" class="btn-login" style="margin-top:10px">
                ${t.active ? 'СТОП' : 'ПУСК'}
            </button>
        </div>
    `).join('');

    renderInventory();
}

function toggleTable(id) {
    const t = state.tables.find(x => x.id === id);
    if (t.active) state.revenue += 2000; // Примерная оплата за сессию
    t.active = !t.active;
    save();
}

function addInventoryItem() {
    const n = prompt("Название товара:");
    const p = prompt("Цена:");
    if(n && p) { state.inventory.push({n, p}); save(); }
}

function renderInventory() {
    document.getElementById('inventory-list').innerHTML = state.inventory.map(i => `
        <tr><td>${i.n}</td><td>${i.p} ₸</td></tr>
    `).join('');
}

function switchPage(p) {
    document.querySelectorAll('.page').forEach(x => x.style.display = 'none');
    document.querySelectorAll('.nav-btn').forEach(x => x.classList.remove('active'));
    document.getElementById(`page-${p}`).style.display = 'block';
    event.currentTarget.classList.add('active');
}

window.onload = () => {
    document.getElementById('staff-select').innerHTML = STAFF.map((s, i) => `<option value="${i}">${s.name}</option>`).join('');
    render();
};
