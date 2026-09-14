import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh flex flex-col">
      <AppHeader />
      <main className="flex-1 px-4 pt-6 pb-28 max-w-md w-full mx-auto">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
