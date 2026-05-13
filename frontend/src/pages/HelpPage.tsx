export default function HelpPage() {
  return (
    <div className="importPagePlain">
      <div className="importHeroRow">
        <div>
          <h1 className="pageTitle">Справка</h1>
          <div className="importHeroMeta">
            <span className="importFileTag">Быстрый гид по шагам расчета</span>
          </div>
        </div>
      </div>

      <div className="importUploadSplit helpGrid">
        <section className="helpTile">
          <div className="cardTitle">Как пользоваться</div>
          <ol className="orderedList pageSection--tight">
            <li>Откройте шаг импорта и загрузите файл портфеля или демо-данные.</li>
            <li>На шаге проверки данных устраните критические ошибки и просмотрите предупреждения.</li>
            <li>Подтяните рыночные данные и убедитесь, что расчёт готов к запуску.</li>
            <li>Выберите нужные метрики и параметры расчёта.</li>
            <li>Запустите расчёт и смотрите результат на панели риска.</li>
          </ol>
        </section>

        <section className="helpTile">
          <div className="cardTitle">Как читать метрики</div>
          <div className="detailList pageSection--tight">
            <div className="detailListRow">
              <span>VaR</span>
              <strong>Возможный убыток в плохой день</strong>
            </div>
            <div className="detailListRow">
              <span>ES</span>
              <strong>Средний убыток в самых плохих случаях</strong>
            </div>
            <div className="detailListRow">
              <span>Greeks</span>
              <strong>Что именно двигает цену портфеля</strong>
            </div>
            <div className="detailListRow">
              <span>Stress</span>
              <strong>Что будет при резком движении рынка</strong>
            </div>
            <div className="detailListRow">
              <span>Лимиты</span>
              <strong>Сравнение факта с допустимым уровнем</strong>
            </div>
          </div>
        </section>
      </div>

      <section className="helpTile helpTile--wide">
        <div className="cardTitle">Точность чисел</div>
        <div className="cardSubtitle">Интерфейс округляет значения только для чтения. Выгрузка сохраняет исходную точность.</div>
        <div className="textMuted statusMessage--compact">
          Если нужно проверить точные значения, используйте экспорт в Excel или JSON на шаге отчёта.
        </div>
      </section>
    </div>
  );
}
