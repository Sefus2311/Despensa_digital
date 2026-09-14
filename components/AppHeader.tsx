import { getCurrentUserAndHome } from "@/lib/home";
import { HomeSwitcher } from "@/components/HomeSwitcher";

export async function AppHeader() {
  const { homeId, homeName, homes } = await getCurrentUserAndHome();

  return (
    <header className="sticky top-0 z-10 bg-white border-b border-[var(--color-border)]">
      <div className="max-w-md w-full mx-auto px-4 py-2 flex items-center justify-end">
        <HomeSwitcher currentHomeId={homeId} currentHomeName={homeName} homes={homes} />
      </div>
    </header>
  );
}
