import React, { useState, useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { 
  LogOut, 
  ShieldCheck, 
  UserPlus, 
  DoorOpen, 
  QrCode,
  Home,
  X,
  ChevronLeft,
  AlertTriangle,
  Key,
  History,
  Activity,
  ShieldAlert,
  Sparkles,
  User,
  Settings
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ref, onValue, set, push } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { motion, AnimatePresence } from "motion/react";

export default function Layout() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [featuresExpanded, setFeaturesExpanded] = useState(false);
  const [emergencyAlertActive, setEmergencyAlertActive] = useState(false);
  const [registeredFacesCount, setRegisteredFacesCount] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const mobileStatus = window.innerWidth < 768;
      setIsMobile(mobileStatus);
      if (mobileStatus) {
        setFeaturesExpanded(false);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!rtdb) return;
    const usersRef = ref(rtdb, "registered_face");
    const unsub = onValue(usersRef, (snapshot) => {
      setRegisteredFacesCount(snapshot.val() ? Object.keys(snapshot.val()).length : 0);
    });
    return () => unsub();
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/login");
    } catch (error) {
      console.error("Failed to sign out", error);
    }
  };

  const navItems = [
    { href: "/", label: "Home", action: "navigate" },
    { href: "/door", label: "Status", action: "navigate" },
    { href: "/logs", label: "Logs", action: "navigate" },
    { href: "/guest", label: "QR Code", action: "navigate" },
    { href: "/register", label: "Register Face", action: "navigate" },
  ];

  const mobileNavItems = [
    { href: "/", label: "Home", icon: Home },
    { href: "/door", label: "Status", icon: DoorOpen },
    { href: "/logs", label: "Logs", icon: History },
    { href: "/guest", label: "QR Code", icon: QrCode },
    { href: "/register", label: "Register Face", icon: UserPlus },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-brand-bg font-sans text-neutral-dark selection:bg-brand-terracotta/20 relative">
      
      {/* Decorative grain/noise pattern from design theme */}
      <div className="pointer-events-none fixed inset-0 z-50 opacity-[0.04] bg-[url('data:image/svg+xml,%3Csvg_viewBox=%220_0_200_200%22_xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter_id=%22noise%22%3E%3CfeTurbulence_type=%22fractalNoise%22_baseFrequency=%220.85%22_numOctaves=%223%22_stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect_width=%22100%25%22_height=%22100%25%22_filter=%22url(%23noise)%22/%3E%3C/svg%3E')]" />

      {/* Subtle Backdrop Blur Overlay for Expanded Menu State */}
      <AnimatePresence>
        {featuresExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-neutral-dark/30 backdrop-blur-[3px] z-30 pointer-events-auto"
            onClick={() => setFeaturesExpanded(false)}
          />
        )}
      </AnimatePresence>

      {/* Mobile Standalone User Profile Button (Upper Left, icon only) */}
      <div className="fixed top-4 left-4 z-40 md:hidden">
        <button
          onClick={() => setProfileModalOpen(true)}
          className="h-10 w-10 rounded-full bg-[#F7F4EB] border border-[#3D3A38]/15 shadow-[0_4px_20px_rgba(61,58,56,0.08)] active:scale-95 flex items-center justify-center transition-all duration-200 cursor-pointer focus:outline-none"
        >
          <div className="h-8 w-8 rounded-full bg-brand-sage flex items-center justify-center text-white text-xs font-black shadow-sm select-none">
            {user?.email?.charAt(0).toUpperCase() || "D"}
          </div>
        </button>
      </div>

      {/* Floating Pill-Shaped Header & Horizontal Nav Integration */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40 hidden md:flex justify-center pointer-events-none w-full max-w-5xl px-4">
        <motion.header
          layout
          transition={{ type: "spring", stiffness: 200, damping: 25 }}
          className="pointer-events-auto bg-[#F7F4EB] border border-[#3D3A38]/10 shadow-[0_8px_30px_rgba(61,58,56,0.08)] p-1.5 text-[#3D3A38] flex items-center justify-between gap-3 sm:gap-4 max-w-full rounded-full"
        >
          {/* USER IDENTITY (Far Left) - Clickable to open Profile */}
          <motion.button
            layout
            onClick={() => setProfileModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-[#3D3A38]/5 transition-all duration-200 cursor-pointer text-left focus:outline-none flex-shrink-0"
          >
            {/* Small clean Green circle avatar containing initial D */}
            <div className="h-7 w-7 rounded-full bg-brand-sage flex items-center justify-center text-white text-xs font-extrabold shadow-sm flex-shrink-0">
              {user?.email?.charAt(0).toUpperCase() || "D"}
            </div>
            <span className="text-xs sm:text-sm font-bold text-[#3D3A38] tracking-tight whitespace-nowrap">
              {user?.email?.split('@')[0] || "dummy"}
            </span>
          </motion.button>

          {/* CENTER NAVIGATION LINKS (Transition from hidden based on featuresExpanded and isMobile checks) */}
          <AnimatePresence initial={false}>
            {featuresExpanded && !isMobile && (
              <motion.nav
                key="header-nav-links"
                initial={{ width: 0, opacity: 0 }}
                animate={{ 
                  width: "auto",
                  opacity: 1,
                  transition: { 
                    width: { type: "spring", stiffness: 200, damping: 25 },
                    opacity: { duration: 0.2, delay: 0.05 }
                  }
                }}
                exit={{ 
                  width: 0,
                  opacity: 0,
                  transition: { 
                    width: { type: "spring", stiffness: 200, damping: 25 },
                    opacity: { duration: 0.1 }
                  }
                }}
                style={{ overflow: "hidden" }}
                className="flex items-center flex-shrink-0 whitespace-nowrap"
              >
                <div className="flex items-center gap-1 sm:gap-1.5 pr-5 pl-1 flex-shrink-0 min-w-max w-max">
                  {navItems.map((item) => {
                    const isActive = item.href 
                      ? location.pathname === item.href 
                      : (item.action === "profile" && profileModalOpen);

                    const handleClick = (e: React.MouseEvent) => {
                      if (item.action === "profile") {
                        e.preventDefault();
                        setProfileModalOpen(true);
                      }
                    };

                    if (item.href) {
                      return (
                        <Link
                          key={item.label}
                          to={item.href}
                          className={cn(
                            "text-xs sm:text-sm font-bold px-3 py-1.5 rounded-full transition-all duration-200 cursor-pointer text-[#3D3A38]/70 hover:text-[#3D3A38] flex items-center justify-center whitespace-nowrap flex-shrink-0",
                            isActive 
                              ? "text-[#3D3A38] font-black bg-white border border-[#3D3A38]/5 shadow-sm" 
                              : "hover:bg-[#3D3A38]/5"
                          )}
                        >
                          {item.label}
                        </Link>
                      );
                    } else {
                      return (
                        <button
                          key={item.label}
                          onClick={handleClick}
                          className={cn(
                            "text-xs sm:text-sm font-bold px-3 py-1.5 rounded-full transition-all duration-200 cursor-pointer text-[#3D3A38]/70 hover:text-[#3D3A38] flex items-center justify-center whitespace-nowrap focus:outline-none flex-shrink-0",
                            isActive 
                              ? "text-[#3D3A38] font-black bg-white border border-[#3D3A38]/5 shadow-sm" 
                              : "hover:bg-[#3D3A38]/5"
                          )}
                        >
                          {item.label}
                        </button>
                      );
                    }
                  })}
                </div>
              </motion.nav>
            )}
          </AnimatePresence>

          {/* MASTER TOGGLE BUTTON (ANZEN) */}
          <motion.button
            layout
            onClick={() => {
              if (!isMobile) {
                setFeaturesExpanded(!featuresExpanded);
              }
            }}
            className={cn(
              "flex items-center gap-1.5 px-4 sm:px-5 py-2 bg-[#E8765B] text-white rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-300 shadow-sm h-9 flex-shrink-0 border-none",
              !isMobile ? "hover:bg-[#d87756] cursor-pointer select-none active:scale-95" : "cursor-default"
            )}
          >
            <span className="font-extrabold tracking-widest text-[10px] sm:text-xs">ANZEN</span>
            {!isMobile && (
              <motion.div
                animate={{ rotate: featuresExpanded ? 180 : 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="flex items-center justify-center"
              >
                <ChevronLeft className="h-3.5 w-3.5 stroke-[3.5]" />
              </motion.div>
            )}
          </motion.button>
        </motion.header>
      </div>

      {/* Floating Emergency Bypass Success HUD alert (maintained for backend safety events) */}
      <AnimatePresence>
        {emergencyAlertActive && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4"
          >
            <div className="bg-red-600 text-white p-4 rounded-3xl shadow-[0_20px_50px_rgba(220,38,38,0.3)] border border-red-500 flex items-center gap-3.5 animate-pulse">
              <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center text-white flex-shrink-0">
                <ShieldAlert className="h-5 w-5 stroke-[2.5]" />
              </div>
              <div className="flex-1">
                <h4 className="text-xs font-black tracking-wider uppercase">CRITICAL SYSTEM BYPASS</h4>
                <p className="text-[10px] text-white/90">Emergency unlatch active. Deadbolt dead-end state: UNSECURED.</p>
              </div>
              <button 
                onClick={() => setEmergencyAlertActive(false)}
                className="text-white/60 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Centered Main Layout Wrapper with top spacing to allow header space */}
      <div className="flex-1 flex flex-col w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 sm:pt-16 pb-24 md:pb-10">
        {/* Main Routed views */}
        <main className="flex-1">
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar Footer */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#F7F4EB] border-t border-[#3D3A38]/15 shadow-[0_-8px_30px_rgba(61,58,56,0.06)] px-2 py-2 pb-safe md:hidden">
        <div className="flex items-center justify-around max-w-lg mx-auto">
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.label}
                to={item.href}
                className={cn(
                  "flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-2xl transition-all duration-200",
                  isActive 
                    ? "text-[#E8765B]" 
                    : "text-[#3D3A38]/60 hover:text-[#3D3A38]"
                )}
              >
                <div className={cn(
                  "p-1.5 rounded-xl transition-all duration-200 flex items-center justify-center",
                  isActive ? "bg-[#E8765B]/10 text-[#E8765B]" : "text-[#3D3A38]/70 hover:bg-[#3D3A38]/5"
                )}>
                  <Icon className="h-5 w-5 stroke-[2.2]" />
                </div>
                <span className={cn(
                  "text-[9px] sm:text-[10px] mt-0.5 tracking-tight whitespace-nowrap",
                  isActive ? "font-black text-[#E8765B]" : "font-extrabold text-[#3D3A38]/60"
                )}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* User Interactive Profile Modal Overlay */}
      <AnimatePresence>
        {profileModalOpen && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-dark/30 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setProfileModalOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="bg-white rounded-[2.5rem] border border-neutral-dark/5 p-8 max-w-sm w-full shadow-[0_30px_70px_rgba(44,42,41,0.22)] flex flex-col items-stretch relative"
              onClick={(e) => e.stopPropagation()}
            >
              
              {/* Close Button X */}
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-5 right-5 h-8 w-8 rounded-full border border-neutral-dark/5 bg-transparent hover:bg-neutral-dark/5 cursor-pointer"
                onClick={() => setProfileModalOpen(false)}
              >
                <X className="h-4 w-4 text-neutral-dark/60" />
              </Button>

              {/* Profile Header Block */}
              <div className="flex flex-col items-center text-center mt-2 mb-6">
                <div className="h-20 w-20 rounded-full bg-brand-sage flex items-center justify-center text-white text-3xl font-bold shadow-md shadow-brand-sage/20 border-2 border-white">
                  {user?.email?.charAt(0).toUpperCase() || "D"}
                </div>
                <h2 className="text-2xl font-extrabold text-neutral-dark tracking-tight mt-3">
                  {user?.email?.split('@')[0] || "dummy"}
                </h2>
                <div className="flex items-center gap-1.5 mt-1 bg-brand-sage-light px-3 py-1 rounded-full border border-brand-sage/10">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-sage animate-pulse" />
                  <span className="text-[10px] text-brand-sage font-extrabold tracking-wide uppercase">Connected</span>
                </div>
              </div>

              {/* Detail Information Area */}
              <div className="space-y-4 py-4 border-t border-b border-neutral-dark/5 text-neutral-dark">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-neutral-dark/40">System Status</span>
                  <span className="text-neutral-dark font-bold">Online</span>
                </div>
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-neutral-dark/40">Edge Hub</span>
                  <span className="text-neutral-dark font-bold">Active</span>
                </div>
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-neutral-dark/40">Enrolled Faces</span>
                  <span className="text-brand-sage font-extrabold bg-brand-sage-light px-2.5 py-0.5 rounded-md">
                    {registeredFacesCount} profiles
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-neutral-dark/40">Encryption</span>
                  <span className="text-[10px] font-mono font-bold bg-neutral-dark/5 text-neutral-dark/70 px-1.5 py-0.5 rounded">
                    AES-256
                  </span>
                </div>
              </div>

              {/* Footer Action Sign Out */}
              <div className="mt-6">
                <Button
                  onClick={() => {
                    setProfileModalOpen(false);
                    handleSignOut();
                  }}
                  className="w-full text-sm font-extrabold justify-center text-brand-terracotta hover:text-white bg-brand-terracotta/10 hover:bg-brand-terracotta rounded-2xl py-6 flex items-center gap-2 border border-brand-terracotta/20 transition-all duration-200 cursor-pointer"
                >
                  <LogOut className="h-4 w-4 stroke-[2.5]" />
                  Sign Out
                </Button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
