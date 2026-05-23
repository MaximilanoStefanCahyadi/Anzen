import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { ref, set } from "firebase/database";
import { rtdb, auth } from "@/lib/firebase";
import { Heart, Loader2, Sparkles, Lock, ArrowRight, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isSignUp) {
        await signUp(email, password);
        // Create user document in Realtime Database as well
        if (rtdb && auth.currentUser) {
           const userRef = ref(rtdb, `users/${auth.currentUser.uid}`);
           await set(userRef, {
             email: email,
             role: "admin",
             createdAt: new Date().toISOString(),
           });
        }
      } else {
        await signIn(email, password);
      }
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Failed to authenticate keys.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-bg font-sans text-neutral-dark p-4 selection:bg-brand-terracotta/20">
      <div className="w-full max-w-md flex flex-col items-center">
        
        {/* Large Decorative Top Brand */}
        <div className="flex flex-col items-center text-center space-y-2.5 mb-8">
          <div className="h-16 w-16 select-none bg-[#FAF8F5] rounded-full border border-neutral-dark/8 shadow-sm flex items-center justify-center">
            <svg viewBox="0 0 200 200" className="w-13 h-13" xmlns="http://www.w3.org/2000/svg">
              {/* Outer green arcs with gaps - Deep Sage Green #6C8069 */}
              <path d="M 68 38 A 72 72 0 0 0 45 135" fill="none" stroke="#6C8069" strokeWidth="6" strokeLinecap="round" />
              <path d="M 132 38 A 72 72 0 0 1 155 135" fill="none" stroke="#6C8069" strokeWidth="6" strokeLinecap="round" />
              <path d="M 68 160 A 72 72 0 0 0 132 160" fill="none" stroke="#6C8069" strokeWidth="6" strokeLinecap="round" />
              
              {/* Padlock on top in Deep Terracotta (#E8765B) */}
              <g transform="translate(88, 12)">
                <path d="M 6 12 L 6 7 C 6 2.5, 18 2.5, 18 7 L 18 12" fill="none" stroke="#E8765B" strokeWidth="4" strokeLinecap="round" />
                <rect x="0" y="11" width="24" height="18" rx="5" fill="#E8765B" />
                <circle cx="12" cy="18" r="2.5" fill="#FAF8F5" />
                <path d="M 12 20 L 12 24" stroke="#FAF8F5" strokeWidth="2.5" strokeLinecap="round" />
              </g>
              
              {/* Minimalist House profile in Deep Charcoal/Bark (#3D3A38) */}
              <g stroke="#3D3A38" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" transform="translate(0, 10)">
                <path d="M 42 105 L 100 70 L 158 105" />
                <path d="M 125 85 L 125 74 L 135 74 L 135 91" />
              </g>
              
              {/* Japanese/Mandarin text '安全' (Safety/Security) in Deep Charcoal (#3D3A38) */}
              <text x="100" y="148" fill="#3D3A38" fontFamily="sans-serif, 'Noto Sans SC', 'Noto Sans CJK TC', 'Microsoft YaHei', 'PingFang SC'" fontSize="32" fontWeight="900" textAnchor="middle" letterSpacing="1">
                安全
              </text>
            </svg>
          </div>
          <div className="space-y-1">
            <h2 className="text-3xl font-extrabold tracking-tight text-neutral-dark">Anzen</h2>
            <p className="text-xs text-neutral-dark/40 font-bold uppercase tracking-widest flex items-center justify-center gap-1">
              <span>Smart Home Companion</span>
            </p>
          </div>
        </div>

        {/* Cozy Rounded Form Container */}
        <Card className="w-full bg-white rounded-[2.5rem] border border-neutral-dark/4 shadow-[0_20px_50px_rgba(44,42,41,0.04)] overflow-hidden">
          <CardHeader className="space-y-1 pt-8 pb-4 text-center">
            <CardTitle className="text-2xl font-bold tracking-tight text-neutral-dark">
              {isSignUp ? "Unfold Admin Account" : "Welcome Back"}
            </CardTitle>
            <CardDescription className="text-xs text-neutral-dark/45 max-w-[250px] mx-auto leading-relaxed">
              {isSignUp
                ? "Generate fresh credentials to access the companion control center"
                : "Unlock the control room by inserting your admin keys below"}
            </CardDescription>
          </CardHeader>
          
          <CardContent className="px-6 sm:px-8 pb-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {error && (
                <div className="rounded-2xl bg-brand-terracotta/10 border border-brand-terracotta/5 p-3 text-xs font-semibold text-brand-terracotta text-center animate-in fade-in zoom-in-95">
                  ⚠️ {error}
                </div>
              )}

              {/* Email Input */}
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-xs font-bold text-neutral-dark/60">
                  Email Authentication Link
                </label>
                <div className="relative">
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@anzen.home"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-11 rounded-xl bg-brand-cream-light/30 border-neutral-dark/8 text-neutral-dark text-sm placeholder:text-neutral-dark/25 focus-visible:ring-brand-terracotta/20 focus-visible:border-brand-terracotta"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-xs font-bold text-neutral-dark/60">
                  Deadbolt Security Key
                </label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Insert secure key"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="h-11 rounded-xl bg-brand-cream-light/30 border-neutral-dark/8 text-neutral-dark text-sm placeholder:text-neutral-dark/25 focus-visible:ring-brand-terracotta/20 focus-visible:border-brand-terracotta"
                />
              </div>

              {/* Informative advice */}
              <div className="p-3.5 rounded-2xl bg-brand-bg/60 border border-neutral-dark/3 text-[10px] text-neutral-dark/40 flex gap-2">
                <ShieldCheck className="h-4.5 w-4.5 text-brand-sage shrink-0" />
                <span className="leading-relaxed">This secure environment utilizes end-to-end sandbox locks inside encrypted Firebase Realtime frames.</span>
              </div>

              {/* Interactive Submit */}
              <div className="pt-2">
                <Button 
                  type="submit" 
                  className="w-full h-11 rounded-xl bg-brand-terracotta hover:bg-brand-terracotta-hover text-white font-extrabold text-xs tracking-wider uppercase transition-all duration-300 shadow-[0_4px_12px_rgba(233,107,79,0.15)] flex items-center justify-center gap-1.5"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                      <span>Verifying Core Synapses...</span>
                    </>
                  ) : (
                    <>
                      <span>{isSignUp ? "Generate Credentials" : "Lift Lock Keys"}</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>

            </form>
          </CardContent>

          {/* Toggle link inside soft grey background footer */}
          <CardFooter className="bg-brand-cream-light/40 border-t border-neutral-dark/3 py-4 flex justify-center shrink-0">
            <Button
              variant="link"
              className="text-xs font-bold text-brand-terracotta hover:text-brand-terracotta-hover transition-colors"
              onClick={() => setIsSignUp(!isSignUp)}
            >
              {isSignUp
                ? "Already have family locks? Sign in now"
                : "Don't have credentials? Draft an admin key"}
            </Button>
          </CardFooter>

        </Card>

        {/* Homey copyright footnote */}
        <p className="text-[10px] text-neutral-dark/30 font-medium mt-6 text-center">
          Designed elegantly for local physical controller sync.
        </p>

      </div>
    </div>
  );
}
