import { pageShell } from "@/lib/layout";

export function AdminShell({ children }: { children: React.ReactNode }) {
  return <main style={pageShell}>{children}</main>;
}
