import { ReactNode, useEffect, useMemo, useState } from "react";
import { PositionDraft } from "../../shared/types/contracts";
import { validatePosition } from "../../shared/lib/validation";

type PositionFormModalProps = {
  initial: PositionDraft;
  open: boolean;
  onClose: () => void;
  onSave: (value: PositionDraft) => void;
};

export function PositionFormModal({ initial, open, onClose, onSave }: PositionFormModalProps) {
  const [draft, setDraft] = useState<PositionDraft>(initial);
  const [touched, setTouched] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const issues = useMemo(() => validatePosition(draft), [draft]);
  const issueMap = useMemo(() => new Map(issues.map((issue) => [issue.field, issue.message])), [issues]);

  useEffect(() => {
    if (!open) return;
    setDraft(initial);
    setTouched(false);
    setShowAdvanced(false);
  }, [initial, open]);

  if (!open) {
    return null;
  }

  const instrumentType = draft.instrument_type ?? "option";

  function update<K extends keyof PositionDraft>(key: K, value: PositionDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function save() {
    setTouched(true);
    if (issues.length) return;
    onSave(draft);
    onClose();
  }

  function controlClass(field?: string) {
    if (!field) return "control";
    return touched && issueMap.has(field) ? "control control-error" : "control";
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3 className="section-title">Редактор позиции</h3>
          <div className="flex-row gap-8">
            <button className="btn" onClick={() => setShowAdvanced((prev) => !prev)}>
              {showAdvanced ? "Скрыть дополнительные поля" : "Показать дополнительные поля"}
            </button>
            <button className="btn" onClick={onClose}>Закрыть</button>
          </div>
        </div>

        <div className="form-grid">
          <Field label="ID позиции" error={touched ? issueMap.get("position_id") : undefined}>
            <input className={controlClass("position_id")} value={draft.position_id} onChange={(event) => update("position_id", event.target.value)} />
          </Field>

          <Field label="Тип инструмента">
            <select
              className="select"
              value={instrumentType}
              onChange={(event) => update("instrument_type", event.target.value as PositionDraft["instrument_type"])}
            >
              <option value="option">Опцион</option>
              <option value="forward">Форвард</option>
              <option value="swap_ir">Своп</option>
            </select>
          </Field>

          <Field label="Количество" error={touched ? issueMap.get("quantity") : undefined}>
            <input
              className={controlClass("quantity")}
              type="number"
              value={draft.quantity}
              onChange={(event) => update("quantity", Number(event.target.value))}
            />
          </Field>

          <Field label="Номинал">
            <input
              className="control"
              type="number"
              value={draft.notional ?? 1}
              onChange={(event) => update("notional", Number(event.target.value))}
            />
          </Field>

          <Field label="Базовый актив" error={touched ? issueMap.get("underlying_symbol") : undefined}>
            <input className={controlClass("underlying_symbol")} value={draft.underlying_symbol} onChange={(event) => update("underlying_symbol", event.target.value)} />
          </Field>

          <Field label="Цена базового актива" error={touched ? issueMap.get("underlying_price") : undefined}>
            <input
              className={controlClass("underlying_price")}
              type="number"
              value={draft.underlying_price}
              onChange={(event) => update("underlying_price", Number(event.target.value))}
            />
          </Field>

          <Field label="Страйк" error={touched ? issueMap.get("strike") : undefined}>
            <input className={controlClass("strike")} type="number" value={draft.strike} onChange={(event) => update("strike", Number(event.target.value))} />
          </Field>

          <Field label="Дата погашения" error={touched ? issueMap.get("maturity_date") : undefined}>
            <input className={controlClass("maturity_date")} type="date" value={draft.maturity_date} onChange={(event) => update("maturity_date", event.target.value)} />
          </Field>

          <Field label="Дата оценки" error={touched ? issueMap.get("maturity_date") : undefined}>
            <input className={controlClass("maturity_date")} type="date" value={draft.valuation_date} onChange={(event) => update("valuation_date", event.target.value)} />
          </Field>

          <Field label="Безрисковая ставка">
            <input
              className="control"
              type="number"
              step="0.0001"
              value={draft.risk_free_rate}
              onChange={(event) => update("risk_free_rate", Number(event.target.value))}
            />
          </Field>

          <Field label="Валюта" error={touched ? issueMap.get("currency") : undefined}>
            <input className={controlClass("currency")} value={draft.currency ?? "RUB"} onChange={(event) => update("currency", event.target.value.toUpperCase())} />
          </Field>

          {showAdvanced ? (
            <Field label="Haircut ликвидности">
              <input
                className="control"
                type="number"
                step="0.0001"
                value={draft.liquidity_haircut ?? 0}
                onChange={(event) => update("liquidity_haircut", Number(event.target.value))}
              />
            </Field>
          ) : null}

          {instrumentType === "option" ? (
            <>
              <Field label="Тип опциона">
                <select className="select" value={draft.option_type ?? "call"} onChange={(event) => update("option_type", event.target.value as any)}>
                  <option value="call">Колл</option>
                  <option value="put">Пут</option>
                </select>
              </Field>

              <Field label="Стиль исполнения">
                <select className="select" value={draft.style ?? "european"} onChange={(event) => update("style", event.target.value as any)}>
                  <option value="european">Европейский</option>
                  <option value="american">Американский</option>
                </select>
              </Field>

              <Field label="Волатильность" error={touched ? issueMap.get("volatility") : undefined}>
                <input
                  className={controlClass("volatility")}
                  type="number"
                  step="0.0001"
                  value={draft.volatility ?? 0.2}
                  onChange={(event) => update("volatility", Number(event.target.value))}
                />
              </Field>

              {showAdvanced ? (
                <>
                  <Field label="Дивидендная доходность">
                    <input
                      className="control"
                      type="number"
                      step="0.0001"
                      value={draft.dividend_yield ?? 0}
                      onChange={(event) => update("dividend_yield", Number(event.target.value))}
                    />
                  </Field>

                  <Field label="Модель">
                    <select className="select" value={draft.model ?? "black_scholes"} onChange={(event) => update("model", event.target.value)}>
                      <option value="black_scholes">Блэк-Шоулз</option>
                      <option value="binomial">Биномиальная</option>
                      <option value="mc">Монте-Карло</option>
                    </select>
                  </Field>
                </>
              ) : null}
            </>
          ) : null}

          {instrumentType === "swap_ir" ? (
            <>
              <Field label="Фиксированная ставка">
                <input
                  className="control"
                  type="number"
                  step="0.0001"
                  value={draft.fixed_rate ?? 0}
                  onChange={(event) => update("fixed_rate", Number(event.target.value))}
                />
              </Field>

              <Field label="Плавающая ставка">
                <input
                  className="control"
                  type="number"
                  step="0.0001"
                  value={draft.float_rate ?? 0}
                  onChange={(event) => update("float_rate", Number(event.target.value))}
                />
              </Field>

              <Field label="База дней">
                <input
                  className="control"
                  type="number"
                  step="0.0001"
                  value={draft.day_count ?? 0.5}
                  onChange={(event) => update("day_count", Number(event.target.value))}
                />
              </Field>
            </>
          ) : null}
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={save}>Сохранить</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  );
}
