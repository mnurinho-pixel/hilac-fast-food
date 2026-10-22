import React, { useState } from 'react';
import { supabase, type Profile } from '../lib/supabase';
import { Utensils, Mail, User as UserIcon, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface LoginProps {
  onLogin: (profile: Profile) => void;
}

export function Login({ onLogin }: LoginProps) {
  const [loginMode, setLoginMode] = useState<'pin' | 'admin'>('pin');
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePinSubmit = async () => {
    if (pin.length < 4) return;
    setLoading(true);
    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('pin', pin)
        .maybeSingle();

      if (fetchError || !data) {
        setError('Invalid PIN');
        setPin('');
      } else {
        onLogin(data);
      }
    } catch (err) {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (profile) onLogin(profile);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex flex-col items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-gray-100 p-8"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 bg-slate-900 rounded-3xl flex items-center justify-center mb-4 shadow-xl shadow-slate-200">
            <Utensils className="text-white w-10 h-10" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Hilac Fast Food</h1>
          <div className="flex gap-2 mt-4 p-1 bg-gray-100 rounded-xl">
            <button 
              onClick={() => setLoginMode('pin')}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${loginMode === 'pin' ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-500'}`}
            >
              Staff PIN
            </button>
            <button 
              onClick={() => setLoginMode('admin')}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${loginMode === 'admin' ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-500'}`}
            >
              Admin Login
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {loginMode === 'pin' ? (
            <motion.div 
              key="pin"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="flex justify-center gap-4 mb-8">
                {[...Array(4)].map((_, i) => (
                  <div 
                    key={i}
                    className={`w-4 h-4 rounded-full border-2 transition-all duration-300 ${
                      pin.length > i ? 'bg-slate-900 border-slate-900 scale-110' : 'border-gray-200'
                    }`}
                  />
                ))}
              </div>

              {error && <p className="text-red-500 text-center text-sm font-bold">{error}</p>}

              <div className="grid grid-cols-3 gap-3">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((btn) => (
                  <button
                    key={btn}
                    onClick={() => {
                      if (btn === 'C') setPin('');
                      else if (btn === '⌫') setPin(prev => prev.slice(0, -1));
                      else if (pin.length < 4) setPin(prev => prev + btn);
                    }}
                    className="h-16 rounded-2xl bg-gray-50 text-xl font-bold text-slate-700 active:bg-slate-900 active:text-white transition-all shadow-sm active:scale-95"
                  >
                    {btn}
                  </button>
                ))}
              </div>

              <button
                onClick={handlePinSubmit}
                disabled={loading || pin.length < 4}
                className="w-full h-16 bg-slate-900 text-white rounded-2xl font-black text-lg shadow-xl shadow-slate-200 active:scale-95 transition-all disabled:opacity-50"
              >
                {loading ? 'Verifying...' : 'Access POS'}
              </button>
            </motion.div>
          ) : (
            <motion.form 
              key="admin"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              onSubmit={handleAdminSubmit}
              className="space-y-4"
            >
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="email" 
                  placeholder="Admin Email"
                  required
                  className="w-full h-14 pl-12 pr-4 rounded-2xl border border-gray-100 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-slate-900 outline-none transition-all font-medium"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="password" 
                  placeholder="Password"
                  required
                  className="w-full h-14 pl-12 pr-4 rounded-2xl border border-gray-100 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-slate-900 outline-none transition-all font-medium"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>
              {error && <p className="text-red-500 text-center text-sm font-bold">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-16 bg-slate-900 text-white rounded-2xl font-black text-lg shadow-xl shadow-slate-200 active:scale-95 transition-all"
              >
                {loading ? 'Logging in...' : 'Admin Access'}
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
