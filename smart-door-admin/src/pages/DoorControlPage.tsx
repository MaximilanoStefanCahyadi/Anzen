import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DoorOpen, Lock, Unlock, Compass, Key, Sparkles, Check, AlertTriangle } from "lucide-react";
import { ref, push, set, onValue } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

export default function DoorControlPage() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [currentDoorState, setCurrentDoorState] = useState("Closed");
  const { user } = useAuth();

  useEffect(() => {
    if (!rtdb) return;

    // Listen to real-time door lock status so the component stays perfectly in sync
    const doorStatusRef = ref(rtdb, "door_status");
    const unsubscribe = onValue(doorStatusRef, (snapshot) => {
      const lockVal = snapshot.val();
      if (lockVal) {
        setCurrentDoorState(lockVal);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleOpenDoor = async () => {
    if (!rtdb) return;
    setLoading(true);
    setStatus("idle");

    const doorStatusRef = ref(rtdb, "door_status");
    const logsRef = ref(rtdb, "logs");
    const commandsRef = ref(rtdb, "door_commands");

    try {
      if (isUnlocked) {
        // Manually lock it immediately
        await set(doorStatusRef, "Closed");

        const newCommandRef = push(commandsRef);
        await set(newCommandRef, {
          command: "CLOSE",
          timestamp: new Date().toISOString(),
          requestedBy: user?.email || "Homeowner",
          status: "PENDING",
        });

        const newLogRef = push(logsRef);
        await set(newLogRef, {
          event: "Manual Locked",
          timestamp: new Date().toISOString(),
          user: user?.email || "Homeowner",
          authenticated: true,
          method: "Web Console"
        });

        setStatus("success");
        setTimeout(() => setStatus("idle"), 3500);
      } else {
        // Unlock
        const newCommandRef = push(commandsRef);
        await set(newCommandRef, {
          command: "OPEN",
          timestamp: new Date().toISOString(),
          requestedBy: user?.email || "Homeowner",
          status: "PENDING",
        });

        await set(doorStatusRef, "Unlocked");

        const newLogRef = push(logsRef);
        await set(newLogRef, {
          event: "Remote Unlocked",
          timestamp: new Date().toISOString(),
          user: user?.email || "Homeowner",
          authenticated: true,
          method: "Web Console"
        });

        setStatus("success");

        // Give it 5 second pause before transition back to lock
        setTimeout(async () => {
          try {
            await set(doorStatusRef, "Closed");
            
            const autoLogRef = push(logsRef);
            await set(autoLogRef, {
              event: "Auto-Locked Secured",
              timestamp: new Date().toISOString(),
              user: "System Auto-Lock",
              authenticated: true,
              method: "Timer Event"
            });
          } catch (e) {
            console.error("Auto lock error:", e);
          }
        }, 5000);

        setTimeout(() => setStatus("idle"), 3500);
      }
    } catch (error) {
      console.error("Error toggling door lock:", error);
      setStatus("error");
    } finally {
      setLoading(false);
    }
  };

  const isUnlocked = currentDoorState.toLowerCase() === "open" || currentDoorState.toLowerCase() === "unlocked";

  return (
    <div className="flex flex-col items-center justify-center space-y-6 py-4 sm:py-6 max-w-lg mx-auto">
      
      <Card className="w-full bg-brand-cream-light rounded-[2rem] border border-neutral-dark/4 shadow-[0_16px_50px_rgba(44,42,41,0.03)] overflow-hidden">
        <CardHeader className="text-center pt-8 pb-4">
          <span className="text-[10px] uppercase tracking-widest font-extrabold text-brand-sage bg-brand-sage-light px-3 py-1 rounded-full inline-block">
            Mechanical Bypass
          </span>
          <CardTitle className="text-xl font-bold text-neutral-dark mt-3">Manual Key Trigger</CardTitle>
          <CardDescription className="text-xs text-neutral-dark/50 max-w-xs mx-auto">
            Tap the beautiful green disk below to request a remote unlatch. The edge motor will trigger for a 5 second window.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="flex flex-col items-center justify-center pb-12 pt-4 px-6">
          
          {/* Main interactive control disk */}
          <div className="relative">
            {/* Spinning decorative background rings */}
            <div className={`absolute inset-0 rounded-full border-2 border-dashed transition-all duration-1000 ${
              isUnlocked ? "border-brand-sage animate-spin-slow scale-110" : "border-neutral-dark/5 scale-105"
            }`} style={{ animationDuration: '20s' }} />

            <Button
              size="lg"
              className={`h-72 w-72 rounded-full border border-neutral-dark/5 text-lg font-extrabold transition-all duration-300 relative select-none shadow-lg flex flex-col items-center justify-center p-0 overflow-hidden ${
                isUnlocked
                  ? "bg-brand-sage-light text-brand-sage hover:bg-brand-sage-light/90 hover:scale-[1.01] shadow-[0_12px_44px_rgba(108,128,105,0.12)] active:scale-95"
                  : "bg-brand-sage text-white hover:bg-brand-sage/95 hover:scale-[1.02] shadow-[0_12px_44px_rgba(108,128,105,0.25)] active:scale-95"
              }`}
              onClick={handleOpenDoor}
              disabled={loading}
              id="cozy-lock-trigger"
            >
              {loading ? (
                <div className="flex flex-col items-center gap-2">
                  <div className={`h-10 w-10 rounded-full border-4 border-t-transparent animate-spin ${isUnlocked ? "border-brand-sage" : "border-white"}`} />
                  <span className={`text-[10px] tracking-widest font-bold mt-2 ${isUnlocked ? 'text-brand-sage' : 'text-white'}`}>COMMUNICATING</span>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center w-full h-full p-6">
                  {/* Big beautifully styled lock/unlock icon container */}
                  <div className={`p-6 rounded-full border-2 border-dashed flex items-center justify-center transition-all duration-300 ${
                    isUnlocked 
                      ? "bg-brand-sage/10 border-brand-sage/30 text-brand-sage scale-105" 
                      : "bg-white/10 border-white/30 text-white"
                  }`}>
                    {isUnlocked ? (
                      <Unlock className="h-16 w-16 stroke-[1.8]" />
                    ) : (
                      <Lock className="h-16 w-16 stroke-[1.8]" />
                    )}
                  </div>
                  
                  {/* Status label below the icon */}
                  <div className="mt-4 text-center">
                    <span className={`text-sm font-black tracking-widest uppercase block transition-colors duration-300 ${
                      isUnlocked ? "text-brand-sage" : "text-white"
                    }`}>
                      {isUnlocked ? "OPEN HOME" : "LOCKED NOW"}
                    </span>
                    <span className={`text-[10px] font-bold mt-1 block transition-colors duration-300 ${
                      isUnlocked ? "text-brand-sage/60" : "text-white/70"
                    }`}>
                      {isUnlocked ? "Tap to seal lock" : "Press to unlock"}
                    </span>
                  </div>
                </div>
              )}
            </Button>
          </div>

          {/* Feedback states and alerts styled safely and cozy */}
          <div className="w-full mt-10 space-y-3">
            {status === "success" && (
              <div className="flex items-center gap-2 justify-center py-3 px-4 rounded-2xl bg-brand-sage-light border border-brand-sage/10 text-brand-sage text-xs font-semibold animate-in fade-in zoom-in-95 duration-200">
                <Check className="h-4 w-4 stroke-[3]" />
                <span>Command verified! Enjoy the welcome home breeze!</span>
              </div>
            )}

            {status === "error" && (
              <div className="flex items-center gap-2 justify-center py-3 px-4 rounded-2xl bg-brand-terracotta/10 border border-brand-terracotta/10 text-brand-terracotta text-xs font-semibold animate-in fade-in duration-200">
                <AlertTriangle className="h-4 w-4" />
                <span>Could not unlatch door. Please check connectivity.</span>
              </div>
            )}
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
