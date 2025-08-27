import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function RoleRedirect() {
  const { role } = useAuth();
  if (!role) return <div className="min-h-screen bg-sand flex items-center justify-center p-6">
    <div className="rounded-2xl bg-sandLight shadow-xl ring-1 ring-sandRing p-8 text-brown">Ielāde…</div>
  </div>;

  switch (role) {
    case "admin":    return <Navigate to="/admin" replace />;
    case "manager":  return <Navigate to="/manager" replace />;
    case "teacher":  return <Navigate to="/teacher" replace />;
    case "assistant":return <Navigate to="/assistant" replace />;
    case "music":    return <Navigate to="/music" replace />;
    case "kitchen":  return <Navigate to="/kitchen" replace />;
    case "tech":     return <Navigate to="/tech" replace />;
    default:         return <Navigate to="/parent" replace />;
  }
}
