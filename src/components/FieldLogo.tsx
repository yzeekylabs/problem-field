type FieldLogoProps = {
  className?: string;
  label?: string;
};

export function FieldLogo({ className = "", label }: FieldLogoProps) {
  return (
    <svg
      aria-hidden={label ? undefined : "true"}
      aria-label={label}
      className={`field-logo ${className}`.trim()}
      role={label ? "img" : undefined}
      viewBox="0 0 40 40"
    >
      <rect className="field-logo__frame" height="40" rx="12" width="40" />
      <circle className="field-logo__sun" cx="29" cy="12" r="4.5" />
      <path className="field-logo__horizon" d="M7 27.5c8.5-5.7 17-7.4 26-6.4" />
      <path className="field-logo__grass" d="M12 29.5c.4-3.8-.2-6.7-2.1-9.1M17.3 27.1c.2-4.6-.7-7.7-2.7-10M23 24.6c-.2-3.2-1-5.6-2.8-7.5" />
    </svg>
  );
}
