import { useState, useEffect } from 'react';
import { supabase, type Profile } from './lib/supabase';
import { Layout } from './components/Layout';
import { Login } from './components/Login';
import { WaiterModule } from './components/WaiterModule';
import { CashierModule } from './components/CashierModule';
import { AdminModule } from './components/AdminModule';

export default function App() {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session or stored user
    const storedUser = localStorage.getItem('pos_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const handleLogin = (profile: Profile) => {
    setUser(profile);
    localStorage.setItem('pos_user', JSON.stringify(profile));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('pos_user');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Layout user={user} onLogout={handleLogout}>
      {user.role === 'waiter' && <WaiterModule user={user} />}
      {user.role === 'cashier' && <CashierModule user={user} />}
      {user.role === 'admin' && <AdminModule user={user} />}
    </Layout>
  );
}
