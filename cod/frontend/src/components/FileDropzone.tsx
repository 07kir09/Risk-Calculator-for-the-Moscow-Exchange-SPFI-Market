import { useRef, useState } from "react";

export default function FileDropzone({
  accept,
  disabled = false,
  title = "Перетащите файл сюда",
  subtitle = "или нажмите, чтобы выбрать файл",
  onFile,
  inputTestId,
}: {
  accept: string;
  disabled?: boolean;
  title?: string;
  subtitle?: string;
  onFile: (file: File) => void;
  inputTestId?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isActive, setActive] = useState(false);

  const pick = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  return (
    <div
      className={`dropzone ${isActive ? "dropzone--active" : ""} ${disabled ? "dropzone--disabled" : ""}`}
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      onClick={pick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") pick();
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        if (disabled) return;
        setActive(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (disabled) return;
        setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        if (disabled) return;
        setActive(false);
        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        onFile(file);
      }}
    >
      <input
        data-testid={inputTestId}
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          onFile(file);
          e.target.value = "";
        }}
      />
      <div className="dropzoneTitle">{title}</div>
      <div className="dropzoneSubtitle">{subtitle}</div>
    </div>
  );
}

