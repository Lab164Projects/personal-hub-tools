import React, { useState, useEffect } from 'react';
import { UserConfig } from '../types';
import { AUTH_KEY } from '../constants';
import { X, User, Lock, Save, AlertTriangle, CheckCircle, Cloud, HelpCircle, Copy, Globe } from 'lucide-react';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserConfig;
  onUpdateUser: (newConfig: UserConfig) => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, currentUser, onUpdateUser }) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNew, setConfirmNew] = useState('');
  const [googleClientId, setGoogleClientId] = useState('');
  const [currentOrigin, setCurrentOrigin] = useState('');
  
  const [msg, setMsg] = useState<{ type: 'error' | 'success', text: string } | null>(null);

  useEffect(() => {
    setMsg(null);
    setOldPassword('');
    setNewPassword('');
    setConfirmNew('');
    setGoogleClientId(currentUser.googleClientId || '');
    
    // Cattura l'origine attuale (es. https://tua-app.web.app o http://localhost:3000)
    if (typeof window !== 'undefined') {
        setCurrentOrigin(window.location.origin);
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const simpleHash = (str: string) => btoa(str).split('').reverse().join('');

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    // Verifica vecchia password solo se si sta cambiando la password
    if (newPassword) {
        if (simpleHash(oldPassword) !== currentUser.passwordHash) {
          setMsg({ type: 'error', text: "La password attuale non è corretta." });
          return;
        }

        if (newPassword.length < 6) {
          setMsg({ type: 'error', text: "La nuova password deve avere almeno 6 caratteri." });
          return;
        }

        if (newPassword !== confirmNew) {
          setMsg({ type: 'error', text: "Le nuove password non coincidono." });
          return;
        }
    }

    const updatedConfig: UserConfig = {
      ...currentUser,
      googleClientId: googleClientId.trim(),
      passwordHash: newPassword ? simpleHash(newPassword) : currentUser.passwordHash
    };

    localStorage.setItem(AUTH_KEY, JSON.stringify(updatedConfig));
    onUpdateUser(updatedConfig);
    setMsg({ type: 'success', text: "Profilo e impostazioni salvati!" });
  };

  const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text);
      setMsg({ type: 'success', text: "URL copiato negli appunti!" });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#18181b] border border-gray-800 rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-800 sticky top-0 bg-[#18181b] z-10">
          <div className="flex items-center gap-2">
            <User className="text-emerald-400 w-5 h-5" />
            <h2 className="text-lg font-bold text-gray-100">Gestione Profilo</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-8">
          {/* Info Account */}
          <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-800">
            <label className="block text-xs font-medium text-gray-500 mb-1">Email Account (Locale)</label>
            <div className="text-gray-200 font-mono text-sm">{currentUser.email}</div>
          </div>

          <form onSubmit={handleUpdate} className="space-y-6">
            
            {/* Sezione Cloud Sync */}
            <div className="space-y-3 border-b border-gray-800 pb-6">
                <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                    <Cloud className="w-4 h-4 text-blue-400" /> Integrazione Google Drive
                </h3>
                
                <div className="bg-blue-900/10 border border-blue-900/30 p-3 rounded-lg space-y-2">
                    <p className="text-xs text-blue-200">
                        1. Crea credenziali OAuth su <strong>Google Cloud Console</strong>.
                    </p>
                    <p className="text-xs text-gray-400">
                        2. Inserisci questo URL in "Origini JavaScript autorizzate":
                    </p>
                    <div className="flex items-center gap-2 bg-black/30 p-1.5 rounded border border-blue-900/30">
                        <Globe className="w-3 h-3 text-gray-500" />
                        <code className="text-xs font-mono text-emerald-400 flex-1 truncate">{currentOrigin}</code>
                        <button type="button" onClick={() => copyToClipboard(currentOrigin)} className="text-gray-400 hover:text-white" title="Copia">
                            <Copy className="w-3 h-3" />
                        </button>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1 mt-2">Incolla qui il tuo Client ID</label>
                    <input 
                        type="text" 
                        placeholder="es. 123456-abcde.apps.googleusercontent.com"
                        value={googleClientId}
                        onChange={e => setGoogleClientId(e.target.value)}
                        className="w-full bg-[#09090b] border border-gray-700 rounded-lg p-2 text-xs text-white focus:border-blue-500 outline-none font-mono"
                    />
                </div>
                <p className="text-[10px] text-gray-500">
                   <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="text-emerald-500 hover:underline inline-flex items-center gap-1">
                        Vai alla Console Google <ExternalLinkIcon className="w-3 h-3" />
                    </a>
                </p>
            </div>

            {/* Sezione Password */}
            <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                <Lock className="w-4 h-4" /> Modifica Password
                </h3>
                <p className="text-xs text-gray-500">Lascia vuoto se non vuoi cambiarla.</p>
                
                <div>
                <input 
                    type="password" 
                    placeholder="Password Attuale (richiesta per cambio)"
                    value={oldPassword}
                    onChange={e => setOldPassword(e.target.value)}
                    className="w-full bg-[#09090b] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 outline-none"
                />
                </div>
                <div>
                <input 
                    type="password" 
                    placeholder="Nuova Password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full bg-[#09090b] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 outline-none"
                />
                </div>
                <div>
                <input 
                    type="password" 
                    placeholder="Conferma Nuova Password"
                    value={confirmNew}
                    onChange={e => setConfirmNew(e.target.value)}
                    className="w-full bg-[#09090b] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 outline-none"
                />
                </div>
            </div>

            {msg && (
              <div className={`p-3 rounded-lg flex items-center gap-2 text-sm ${msg.type === 'error' ? 'bg-red-900/20 text-red-200 border border-red-900' : 'bg-emerald-900/20 text-emerald-200 border border-emerald-900'}`}>
                {msg.type === 'error' ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                {msg.text}
              </div>
            )}

            <button 
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg py-2 transition-all flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              Salva Impostazioni
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

// Helper icon locally defined
const ExternalLinkIcon = ({className}:{className?:string}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
)

export default ProfileModal;