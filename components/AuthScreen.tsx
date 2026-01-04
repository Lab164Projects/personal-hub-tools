import React, { useState, useEffect } from 'react';
import { AUTH_KEY } from '../constants';
import { UserConfig } from '../types';
import { ShieldCheck, Lock, Mail, ArrowRight, RefreshCw, AlertTriangle, Info } from 'lucide-react';

interface AuthScreenProps {
  onAuthenticated: (userConfig: UserConfig) => void;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'loading' | 'login' | 'setup' | 'reset'>('loading');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [config, setConfig] = useState<UserConfig | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(AUTH_KEY);
    if (saved) {
      setConfig(JSON.parse(saved));
      setMode('login');
    } else {
      setMode('setup');
    }
  }, []);

  const simpleHash = (str: string) => {
    // Semplice offuscamento per demo client-side.
    return btoa(str).split('').reverse().join('');
  };

  const handleSetup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !confirmPassword) {
      setError("Tutti i campi sono obbligatori.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Le password non coincidono.");
      return;
    }
    if (password.length < 6) {
      setError("La password deve essere di almeno 6 caratteri.");
      return;
    }

    const newConfig: UserConfig = {
      isSetup: true,
      email,
      passwordHash: simpleHash(password)
    };
    localStorage.setItem(AUTH_KEY, JSON.stringify(newConfig));
    setConfig(newConfig);
    onAuthenticated(newConfig);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;

    if (simpleHash(password) === config.passwordHash) {
      onAuthenticated(config);
    } else {
      setError("Password non valida.");
    }
  };

  const handleResetRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;

    if (email === config.email) {
      // Simulazione chiara per l'utente
      alert(`[SIMULAZIONE SERVER]\n\nUn'email è stata "inviata" a: ${email}\n\nIl tuo codice di verifica è: 123456`);
      
      const code = prompt("Inserisci il codice ricevuto via mail (guarda l'alert precedente):");
      if (code === "123456") {
           // Reset permesso -> torna a setup ma mantenendo email
           setMode('setup');
           setPassword('');
           setConfirmPassword('');
           setError("Codice verificato. Imposta la nuova password.");
      } else {
        setError("Codice errato.");
      }
    } else {
      setError("Email non trovata nel sistema locale.");
    }
  };

  if (mode === 'loading') return null;

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#18181b] border border-gray-800 rounded-2xl shadow-2xl overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-cyan-500"></div>
        
        <div className="p-8">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-emerald-900/20 rounded-full flex items-center justify-center border border-emerald-500/30">
              <ShieldCheck className="w-8 h-8 text-emerald-400" />
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-center text-white mb-2">
            {mode === 'setup' && "Configurazione Iniziale"}
            {mode === 'login' && "Accesso Sicuro"}
            {mode === 'reset' && "Recupero Password"}
          </h2>
          
          <div className="bg-blue-900/10 border border-blue-900/30 p-3 rounded-lg mb-6 flex gap-2">
            <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <p className="text-gray-400 text-xs">
              Questa applicazione funziona localmente nel browser. Nessun dato viene inviato a server esterni. Le email di reset sono simulate.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-900/20 border border-red-900/50 rounded-lg flex items-center gap-2 text-red-200 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={mode === 'setup' ? handleSetup : mode === 'login' ? handleLogin : handleResetRequest} className="space-y-4">
            
            {(mode === 'setup' || mode === 'reset') && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Email Riferimento</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input 
                    type="email" 
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full bg-[#09090b] border border-gray-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                    placeholder="tu@email.com"
                    required
                  />
                </div>
              </div>
            )}

            {(mode === 'login' || mode === 'setup') && (
              <div>
                 <label className="block text-xs font-medium text-gray-400 mb-1">Password</label>
                 <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input 
                    type="password" 
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full bg-[#09090b] border border-gray-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>
            )}

            {mode === 'setup' && (
               <div>
               <label className="block text-xs font-medium text-gray-400 mb-1">Conferma Password</label>
               <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input 
                  type="password" 
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full bg-[#09090b] border border-gray-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>
            )}

            <button 
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg py-2.5 transition-all shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2 mt-2"
            >
              {mode === 'setup' ? 'Registra e Accedi' : mode === 'login' ? 'Accedi' : 'Invia Link Reset (Simulato)'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {mode === 'login' && (
            <div className="mt-6 text-center">
              <button onClick={() => { setMode('reset'); setError(''); }} className="text-xs text-gray-500 hover:text-emerald-400 flex items-center justify-center gap-1 mx-auto transition-colors">
                <RefreshCw className="w-3 h-3" />
                Password dimenticata?
              </button>
            </div>
          )}
           {mode === 'reset' && (
            <div className="mt-6 text-center">
              <button onClick={() => { setMode('login'); setError(''); }} className="text-xs text-gray-500 hover:text-white transition-colors">
                Torna al Login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;