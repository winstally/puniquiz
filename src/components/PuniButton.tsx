"use client";

import type { ComponentProps } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  puniButtonStyle,
  puniIconSize,
  PUNI_ICON_STROKE,
  type PuniButtonSize,
  type PuniButtonTone,
} from "@/lib/puni-button";

export function PuniIcon({
  icon: Icon,
  size = "md",
  filled = false,
}: {
  icon: LucideIcon;
  size?: PuniButtonSize;
  filled?: boolean;
}) {
  return (
    <Icon
      aria-hidden
      size={puniIconSize(size)}
      strokeWidth={PUNI_ICON_STROKE}
      stroke="currentColor"
      fill={filled ? "currentColor" : "none"}
    />
  );
}

type PuniButtonProps = {
  variant: "plum" | "ghost" | "soft";
  size?: PuniButtonSize;
  tone?: PuniButtonTone;
  wide?: boolean;
  icon?: LucideIcon;
  iconFilled?: boolean;
} & Omit<ComponentProps<typeof Button>, "variant" | "size">;

/** Branded pill button — icon + label layout SSOT for puni CTAs. */
export function PuniButton({
  variant,
  size = "md",
  tone = "default",
  wide,
  icon: Icon,
  iconFilled = false,
  className,
  style,
  children,
  ...props
}: PuniButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={cn(
        "h-auto min-h-0 rounded-full border-0 p-0 font-[inherit] shadow-none",
        "hover:bg-transparent active:translate-y-0",
        "[&_svg]:shrink-0 [&_svg]:stroke-current",
        iconFilled ? "[&_svg]:fill-current" : "[&_svg]:fill-none",
        className,
      )}
      style={{ ...puniButtonStyle({ variant, size, tone, wide }), ...style }}
      {...props}
    >
      {Icon ? <PuniIcon icon={Icon} size={size} filled={iconFilled} /> : null}
      {children}
    </Button>
  );
}
