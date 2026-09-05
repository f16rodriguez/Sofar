// Signed-in shell (SPEC §6). One nav across Interview, The Book and Settings,
// and a way out. Pages inside still check the session themselves; this is the
// wall, not the only lock.

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import Nav from "./Nav";
import InstallPrompt from "./InstallPrompt";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  return (
    <div className="app">
      <Nav />
      {children}
      <InstallPrompt />
    </div>
  );
}
