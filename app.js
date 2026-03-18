const EMPLOYEES = [
    { name: "Султан", pin: "1111", role: "Админ" },
    { name: "Дидар", pin: "2222", role: "Админ" },
    { name: "Хозяин", pin: "0000", role: "Владелец" }
];

let db = JSON.parse(localStorage.getItem('sensei_v3')) || {
    session: false,
    currentUser: null,
    totalRev: 0,
    inventory: [],
    tables: [1,2,3,4,5,6].map(id => ({id, active: false}))
};

function save() {
    localStorage.setItem('sensei_v3', JSON.stringify(db));
    render();
}

function login() {
    const idx = document.getElementById('staff-select').value;
    const pin = document.getElementById('pass-input').value;
    
    if (EMPLOYEES[idx].pin === pin) {
        db.session = true;
        db.currentUser = EMPLOYEES[idx];
        save();
        document.getElementById('pass-input').value = "";
    } else {
        document.getElementById('auth-error').style.display = 'block';
    }
}

function logout() {
    if (confirm("Закрыть смену и выйти?")) {
        db.session = false;
        db.currentUser = null;
        db.totalRev = 0;
        save();
        location.reload();
    }
}

function render() {
    const auth = document.getElementById('auth-screen');
    const app = document.getElementById('app');

    if (!db.session) {
        auth.style.display = 'flex';
        app.style.display = 'none';
        return;
    }

    auth.style.display = 'none';
    app.style.display = 'block';

    document.getElementById('user-name').innerText = db.currentUser.name;
    document.getElementById('role-label').innerText = db.currentUser.role;
    document.getElementById('total-rev').innerText = db.totalRev;
    document.getElementById('my-salary').innerText = Math.round(db.totalRev * 0.08 + 6000);

    // Столы
    document.getElementById('tables-container').innerHTML = db.tables.map(t => `
        <div class="table-box ${t.active ? 'active' : ''}">
            <h3 class="gold-text">Стол ${t.id}</h3>
            <p>${t.active ? 'ИГРАЕТ' : 'СВОБОДЕН'}</p>
            <button onclick="toggleTable(${t.id})" class="btn-primary">
                ${t.active ? 'СТОП' : 'ПУСК'}
            </button>
        </div>
    `).join('');

    // Склад
    document.getElementById('stock-list').innerHTML = db.inventory.map(i => `
        <tr><td>${i.name}</td><td>${i.price} ₸</td></tr>
    `).join('');
}

function toggleTable(id) {
    const t = db.tables.find(x => x.id === id);
    if (t.active) db.totalRev += 2000;
    t.active = !t.active;
    save();
}

function addItem() {
    const n = prompt("Название:");
    const p = prompt("Цена:");
    if(n && p) { db.inventory.push({name: n, price: p}); save(); }
}

function openTab(name) {
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.tab-link').forEach(l => l.classList.remove('active'));
    document.getElementById('tab-' + name).style.display = 'block';
    event.currentTarget.classList.add('active');
}

window.onload = () => {
    const sel = document.getElementById('staff-select');
    sel.innerHTML = EMPLOYEES.map((e, i) => `<option value="${i}">${e.name}</option>`).join('');
    render();
};
