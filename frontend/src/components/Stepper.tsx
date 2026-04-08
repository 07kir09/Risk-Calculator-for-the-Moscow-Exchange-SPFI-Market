interface Step {
  title: string;
  description: string;
  status: "pending" | "done" | "active";
}

export default function Stepper({ steps }: { steps: Step[] }) {
  return (
    <div className="stepper">
      {steps.map((s, idx) => (
        <div key={idx} className={`step ${s.status === "pending" ? "locked" : s.status}`}>
          <div className="stepRow">
            <div className="stepIndex">{idx + 1}</div>
            <div className="stepTitle">{s.title}</div>
          </div>
          <div className="stepDesc">{s.description}</div>
        </div>
      ))}
    </div>
  );
}
