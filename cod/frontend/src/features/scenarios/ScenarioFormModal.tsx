import { useEffect, useState } from "react";
import { ScenarioDraft } from "../../shared/types/contracts";

type ScenarioFormModalProps = {
  open: boolean;
  initial: ScenarioDraft;
  onClose: () => void;
  onSave: (value: ScenarioDraft) => void;
};

export function ScenarioFormModal({ open, initial, onClose, onSave }: ScenarioFormModalProps) {
  const [draft, setDraft] = useState<ScenarioDraft>(initial);

  useEffect(() => {
    if (!open) return;
    setDraft(initial);
  }, [initial, open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel modal-panel-small" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3 className="section-title">Редактор сценария</h3>
          <button className="btn" onClick={onClose}>Закрыть</button>
        </div>

        <div className="form-grid">
          <label className="field">
            <span className="field-label">ID сценария</span>
            <input className="control" value={draft.scenario_id} onChange={(event) => setDraft((prev) => ({ ...prev, scenario_id: event.target.value }))} />
          </label>
          <label className="field">
            <span className="field-label">Сдвиг базового актива</span>
            <input className="control" type="number" step="0.0001" value={draft.underlying_shift ?? 0} onChange={(event) => setDraft((prev) => ({ ...prev, underlying_shift: Number(event.target.value) }))} />
          </label>
          <label className="field">
            <span className="field-label">Сдвиг волатильности</span>
            <input className="control" type="number" step="0.0001" value={draft.volatility_shift ?? 0} onChange={(event) => setDraft((prev) => ({ ...prev, volatility_shift: Number(event.target.value) }))} />
          </label>
          <label className="field">
            <span className="field-label">Сдвиг ставки</span>
            <input className="control" type="number" step="0.0001" value={draft.rate_shift ?? 0} onChange={(event) => setDraft((prev) => ({ ...prev, rate_shift: Number(event.target.value) }))} />
          </label>
          <label className="field">
            <span className="field-label">Вероятность</span>
            <input className="control" type="number" step="0.0001" value={draft.probability ?? ""} onChange={(event) => setDraft((prev) => ({ ...prev, probability: event.target.value === "" ? null : Number(event.target.value) }))} />
          </label>
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={() => {
            onSave(draft);
            onClose();
          }}>Сохранить</button>
        </div>
      </div>
    </div>
  );
}
