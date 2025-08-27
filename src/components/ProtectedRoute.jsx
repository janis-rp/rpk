import { Navigate, Outlet } from 'react-router-dom';
import { useAuthRole } from '../lib/useAuthRole';

export default function ProtectedRoute() {
  const { loading, isAuthed } = useAuthRole();

  if (loading) return <div>Notiek ielāde…</div>;
  if (!isAuthed) return <Navigate to="/login" replace />;

  return <Outlet />;
}
