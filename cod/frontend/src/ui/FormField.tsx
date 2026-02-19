import { ReactNode } from "react";
import classNames from "classnames";

export default function FormField({
  label,
  helper,
  error,
  unit,
  required,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode;
  helper?: ReactNode;
  error?: ReactNode;
  unit?: ReactNode;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={classNames("formField", className, error && "formField--error")}>
      <label className="formFieldLabel" htmlFor={htmlFor}>
        <span>{label}</span>
        {required && <span className="formFieldRequired">*</span>}
      </label>
      <div className="formFieldControlWrap">
        {children}
        {unit && <span className="formFieldUnit">{unit}</span>}
      </div>
      {error ? <div className="formFieldError">{error}</div> : helper ? <div className="formFieldHelper">{helper}</div> : null}
    </div>
  );
}
