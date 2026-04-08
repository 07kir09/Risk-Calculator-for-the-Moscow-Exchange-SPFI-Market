import Card from "../ui/Card";

export default function HelpPage() {
  return (
    <Card>
      <h1 className="pageTitle">Справка</h1>
      <p className="pageHint">
        Здесь коротко и по-человечески объясняется, что делать на сайте и как читать основные результаты.
      </p>

      <div className="grid pageSection--tight">
        <Card>
          <div className="cardTitle">Как пользоваться</div>
          <ol className="orderedList pageSection--tight">
            <li>Откройте шаг импорта и загрузите файл портфеля или демо-данные.</li>
            <li>На шаге проверки данных устраните критические ошибки и просмотрите предупреждения.</li>
            <li>Подтяните рыночные данные и убедитесь, что расчёт готов к запуску.</li>
            <li>Выберите нужные метрики и параметры расчёта.</li>
            <li>Запустите расчёт и смотрите результат на панели риска.</li>
          </ol>
        </Card>

        <Card>
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
        </Card>
      </div>

      <Card className="pageSection--tight">
        <div className="cardTitle">Точность чисел</div>
        <div className="cardSubtitle">Интерфейс округляет значения только для чтения. Выгрузка сохраняет исходную точность.</div>
        <div className="textMuted statusMessage--compact">
          Если нужно проверить точные значения, используйте экспорт в Excel или JSON на шаге отчёта.
        </div>
      </Card>
    </Card>
  );
}
