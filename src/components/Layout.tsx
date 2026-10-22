import React from 'react';
import { LogOut, User, Menu as MenuIcon, Utensils, ChefHat, UserCircle } from 'lucide-react';
import { type Profile } from '../lib/supabase';

interface LayoutProps {
  user: Profile;
  onLogout: () => void;
  children: React.ReactNode;
}

export function Layout({ user, onLogout, children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-50 print:hidden">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white font-bold text-xl">
              <Utensils size={20} />
            </div>
            <div>
              <h1 className="font-bold text-gray-900 leading-none text-sm sm:text-base">Hilac Fast Food</h1>
              <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                {user.role} Module
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-semibold text-gray-900">{user.full_name}</span>
              <span className="text-xs text-gray-500 capitalize">{user.role}</span>
            </div>
            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-400">
              {user.role === 'waiter' ? <ChefHat size={20} /> : <UserCircle size={20} />}
            </div>
            <button 
              onClick={onLogout}
              className="p-2 text-gray-400 hover:text-red-500 transition-colors"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-x-hidden print:p-0">
        <div className="max-w-7xl mx-auto p-4 print:p-0">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Nav (Optional for specific roles) */}
      <nav className="sm:hidden bg-white border-t border-gray-200 px-6 py-3 flex justify-between items-center sticky bottom-0 print:hidden">
        <button className="flex flex-col items-center gap-1 text-blue-600">
          <MenuIcon size={24} />
          <span className="text-[10px] font-bold">Menu</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-gray-400">
          <User size={24} />
          <span className="text-[10px] font-bold">Profile</span>
        </button>
      </nav>
    </div>
  );
}
