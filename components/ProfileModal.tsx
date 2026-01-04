import React, { useState, useEffect } from 'react';
import { UserConfig } from '../types';
import { X, User, Lock, Save, AlertTriangle, CheckCircle, ExternalLink } from 'lucide-react';
import { auth } from '../services/firebase';
import { updatePassword, sendPasswordResetEmail } from "firebase/auth";

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserConfig;
  onUpdateUser: (newConfig: UserConfig) => void;
  onWipeDatabase: () => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, currentUser, onUpdateUser, onWipeDatabase }) => {

  const [newPassword, setNewPassword] = useState('');
  const [confirmNew, setConfirmNew] = useState('');
  const [msg, setMsg] = useState<{ type: 'error' | 'success', text: string } | null>(null);

  useEffect(() => {
    setMsg(null);
    setNewPassword('');
    setConfirmNew('');
  }, [isOpen]);

  if (!isOpen) return null;

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (!newPassword) return;

    if (newPassword.length < 6) {
      setMsg({ type: 'error', text: "La password deve avere almeno 6 caratteri." });
      return;
    }

    if (newPassword !== confirmNew) {
      setMsg({ type: 'error', text: "Le password non coincidono." });
      return;
    }

    const user = auth.currentUser;
    if (user) {
      try {
        await updatePassword(user, newPassword);
        setMsg({ type: 'success', text: "Password aggiornata con successo!" });
        setNewPassword('');
        setConfirmNew('');
      } catch (error: any) {
        console.error("Update Password Error", error);
        if (error.code === 'auth/requires-recent-login') {
          setMsg({ type: 'error', text: "Per sicurezza, devi rifare il login prima di cambiare la password." });
        } else {
          setMsg({ type: 'error', text: "Errore aggiornamento password: " + error.message });
        }
      }
    }
  };

  const handleResetEmail = async () => {
    const user = auth.currentUser;
    if (user && user.email) {
      try {
        await sendPasswordResetEmail(auth, user.email);
        setMsg({ type: 'success', text: `Email di reset inviata a ${user.email}` });
      } catch (error: any) {
        setMsg({ type: 'error', text: error.message });
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#18181b] border border-gray-800 rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-800 sticky top-0 bg-[#18181b] z-10">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-emerald-900/20 rounded-lg">
              <User className="text-emerald-400 w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-gray-100">Account</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-8">
          {/* Info Account */}
          <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-800">
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Email Connessa</label>
            <div className="text-gray-200 font-mono text-sm flex items-center gap-2">
              {currentUser.email}
              {auth.currentUser?.emailVerified && <CheckCircle className="w-4 h-4 text-emerald-500" title="Verificata" />}
            </div>
            <div className="mt-2 text-xs text-gray-500">
              UID: <span className="font-mono text-[10px]">{auth.currentUser?.uid}</span>
            </div>
          </div>

          <form onSubmit={handleUpdatePassword} className="space-y-6">

            {/* Sezione Password */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2 pb-2 border-b border-gray-800">
                <Lock className="w-4 h-4 text-emerald-400" /> Sicurezza
              </h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Nuova Password</label>
                  <input
                    type="password"
                    placeholder="Minimo 6 caratteri"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full bg-[#09090b] border border-gray-700 rounded-lg p-2.5 text-sm text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Conferma Password</label>
                  <input
                    type="password"
                    placeholder="Riscrivi la password"
                    value={confirmNew}
                    onChange={e => setConfirmNew(e.target.value)}
                    className="w-full bg-[#09090b] border border-gray-700 rounded-lg p-2.5 text-sm text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={!newPassword}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-2 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
                >
                  <Save className="w-4 h-4" />
                  Aggiorna Password
                </button>

                <button
                  type="button"
                  onClick={handleResetEmail}
                  className="px-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg py-2 transition-all border border-gray-700"
                  title="Invia email di reset"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>

              {/* Danger Zone */}
              <div className="mt-8 pt-6 border-t border-gray-800">
                <h3 className="text-xs font-bold text-red-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-3 h-3" /> Zona Pericolosa
                </h3>
                <button
                  type="button"
                  onClick={onWipeDatabase}
                  className="w-full bg-red-900/10 hover:bg-red-900/30 text-red-400 hover:text-red-300 border border-red-900/30 rounded-lg py-2 text-xs font-medium transition-all"
                >
                  Elimina Tutto il Database
                </button>
              </div>
            </div>

            {msg && (
              <div className={`p-3 rounded-lg flex items-center gap-2 text-sm animate-in fade-in slide-in-from-top-2 ${msg.type === 'error' ? 'bg-red-900/20 text-red-200 border border-red-900/50' : 'bg-emerald-900/20 text-emerald-200 border border-emerald-900/50'}`}>
                {msg.type === 'error' ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <CheckCircle className="w-4 h-4 shrink-0" />}
                {msg.text}
              </div>
            )}

          </form>
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;