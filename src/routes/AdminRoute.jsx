import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function AdminRoute({ children }) {
  const { user, role } = useAuth?.() || {};

  // Kamēr AuthContext ielādējas
  if (user === undefined || role === undefined) {
    return (
      <div className="min-h-screen bg-sand flex items-center justify-center p-6">
        <div className="rounded-2xl bg-sandLight shadow-xl ring-1 ring-sandRing p-8 text-brown">
          Ielāde…
        </div>
      </div>
    );
  }

  // Neielogots -> uz /auth
  if (!user) return <Navigate to="/auth" replace />;

  // Tikai admin/manager drīkst
  if (!(role === 'admin' || role === 'manager')) {
    return <Navigate to="/" replace />;
  }

  return children;
}
