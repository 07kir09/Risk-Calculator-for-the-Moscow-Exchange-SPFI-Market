import { useId, type ComponentProps, type ReactNode } from "react";
import classNames from "classnames";
import { Checkbox, Description, Label } from "@heroui/react";

type CheckboxProps = ComponentProps<typeof Checkbox>;

type AppCheckboxProps = Omit<CheckboxProps, "children" | "onChange"> & {
  id?: string;
  label: ReactNode;
  description?: ReactNode;
  onChange?: (isSelected: boolean) => void;
  contentClassName?: string;
  labelClassName?: string;
  descriptionClassName?: string;
  checkboxClassNames?: {
    base?: string;
    wrapper?: string;
    icon?: string;
    label?: string;
  };
};

export default function AppCheckbox({
  id,
  label,
  description,
  onChange,
  className,
  contentClassName,
  labelClassName,
  descriptionClassName,
  checkboxClassNames,
  children,
  ...props
}: AppCheckboxProps) {
  const generatedId = useId();
  const inputId = id ?? `checkbox-${generatedId}`;

  return (
    <Checkbox
      {...props}
      id={inputId}
      onChange={onChange}
      className={classNames("appCheckbox", checkboxClassNames?.base, className)}
    >
      <Checkbox.Control className={classNames("appCheckboxControl", checkboxClassNames?.wrapper)}>
        <Checkbox.Indicator className={classNames("appCheckboxIndicator", checkboxClassNames?.icon)} />
      </Checkbox.Control>
      <Checkbox.Content className={classNames("appCheckboxContent", contentClassName)}>
        <Label htmlFor={inputId} className={classNames("appCheckboxLabel", checkboxClassNames?.label, labelClassName)}>
          {label}
        </Label>
        {description ? (
          <Description className={classNames("appCheckboxDescription", descriptionClassName)}>
            {description}
          </Description>
        ) : null}
        {children}
      </Checkbox.Content>
    </Checkbox>
  );
}
