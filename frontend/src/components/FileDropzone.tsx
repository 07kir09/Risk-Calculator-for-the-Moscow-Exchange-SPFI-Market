import { useId, useRef, useState } from "react";
import { ReactNode } from "react";
import Button from "./Button";

export default function FileDropzone({
  accept,
  disabled = false,
  title = "Перетащите файл сюда",
  subtitle = "или нажмите, чтобы выбрать файл",
  onFile,
  onFiles,
  inputTestId,
  showSystemPickerLink = true,
  extraAction,
  multiple = false,
}: {
  accept: string;
  disabled?: boolean;
  title?: string;
  subtitle?: string;
  onFile?: (file: File) => void;
  onFiles?: (files: File[]) => void;
  inputTestId?: string;
  showSystemPickerLink?: boolean;
  extraAction?: ReactNode;
  multiple?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isActive, setActive] = useState(false);
  const [isExtraActionHovered, setExtraActionHovered] = useState(false);
  const inputId = useId();

  const pick = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  const emitFiles = (incoming: FileList | File[]) => {
    const files = Array.from(incoming).filter(Boolean);
    if (!files.length) return;

    if (multiple) {
      if (onFiles) onFiles(files);
      else onFile?.(files[0]);
      return;
    }

    const first = files[0];
    if (onFile) onFile(first);
    else onFiles?.([first]);
  };

  return (
    <div
      className={`dropzone ${isActive ? "dropzone--active" : ""} ${disabled ? "dropzone--disabled" : ""} ${isExtraActionHovered ? "dropzone--suspend-hover" : ""}`}
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
        const dropped = e.dataTransfer.files;
        if (!dropped?.length) return;
        emitFiles(dropped);
      }}
    >
      <input
        id={inputId}
        data-testid={inputTestId}
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="visuallyHiddenInput"
        onChange={(e) => {
          const selected = e.target.files;
          if (!selected?.length) return;
          emitFiles(selected);
          e.target.value = "";
        }}
      />
      <div className="dropzoneTitle">{title}</div>
      <div className="dropzoneSubtitle">{subtitle}</div>
      <div className="dropzoneActions">
        <Button
          type="button"
          variant="secondary"
          className="dropzoneCta"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            pick();
          }}
        >
          Выбрать файл
        </Button>
        {showSystemPickerLink && (
          <label
            htmlFor={inputId}
            className={`dropzoneLink ${disabled ? "dropzoneLink--disabled" : ""}`}
            onClick={(e) => {
              if (disabled) {
                e.preventDefault();
                return;
              }
              e.stopPropagation();
            }}
          >
            Открыть системный выбор
          </label>
        )}
        {extraAction && (
          <div
            className="dropzoneExtraAction"
            onMouseEnter={() => setExtraActionHovered(true)}
            onMouseLeave={() => setExtraActionHovered(false)}
            onFocusCapture={() => setExtraActionHovered(true)}
            onBlurCapture={() => setExtraActionHovered(false)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {extraAction}
          </div>
        )}
      </div>
    </div>
  );
}
