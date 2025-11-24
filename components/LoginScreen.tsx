
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, User, ArrowRight, ShieldCheck } from 'lucide-react';

interface LoginScreenProps {
  onLogin: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Credentials from Environment or Defaults
    const correctUser = process.env.APP_USERNAME || 'admin';
    const correctPass = process.env.APP_PASSWORD || '1234';

    // Simulate network delay for better UX (mimicking an API call)
    setTimeout(() => {
        if (username.trim() === correctUser && password === correctPass) {
            localStorage.setItem('grace_session', 'loggedin');
            onLogin();
        } else {
            setError('Invalid credentials');
            setIsLoading(false);
        }
    }, 800);
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 border border-gray-100"
      >
        <div className="text-center mb-10">
            <div className="w-20 h-20 bg-black text-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-black/20">
                <ShieldCheck size={40} strokeWidth={1.5} />
            </div>
            <h1 className="text-2xl font-black text-black tracking-tight mb-1">Grace Best</h1>
            <p className="text-sm text-gray-400 font-medium">Secure Packing Assistant</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">Username</label>
                <div className="relative">
                    <User className="absolute left-4 top-3.5 text-gray-400" size={18} />
                    <input 
                        type="text" 
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-900 focus:ring-2 focus:ring-black/5 focus:bg-white transition-all outline-none"
                        placeholder="Enter username"
                    />
                </div>
            </div>

            <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">Password</label>
                <div className="relative">
                    <Lock className="absolute left-4 top-3.5 text-gray-400" size={18} />
                    <input 
                        type="password" 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-900 focus:ring-2 focus:ring-black/5 focus:bg-white transition-all outline-none"
                        placeholder="••••••••"
                    />
                </div>
            </div>

            {error && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="text-red-500 text-xs font-bold text-center bg-red-50 py-2 rounded-lg">
                    {error}
                </motion.div>
            )}

            <button 
                type="submit"
                disabled={isLoading}
                className="w-full py-4 bg-black text-white rounded-xl font-bold shadow-lg shadow-black/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-70"
            >
                {isLoading ? (
                    'Verifying...'
                ) : (
                    <>Login <ArrowRight size={18} /></>
                )}
            </button>
        </form>
      </motion.div>
    </div>
  );
};

export default LoginScreen;
