const STAFF = [
    { name: "Султан", pin: "1111" },
    { name: "Дидар", pin: "2222" },
    { name: "Хозяин", pin: "0000" }
];

// ЗАЩИТА ОТ ОШИБОК: Проверяем данные при загрузке
let state;
try {
    const saved = localStorage.getItem('sensei_final');
    state = saved ? JSON.parse(saved) : null;
    if (!state || !state.tables) throw new Error();
} catch (e) {
    state = {
        isLoggedIn: false,
        user: null,
        revenue: 0,
        inventory: [],
        tables: [1,2,3,4,5,6].map(id => ({ id, active: false }))
    };
}

function save() {
    localStorage.setItem('sensei_final', JSON.stringify(state));
    render();
}

function login() {
    const idx = document.getElementById('staff-select').value;
    const pin = document.getElementById('pass-input').value;
    
    if (STAFF[idx].pin === pin) {
        state.isLoggedIn = true;
        state.user = STAFF[idx];
        document.getElementById('auth-error').style.display = 'none';
        save();
    } else {
        document.getElementById('auth-error').style.display = 'block';
    }
}

function logout() {
    if (confirm("Закрыть смену? Данные выручки обнулятся.")) {
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
        // Заполняем список админов, если еще не заполнен
        const sel = document.getElementById('staff-select');
        if (sel.options.length === 0) {
            sel.innerHTML = STAFF.map((s, i) => `<option value="${i}">${s.name}</option>`).join('');
        }
        return;
    }

    auth.style.display = 'none';
    app.style.display = 'block';

    document.getElementById('display-user').innerText = state.user.name;
    document.getElementById('rev-val').innerText = state.revenue;
    // Твоя формула: 6000 фикса + 8% от выручки
    document.getElementById('salary-val').innerText = Math.round(state.revenue * 0.08 + 6000);

    // Столы
    document.getElementById('tables-list').innerHTML = state.tables.map(t => `
        <div class="table-card ${t.active ? 'active' : ''}">
            <h3 class="gold-text">СТОЛ ${t.id}</h3>
            <p style="font-size:10px; color:${t.active ? '#2ecc71' : '#444'}">${t.active ? 'В ИГРЕ' : 'СВОБОДЕН'}</p>
            <button onclick="toggleTable(${t.id})" class="btn-primary" style="background:${t.active ? '#e74c3c' : '#d4af37'}">
                ${t.active ? 'СТОП' : 'ПУСК'}
            </button>
        </div>
    `).join('');

    // Склад
    document.getElementById('stock-list').innerHTML = state.inventory.map(i => `
        <div style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #222;">
            <span>${i.name}</span>
            <span class="gold-text">${i.price} ₸</span>
        </div>
    `).join('');
}

function toggleTable(id) {
    const t = state.tables.find(x => x.id === id);
    if (t.active) state.revenue += 2000; // Добавляем 2000 при завершении
    t.active = !t.active;
    save();
}

function switchTab(tabId, event) {
    document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + tabId).style.display = 'block';
    event.currentTarget.classList.add('active');
}

function addStockItem() {
    const n = prompt("Название товара:");
    const p = prompt("Цена:");
    if(n && p) { state.inventory.push({name: n, price: p}); save(); }
}

// Запуск при загрузке
window.onload = render;
