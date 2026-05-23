import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SetupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Firebase Configuration Required</CardTitle>
          <CardDescription>
            This application requires Firebase to function.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-zinc-600">
            Please configure your Firebase credentials in the environment variables.
          </p>
          <div className="rounded-md bg-zinc-100 p-4 text-xs font-mono">
            <p>VITE_FIREBASE_API_KEY=...</p>
            <p>VITE_FIREBASE_AUTH_DOMAIN=...</p>
            <p>VITE_FIREBASE_PROJECT_ID=...</p>
            <p>VITE_FIREBASE_STORAGE_BUCKET=...</p>
            <p>VITE_FIREBASE_MESSAGING_SENDER_ID=...</p>
            <p>VITE_FIREBASE_APP_ID=...</p>
          </div>
          <p className="text-sm text-zinc-600">
            After setting these variables, restart the application.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
