import React from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, LogOut, ShieldCheck, UserPlus, DoorOpen, QrCode } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Layout() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/login");
    } catch (error) {
      console.error("Failed to sign out", error);
    }
  };

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/logs", label: "Access Logs", icon: ShieldCheck },
    { href: "/door", label: "Door Control", icon: DoorOpen },
    { href: "/register", label: "Register Face", icon: UserPlus },
    { href: "/guest", label: "Guest QR", icon: QrCode },
  ];

  return (
    <div className="flex min-h-screen bg-zinc-50">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 w-64 border-r bg-white shadow-sm hidden md:block">
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center border-b px-6">
            <ShieldCheck className="mr-2 h-6 w-6 text-indigo-600" />
            <span className="text-lg font-bold text-zinc-900">Smart Door</span>
          </div>
          <nav className="flex-1 space-y-1 px-3 py-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
                  )}
                >
                  <Icon className="mr-3 h-5 w-5 flex-shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t p-4">
            <div className="mb-4 flex items-center px-2">
              <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                {user?.email?.charAt(0).toUpperCase()}
              </div>
              <div className="ml-3 overflow-hidden">
                <p className="truncate text-sm font-medium text-zinc-900">
                  {user?.email}
                </p>
                <p className="truncate text-xs text-zinc-500">Admin</p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full justify-start text-zinc-600 hover:text-red-600 hover:bg-red-50 hover:border-red-200"
              onClick={handleSignOut}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="flex flex-1 flex-col md:pl-64">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-white px-4 shadow-sm md:hidden">
          <div className="flex items-center">
            <ShieldCheck className="mr-2 h-6 w-6 text-indigo-600" />
            <span className="text-lg font-bold text-zinc-900">Smart Door</span>
          </div>
          <Button variant="ghost" size="icon" onClick={handleSignOut}>
            <LogOut className="h-5 w-5" />
          </Button>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-4 pb-24 md:p-8 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      
      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white md:hidden">
        <div className="flex justify-around p-2">
           {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "flex flex-col items-center rounded-md p-2 text-xs font-medium transition-colors",
                    isActive
                      ? "text-indigo-700"
                      : "text-zinc-500 hover:text-zinc-900"
                  )}
                >
                  <Icon className="h-6 w-6 mb-1" />
                  {item.label}
                </Link>
              );
            })}
        </div>
      </nav>
    </div>
  );
}
