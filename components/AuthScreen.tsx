import React, { useState } from 'react';
import { UserConfig } from '../types';
import {
  ShieldCheck, Lock, Mail, ArrowRight, AlertTriangle, LogIn
} from 'lucide-react';
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from "firebase/auth";
import { auth, googleProvider } from '../services/firebase';

interface AuthScreenProps {
  onAuthenticated: (userConfig: UserConfig) => void;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      onAuthenticated({
        email: user.email || '',
        isSetup: true,
        // No password hash needed locally
      });
    } catch (err: any) {
      console.error("Google Auth Error:", err);
      setError(err.message || "Errore login Google");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError('');

    try {
      let userCred;
      if (mode === 'login') {
        userCred = await signInWithEmailAndPassword(auth, email, password);
      } else {
        userCred = await createUserWithEmailAndPassword(auth, email, password);
      }
      onAuthenticated({
        email: userCred.user.email || '',
        isSetup: true
      });
    } catch (err: any) {
      console.error("Auth Error:", err);
      if (err.code === 'auth/invalid-credential') setError("Credenziali non valide.");
      else if (err.code === 'auth/email-already-in-use') setError("Email già registrata.");
      else if (err.code === 'auth/weak-password') setError("Password troppo debole (min 6 caratteri).");
      else setError(err.message || "Errore autenticazione");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      alert(`Email di reset inviata a ${email}`);
      setMode('login');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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
            {mode === 'register' && "Crea Account"}
            {mode === 'login' && "Accedi al Hub"}
            {mode === 'reset' && "Recupero Password"}
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-900/20 border border-red-900/50 rounded-lg flex items-center gap-2 text-red-200 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Google Login Button */}
          {mode !== 'reset' && (
            <div className="mb-6">
              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full bg-white text-gray-900 hover:bg-gray-100 font-medium rounded-lg py-2.5 transition-all flex items-center justify-center gap-2"
              >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
                Accedi con Google
              </button>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-800"></div></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-[#18181b] px-2 text-gray-500">Oppure email</span></div>
              </div>
            </div>
          )}

          <form onSubmit={mode === 'reset' ? handleReset : handleEmailAuth} className="space-y-4">

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-[#09090b] border border-gray-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none"
                  placeholder="name@example.com"
                  required
                />
              </div>
            </div>

            {mode !== 'reset' && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full bg-[#09090b] border border-gray-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-lg py-2.5 transition-all flex items-center justify-center gap-2"
            >
              {loading ? 'Attendere...' : (mode === 'register' ? 'Registrati' : mode === 'login' ? 'Accedi' : 'Invia Email Reset')}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-gray-500">
            {mode === 'login' ? (
              <>
                Non hai un account? <button onClick={() => setMode('register')} className="text-emerald-400 hover:underline">Registrati</button>
                <br />
                <button onClick={() => setMode('reset')} className="mt-2 text-gray-400 hover:text-white">Password dimenticata?</button>
              </>
            ) : mode === 'register' ? (
              <>
                Hai già un account? <button onClick={() => setMode('login')} className="text-emerald-400 hover:underline">Accedi</button>
              </>
            ) : (
              <button onClick={() => setMode('login')} className="text-emerald-400 hover:underline">Torna al Login</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
export default AuthScreen;