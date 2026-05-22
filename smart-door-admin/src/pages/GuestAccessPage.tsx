import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ref, push, set, onValue, update } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import QRCode from "react-qr-code";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { QrCode, Trash2, KeyRound, Download, Share2, X, Loader2, Sparkles, UserPlus, Info, Hourglass, ShieldAlert } from "lucide-react";

interface GuestToken {
  id: string;
  guestName: string;
  token: string;
  expiresAt: string;
  createdAt: string;
  createdBy?: string;
  status: "active" | "revoked" | "used";
}

export default function GuestAccessPage() {
  const { user } = useAuth();
  const [guestName, setGuestName] = useState("");
  const [expiryDuration, setExpiryDuration] = useState("3600000"); // 1 hour in ms by default
  const [activeTokens, setActiveTokens] = useState<GuestToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<GuestToken | null>(null);

  useEffect(() => {
    if (!rtdb) return;

    const tokensRef = ref(rtdb, "guest_tokens");
    const unsubscribe = onValue(tokensRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const tokensList = Object.entries(data)
          .map(([key, value]: [string, any]) => ({
            id: key,
            ...value,
          }))
          .reverse(); // Newest first
        setActiveTokens(tokensList);
      } else {
        setActiveTokens([]);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rtdb || !guestName) return;

    setLoading(true);
    try {
      const tokenString = Math.random().toString(36).substring(2, 10).toUpperCase();
      const tokensRef = ref(rtdb, "guest_tokens");
      const newTokenRef = push(tokensRef);
      
      const now = new Date();
      const expiresAt = new Date(now.getTime() + parseInt(expiryDuration));

      const newToken = {
        id: newTokenRef.key as string,
        guestName,
        token: tokenString,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        createdBy: user?.email || "Admin",
        status: "active" as const,
      };

      await set(newTokenRef, newToken);
      setGeneratedToken(newToken);
      setGuestName("");
    } catch (error) {
      console.error("Error generating token:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (tokenId: string) => {
    if (!rtdb) return;
    try {
      const tokenRef = ref(rtdb, `guest_tokens/${tokenId}`);
      await update(tokenRef, { status: "revoked" });
    } catch (error) {
      console.error("Error revoking token:", error);
    }
  };

  const handleDownloadQR = () => {
    const svg = document.getElementById("guest-qr-code");
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    
    img.onload = () => {
      const padding = 24;
      canvas.width = img.width + (padding * 2);
      canvas.height = img.height + (padding * 2);
      
      if (ctx) {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, padding, padding);
        const pngFile = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.download = `QR_Pass_${generatedToken?.guestName || 'Guest'}.png`;
        downloadLink.href = pngFile;
        downloadLink.click();
      }
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handleShareQR = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Smart Pass QR Code',
          text: `Hi ${generatedToken?.guestName}, here is your temporary lobby pass code: ${generatedToken?.token}\nValid until: ${generatedToken ? format(new Date(generatedToken.expiresAt), "MMM d, h:mm a") : ''}`,
        });
      } catch (err) {
        console.error("Share failed", err);
      }
    } else {
      // Direct clipboard copy fallback
      try {
        await navigator.clipboard.writeText(`Lobby Code: ${generatedToken?.token}`);
        alert("Pass copied to clipboard! Share it with your visitor.");
      } catch {
        alert("Pass Key: " + generatedToken?.token);
      }
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 max-w-5xl mx-auto pb-10">
      
      {/* Page description */}
      <div>
        <span className="text-xs font-bold text-brand-terracotta tracking-wider uppercase">Invite Friends</span>
        <h1 className="text-3xl font-extrabold tracking-tight text-neutral-dark">Guest Pass Keys</h1>
        <p className="text-xs sm:text-sm text-neutral-dark/50 mt-1">
          Generate temporary single-use access codes and scanned QR vouchers for delivery staff, friends, or family.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-12 items-start">
        
        {/* CREATE CARD FORM (5 cols) */}
        <div className="md:col-span-5">
          <Card className="bg-white rounded-[2rem] border border-neutral-dark/4 shadow-[0_8px_30px_rgba(44,42,41,0.02)] overflow-hidden">
            <CardHeader className="bg-brand-cream-light/30 border-b border-neutral-dark/3 p-5 sm:p-6">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-brand-terracotta/10 flex items-center justify-center text-brand-terracotta shrink-0">
                  <UserPlus className="h-4.5 w-4.5" />
                </div>
                <div>
                  <CardTitle className="text-base font-bold text-neutral-dark">Issue Temporary Pass</CardTitle>
                  <CardDescription className="text-[10px] text-neutral-dark/40 mt-0.5">Define a warm, temporary access path</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-5 sm:p-6">
              <form onSubmit={handleGenerate} className="space-y-4">
                
                {/* Input Name */}
                <div className="space-y-1.5">
                  <label htmlFor="guestName" className="text-xs font-bold text-neutral-dark/60">
                    Visitor's Name
                  </label>
                  <Input
                    id="guestName"
                    placeholder="e.g. Grandma, DHL Express"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    required
                    className="h-11 rounded-xl bg-brand-cream-light/30 border-neutral-dark/8 text-neutral-dark text-sm placeholder:text-neutral-dark/30 focus-visible:ring-brand-terracotta/20 focus-visible:border-brand-terracotta"
                  />
                </div>

                {/* Dropdown Duration */}
                <div className="space-y-1.5">
                  <label htmlFor="expiry" className="text-xs font-bold text-neutral-dark/60">
                    Active Duration
                  </label>
                  <div className="relative">
                    <select
                      id="expiry"
                      className="w-full flex h-11 items-center justify-between rounded-xl border border-neutral-dark/8 bg-brand-cream-light/30 px-3 py-2 text-sm text-neutral-dark focus:outline-none focus:ring-2 focus:ring-brand-terracotta/20 focus:border-brand-terracotta appearance-none transition-all"
                      value={expiryDuration}
                      onChange={(e) => setExpiryDuration(e.target.value)}
                    >
                      <option value="900000">⏱️ Quick Pass (15 Minutes)</option>
                      <option value="3600000">⏱️ Lunch Run (1 Hour)</option>
                      <option value="86400000">⏱️ Overnighter (24 Hours)</option>
                      <option value="604800000">⏱️ Extended (7 Days)</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-neutral-dark/40 text-xs">
                      ▼
                    </div>
                  </div>
                </div>

                {/* Submitting trigger */}
                <Button 
                  type="submit" 
                  disabled={loading || !guestName}
                  className="w-full h-11 rounded-xl bg-brand-terracotta hover:bg-brand-terracotta-hover text-white font-extrabold text-xs tracking-wide uppercase transition-all duration-300 shadow-[0_4px_12px_rgba(233,107,79,0.15)] hover:shadow-[0_6px_16px_rgba(233,107,79,0.25)] active:scale-[0.99] shrink-0 mt-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Weaving Token...
                    </>
                  ) : (
                    <>
                      <KeyRound className="mr-2 h-4 w-4" />
                      Engrave Pass Key
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-5 p-3 rounded-2xl bg-brand-bg/40 border border-neutral-dark/3 text-[10px] text-neutral-dark/40 flex gap-2">
                <Info className="h-4 w-4 text-brand-terracotta shrink-0" />
                <p className="leading-normal">
                  Registered visitors will receive a digital ticket compatible with the facial deadbolt keypad. Passes terminate automatically.
                </p>
              </div>

            </CardContent>
          </Card>
        </div>

        {/* LOG HISTORY GRID (7 cols) */}
        <div className="md:col-span-7">
          <Card className="bg-white rounded-[2rem] border border-neutral-dark/4 shadow-[0_8px_30px_rgba(44,42,41,0.02)] overflow-hidden">
            <CardHeader className="p-5 sm:p-6 border-b border-neutral-dark/3">
              <CardTitle className="text-base font-bold text-neutral-dark">Active Pass Log</CardTitle>
              <CardDescription className="text-[10px] text-neutral-dark/40 mt-0.5">Revoke, edit, or dispatch active QR keys</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              
              {activeTokens.length === 0 ? (
                <div className="p-12 text-center text-xs text-neutral-dark/30 font-medium">
                  No temporary codes generated yet. Use the desk to your left!
                </div>
              ) : (
                <div className="divide-y divide-neutral-dark/4">
                  {activeTokens.map((t) => {
                    const isExpired = isPast(new Date(t.expiresAt));
                    const status = t.status === "revoked" ? "Revoked" : 
                                   t.status === "used" ? "Used" :
                                   isExpired ? "Expired" : "Active";
                    
                    return (
                      <div key={t.id} className="p-4 sm:p-5 flex items-center justify-between gap-4 hover:bg-brand-cream-light/20 transition-colors">
                        
                        {/* Visitor Info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-sm text-neutral-dark truncate">{t.guestName}</h4>
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full shrink-0 uppercase tracking-wider ${
                              status === "Active" 
                                ? "bg-brand-sage-light text-brand-sage" 
                                : status === "Used" 
                                ? "bg-blue-50 text-blue-600" 
                                : "bg-neutral-dark/5 text-neutral-dark/40"
                            }`}>
                              {status}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1 text-[10.5px] text-neutral-dark/50">
                            <span className="flex items-center gap-1">
                              <Info className="h-3 w-3 text-neutral-dark/30" />
                              <code className="text-xs bg-brand-bg px-1.5 py-0.5 rounded font-black text-brand-terracotta tracking-wider">{t.token}</code>
                            </span>
                            <span className="text-neutral-dark/15">•</span>
                            <span className="flex items-center gap-1 text-[10px]">
                              <Hourglass className="h-3 w-3 text-neutral-dark/30" />
                              <span>Exp: {format(new Date(t.expiresAt), "MMM d, h:mm a")}</span>
                            </span>
                          </div>
                        </div>

                        {/* Actions aligned on the right */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {status === "Active" && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setGeneratedToken(t)}
                                className="h-8 rounded-xl bg-brand-sage-light text-brand-sage hover:bg-brand-sage hover:text-white transition-all text-xs font-bold"
                              >
                                View QR
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRevoke(t.id)}
                                className="h-8 w-8 rounded-xl text-neutral-dark/40 hover:text-brand-terracotta hover:bg-brand-terracotta/5 transition-all text-xs border border-transparent hover:border-brand-terracotta/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          
                          {status !== "Active" && (
                            <span className="text-[10px] font-semibold text-neutral-dark/30 italic mr-2 capitalize">
                              Closed
                            </span>
                          )}
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}

            </CardContent>
          </Card>
        </div>

      </div>

      {/* QR Code Modal Overlay Redesigned perfectly to be safe on mobile and never stretch */}
      {generatedToken && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-dark/40 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setGeneratedToken(null)}
        >
          <Card 
            className="w-full max-w-sm max-h-[90vh] bg-brand-bg rounded-[2rem] overflow-hidden flex flex-col border border-neutral-dark/8 shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            
            {/* Modal Header */}
            <div className="flex justify-between items-center p-4 sm:p-5 border-b border-neutral-dark/5 bg-white shrink-0">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-brand-terracotta/10 flex items-center justify-center text-brand-terracotta">
                  <QrCode className="h-4 w-4" />
                </div>
                <h3 className="font-extrabold text-sm text-neutral-dark">Visitor Voucher</h3>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setGeneratedToken(null)} 
                className="h-8 w-8 rounded-full border border-neutral-dark/5 bg-brand-bg hover:bg-neutral-dark/4 transition-colors shrink-0"
              >
                <X className="h-4 w-4 text-neutral-dark" />
              </Button>
            </div>

            {/* Modal Core Contents */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center text-center space-y-5">
              
              {/* Cozy container wrapping White QR precisely */}
              <div className="bg-white p-5 rounded-3xl shadow-md border border-neutral-dark/4 w-48 h-48 flex items-center justify-center shrink-0">
                <QRCode 
                  id="guest-qr-code" 
                  value={generatedToken.token} 
                  style={{ width: "100%", height: "100%" }} 
                  level="M" 
                  fgColor="#3D3A38"
                />
              </div>

              {/* Text Info */}
              <div className="space-y-2">
                <span className="text-[9px] uppercase tracking-widest font-black text-brand-sage animate-pulse bg-brand-sage-light px-3 py-1 rounded-full">
                  Verified Active Pass
                </span>
                
                {/* Numeric/Alphabetic Token code block */}
                <div className="pt-2">
                  <p className="font-black text-2xl text-brand-terracotta tracking-widest bg-white py-2 px-5 rounded-2xl inline-block border border-neutral-dark/5 shadow-sm">
                    {generatedToken.token}
                  </p>
                </div>

                <div className="pt-1.5">
                  <p className="font-extrabold text-sm text-neutral-dark">{generatedToken.guestName}</p>
                  <p className="text-[10.5px] text-neutral-dark/45 mt-0.5 font-medium leading-relaxed">
                    Ends at {format(new Date(generatedToken.expiresAt), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-white border border-neutral-dark/3 text-[10px] text-neutral-dark/40 max-w-[260px] leading-normal flex gap-1.5 text-left">
                <Info className="h-4.5 w-4.5 text-brand-terracotta shrink-0" />
                <span>The system camera scans this QR screen or accepts key input to trigger remote deadbolts.</span>
              </div>

            </div>

            {/* Download/Share footer action links */}
            <div className="grid grid-cols-2 bg-white border-t border-neutral-dark/5 shrink-0">
              <Button 
                variant="ghost" 
                className="h-13 rounded-none border-r border-neutral-dark/5 hover:bg-brand-bg text-neutral-dark/70 hover:text-neutral-dark text-xs font-bold gap-1.5 transition-colors" 
                onClick={handleDownloadQR}
              >
                <Download className="h-4 w-4 shrink-0 text-neutral-dark/40" />
                Voucher PNG
              </Button>
              <Button 
                variant="ghost" 
                className="h-13 rounded-none hover:bg-brand-bg text-neutral-dark/70 hover:text-neutral-dark text-xs font-bold gap-1.5 transition-colors" 
                onClick={handleShareQR}
              >
                <Share2 className="h-4 w-4 shrink-0 text-neutral-dark/40" />
                Share Link
              </Button>
            </div>

          </Card>
        </div>
      )}

    </div>
  );
}
