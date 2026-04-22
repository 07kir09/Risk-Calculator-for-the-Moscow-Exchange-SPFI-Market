import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const STORAGE_KEY = "onboarding_seen_v4";

const STEPS = [
  {
    icon: "📂",
    title: "Загрузите портфель",
    desc: "Импортируйте позиции из CSV или XLSX — система распознает структуру и валидирует обязательные поля.",
    tag: "Шаг 1",
  },
  {
    icon: "🔍",
    title: "Проверьте данные",
    desc: "Валидатор покажет ошибки и предупреждения по строкам, чтобы вы быстро устранили проблемы перед расчетом.",
    tag: "Шаг 2",
  },
  {
    icon: "📡",
    title: "Подключите Market Data",
    desc: "Выберите API (auto) или ручной bundle файлов — оба режима поддерживаются в рабочем процессе.",
    tag: "Шаг 3",
  },
  {
    icon: "⚡",
    title: "Запустите расчет",
    desc: "Получите VaR, ES, стресс-тесты, лимиты и ключевые вкладчики риска в одном запуске.",
    tag: "Шаг 4",
  },
] as const;

const REQUIRED_FIELDS = [
  "Тип инструмента",
  "Позиция",
  "Объем",
  "Номинал",
  "Базовый актив",
  "Валюта",
] as const;

export default function OnboardingModal() {
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) !== "1";
  });
  const [dontShowAgain, setDontShowAgain] = useState(true);
  const [activeStep, setActiveStep] = useState(0);
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);
  const portalRoot = useMemo(() => document.getElementById("overlay-root") ?? document.body, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => setEntered(true), 80);
    return () => window.clearTimeout(timer);
  }, [open]);

  const closeHint = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => {
      if (dontShowAgain) localStorage.setItem(STORAGE_KEY, "1");
      setOpen(false);
    }, 380);
  };

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeHint();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      onClick={closeHint}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 480,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "18px",
        transition: "all 0.42s cubic-bezier(0.4,0,0.2,1)",
        backdropFilter: closing ? "blur(0px)" : "blur(16px)",
        background: closing
          ? "rgba(6,10,22,0)"
          : "radial-gradient(1400px 820px at 10% -12%, rgba(59,130,246,0.22), transparent 55%), radial-gradient(980px 780px at 92% 108%, rgba(20,184,166,0.14), transparent 58%), rgba(6,10,22,0.82)",
        opacity: closing ? 0 : 1,
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Вступительное окно"
        onClick={(event) => event.stopPropagation()}
        style={{
          position: "relative",
          width: "min(700px, 92vw)",
          maxHeight: "90vh",
          overflowY: "auto",
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "linear-gradient(168deg, #111827 0%, #0d1321 50%, #0f172a 100%)",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.03), 0 40px 120px rgba(0,0,0,0.72), 0 0 80px rgba(59,130,246,0.08)",
          color: "#e2e8f0",
          transform: entered && !closing ? "translateY(0) scale(1)" : "translateY(26px) scale(0.97)",
          opacity: entered && !closing ? 1 : 0,
          transition: "all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        <div
          style={{
            height: 3,
            borderRadius: "20px 20px 0 0",
            background: "linear-gradient(90deg, #3b82f6 0%, #06b6d4 40%, #8b5cf6 100%)",
          }}
        />

        <div style={{ padding: "34px 40px 0 40px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "linear-gradient(135deg, #3b82f6, #6366f1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                fontWeight: 800,
                color: "#fff",
                boxShadow: "0 4px 20px rgba(59,130,246,0.3)",
                letterSpacing: -1,
              }}
            >
              RC
            </div>
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 2.5,
                  color: "#64748b",
                  textTransform: "uppercase",
                  marginBottom: 2,
                }}
              >
                Risk Calculator
              </div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  letterSpacing: -0.5,
                  background: "linear-gradient(90deg, #e2e8f0, #94a3b8)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                СПФИ MOEX
              </div>
            </div>
          </div>

          <p
            style={{
              fontSize: 15,
              lineHeight: 1.7,
              color: "#94a3b8",
              margin: "18px 0 0 0",
              maxWidth: 560,
            }}
          >
            Оценивайте рыночный риск портфеля СПФИ: от импорта сделок до результата по VaR/ES, стрессам и лимитам за
            несколько минут.
          </p>
        </div>

        <div
          style={{
            height: 1,
            margin: "28px 40px 0",
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)",
          }}
        />

        <div style={{ padding: "28px 40px 0 40px" }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 2,
              color: "#475569",
              textTransform: "uppercase",
              marginBottom: 16,
            }}
          >
            Быстрый старт
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {STEPS.map((step, index) => {
              const isActive = activeStep === index;
              return (
                <div
                  key={step.title}
                  onClick={() => setActiveStep(index)}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 16,
                    padding: "16px 18px",
                    borderRadius: 14,
                    cursor: "pointer",
                    transition: "all 0.25s ease",
                    background: isActive ? "rgba(59,130,246,0.06)" : "transparent",
                    border: isActive ? "1px solid rgba(59,130,246,0.12)" : "1px solid transparent",
                  }}
                >
                  <div
                    style={{
                      minWidth: 36,
                      height: 36,
                      borderRadius: 10,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 18,
                      background: isActive ? "linear-gradient(135deg, #3b82f6, #6366f1)" : "rgba(255,255,255,0.04)",
                      boxShadow: isActive ? "0 4px 16px rgba(59,130,246,0.25)" : "none",
                      transition: "all 0.3s ease",
                    }}
                  >
                    {step.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                      <span
                        style={{
                          fontSize: 15,
                          fontWeight: 600,
                          color: isActive ? "#e2e8f0" : "#94a3b8",
                        }}
                      >
                        {step.title}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: isActive ? "#60a5fa" : "#475569",
                          background: isActive ? "rgba(59,130,246,0.1)" : "rgba(255,255,255,0.03)",
                          padding: "2px 8px",
                          borderRadius: 6,
                          letterSpacing: 0.5,
                        }}
                      >
                        {step.tag}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        lineHeight: 1.65,
                        color: "#64748b",
                        maxHeight: isActive ? 120 : 0,
                        opacity: isActive ? 1 : 0,
                        overflow: "hidden",
                        transition: "all 0.35s ease",
                      }}
                    >
                      {step.desc}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ padding: "24px 40px 0 40px" }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 2,
              color: "#475569",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            Обязательные поля портфеля
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {REQUIRED_FIELDS.map((field) => (
              <span
                key={field}
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: "#94a3b8",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  padding: "5px 14px",
                  borderRadius: 8,
                  letterSpacing: 0.2,
                }}
              >
                {field}
              </span>
            ))}
          </div>
        </div>

        <div
          style={{
            padding: "30px 40px 36px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: "#64748b",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(event) => setDontShowAgain(event.target.checked)}
              style={{ width: 16, height: 16, borderRadius: 4, accentColor: "#3b82f6", cursor: "pointer" }}
            />
            Больше не показывать
          </label>

          <button
            type="button"
            onClick={closeHint}
            style={{
              background: "linear-gradient(135deg, #3b82f6, #6366f1)",
              color: "#fff",
              border: "none",
              padding: "13px 30px",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 4px 24px rgba(59,130,246,0.3), 0 1px 3px rgba(0,0,0,0.2)",
              letterSpacing: 0.3,
            }}
          >
            Готово
          </button>
        </div>
      </aside>
    </div>,
    portalRoot
  );
}
