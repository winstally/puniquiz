"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      position="bottom-right"
      offset={{ bottom: 20, right: 16 }}
      mobileOffset={{ bottom: 24, right: 12 }}
      visibleToasts={2}
      richColors
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
