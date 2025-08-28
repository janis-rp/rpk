// src/routes/RoleRedirect.jsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RoleRedirect() {
  const { user, claims, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate('/auth', { replace: true });
      return;
    }
    if (claims?.admin) {
      navigate('/admin', { replace: true });
    } else {
      navigate('/parent', { replace: true });
    }
  }, [user, claims, loading, navigate]);

  return (
    <div className="min-h-screen bg-sand flex items-center justify-center p-6">
      <div className="rounded-2xl bg-sandLight shadow-xl ring-1 ring-sandRing p-8 text-brown">
        Pāradresācija…
      </div>
    </div>
  );
}
