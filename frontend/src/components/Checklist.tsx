interface Item {
  label: string;
  done: boolean;
  hint?: string;
}

export default function Checklist({ items }: { items: Item[] }) {
  return (
    <ul className="checklist">
      {items.map((i, idx) => (
        <li key={idx} className={`checklistItem ${i.done ? "done" : "pending"}`}>
          <span className="checkmark">{i.done ? "✓" : "•"}</span>
          <span>{i.label}</span>
          {i.hint && <span className="textMuted"> — {i.hint}</span>}
        </li>
      ))}
    </ul>
  );
}
