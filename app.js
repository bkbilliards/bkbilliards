const STAFF = [
    { name: "Султан", pin: "1111", role: "АДМИН" },
    { name: "Дидар", pin: "2222", role: "АДМИН" },
    { name: "Хозяин", pin: "0000", role: "ВЛАДЕЛЕЦ" }
];

let state = JSON.parse(localStorage.getItem('sensei_v4')) || {
    isAuth: false,
    user: null,
    rev: 0,
    items: [],
    tables: [1,2,3,4,5,6].map(id => ({id, active: false, start: null}))
};

function save() {
    localStorage.setItem('sensei_v4', JSON.stringify(state));
    render();
}

function login() {
    const idx = document.getElementById('staff-select').value;
    const pin = document.getElementById('pass-input').value;
    if (STAFF[idx].pin === pin) {
        state.isAuth = true;
        state.user = STAFF[idx];
        save();
        document.getElementById('pass-input').value = "";
    } else {
        const err = document.getElementById('auth-error');
        err.style.display = 'block';
        setTimeout(() => err.style.display = 'none', 2000);
    }
}

function logout() {
    if (confirm("Вы действительно хотите завершить смену?")) {
        state.isAuth = false;
        state.user = null;
        state.rev = 0;
        save();
        location.reload();
    }
}

function render() {
    const auth = document.getElementById('auth-screen');
    const app = document.getElementById('app');

    if (!state.isAuth) {
        auth.style.display = 'flex';
        app.style.display = 'none';
        return;
    }

    auth.style.display = 'none';
    app.style.display = 'block';

    document.getElementById('user-name').innerText = state.user.name;
    document.getElementById('role-badge').innerText = state.user.role;
    document.getElementById('total-rev').innerText = state.rev.toLocaleString();
    document.getElementById('my-salary').innerText = Math.round(state.rev * 0.08 + 6000).toLocaleString();

    // Отрисовка столов
    document.getElementById('tables-container').innerHTML = state.tables.map(t => `
        <div class="table-card ${t.active ? 'active' : ''}">
            <div style="display:flex; justify-content:space-between; margin-bottom:20px;">
                <span style="color:#666; font-size:12px;">СТОЛ №${t.id}</span>
                <span class="role-badge" style="background:${t.active ? '#00ff87' : '#333'}">
                    ${t.active ? 'ЗАНЯТ' : 'СВОБОДЕН'}
                </span>
            </div>
            <div style="font-size:32px; font-weight:700; margin-bottom:25px;">
                ${t.active ? 'В ИГРЕ' : 'ГОТОВ'}
            </div>
            <button onclick="toggleTable(${t.id})" class="${t.active ? 'btn-stop' : 'btn-start'}">
                ${t.active ? 'ЗАВЕРШИТЬ' : 'ОТКРЫТЬ СТОЛ'}
            </button>
        </div>
    `).join('');

    // Отрисовка склада
    document.getElementById('stock-list').innerHTML = state.items.map(i => `
        <tr>
            <td style="font-weight:600">${i.name}</td>
            <td class="gold-gradient-text">${parseInt(i.price).toLocaleString()} ₸</td>
        </tr>
    `).join('');
}

function toggleTable(id) {
    const t = state.tables.find(x => x.id === id);
    if (t.active) state.rev += 2000; // Пример начисления
    t.active = !t.active;
    save();
}

function addItem() {
    const name = prompt("Название товара:");
    const price = prompt("Цена:");
    if(name && price) {
        state.items.push({name, price});
        save();
    }
}

function openTab(tab) {
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');
    event.currentTarget.classList.add('active');
}

window.onload = () => {
    const sel = document.getElementById('staff-select');
    sel.innerHTML = STAFF.map((s, i) => `<option value="${i}">${s.name}</option>`).join('');
    render();
};
