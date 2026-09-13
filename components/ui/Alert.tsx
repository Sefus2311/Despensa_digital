import type { HTMLAttributes } from "react";

type AlertTone = "info" | "warning" | "danger" | "success";

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  tone?: AlertTone;
}

const ROLE_BY_TONE: Record<AlertTone, "status" | "alert"> = {
  info: "status",
  success: "status",
  warning: "alert",
  danger: "alert",
};

export function Alert({ tone = "info", className, children, ...props }: AlertProps) {
  const classes = ["ui-alert", `ui-alert--${tone}`, className].filter(Boolean).join(" ");
  return (
    <div className={classes} role={ROLE_BY_TONE[tone]} {...props}>
      {children}
    </div>
  );
}
