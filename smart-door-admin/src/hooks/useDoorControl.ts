import { useState, useCallback } from "react";
import { ref, push, set } from "firebase/database";
import { rtdb } from "@/lib/firebase";

type DoorAction = "open" | "close";

export function useDoorControl(userEmail: string | null | undefined) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const autoLock = useCallback(async () => {
    if (!rtdb) return;
    try {
      const doorStatusRef = ref(rtdb, "door_status");
      await set(doorStatusRef, "Closed");
    } catch (e) {
      console.error("Auto-lock error:", e);
    }
  }, []);

  const toggleDoor = useCallback(
    async (isCurrentlyUnlocked: boolean) => {
      if (!rtdb) return;
      setLoading(true);
      setMessage(null);
      setStatus("idle");

      const doorStatusRef = ref(rtdb, "door_status");
      const logsRef = ref(rtdb, "logs");
      const commandsRef = ref(rtdb, "door_commands");
      const actor = userEmail || "Admin";

      try {
        if (isCurrentlyUnlocked) {
          await set(doorStatusRef, "Closed");
          const cmdRef = push(commandsRef);
          await set(cmdRef, {
            command: "CLOSE",
            timestamp: new Date().toISOString(),
            requestedBy: actor,
            status: "PENDING",
          });
          const logRef = push(logsRef);
          await set(logRef, {
            event: "Manual Lock",
            timestamp: new Date().toISOString(),
            user: actor,
            authenticated: true,
            method: "Web Console",
          });
          setMessage("Door locked.");
          setStatus("success");
          setTimeout(() => setMessage(null), 3500);
        } else {
          const cmdRef = push(commandsRef);
          await set(cmdRef, {
            command: "OPEN",
            timestamp: new Date().toISOString(),
            requestedBy: actor,
            status: "PENDING",
          });
          await set(doorStatusRef, "Unlocked");
          setMessage("Unlock command sent. Auto-locking in 5s.");
          setStatus("success");
          setTimeout(() => setMessage(null), 3500);
          setTimeout(autoLock, 5000);
        }
      } catch (e) {
        console.error("Door control error:", e);
        setMessage("Command failed. Check connection.");
        setStatus("error");
      } finally {
        setLoading(false);
      }
    },
    [userEmail, autoLock]
  );

  return { loading, message, status, toggleDoor };
}
