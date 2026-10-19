import { cookies } from "next/headers";
import LaunchScreen from "../(marketing)/launch-screen";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const previewSeen = (await cookies()).has("batasgo_mvp_preview_seen");
  return <section aria-label="Dashboard">{previewSeen ? children : <LaunchScreen />}</section>;
}
