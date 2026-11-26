import { redirect } from "next/navigation";
import { initialize } from "@/lib/db";
import { actor } from "@/lib/security";
import { validAccountId } from "@/lib/account-context";
import { snapshot } from "@/lib/snapshot";
import Dashboard from "@/components/dashboard";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export default async function Page({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  if (!validAccountId(accountId)) redirect("/login");
  await initialize();
  let user;
  try {
    user = await actor(accountId);
  } catch {
    redirect("/login");
  }
  return <Dashboard key={accountId} initial={await snapshot(user)} />;
}
