import React, { useRef, useState, useCallback } from "react";
import Webcam from "react-webcam";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Camera, RefreshCw, Save, UserPlus, Upload, Sparkles, Smile, ShieldCheck, HelpCircle, Loader2, Check } from "lucide-react";
import { ref as dbRef, push, set } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

export default function RegisterFacePage() {
  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const { user } = useAuth();

  const capture = useCallback(() => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      setImgSrc(imageSrc);
    }
  }, [webcamRef]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImgSrc(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const retake = () => {
    setImgSrc(null);
    setStatus("idle");
    setErrorMessage("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imgSrc || !name) return;

    setLoading(true);
    setStatus("idle");
    setErrorMessage("");

    try {
      const safeName = name.replace(/\s+/g, '_').toUpperCase();

      if (rtdb) {
        // 1. Send register request to Firebase RTDB queue (Python reads from here)
        const queueRef = dbRef(rtdb, "registration_queue");
        const newQueueRef = push(queueRef);
        await set(newQueueRef, {
          name: safeName,
          image_base64: imgSrc,
          timestamp: new Date().toISOString()
        });

        // 2. Add to registered users list for the web presentation
        const usersRef = dbRef(rtdb, "registered_face");
        const newUserRef = dbRef(rtdb, `registered_face/${safeName}`); // Key by name directly so there aren't duplicates
        await set(newUserRef, {
          name: safeName,
          registeredBy: user?.email || "admin",
          registeredAt: new Date().toISOString(),
          status: "active",
        });
      }

      setStatus("success");
      setName("");
      setImgSrc(null);
      setTimeout(() => setStatus("idle"), 4000);
    } catch (error: any) {
      console.error("Error registering face:", error);
      setStatus("error");
      setErrorMessage(error.message || "Failed to sync facial parameters.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 max-w-4xl mx-auto pb-10">
      
      {/* Title block */}
      <div>
        <span className="text-xs font-bold text-brand-terracotta tracking-wider uppercase">Facial Keychain</span>
        <h1 className="text-3xl font-extrabold tracking-tight text-neutral-dark">Register New Resident</h1>
        <p className="text-xs sm:text-sm text-neutral-dark/50 mt-1">
          Add close friends and family members to the trusted access circle.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 items-stretch">
        
        {/* WEBCAM MODULE (col 1) */}
        <Card className="bg-white rounded-[2rem] border border-neutral-dark/4 shadow-[0_8px_30px_rgba(44,42,41,0.02)] overflow-hidden flex flex-col justify-between">
          <CardHeader className="bg-brand-cream-light/30 border-b border-neutral-dark/3 p-5 sm:p-6 pb-4">
            <div className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-brand-terracotta" />
              <CardTitle className="text-base font-bold text-neutral-dark">Facial Vector Camera</CardTitle>
            </div>
            <CardDescription className="text-[10px] mt-0.5">Please look straight inside the camera overlay</CardDescription>
          </CardHeader>
          <CardContent className="p-5 sm:p-6 flex-1 flex flex-col justify-between">
            
            {/* Round display frame */}
            <div className="relative aspect-video w-full overflow-hidden rounded-[1.5rem] bg-neutral-dark/5 border-2 border-dashed border-neutral-dark/10 flex justify-center items-center">
              {imgSrc ? (
                <img src={imgSrc} alt="Captured face vector" className="h-full w-full object-cover" />
              ) : (
                <Webcam
                  audio={false}
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  videoConstraints={{ facingMode: "user" }}
                  className="h-full w-full object-cover"
                  mirrored={true}
                  screenshotQuality={1}
                  disablePictureInPicture={false}
                  forceScreenshotSourceSize={false}
                  imageSmoothing={true}
                  onUserMedia={() => {}}
                  onUserMediaError={() => {}}
                />
              )}

              {/* Face Guide Overlay Box */}
              {!imgSrc && (
                <div className="absolute inset-0 border-[3px] border-dashed border-white/40 rounded-3xl m-6 pointer-events-none flex items-center justify-center">
                  <span className="text-[10px] tracking-wider font-extrabold text-white/50 bg-black/40 px-2.5 py-1 rounded-full uppercase">
                    Position Face Inside
                  </span>
                </div>
              )}
            </div>

            {/* Triggers */}
            <div className="w-full gap-2 mt-6 flex flex-row shrink-0">
              {imgSrc ? (
                <Button 
                  variant="outline" 
                  className="w-full h-11 border-neutral-dark/10 hover:bg-neutral-dark/2 font-bold text-xs text-neutral-dark/70 rounded-xl" 
                  onClick={retake}
                >
                  <RefreshCw className="mr-2 h-4 w-4 text-neutral-dark/40" />
                  Discard and Retake
                </Button>
              ) : (
                <div className="flex w-full gap-2">
                  <Button 
                    onClick={capture}
                    className="flex-1 h-11 bg-brand-terracotta hover:bg-brand-terracotta-hover text-white rounded-xl text-xs font-bold transition-all shadow-[0_4px_10px_rgba(233,107,79,0.15)]"
                  >
                    <Camera className="mr-2 h-4 w-4" />
                    Snap Photo
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={triggerFileUpload}
                    className="flex-1 h-11 border-neutral-dark/8 bg-brand-cream-light/10 text-neutral-dark/70 hover:bg-neutral-dark/4 rounded-xl text-xs font-bold"
                  >
                    <Upload className="mr-2 h-4 w-4 text-neutral-dark/40" />
                    Upload File
                  </Button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleFileUpload}
                  />
                </div>
              )}
            </div>
            
          </CardContent>
        </Card>

        {/* DETAILS ENTRY FORM (col 2) */}
        <Card className="bg-white rounded-[2rem] border border-neutral-dark/4 shadow-[0_8px_30px_rgba(44,42,41,0.02)] overflow-hidden flex flex-col justify-between">
          <div>
            <CardHeader className="bg-brand-cream-light/30 border-b border-neutral-dark/3 p-5 sm:p-6 pb-4">
              <div className="flex items-center gap-2">
                <Smile className="h-4 w-4 text-brand-sage" />
                <CardTitle className="text-base font-bold text-neutral-dark">Personal Information</CardTitle>
              </div>
              <CardDescription className="text-[10px] mt-0.5">Please write of their official household parameters</CardDescription>
            </CardHeader>
            <CardContent className="p-5 sm:p-6 space-y-4">
              <form onSubmit={handleRegister} className="space-y-4">
                
                {/* Input block */}
                <div className="space-y-1.5">
                  <label htmlFor="name" className="text-xs font-bold text-neutral-dark/60">
                    Full Display Name
                  </label>
                  <Input
                    id="name"
                    placeholder="e.g. Max Verstappen"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="h-11 rounded-xl bg-brand-cream-light/30 border-neutral-dark/8 text-neutral-dark text-sm placeholder:text-neutral-dark/30 focus-visible:ring-brand-terracotta/20 focus-visible:border-brand-terracotta"
                  />
                </div>

                {/* Local Vector Policy Advices */}
                <div className="rounded-2xl bg-brand-bg/60 border border-neutral-dark/3 p-4 flex gap-2.5">
                  <ShieldCheck className="h-5 w-5 text-brand-sage shrink-0 stroke-[2.5]" />
                  <div className="space-y-0.5 text-left">
                    <h5 className="text-[11.5px] font-bold text-neutral-dark">Safe Biometrics Protocol</h5>
                    <p className="text-[10px] text-neutral-dark/50 leading-relaxed">
                      Captured features are converted directly into private local models. No personal images are sent to general third parties.
                    </p>
                  </div>
                </div>

                {/* Submits and alerts */}
                <div className="pt-2">
                  <Button 
                    type="submit" 
                    className="w-full h-11 rounded-xl bg-brand-terracotta hover:bg-brand-terracotta-hover text-white font-extrabold text-xs tracking-wide uppercase transition-all duration-300 shadow-[0_4px_12px_rgba(233,107,79,0.15)] disabled:opacity-50"
                    disabled={loading || !imgSrc || !name}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin text-white" />
                        Transmitting to Lock Processor...
                      </>
                    ) : status === "success" ? (
                      <>
                        <Check className="mr-2 h-4 w-4 stroke-[3]" />
                        Success Greeted!
                      </>
                    ) : (
                      <>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Authorize Household Member
                      </>
                    )}
                  </Button>
                </div>
                
                {status === "success" && (
                  <div className="rounded-2xl bg-brand-sage-light border border-brand-sage/10 p-3 text-xs text-brand-sage text-center font-bold animate-in fade-in zoom-in-95">
                    ✨ Welcome! Member synchronized securely with the deadbolt.
                  </div>
                )}

                {status === "error" && (
                  <div className="rounded-2xl bg-brand-terracotta/10 border border-brand-terracotta/10 p-3 text-xs text-brand-terracotta text-center font-bold">
                    ⚠️ {errorMessage}
                  </div>
                )}

              </form>
            </CardContent>
          </div>
          
          <div className="p-5 border-t border-neutral-dark/4 bg-brand-cream-light/20 flex gap-2 text-[10px] text-neutral-dark/40 italic">
            <HelpCircle className="h-4 w-4 text-neutral-dark/30 shrink-0" />
            <span>The python face scanner updates vector maps locally when the resident looks at any edge lenses.</span>
          </div>
        </Card>

      </div>
    </div>
  );
}
