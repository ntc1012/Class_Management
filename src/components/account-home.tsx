"use client";
import { useEffect } from "react";
import { BookOpen } from "lucide-react";
import { rememberedAccount, workspacePath } from "@/lib/account-context";
export default function AccountHome({
  defaultAccount,
}: {
  defaultAccount: string | null;
}) {
  useEffect(() => {
    const account = rememberedAccount() || defaultAccount;
    window.location.replace(account ? workspacePath(account) : "/login");
  }, [defaultAccount]);
  return (
    <main className="account-loading">
      <span className="brand-icon">
        <BookOpen size={25} />
      </span>
      <p>Đang mở không gian làm việc…</p>
    </main>
  );
}
