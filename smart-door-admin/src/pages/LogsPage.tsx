import React, { useEffect, useState } from "react";
import { ref, onValue, query, limitToLast } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Loader2, 
  UserCheck, 
  UserX, 
  Clock, 
  Compass, 
  MapPin, 
  Sparkles,
  Camera,
  Layers,
  Search
} from "lucide-react";
import { format, parseISO } from "date-fns";

interface AccessLog {
  id: string;
  timestamp: string;
  name?: string;
  snapshot?: string;
  method?: string;
  status?: string;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logLimit, setLogLimit] = useState(15);
  const [filter, setFilter] = useState<"all" | "known" | "unknown">("all");

  useEffect(() => {
    if (!rtdb) {
      setError("Firebase Realtime Database is not initialized.");
      setLoading(false);
      return;
    }

    const logsRef = ref(rtdb, "logs");
    // Retrieve a little more than the limit so we can query locally if needed
    const recentLogsQuery = query(logsRef, limitToLast(logLimit + 10));

    const unsubscribe = onValue(recentLogsQuery, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const logsList = Object.entries(data).map(([key, value]: [string, any]) => ({
          id: key,
          ...value,
        })).reverse();
        
        setLogs(logsList);
        setError(null);
      } else {
        setLogs([]);
      }
      setLoading(false);
    }, (err) => {
      console.error("Error fetching logs:", err);
      setError(err.message);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [logLimit]);

  // Translate stiff technical names/values into warm, cozy explanations
  const getFriendlyStatus = (log: AccessLog) => {
    const isUnknown = !log.name || log.name.toLowerCase() === "unknown";
    const statusLower = (log.status || "granted").toLowerCase();
    const isGranted = statusLower === "success" || statusLower === "granted" || statusLower === "ok";

    if (isUnknown) {
      return {
        message: "A waiting visitor or visitor at the lobby door",
        subtext: "Facial analysis was unable to match against stored family vectors.",
        icon: UserX,
        accentClass: "bg-brand-terracotta/10 text-brand-terracotta",
        badgeText: "Unregistered",
      };
    }

    return {
      message: `${log.name.replace(/_/g, ' ')} was warmly welcomed home`,
      subtext: `Access permitted securely via modern ${log.method || "Face ID"} verification.`,
      icon: UserCheck,
      accentClass: "bg-brand-sage-light text-brand-sage",
      badgeText: "Verified Resident",
    };
  };

  // Helper to safely display cozy dates
  const formatFriendlyTime = (timeStr?: string) => {
    if (!timeStr) return "Just now";
    try {
      const parsed = parseISO(timeStr);
      return format(parsed, "MMMM d, yyyy 'at' h:mm a");
    } catch {
      return timeStr;
    }
  };

  // Safe filtration
  const filteredLogs = logs.filter(log => {
    const isUnknown = !log.name || log.name.toLowerCase() === "unknown";
    if (filter === "known") return !isUnknown;
    if (filter === "unknown") return isUnknown;
    return true;
  }).slice(0, logLimit);

  if (loading) {
    return (
      <div className="flex flex-col h-[70vh] items-center justify-center space-y-4">
        <div className="h-10 w-10 rounded-full border-4 border-brand-terracotta border-t-transparent animate-spin" />
        <p className="text-xs font-bold tracking-widest text-neutral-dark/40 uppercase">GATHERING VISITS FEED</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[75vh] flex-col items-center justify-center space-y-4 text-center px-4 max-w-sm mx-auto">
        <div className="h-12 w-12 rounded-2xl bg-brand-terracotta/10 flex items-center justify-center text-brand-terracotta">
          <UserX className="h-6 w-6" />
        </div>
        <p className="text-lg font-bold text-neutral-dark">Cloud Connection Sleeping</p>
        <p className="text-xs text-neutral-dark/50 leading-relaxed">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-brand-terracotta text-white rounded-2xl text-xs font-bold"
        >
          Check Synced State
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8 max-w-4xl mx-auto pb-10">
      
      {/* Title block with custom filter pills */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-brand-terracotta tracking-wider uppercase">Lately Greeted</span>
          <h1 className="text-3xl font-extrabold tracking-tight text-neutral-dark">Access Timeline</h1>
          <p className="text-xs sm:text-sm text-neutral-dark/50 mt-1">A real-time diary of warm greetings and door logs at your home.</p>
        </div>

        {/* Filter controls styled as aesthetic pills */}
        <div className="flex items-center bg-white p-1 rounded-2xl border border-neutral-dark/4 shadow-[0_2px_10px_rgba(44,42,41,0.01)] self-start sm:self-auto">
          {(["all", "known", "unknown"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`px-4 py-2 text-xs font-extrabold rounded-xl transition-all capitalize ${
                filter === type
                  ? "bg-brand-terracotta text-white shadow-sm"
                  : "text-neutral-dark/60 hover:text-neutral-dark hover:bg-neutral-dark/3"
              }`}
            >
              {type === "known" ? "Residents" : type === "unknown" ? "Guests" : "All Feeds"}
            </button>
          ))}
        </div>
      </div>

      {/* Main Feed */}
      <div className="space-y-4">
        {filteredLogs.length === 0 ? (
          <div className="bg-white rounded-[2rem] border border-neutral-dark/4 p-12 text-center shadow-[0_12px_45px_rgba(44,42,41,0.01)]">
            <div className="mx-auto h-12 w-12 rounded-full bg-brand-sage-light flex items-center justify-center text-brand-sage mb-4">
              <Camera className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-neutral-dark">No Greeted Visages Here Yet</h3>
            <p className="text-xs text-neutral-dark/40 max-w-xs mx-auto mt-2">
              Whenever the door detects eyes or remote locks are issued, they'll write elegant records here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredLogs.map((log) => {
              const info = getFriendlyStatus(log);
              const LogIcon = info.icon;

              return (
                <div 
                  key={log.id} 
                  className="bg-white rounded-3xl border border-neutral-dark/4 p-4 sm:p-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-4 hover:shadow-[0_12px_30px_-5px_rgba(44,42,41,0.03)] hover:translate-y-[-1px] transition-all duration-300"
                >
                  
                  {/* Photo thumbnail or default stylized icon */}
                  <div className="flex-shrink-0 relative self-center sm:self-auto">
                    {log.snapshot ? (
                      <div className="relative h-20 w-20 rounded-2xl overflow-hidden border border-neutral-dark/5 shadow-inner">
                        <img
                          src={log.snapshot}
                          alt="Face capture"
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover transition-transform duration-500 hover:scale-110"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                      </div>
                    ) : (
                      <div className={`h-20 w-20 rounded-2xl flex flex-col items-center justify-center text-center p-2 font-black ${info.accentClass}`}>
                        <LogIcon className="h-6 w-6 stroke-[2.5]" />
                        <span className="text-[9px] mt-1 font-bold">RECG</span>
                      </div>
                    )}
                  </div>

                  {/* Message detail container */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between py-1 text-center sm:text-left">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 justify-center sm:justify-start">
                      <span className={`text-[9px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-full w-fit self-center sm:self-auto ${info.accentClass}`}>
                        {info.badgeText}
                      </span>
                      <span className="text-[10px] text-neutral-dark/40 font-semibold flex items-center justify-center sm:justify-start gap-1">
                        <MapPin className="h-3 w-3 stroke-[2] inline" /> LOBBY CAMERA NODE
                      </span>
                    </div>

                    <h3 className="font-bold text-base text-neutral-dark mt-2.5 sm:mt-1.5 tracking-tight group-hover:text-brand-terracotta transition-colors">
                      {info.message}
                    </h3>
                    <p className="text-xs text-neutral-dark/50 leading-relaxed mt-0.5">
                      {info.subtext}
                    </p>
                  </div>

                  {/* Left-right divider on wider displays, otherwise top-bottom */}
                  <div className="hidden sm:block h-10 w-[1px] bg-neutral-dark/5 self-center mx-1" />

                  {/* Timestamps Section */}
                  <div className="flex-shrink-0 flex sm:flex-col items-center sm:items-end justify-between sm:justify-center py-2 sm:py-0 border-t sm:border-t-0 border-neutral-dark/5 mt-2 sm:mt-0">
                    <span className="text-[10.5px] font-bold text-neutral-dark/60 flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-neutral-dark/30 stroke-[2.5]" />
                      <span>{log.timestamp ? log.timestamp.split(' ')[1] || log.timestamp : "Event"}</span>
                    </span>
                    <span className="text-[10px] font-medium text-neutral-dark/40 mt-0.5 text-right flex sm:block items-center gap-1">
                      {formatFriendlyTime(log.timestamp)}
                    </span>
                  </div>

                </div>
              );
            })}
          </div>
        )}

        {/* Load More Trigger Pills */}
        {logs.length > logLimit && (
          <div className="flex justify-center pt-6">
            <Button 
              variant="outline" 
              onClick={() => setLogLimit(prev => prev + 15)}
              className="bg-white hover:bg-neutral-dark/4 border-neutral-dark/5 rounded-2xl font-bold py-5 px-6 text-xs text-neutral-dark/60 shadow-sm"
            >
              <Layers className="mr-2 h-4 w-4 text-neutral-dark/40" />
              Load Older Diary History
            </Button>
          </div>
        )}
      </div>

    </div>
  );
}
