import Card from "../ui/Card";
import Button from "../components/Button";

export default function UiDemoPage() {
  return (
    <Card>
      <h1 className="pageTitle">UI Demo (проверка лейаутов)</h1>
      <p className="pageHint">
        Страница для быстрой проверки: длинные тексты, таблицы, кнопки и сетка на разных ширинах.
      </p>

      <div className="grid" style={{ marginTop: 12 }}>
        <Card>
          <div className="cardTitle">Кнопки</div>
          <div className="row wrap" style={{ marginTop: 12 }}>
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button disabled>Disabled</Button>
            <Button loading>Loading</Button>
          </div>
        </Card>

        <Card>
          <div className="cardTitle">Длинный текст</div>
          <div className="cardSubtitle">
            Очень длинное описание, чтобы проверить переносы и отсутствие наложений: “потенциальный убыток при доверии 99% на горизонте 10 дней”.
          </div>
        </Card>
      </div>

      <Card>
        <div className="cardTitle">Таблица (overflow внутри)</div>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table sticky">
            <thead>
              <tr>
                <th>Колонка 1</th>
                <th>Колонка 2 (очень длинное название)</th>
                <th>Колонка 3</th>
                <th>Колонка 4</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 40 }).map((_, i) => (
                <tr key={i}>
                  <td>row {i}</td>
                  <td title="длинный-длинный-длинный-длинный-идентификатор">длинный-длинный-длинный-длинный-идентификатор</td>
                  <td>1234567890.123456</td>
                  <td>OK</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Card>
  );
}

