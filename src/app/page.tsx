import { redirect } from "next/navigation";
import { initialize } from "@/lib/db";
import { actor } from "@/lib/security";
import { snapshot } from "@/lib/snapshot";
import Dashboard from "@/components/dashboard";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export default async function Page() {
  await initialize();
  let user;
  try {
    user = await actor();
  } catch {
    redirect("/login");
  }
  return <Dashboard initial={await snapshot(user)} />;
}
