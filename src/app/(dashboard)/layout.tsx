export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <section aria-label="Dashboard">{children}</section>;
}
