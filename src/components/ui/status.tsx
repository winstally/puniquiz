import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const statusDotVariants = cva("relative inline-flex shrink-0 rounded-full", {
  variants: {
    variant: {
      online: "bg-[var(--sage)]",
      offline: "bg-destructive",
      maintenance: "bg-sky-500",
      degraded: "bg-[var(--amber)]",
    },
    size: {
      sm: "size-2",
      default: "size-2.5",
      lg: "size-3",
    },
  },
  defaultVariants: {
    variant: "online",
    size: "default",
  },
})

const statusPingVariants = cva(
  "absolute inline-flex h-full w-full rounded-full opacity-75 motion-safe:animate-ping",
  {
    variants: {
      variant: {
        online: "bg-[var(--sage)]",
        offline: "bg-destructive",
        maintenance: "bg-sky-500",
        degraded: "bg-[var(--amber)]",
      },
    },
    defaultVariants: {
      variant: "online",
    },
  }
)

function Status({
  className,
  variant = "online",
  size = "default",
  pulse = true,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof statusDotVariants> & {
    pulse?: boolean
  }) {
  const showPing = pulse && (variant === "online" || variant === "maintenance")
  const showPulse = pulse && variant === "degraded"

  return (
    <span
      data-slot="status"
      className={cn(
        "relative flex shrink-0",
        size === "sm" ? "size-2" : size === "lg" ? "size-3" : "size-2.5",
        className
      )}
      {...props}
    >
      {showPing ? (
        <span className={statusPingVariants({ variant })} aria-hidden />
      ) : null}
      <span
        className={cn(
          statusDotVariants({ variant, size }),
          showPulse && "motion-safe:animate-pulse"
        )}
        aria-hidden
      />
    </span>
  )
}

export { Status, statusDotVariants }
