import Setup from "@/components/setup";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Thiết lập admin · ClassFlow",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <Setup />;
}
