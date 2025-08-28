// router.jsx
<Route path="/" element={<Navigate to="/auth" replace />} />
<Route path="/auth" element={<AuthPage />} />
<Route
  path="/parent"
  element={
    <ProtectedRoute>
      <ParentDashboard/>
    </ProtectedRoute>
  }
/>
<Route
  path="/admin"
  element={
    <ProtectedRoute requireAdmin>
      <AdminPanel/>
    </ProtectedRoute>
  }
/>
