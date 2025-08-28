// ProtectedRoute.jsx
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth'; // tavs hooks ap onAuthStateChanged

export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { user, claims, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div>Loading…</div>;

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }
  if (requireAdmin && !claims?.admin) {
    return <Navigate to="/parent" replace />;
  }
  return children;
}
