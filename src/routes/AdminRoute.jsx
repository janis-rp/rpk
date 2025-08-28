// src/routes/AdminRoute.jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ProtectedRoute from './ProtectedRoute';

export default function AdminRoute({ children }) {
  const { claims } = useAuth();
  return (
    <ProtectedRoute>
      {claims?.admin ? children : <Navigate to="/parent" replace />}
    </ProtectedRoute>
  );
}
