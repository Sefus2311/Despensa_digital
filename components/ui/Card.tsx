import type { HTMLAttributes } from "react";

type CardElevation = "none" | "raised" | "overlay";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  elevation?: CardElevation;
}

export function Card({ elevation = "none", className, ...props }: CardProps) {
  const classes = ["ui-card", elevation !== "none" && `ui-card--${elevation}`, className]
    .filter(Boolean)
    .join(" ");
  return <div className={classes} {...props} />;
}
