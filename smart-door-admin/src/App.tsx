import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { isFirebaseConfigured } from "@/lib/firebase";
import Layout from "@/components/Layout";
import LoginPage from "@/pages/LoginPage";
import SetupPage from "@/pages/SetupPage";
import Dashboard from "@/pages/Dashboard";
import LogsPage from "@/pages/LogsPage";
import DoorControlPage from "@/pages/DoorControlPage";
import RegisterFacePage from "@/pages/RegisterFacePage";
import GuestAccessPage from "@/pages/GuestAccessPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-900"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  if (!isFirebaseConfigured()) {
    return <SetupPage />;
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="door" element={<DoorControlPage />} />
        <Route path="register" element={<RegisterFacePage />} />
        <Route path="guest" element={<GuestAccessPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
