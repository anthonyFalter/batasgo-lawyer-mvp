import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import LaunchScreen from "./launch-screen";

export default async function HomePage() {
  if ((await cookies()).has("batasgo_mvp_preview_seen")) {
    redirect("/dashboard");
  }
  return <LaunchScreen />;
}
