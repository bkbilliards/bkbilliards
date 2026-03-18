// ... (весь предыдущий код остается таким же до функции logout)

function logout() {
    if (!state.shiftActive) {
        location.reload();
        return;
    }

    // Расчеты для отчета
    let totalTableRevenue = 0;
    let totalBarRevenue = 0;
    let totalBarProfit = 0;

    // Считаем показатели (проходим по истории или текущим данным, если нужно)
    // В данной версии мы берем итоговую выручку. 
    // Для детального разделения добавим переменные в state при оплате столов.

    let isOwner = state.activeStaffName === "Хозяин";
    let salary = isOwner ? 0 : Math.round(state.totalRevenue * PERCENT + BASE_SALARY);
    let finalNet = state.totalRevenue - salary;

    const report = `
=== ОТЧЕТ ЗА СМЕНУ ===
👤 Сотрудник: ${state.activeStaffName}
--------------------------
💰 ОБЩАЯ ВЫРУЧКА: ${state.totalRevenue} ₸

📊 ДЕТАЛИЗАЦИЯ:
- Столы + Бар (всего): ${state.totalRevenue} ₸
(Система фиксирует общую сумму при оплате)

💵 ЗАРПЛАТА:
- К выплате админу: ${salary} ₸
--------------------------
ИНКАССАЦИЯ (Остаток в кассе):
✅ ИТОГО К СДАЧЕ: ${finalNet} ₸
======================
    `;

    if (confirm(report + "\n\nЗавершить смену и очистить данные?")) {
        state.shiftActive = false;
        state.activeStaffName = null;
        state.totalRevenue = 0;
        // Очищаем временные данные, но сохраняем склад и долги
        localStorage.setItem('sensei_state', JSON.stringify({
            ...state,
            shiftActive: false,
            activeStaffName: null,
            totalRevenue: 0,
            tables: Array.from({ length: TABLES_COUNT }, (_, i) => ({
                id: i + 1, active: false, startTime: null, bar: [], clientName: "Гость", discount: 0
            }))
        }));
        location.reload();
    }
}

// ... (остальной код render и интервалы без изменений)
