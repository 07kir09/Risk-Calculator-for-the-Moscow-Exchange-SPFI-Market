export default function HelpPage() {
  return (
    <div className="card">
      <h1 className="pageTitle">Справка</h1>
      <p className="pageHint">
        Здесь коротко и “по‑человечески” объясняем, что делать на сайте и что означают основные термины.
      </p>

      <div className="grid" style={{ marginTop: 12 }}>
        <div className="card">
          <div className="cardTitle">Как пользоваться (самый простой сценарий)</div>
          <ol style={{ margin: "10px 0 0", paddingLeft: 18 }} className="stack">
            <li>Откройте <span className="code">Шаг 1. Импорт сделок</span> и загрузите CSV (или демо‑данные).</li>
            <li>На <span className="code">Шаг 2. Проверка данных</span> исправьте ошибки (критические — обязательно).</li>
            <li>На <span className="code">Шаг 3</span> нажмите “Подтянуть рыночные данные”.</li>
            <li>На <span className="code">Шаг 4</span> выберите метрики и нажмите “Сохранить”.</li>
            <li>На <span className="code">Шаг 5</span> нажмите “Запустить расчёт”, затем смотрите результаты на панели.</li>
          </ol>
        </div>

        <div className="card">
          <div className="cardTitle">Что считать (простое объяснение)</div>
          <div className="stack" style={{ marginTop: 10 }}>
            <div><span className="badge ok">VaR</span> — “какой убыток возможен в плохой день” при выбранном доверии.</div>
            <div><span className="badge ok">ES</span> — “средний убыток в самых плохих случаях” (хуже, чем VaR).</div>
            <div><span className="badge ok">Greeks</span> — “что именно двигает цену” (цена/вола/ставка).</div>
            <div><span className="badge ok">Stress</span> — “что будет, если рынок резко двинется”.</div>
            <div><span className="badge ok">Лимиты</span> — сравнение “факт” vs “разрешено”.</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="cardTitle">Точность чисел</div>
        <div className="cardSubtitle">Мы не округляем вычисления. Форматирование — только для удобства отображения.</div>
        <div className="textMuted" style={{ marginTop: 10 }}>
          Наведите курсор на число, чтобы увидеть точное значение (если поддерживается в текущем виджете), или используйте экспорт (шаг 10).
        </div>
      </div>
    </div>
  );
}
