import { initialize } from "@/lib/db";
import { actor } from "@/lib/security";
import AccountHome from "@/components/account-home";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export default async function Page() {
  await initialize();
  let defaultAccount: string | null = null;
  try {
    defaultAccount = (await actor()).id;
  } catch {
    /* Each tab can still select its own authenticated account. */
  }
  return <AccountHome defaultAccount={defaultAccount} />;
}
