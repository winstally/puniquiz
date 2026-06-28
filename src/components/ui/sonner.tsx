"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-right"
      offset={{ bottom: 20, right: 16 }}
      mobileOffset={{ bottom: 24, right: 12 }}
      visibleToasts={2}
      richColors
      icons={{
        success: (
          <CircleCheckIcon className="size-4 text-[var(--sage-deep)]" />
        ),
        info: (
          <InfoIcon className="size-4 text-[var(--sky-deep)]" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4 text-[var(--amber-deep)]" />
        ),
        error: (
          <OctagonXIcon className="size-4 text-[var(--rose-deep)]" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin text-[var(--plum-deep)]" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--success-bg": "color-mix(in srgb, var(--sage) 12%, #fff)",
          "--success-border": "color-mix(in srgb, var(--sage) 38%, var(--line))",
          "--success-text": "var(--sage-deep)",
          "--info-bg": "color-mix(in srgb, var(--sky) 12%, #fff)",
          "--info-border": "color-mix(in srgb, var(--sky) 38%, var(--line))",
          "--info-text": "var(--sky-deep)",
          "--warning-bg": "color-mix(in srgb, var(--amber) 14%, #fff)",
          "--warning-border": "color-mix(in srgb, var(--amber) 42%, var(--line))",
          "--warning-text": "var(--amber-deep)",
          "--error-bg": "color-mix(in srgb, var(--rose) 12%, #fff)",
          "--error-border": "color-mix(in srgb, var(--rose) 40%, var(--line))",
          "--error-text": "var(--rose-deep)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
