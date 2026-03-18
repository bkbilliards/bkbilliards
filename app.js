const STAFF = [
    { name: "Султан", pin: "1111", role: "Админ" },
    { name: "Дидар", pin: "2222", role: "Админ" },
    { name: "Хозяин", pin: "0000", role: "Владелец" }
];

let state = JSON.parse(localStorage.getItem('sensei_v5')) || {
    isLoggedIn: false,
    user: null,
    revenue: 0,
    inventory: [],
    history: [],
    tables: [1,2,3,4,5,6].map(id => ({ id, active: false }))
};

function save() {
    localStorage.setItem('sensei_v5', JSON.stringify(state));
    render();
}

function login() {
    const idx = document.getElementById('staff-select').value;
    const pin = document.getElementById('pass-input').value;
    
    if (STAFF[idx].pin === pin) {
        state.isLoggedIn = true;
        state.user = STAFF[idx];
        save();
    } else {
        document.getElementById('auth-error').style.display = 'block';
    }
}

function logout() {
    if (confirm("Вы уверены, что хотите закрыть смену?")) {
        state.history.push({
            date: new Date().toLocaleDateString(),
            admin: state.user.name,
            rev: state.revenue
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
    const app = document.getElementById('main-app');

    if (!state.isLoggedIn) {
        auth.style.display = 'flex';
        app.style.display = 'none';
        return;
    }

    auth.style.display = 'none';
    app.style.display = 'block';

    document.getElementById('display-user').innerText = state.user.name;
    document.getElementById('rev-val').innerText = state.revenue.toLocaleString();
    document.getElementById('salary-val').innerText = (state.revenue * 0.08 + 6000).toLocaleString();

    // Столы
    document.getElementById('tables-list').innerHTML = state.tables.map(t => `
        <div class="table-card ${t.active ? 'active' : ''}">
            <h3 class="gold-text">Стол ${t.id}</h3>
            <p style="font-size:12px; color:#666">${t.active ? 'В ИГРЕ' : 'СВОБОДЕН'}</p>
            <button onclick="toggleTable(${t.id})" class="btn-primary" style="background:${t.active ? '#e74c3c' : '#c5a059'}">
                ${t.active ? 'СТОП' : 'ПУСК'}
            </button>
        </div>
    `).join('');

    // Склад
    document.getElementById('stock-list').innerHTML = state.inventory.map(i => `
        <tr><td>${i.name}</td><td>${i.price} ₸</td></tr>
    `).join('');

    // История
    document.getElementById('history-list').innerHTML = state.history.map(h => `
        <tr><td>${h.date}</td><td>${h.admin}</td><td>${h.rev} ₸</td></tr>
    `).join('');
}

function toggleTable(id) {
    const t = state.tables.find(x => x.id === id);
    if (t.active) state.revenue += 2000; // Пример начисления за сессию
    t.active = !t.active;
    save();
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + tabId).classList.add('active');
    event.currentTarget.classList.add('active');
}

function addStockItem() {
    const name = prompt("Название товара:");
    const price = prompt("Цена:");
    if(name && price) {
        state.inventory.push({ name, price });
        save();
    }
}

window.onload = () => {
    const sel = document.getElementById('staff-select');
    sel.innerHTML = STAFF.map((s, i) => `<option value="${i}">${s.name}</option>`).join('');
    render();
};
