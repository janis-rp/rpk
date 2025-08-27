import { Navigate, Outlet } from 'react-router-dom';
import { useAuthRole } from '../lib/useAuthRole';

export default function AdminRoute() {
  const { loading, isAuthed, isAdminOrManager } = useAuthRole();

  if (loading) return <div>Notiek ielāde…</div>;
  if (!isAuthed) return <Navigate to="/login" replace />;
  if (!isAdminOrManager) return <Navigate to="/403" replace />; // vienk. kļūdas lapa

  return <Outlet />;
}
