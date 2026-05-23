import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ref, push, set, onValue, update } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import QRCode from "react-qr-code";
import { format, isPast } from "date-fns";
import { QrCode, Trash2, KeyRound, Download, Share2, X, Loader2, UserPlus, Info, Hourglass } from "lucide-react";

interface GuestToken {
  id: string;
  guestName: string;
  token: string;
  expiresAt: string;
  createdAt: string;
  createdBy?: string;
  status: "active" | "revoked" | "used";
}

/** Cryptographically secure random token */
function generateSecureToken(): string {
  const array = new Uint8Array(6);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export default function GuestAccessPage() {
  const { user } = useAuth();
  const [guestName, setGuestName] = useState("");
  const [expiryDuration, setExpiryDuration] = useState("3600000");
  const [activeTokens, setActiveTokens] = useState<GuestToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<GuestToken | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (!rtdb) return;

    const tokensRef = ref(rtdb, "guest_tokens");
    const unsubscribe = onValue(tokensRef, (snapshot) => {
      if (!mountedRef.current) return;
      const data = snapshot.val();
      if (data) {
        const tokensList = Object.entries(data)
          .map(([key, value]: [string, any]) => ({ id: key, ...value }))
          .reverse();
        setActiveTokens(tokensList);
      } else {
        setActiveTokens([]);
      }
    });

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, []);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rtdb || !guestName) return;

    setLoading(true);
    try {
      const tokenString = generateSecureToken();
      const tokensRef = ref(rtdb, "guest_tokens");
      const newTokenRef = push(tokensRef);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + parseInt(expiryDuration));

      const newToken: GuestToken = {
        id: newTokenRef.key as string,
        guestName,
        token: tokenString,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        createdBy: user?.email || "Admin",
        status: "active",
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
      canvas.width = img.width + padding * 2;
      canvas.height = img.height + padding * 2;
      if (ctx) {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, padding, padding);
        const pngFile = canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.download = `GuestPass_${generatedToken?.guestName || "Guest"}.png`;
        a.href = pngFile;
        a.click();
      }
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handleShareQR = async () => {
    const text = `Hi ${generatedToken?.guestName}, your guest pass code is: ${generatedToken?.token}\nValid until: ${generatedToken ? format(new Date(generatedToken.expiresAt), "MMM d, h:mm a") : ""}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Guest Pass", text });
      } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(text);
        alert("Pass code copied to clipboard.");
      } catch {
        alert("Pass code: " + generatedToken?.token);
      }
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 max-w-5xl mx-auto pb-10">
      <div>
        <span className="text-xs font-bold text-brand-terracotta tracking-wider uppercase">Guest Access</span>
        <h1 className="text-3xl font-extrabold tracking-tight text-neutral-dark">Guest Passes</h1>
        <p className="text-xs sm:text-sm text-neutral-dark/50 mt-1">
          Issue temporary, time-limited access codes for visitors, delivery staff, or family.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-12 items-start">
        {/* Create form */}
        <div className="md:col-span-5">
          <Card className="bg-white rounded-[2rem] border border-neutral-dark/4 shadow-[0_8px_30px_rgba(44,42,41,0.02)] overflow-hidden">
            <CardHeader className="bg-brand-cream-light/30 border-b border-neutral-dark/3 p-5 sm:p-6">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-brand-terracotta/10 flex items-center justify-center text-brand-terracotta shrink-0">
                  <UserPlus className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base font-bold text-neutral-dark">New Guest Pass</CardTitle>
                  <CardDescription className="text-[10px] text-neutral-dark/40 mt-0.5">Create a temporary access code</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-5 sm:p-6">
              <form onSubmit={handleGenerate} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="guestName" className="text-xs font-bold text-neutral-dark/60">
                    Visitor's Name
                  </label>
                  <Input
                    id="guestName"
                    placeholder="e.g. John Smith, DHL Delivery"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    required
                    className="h-11 rounded-xl bg-brand-cream-light/30 border-neutral-dark/8 text-neutral-dark text-sm placeholder:text-neutral-dark/30 focus-visible:ring-brand-terracotta/20 focus-visible:border-brand-terracotta"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="expiry" className="text-xs font-bold text-neutral-dark/60">
                    Pass Duration
                  </label>
                  <div className="relative">
                    <select
                      id="expiry"
                      className="w-full flex h-11 items-center justify-between rounded-xl border border-neutral-dark/8 bg-brand-cream-light/30 px-3 py-2 text-sm text-neutral-dark focus:outline-none focus:ring-2 focus:ring-brand-terracotta/20 focus:border-brand-terracotta appearance-none transition-all"
                      value={expiryDuration}
                      onChange={(e) => setExpiryDuration(e.target.value)}
                    >
                      <option value="900000">15 minutes</option>
                      <option value="3600000">1 hour</option>
                      <option value="86400000">24 hours</option>
                      <option value="604800000">7 days</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-neutral-dark/40 text-xs">▼</div>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading || !guestName}
                  className="w-full h-11 rounded-xl bg-brand-terracotta hover:bg-brand-terracotta-hover text-white font-extrabold text-xs tracking-wide uppercase transition-all duration-300 shadow-[0_4px_12px_rgba(233,107,79,0.15)] hover:shadow-[0_6px_16px_rgba(233,107,79,0.25)] active:scale-[0.99] shrink-0 mt-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <KeyRound className="mr-2 h-4 w-4" />
                      Generate Pass
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-5 p-3 rounded-2xl bg-brand-bg/40 border border-neutral-dark/3 text-[10px] text-neutral-dark/40 flex gap-2">
                <Info className="h-4 w-4 text-brand-terracotta shrink-0" />
                <p className="leading-normal">
                  Passes use cryptographically secure random codes and expire automatically.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Token list */}
        <div className="md:col-span-7">
          <Card className="bg-white rounded-[2rem] border border-neutral-dark/4 shadow-[0_8px_30px_rgba(44,42,41,0.02)] overflow-hidden">
            <CardHeader className="p-5 sm:p-6 border-b border-neutral-dark/3">
              <CardTitle className="text-base font-bold text-neutral-dark">Active Passes</CardTitle>
              <CardDescription className="text-[10px] text-neutral-dark/40 mt-0.5">View or revoke issued access codes</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {activeTokens.length === 0 ? (
                <div className="p-12 text-center text-xs text-neutral-dark/30 font-medium">
                  No passes issued yet.
                </div>
              ) : (
                <div className="divide-y divide-neutral-dark/4">
                  {activeTokens.map((t) => {
                    const isExpired = isPast(new Date(t.expiresAt));
                    const status =
                      t.status === "revoked" ? "Revoked" :
                      t.status === "used" ? "Used" :
                      isExpired ? "Expired" : "Active";

                    return (
                      <div key={t.id} className="p-4 sm:p-5 flex items-center justify-between gap-4 hover:bg-brand-cream-light/20 transition-colors">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-sm text-neutral-dark truncate">{t.guestName}</h4>
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full shrink-0 uppercase tracking-wider ${
                              status === "Active" ? "bg-brand-sage-light text-brand-sage" :
                              status === "Used" ? "bg-blue-50 text-blue-600" :
                              "bg-neutral-dark/5 text-neutral-dark/40"
                            }`}>
                              {status}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1 text-[10.5px] text-neutral-dark/50">
                            <code className="text-xs bg-brand-bg px-1.5 py-0.5 rounded font-black text-brand-terracotta tracking-wider">{t.token}</code>
                            <span className="text-neutral-dark/15">•</span>
                            <span className="flex items-center gap-1 text-[10px]">
                              <Hourglass className="h-3 w-3 text-neutral-dark/30" />
                              Expires: {format(new Date(t.expiresAt), "MMM d, h:mm a")}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {status === "Active" && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setGeneratedToken(t)}
                                className="h-8 rounded-xl bg-brand-sage-light text-brand-sage hover:bg-brand-sage hover:text-white transition-all text-xs font-bold"
                              >
                                Show QR
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRevoke(t.id)}
                                className="h-8 w-8 rounded-xl text-neutral-dark/40 hover:text-brand-terracotta hover:bg-brand-terracotta/5 transition-all border border-transparent hover:border-brand-terracotta/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {status !== "Active" && (
                            <span className="text-[10px] font-semibold text-neutral-dark/30 italic mr-2 capitalize">Closed</span>
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

      {/* QR Modal */}
      {generatedToken && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-dark/40 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setGeneratedToken(null)}
        >
          <Card
            className="w-full max-w-sm max-h-[90vh] bg-brand-bg rounded-[2rem] overflow-hidden flex flex-col border border-neutral-dark/8 shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-4 sm:p-5 border-b border-neutral-dark/5 bg-white shrink-0">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-brand-terracotta/10 flex items-center justify-center text-brand-terracotta">
                  <QrCode className="h-4 w-4" />
                </div>
                <h3 className="font-extrabold text-sm text-neutral-dark">Guest Pass QR</h3>
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

            <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center text-center space-y-5">
              <div className="bg-white p-5 rounded-3xl shadow-md border border-neutral-dark/4 w-48 h-48 flex items-center justify-center shrink-0">
                <QRCode
                  id="guest-qr-code"
                  value={generatedToken.token}
                  style={{ width: "100%", height: "100%" }}
                  level="M"
                  fgColor="#3D3A38"
                />
              </div>

              <div className="space-y-2">
                <span className="text-[9px] uppercase tracking-widest font-black text-brand-sage bg-brand-sage-light px-3 py-1 rounded-full">
                  Active Pass
                </span>
                <div className="pt-2">
                  <p className="font-black text-2xl text-brand-terracotta tracking-widest bg-white py-2 px-5 rounded-2xl inline-block border border-neutral-dark/5 shadow-sm">
                    {generatedToken.token}
                  </p>
                </div>
                <div className="pt-1.5">
                  <p className="font-extrabold text-sm text-neutral-dark">{generatedToken.guestName}</p>
                  <p className="text-[10.5px] text-neutral-dark/45 mt-0.5 font-medium">
                    Expires {format(new Date(generatedToken.expiresAt), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-white border border-neutral-dark/3 text-[10px] text-neutral-dark/40 max-w-[260px] leading-normal flex gap-1.5 text-left">
                <Info className="h-4 w-4 text-brand-terracotta shrink-0" />
                <span>The door camera scans this QR code or the visitor can enter the code manually on the keypad.</span>
              </div>
            </div>

            <div className="grid grid-cols-2 bg-white border-t border-neutral-dark/5 shrink-0">
              <Button
                variant="ghost"
                className="h-13 rounded-none border-r border-neutral-dark/5 hover:bg-brand-bg text-neutral-dark/70 hover:text-neutral-dark text-xs font-bold gap-1.5 transition-colors"
                onClick={handleDownloadQR}
              >
                <Download className="h-4 w-4 shrink-0 text-neutral-dark/40" />
                Download PNG
              </Button>
              <Button
                variant="ghost"
                className="h-13 rounded-none hover:bg-brand-bg text-neutral-dark/70 hover:text-neutral-dark text-xs font-bold gap-1.5 transition-colors"
                onClick={handleShareQR}
              >
                <Share2 className="h-4 w-4 shrink-0 text-neutral-dark/40" />
                Share Code
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
