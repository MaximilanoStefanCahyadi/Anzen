import React, { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Heart, 
  Users, 
  DoorOpen, 
  Server, 
  Camera, 
  Lock, 
  Database,
  ArrowRight,
  Activity,
  UserCheck,
  Calendar,
  Sparkles,
  RefreshCw,
  Unlock
} from "lucide-react";
import { ref, onValue, push, set } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalLogs: 0,
    recentAccess: 0,
    registeredUsers: 0,
    doorStatus: "Closed",
  });
  const [chartData, setChartData] = useState<any[]>([]);
  const [triggerLoading, setTriggerLoading] = useState(false);
  const [triggerMessage, setTriggerMessage] = useState<string | null>(null);

  // System Health - Real-time Check-ins
  const [health, setHealth] = useState({
    isOnline: false, 
    camera: false,
    arduino: false,
    database: false, 
  });

  const lastSeenRef = useRef<number>(0);

  useEffect(() => {
    if (!rtdb) return;

    // 1. Connection logic to Cloud Database
    const connectedRef = ref(rtdb, ".info/connected");
    const unsubConnection = onValue(connectedRef, (snap) => {
      setHealth(prev => ({ ...prev, database: snap.val() === true }));
    });

    // 2. Hearbeat tracker (from Python controller)
    const healthRef = ref(rtdb, "system_health");
    const unsubHealth = onValue(healthRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        lastSeenRef.current = data.last_seen || Date.now();
        setHealth(prev => ({
          ...prev,
          camera: data.camera_active,
          arduino: data.arduino_active,
          isOnline: true 
        }));
      }
    });

    // 3. Listen to Logs entries
    const logsRef = ref(rtdb, "logs");
    const unsubLogs = onValue(logsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const logsArray = Object.values(data) as any[];
        setStats(prev => ({ ...prev, totalLogs: logsArray.length, recentAccess: logsArray.length }));

        // Accumulate statistics by Day
        const dailyCounts: { [key: string]: number } = {};
        logsArray.forEach(log => {
          if (log.timestamp) {
            try {
              const date = parseISO(log.timestamp);
              const dayKey = format(date, 'yyyy-MM-dd');
              dailyCounts[dayKey] = (dailyCounts[dayKey] || 0) + 1;
            } catch (e) {
              console.warn("Failed to parse log timestamp in dashboard:", log.timestamp);
            }
          }
        });

        const chartDataArray = Object.entries(dailyCounts)
          .map(([date, count]) => ({
            date,
            displayDate: format(parseISO(date), 'EEE'), // Short day names (e.g. Mon, Tue)
            count
          }))
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(-7);

        setChartData(chartDataArray);
      } else {
        setStats(prev => ({ ...prev, totalLogs: 0, recentAccess: 0 }));
        setChartData([]);
      }
    });

    // 4. Listen to registered human faces
    const usersRef = ref(rtdb, "registered_face");
    const unsubUsers = onValue(usersRef, (snapshot) => {
      setStats(prev => ({ ...prev, registeredUsers: snapshot.val() ? Object.keys(snapshot.val()).length : 0 }));
    });

    // 5. Watch for Door's lock state
    const doorStatusRef = ref(rtdb, "door_status");
    const unsubDoor = onValue(doorStatusRef, (snapshot) => {
      const status = snapshot.val();
      setStats(prev => ({ ...prev, doorStatus: status || "Closed" }));
    });

    // Periodic server check (marks offline if heartbeat doesn't ping for 15s)
    const healthCheckInterval = setInterval(() => {
        const timeDiff = Date.now() - lastSeenRef.current;
        if (lastSeenRef.current > 0 && timeDiff > 15000) {
            setHealth(prev => {
              if (prev.isOnline) {
                return { ...prev, isOnline: false, camera: false, arduino: false };
              }
              return prev;
            });
        }
    }, 5000);

    return () => {
      unsubConnection();
      unsubHealth();
      unsubLogs();
      unsubUsers();
      unsubDoor();
      clearInterval(healthCheckInterval);
    };
  }, []);

  // Quick remote unlock/toggle command
  const handleToggleDoor = async () => {
    if (!rtdb) return;
    setTriggerLoading(true);
    setTriggerMessage(null);

    const doorStatusRef = ref(rtdb, "door_status");
    const logsRef = ref(rtdb, "logs");
    const commandsRef = ref(rtdb, "door_commands");

    try {
      if (isUnlocked) {
        // Lock immediately
        await set(doorStatusRef, "Closed");
        
        const newCommandRef = push(commandsRef);
        await set(newCommandRef, {
          command: "CLOSE",
          timestamp: new Date().toISOString(),
          requestedBy: user?.email || "Admin",
          status: "PENDING",
        });

        const newLogRef = push(logsRef);
        await set(newLogRef, {
          event: "Manual Locked",
          timestamp: new Date().toISOString(),
          user: user?.email || "Admin",
          authenticated: true,
          method: "Web Console"
        });

        setTriggerMessage("Lock command sent! 🔒");
        setTimeout(() => setTriggerMessage(null), 3500);
      } else {
        // Unlock
        const newCommandRef = push(commandsRef);
        await set(newCommandRef, {
          command: "OPEN",
          timestamp: new Date().toISOString(),
          requestedBy: user?.email || "Admin",
          status: "PENDING",
        });

        await set(doorStatusRef, "Unlocked");

        const newLogRef = push(logsRef);
        await set(newLogRef, {
          event: "Remote Unlocked",
          timestamp: new Date().toISOString(),
          user: user?.email || "Admin",
          authenticated: true,
          method: "Web Console"
        });

        setTriggerMessage("Unlock command sent! ✨");
        setTimeout(() => setTriggerMessage(null), 3500);

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
            console.error("Auto lock error from dashboard:", e);
          }
        }, 5000);
      }
    } catch (e: any) {
      setTriggerMessage("Failed to toggle.");
    } finally {
      setTriggerLoading(false);
    }
  };

  const isUnlocked = stats.doorStatus.toLowerCase() === "open" || stats.doorStatus.toLowerCase() === "unlocked";

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-32 sm:pb-36 animate-in fade-in duration-500">
      
      {/* Top Plain Refined Greeting Header */}
      <div className="mb-4 sm:mb-6 text-right flex flex-col items-end">
        <span className="text-[9px] font-extrabold text-brand-terracotta tracking-widest uppercase block mb-0.5">
          ANZEN SMART LABS
        </span>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-neutral-dark tracking-tight leading-none">
          Welcome home, <span className="text-brand-terracotta font-black">{user?.email?.split('@')[0] || "dummy"}</span>
        </h1>
      </div>

      {/* Top Banner section */}
      <div className="grid gap-6 md:grid-cols-12 items-stretch">
        
        {/* HERO STATUS CARD */}
        <div className="md:col-span-7 bg-brand-cream-light rounded-[2rem] border border-neutral-dark/4 p-5 sm:p-6 flex flex-col justify-between shadow-[0_12px_45px_rgba(61,58,56,0.06)] relative overflow-hidden group">
          <div className="absolute top-0 right-0 h-40 w-40 bg-brand-bg/40 rounded-full -mr-16 -mt-16 -z-10 group-hover:scale-110 transition-transform duration-500" />
          
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-bg rounded-full border border-neutral-dark/5 text-[10px] font-bold text-neutral-dark/70 mb-3 sm:mb-4">
              <Sparkles className="h-3 w-3 text-brand-terracotta animate-spin duration-3000" />
              <span>Living Space Security Node</span>
            </div>

            <h2 className="text-lg sm:text-2xl font-black tracking-tight text-neutral-dark leading-tight">
              The front door is currently <span className={isUnlocked ? "text-brand-sage" : "text-brand-terracotta"}>{isUnlocked ? "Unlocked & Welcoming" : "Locked & Secure"}</span>
            </h2>
            <p className="text-[11px] sm:text-xs text-neutral-dark/55 mt-1 sm:mt-2 max-w-sm">
              Your smart lock deadbolt joint is beautifully synced. Tap the key medallion below to instantly unlock remotely.
            </p>
          </div>

          <div className="my-5 sm:my-6 flex justify-center">
            {/* Medallion interactive trigger */}
            <button
              onClick={handleToggleDoor}
              disabled={triggerLoading}
              className={`h-32 w-32 rounded-full border-[6px] text-xs font-bold flex flex-col items-center justify-center p-3 transition-all duration-300 relative focus:outline-none focus:ring-4 focus:ring-brand-terracotta/20 ${
                isUnlocked
                  ? "border-brand-sage/20 bg-brand-sage-light text-brand-sage shadow-[0_10px_25px_-5px_rgba(143,168,142,0.15)]"
                  : "border-brand-terracotta/15 bg-brand-terracotta/5 text-brand-terracotta hover:bg-brand-terracotta/10 shadow-[0_10px_25px_-5px_rgba(233,107,79,0.12)]"
              }`}
            >
              <div className="flex flex-col items-center gap-1.5 text-center">
                {triggerLoading ? (
                  <RefreshCw className="h-6 w-6 animate-spin" />
                ) : isUnlocked ? (
                  <>
                    <Unlock className="h-8 w-8 stroke-[2.5]" />
                    <span className="text-[9px] tracking-widest font-extrabold uppercase mt-1">Open Access</span>
                    <span className="text-[7px] font-bold text-brand-sage/60">Tap to cycle</span>
                  </>
                ) : (
                  <>
                    <Lock className="h-8 w-8 stroke-[2.5] animate-pulse" />
                    <span className="text-[9px] tracking-widest font-extrabold uppercase mt-1">Locked Solid</span>
                    <span className="text-[7px] font-bold text-brand-terracotta/60">Tap to unlock</span>
                  </>
                )}
              </div>
            </button>
          </div>

          <div className="flex items-center justify-between border-t border-neutral-dark/5 pt-3.5 mt-2">
            <span className="text-[11px] font-extrabold text-neutral-dark/40">Status: {stats.doorStatus}</span>
            {triggerMessage && (
              <span className="text-[11px] font-extrabold text-brand-sage animate-bounce">{triggerMessage}</span>
            )}
            <Link to="/door" className="text-[11px] font-black text-brand-terracotta hover:text-brand-terracotta-hover flex items-center gap-1">
              <span>More Controls</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* STATS BENTO TILES */}
        <div className="md:col-span-5 grid grid-rows-3 gap-3.5 h-full">
          
          {/* Card 1: Family Circle */}
          <div className="bg-brand-cream-light rounded-2xl border border-neutral-dark/4 p-4 flex items-center gap-4 hover:shadow-[0_10px_30px_rgba(61,58,56,0.06)] shadow-[0_8px_25px_rgba(61,58,56,0.04)] transition-all duration-300">
            <div className="h-11 w-11 rounded-xl bg-brand-sage-light flex items-center justify-center text-brand-sage flex-shrink-0">
              <Users className="h-5 w-5 stroke-[2]" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold text-neutral-dark/40 uppercase tracking-wider block">Trusted Souls</span>
              <h4 className="text-xl font-black text-neutral-dark leading-none mt-1">{stats.registeredUsers}</h4>
              <p className="text-[9px] text-neutral-dark/50 mt-1">Registered Face ID profiles in system memory</p>
            </div>
          </div>

          {/* Card 2: Logging Entries */}
          <div className="bg-brand-cream-light rounded-2xl border border-neutral-dark/4 p-4 flex items-center gap-4 hover:shadow-[0_10px_30px_rgba(61,58,56,0.06)] shadow-[0_8px_25px_rgba(61,58,56,0.04)] transition-all duration-300">
            <div className="h-11 w-11 rounded-xl bg-brand-terracotta/10 flex items-center justify-center text-brand-terracotta flex-shrink-0">
              <Activity className="h-5 w-5 stroke-[2]" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold text-neutral-dark/40 uppercase tracking-wider block">Recorded Check-ins</span>
              <h4 className="text-xl font-black text-neutral-dark leading-none mt-1">{stats.totalLogs}</h4>
              <p className="text-[9px] text-neutral-dark/50 mt-1">Total access logs archived globally</p>
            </div>
          </div>

          {/* Card 3: Quick Guest Action Banner */}
          <div className="bg-brand-cream-light rounded-2xl border border-neutral-dark/4 p-4 flex items-center justify-between hover:shadow-[0_10px_30px_rgba(61,58,56,0.06)] shadow-[0_8px_25px_rgba(61,58,56,0.04)] hover:scale-[1.01] transition-all duration-300">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-brand-sage/10 flex items-center justify-center text-brand-sage shadow-sm flex-shrink-0">
                <Sparkles className="h-4 w-4 fill-current pt-0.5" />
              </div>
              <div>
                <span className="text-[9px] font-extrabold text-brand-sage uppercase tracking-wider block">Quick sharing</span>
                <h4 className="text-xs font-black text-neutral-dark mt-0.5 leading-tight">Need key for your guest?</h4>
                <p className="text-[9px] text-neutral-dark/50 mt-0.5">Generate a secure 1-time local pass</p>
              </div>
            </div>
            <Link 
              to="/guest" 
              className="h-8 w-8 rounded-full bg-white flex items-center justify-center text-brand-sage hover:bg-brand-sage hover:text-white transition-colors border border-neutral-dark/5 shadow-sm flex-shrink-0"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

        </div>

      </div>

      {/* MID SECTION - ACCESS TIMELINE VS SYSTEM HEALTH */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-12">
        
        {/* CHART ACTIVITY (7 columns) */}
        <div className="lg:col-span-7 bg-brand-cream-light rounded-[2rem] border border-neutral-dark/4 p-5 sm:p-6 shadow-[0_12px_45px_rgba(61,58,56,0.05)]">
          <div className="flex items-center justify-between pb-6">
            <div>
              <h3 className="font-bold text-lg text-neutral-dark">Weekly Activity Feed</h3>
              <p className="text-xs text-neutral-dark/50 mt-0.5">Frequency of secure entries across the past 7 days</p>
            </div>
            <div className="h-9 w-9 rounded-2xl bg-brand-bg flex items-center justify-center text-neutral-dark/50">
              <Calendar className="h-4 w-4" />
            </div>
          </div>

          <div className="h-[260px] w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="rgba(61,58,56,0.05)" vertical={false} />
                  <XAxis 
                    dataKey="displayDate" 
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: '#3D3A38', opacity: 0.6, fontWeight: 600 }}
                  />
                  <YAxis 
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: '#3D3A38', opacity: 0.6, fontWeight: 600 }}
                    allowDecimals={false}
                  />
                  <Tooltip 
                    cursor={{ fill: 'rgba(223,146,125,0.05)', radius: [10, 10, 0, 0] }}
                    contentStyle={{ 
                      borderRadius: '16px', 
                      backgroundColor: '#FFFFFF',
                      border: '1px solid rgba(61,58,56,0.06)', 
                      boxShadow: '0 8px 30px rgba(61,58,56,0.05)',
                      fontFamily: 'inherit',
                      fontSize: '12px'
                    }}
                  />
                  <Bar dataKey="count" fill="#DF927D" radius={[10, 10, 0, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-neutral-dark/40 font-medium bg-brand-cream-light rounded-2xl">
                Waiting for access entry events...
              </div>
            )}
          </div>
        </div>

        {/* SYSTEM HEALTH (5 columns) */}
        <div className="lg:col-span-5 bg-brand-cream-light rounded-[2rem] border border-neutral-dark/4 p-5 sm:p-6 shadow-[0_12px_45px_rgba(61,58,56,0.05)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4">
              <div>
                <h3 className="font-bold text-lg text-neutral-dark">Companion Status</h3>
                <p className="text-xs text-neutral-dark/50 mt-0.5">Real-time health of your smart locks</p>
              </div>
              <span className={`text-[10px] px-3 py-1 rounded-full font-bold tracking-wider uppercase flex items-center gap-1.5 ${health.isOnline ? 'bg-brand-sage-light text-brand-sage' : 'bg-brand-terracotta/10 text-brand-terracotta'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${health.isOnline ? 'bg-brand-sage animate-pulse' : 'bg-brand-terracotta'}`} />
                {health.isOnline ? 'Alive & Ready' : 'Sleeping'}
              </span>
            </div>

            <div className="space-y-2.5 mt-2">
              
              {/* Node 1: Edge Hub */}
              <div className="flex items-center justify-between p-3 border border-neutral-dark/3 rounded-2xl bg-white/70 hover:bg-neutral-dark/1 transition-colors Anzen-device">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${health.isOnline ? 'bg-brand-sage-light text-brand-sage' : 'bg-neutral-dark/5 text-neutral-dark/40'}`}>
                    <Server className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-neutral-dark">Core Edge Hub</p>
                    <p className="text-[10px] text-neutral-dark/40">Local Intel module</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${health.isOnline ? 'bg-brand-sage' : 'bg-brand-terracotta'}`} />
                  <span className={`text-[10px] font-bold ${health.isOnline ? 'text-brand-sage' : 'text-brand-terracotta'}`}>
                    {health.isOnline ? 'Connected' : 'Offline'}
                  </span>
                </div>
              </div>

              {/* Node 2: Camera Eye */}
              <div className="flex items-center justify-between p-3 border border-neutral-dark/3 rounded-2xl bg-white/70 hover:bg-neutral-dark/1 transition-colors Anzen-camera">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${health.camera && health.isOnline ? 'bg-brand-sage-light text-brand-sage' : 'bg-neutral-dark/5 text-neutral-dark/40'}`}>
                    <Camera className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-neutral-dark">Facial Camera Eye</p>
                    <p className="text-[10px] text-neutral-dark/40">Biometric scanner node</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${health.camera && health.isOnline ? 'bg-brand-sage' : 'bg-brand-terracotta'}`} />
                  <span className={`text-[10px] font-bold ${health.camera && health.isOnline ? 'text-brand-sage' : 'text-brand-terracotta'}`}>
                    {health.camera && health.isOnline ? 'Active' : 'Offline'}
                  </span>
                </div>
              </div>

              {/* Node 3: Deadbolt System */}
              <div className="flex items-center justify-between p-3 border border-neutral-dark/3 rounded-2xl bg-white/70 hover:bg-neutral-dark/1 transition-colors Anzen-arduino">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${health.arduino && health.isOnline ? 'bg-brand-sage-light text-brand-sage' : 'bg-neutral-dark/5 text-neutral-dark/40'}`}>
                    <Lock className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-neutral-dark">Deadbolt Dead Joint</p>
                    <p className="text-[10px] text-neutral-dark/40">Mechanical cylinder block</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${health.arduino && health.isOnline ? 'bg-brand-sage' : 'bg-brand-terracotta'}`} />
                  <span className={`text-[10px] font-bold ${health.arduino && health.isOnline ? 'text-brand-sage' : 'text-brand-terracotta'}`}>
                    {health.arduino && health.isOnline ? 'Secured' : 'Offline'}
                  </span>
                </div>
              </div>

              {/* Node 4: Cloud Signal thoughts */}
              <div className="flex items-center justify-between p-3 border border-neutral-dark/3 rounded-2xl bg-white/70 hover:bg-neutral-dark/1 transition-colors Anzen-cloud">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${health.database ? 'bg-brand-sage-light text-brand-sage' : 'bg-neutral-dark/5 text-neutral-dark/40'}`}>
                    <Database className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-neutral-dark">Cloud Sync Database</p>
                    <p className="text-[10px] text-neutral-dark/40">Realtime Firebase cloud thoughts</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${health.database ? 'bg-brand-sage' : 'bg-brand-terracotta'}`} />
                  <span className={`text-[10px] font-bold ${health.database ? 'text-brand-sage' : 'text-brand-terracotta'}`}>
                    {health.database ? 'Synchronously Synced' : 'Offline'}
                  </span>
                </div>
              </div>

            </div>
          </div>

          <div className="text-[10px] text-center text-neutral-dark/30 font-medium pt-3 mt-2">
            System checks local and cloud nodes automatically.
          </div>
        </div>

      </div>

    </div>
  );
}
