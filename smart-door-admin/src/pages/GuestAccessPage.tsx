import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ref, push, set, onValue, update } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import QRCode from "react-qr-code";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { QrCode, Trash2, KeyRound, Download, Share2, X, Loader2 } from "lucide-react";

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
    
    // Convert to PNG for easier sharing
    img.onload = () => {
      // Add padding
      const padding = 20;
      canvas.width = img.width + (padding * 2);
      canvas.height = img.height + (padding * 2);
      
      if (ctx) {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, padding, padding);
        const pngFile = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.download = `QR_${generatedToken?.guestName || 'Guest'}.png`;
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
          title: 'Guest Pass QR Code',
          text: `Here is your one-time pass key: ${generatedToken?.token}\nValid until: ${generatedToken ? format(new Date(generatedToken.expiresAt), "MMM d, h:mm a") : ''}`,
        });
      } catch (err) {
        console.error("Share failed", err);
      }
    } else {
      alert("Sharing is not supported on this device/browser.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Guest Access</h1>
        <p className="text-zinc-500 mt-1">Generate one-time pass keys and QR codes for visitors.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create Pass Key</CardTitle>
          <CardDescription>Issue a temporary access key for a guest.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleGenerate} className="grid sm:grid-cols-3 gap-4 items-end">
            <div className="space-y-2">
              <label htmlFor="guestName" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Guest Name</label>
              <Input
                id="guestName"
                placeholder="E.g. Delivery, John Doe"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                required
                className="text-base sm:text-sm"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="expiry" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Valid For</label>
              <select
                id="expiry"
                className="w-full flex h-10 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-base sm:text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={expiryDuration}
                onChange={(e) => setExpiryDuration(e.target.value)}
              >
                <option value="900000">15 Minutes</option>
                <option value="3600000">1 Hour</option>
                <option value="86400000">24 Hours</option>
                <option value="604800000">7 Days</option>
              </select>
            </div>
            <Button type="submit" className="w-full transition-all" disabled={loading || !guestName}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
              {loading ? "Generating..." : "Generate Key"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Pass Keys</CardTitle>
          <CardDescription>Track and manage generated guest tokens.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Guest</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeTokens.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-zinc-500">
                      No tokens generated yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  activeTokens.map((t) => {
                    const isExpired = isPast(new Date(t.expiresAt));
                    const status = t.status === "revoked" ? "Revoked" : 
                                   t.status === "used" ? "Used" :
                                   isExpired ? "Expired" : "Active";
                    
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium whitespace-nowrap">{t.guestName}</TableCell>
                        <TableCell>
                          <code className="text-xs bg-zinc-100 px-2 py-1 rounded font-bold tracing-wider">{t.token}</code>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-sm">{format(new Date(t.expiresAt), "MMM d, h:mm a")}</span>
                            {!isExpired && status === "Active" && (
                              <span className="text-xs text-zinc-500">
                                in {formatDistanceToNow(new Date(t.expiresAt))}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            status === "Active" ? "bg-green-100 text-green-700" :
                            status === "Used" ? "bg-blue-100 text-blue-700" :
                            status === "Revoked" ? "bg-red-100 text-red-700" :
                            "bg-zinc-100 text-zinc-700"
                          }`}>
                            {status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap space-x-2">
                           {(status === "Active") && (
                            <Button
                              variant="ghost" 
                              size="sm"
                              onClick={() => setGeneratedToken(t)}
                              className="h-8 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                            >
                              Show QR
                            </Button>
                          )}
                          {status === "Active" && (
                            <Button
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleRevoke(t.id)}
                              className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              Revoke
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* QR Code Modal Overlay */}
      {generatedToken && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setGeneratedToken(null)}
        >
          <Card 
            className="w-full max-w-sm max-h-[90vh] overflow-y-auto flex flex-col animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-3 sm:p-4 border-b border-zinc-100 bg-zinc-50 shrink-0">
              <h3 className="font-bold text-base sm:text-lg text-zinc-900">Guest Access Pass</h3>
              <Button variant="ghost" size="icon" onClick={() => setGeneratedToken(null)} className="h-8 w-8 rounded-full border border-zinc-200 bg-white hover:bg-zinc-100 shrink-0">
                <X className="h-4 w-4 text-zinc-600" />
              </Button>
            </div>
            <div className="flex flex-col items-center p-4 sm:p-8 space-y-4 sm:space-y-6 text-center">
              <div className="bg-white p-3 sm:p-4 rounded-xl shadow-md border border-zinc-200 w-3/4 max-w-[200px] aspect-square flex items-center justify-center">
                <QRCode id="guest-qr-code" value={generatedToken.token} style={{ width: "100%", height: "100%" }} level="M" />
              </div>
              <div className="space-y-1">
                <p className="font-black text-xl sm:text-3xl text-zinc-900 tracking-widest bg-zinc-100 py-1 sm:py-2 px-3 sm:px-4 rounded-lg inline-block border border-zinc-200">
                  {generatedToken.token}
                </p>
                <p className="font-medium text-base sm:text-lg text-zinc-800 mt-1 sm:mt-2">{generatedToken.guestName}</p>
                <p className="text-xs sm:text-sm text-zinc-500 font-medium">
                  Valid until: {format(new Date(generatedToken.expiresAt), "MMM d, yyyy h:mm a")}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 bg-zinc-50 border-t border-zinc-100 shrink-0 mt-auto">
              <Button variant="ghost" className="h-12 sm:h-14 rounded-none border-r border-zinc-200 hover:bg-zinc-100 text-sm" onClick={handleDownloadQR}>
                <Download className="mr-2 h-4 w-4 shrink-0" />
                Download
              </Button>
              <Button variant="ghost" className="h-12 sm:h-14 rounded-none hover:bg-zinc-100 text-sm" onClick={handleShareQR}>
                <Share2 className="mr-2 h-4 w-4 shrink-0" />
                Share
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
