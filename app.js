const TABLES_COUNT = 6;
// Загружаем данные из памяти телефона или создаем новые
let state = JSON.parse(localStorage.getItem('sensei_state')) || {
    tables: Array.from({ length: TABLES_COUNT }, (_, i) => ({
        id: i + 1,
        active: false,
        startTime: null,
        pauseTime: null,
        isPaused: false,
        bar: []
    }))
};

// Функция сохранения (чтобы ничего не пропало!)
function save() {
    localStorage.setItem('sensei_state', JSON.stringify(state));
    render();
}

function startTable(id) {
    const table = state.tables.find(t => t.id === id);
    if (!table.active) {
        table.active = true;
        table.startTime = Date.now();
        save();
    }
}

function stopTable(id) {
    if (confirm(`Закрыть стол №${id}?`)) {
        const table = state.tables.find(t => t.id === id);
        table.active = false;
        table.startTime = null;
        save();
    }
}

function render() {
    const container = document.querySelector('.hall-map');
    container.innerHTML = '';
    
    state.tables.forEach(table => {
        const card = document.createElement('div');
        card.className = `table-card ${table.active ? 'active' : ''}`;
        
        let timeStr = "00:00:00";
        if (table.active) {
            const diff = Date.now() - table.startTime;
            const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
            const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
            const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
            timeStr = `${h}:${m}:${s}`;
        }

        card.innerHTML = `
            <div class="table-num">Стол ${table.id}</div>
            <div class="timer">${timeStr}</div>
            <button class="${table.active ? 'btn-stop' : 'btn-start'}" 
                    onclick="${table.active ? `stopTable(${table.id})` : `startTable(${table.id})`}">
                ${table.active ? 'СТОП' : 'СТАРТ'}
            </button>
            <button class="btn-bar">БАР</button>
        `;
        container.appendChild(card);
    });
}

// Обновляем экран каждую секунду
setInterval(render, 1000);
render();
