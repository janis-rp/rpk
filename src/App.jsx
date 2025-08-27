import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy } from "react";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./routes/ProtectedRoute";
import RoleRedirect from "./routes/RoleRedirect";
import ParentSettings from "./pages/ParentSettings";

const AuthPage  = lazy(() => import("./pages/AuthPage"));
const Parent    = lazy(() => import("./pages/Parent"));
const Admin     = lazy(() => import("./pages/Admin"));
const Manager   = lazy(() => import("./pages/Manager"));
const Teacher   = lazy(() => import("./pages/Teacher"));
const Assistant = lazy(() => import("./pages/Assistant"));
const Music     = lazy(() => import("./pages/Music"));
const Kitchen   = lazy(() => import("./pages/Kitchen"));
const Tech      = lazy(() => import("./pages/Tech"));

function Fallback() {
  return (
    <div className="min-h-screen bg-sand flex items-center justify-center p-6">
      <div className="rounded-2xl bg-sandLight shadow-xl ring-1 ring-sandRing p-8 text-brown">
        Ielāde…
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<Fallback />}>
          <Routes>
            <Route path="/" element={<ProtectedRoute><RoleRedirect /></ProtectedRoute>} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/parent" element={<ProtectedRoute><Parent /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
            <Route path="/manager" element={<ProtectedRoute><Manager /></ProtectedRoute>} />
            <Route path="/teacher" element={<ProtectedRoute><Teacher /></ProtectedRoute>} />
            <Route path="/assistant" element={<ProtectedRoute><Assistant /></ProtectedRoute>} />
            <Route path="/music" element={<ProtectedRoute><Music /></ProtectedRoute>} />
            <Route path="/kitchen" element={<ProtectedRoute><Kitchen /></ProtectedRoute>} />
            <Route path="/tech" element={<ProtectedRoute><Tech /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
		<Route path="/parent/settings" element={<ProtectedRoute><ParentSettings /></ProtectedRoute>} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
