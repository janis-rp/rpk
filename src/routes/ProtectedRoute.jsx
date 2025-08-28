// src/routes/ProtectedRoute.jsx
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-sand flex items-center justify-center p-6">
        <div className="rounded-2xl bg-sandLight shadow-xl ring-1 ring-sandRing p-8 text-brown">
          Ielāde…
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }

  return children;
}
