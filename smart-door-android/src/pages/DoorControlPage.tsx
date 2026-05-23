import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Unlock, Check, AlertTriangle } from "lucide-react";
import { ref, onValue } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useDoorControl } from "@/hooks/useDoorControl";

export default function DoorControlPage() {
  const [currentDoorState, setCurrentDoorState] = useState("Closed");
  const { user } = useAuth();
  const mountedRef = useRef(true);

  const isUnlocked =
    currentDoorState.toLowerCase() === "open" ||
    currentDoorState.toLowerCase() === "unlocked";

  const { loading, status, message, toggleDoor } = useDoorControl(user?.email);

  useEffect(() => {
    mountedRef.current = true;
    if (!rtdb) return;

    const doorStatusRef = ref(rtdb, "door_status");
    const unsubscribe = onValue(doorStatusRef, (snapshot) => {
      if (mountedRef.current) {
        setCurrentDoorState(snapshot.val() || "Closed");
      }
    });

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center space-y-6 py-4 sm:py-6 max-w-lg mx-auto">
      <Card className="w-full bg-brand-cream-light rounded-[2rem] border border-neutral-dark/4 shadow-[0_16px_50px_rgba(44,42,41,0.03)] overflow-hidden">
        <CardHeader className="text-center pt-8 pb-4">
          <span className="text-[10px] uppercase tracking-widest font-extrabold text-brand-sage bg-brand-sage-light px-3 py-1 rounded-full inline-block">
            Door Control
          </span>
          <CardTitle className="text-xl font-bold text-neutral-dark mt-3">Manual Override</CardTitle>
          <CardDescription className="text-xs text-neutral-dark/50 max-w-xs mx-auto">
            Remotely lock or unlock the front door. When unlocked, the door will auto-lock after 5 seconds.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col items-center justify-center pb-12 pt-4 px-6">
          <div className="relative">
            <div
              className={`absolute inset-0 rounded-full border-2 border-dashed transition-all duration-1000 ${
                isUnlocked ? "border-brand-sage scale-110" : "border-neutral-dark/5 scale-105"
              }`}
              style={{ animationDuration: "20s", animation: isUnlocked ? "spin 20s linear infinite" : "none" }}
            />

            <Button
              size="lg"
              className={`h-72 w-72 rounded-full border border-neutral-dark/5 text-lg font-extrabold transition-all duration-300 relative select-none shadow-lg flex flex-col items-center justify-center p-0 overflow-hidden ${
                isUnlocked
                  ? "bg-brand-sage-light text-brand-sage hover:bg-brand-sage-light/90 hover:scale-[1.01] shadow-[0_12px_44px_rgba(108,128,105,0.12)] active:scale-95"
                  : "bg-brand-sage text-white hover:bg-brand-sage/95 hover:scale-[1.02] shadow-[0_12px_44px_rgba(108,128,105,0.25)] active:scale-95"
              }`}
              onClick={() => toggleDoor(isUnlocked)}
              disabled={loading}
            >
              {loading ? (
                <div className="flex flex-col items-center gap-2">
                  <div className={`h-10 w-10 rounded-full border-4 border-t-transparent animate-spin ${isUnlocked ? "border-brand-sage" : "border-white"}`} />
                  <span className={`text-[10px] tracking-widest font-bold mt-2 ${isUnlocked ? "text-brand-sage" : "text-white"}`}>
                    SENDING...
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center w-full h-full p-6">
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
                  <div className="mt-4 text-center">
                    <span className={`text-sm font-black tracking-widest uppercase block transition-colors duration-300 ${isUnlocked ? "text-brand-sage" : "text-white"}`}>
                      {isUnlocked ? "UNLOCKED" : "LOCKED"}
                    </span>
                    <span className={`text-[10px] font-bold mt-1 block transition-colors duration-300 ${isUnlocked ? "text-brand-sage/60" : "text-white/70"}`}>
                      {isUnlocked ? "Tap to lock" : "Tap to unlock"}
                    </span>
                  </div>
                </div>
              )}
            </Button>
          </div>

          <div className="w-full mt-10 space-y-3">
            {status === "success" && (
              <div className="flex items-center gap-2 justify-center py-3 px-4 rounded-2xl bg-brand-sage-light border border-brand-sage/10 text-brand-sage text-xs font-semibold animate-in fade-in zoom-in-95 duration-200">
                <Check className="h-4 w-4 stroke-[3]" />
                <span>{message}</span>
              </div>
            )}
            {status === "error" && (
              <div className="flex items-center gap-2 justify-center py-3 px-4 rounded-2xl bg-brand-terracotta/10 border border-brand-terracotta/10 text-brand-terracotta text-xs font-semibold animate-in fade-in duration-200">
                <AlertTriangle className="h-4 w-4" />
                <span>{message}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
