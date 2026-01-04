import React, { useState } from 'react';
import { AiStatus } from '../types';
import { repairAndParseJson } from '../services/geminiService';
import { Upload, FileJson, AlertTriangle, CheckCircle, X, Loader2 } from 'lucide-react';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: any[], mode: 'merge' | 'replace') => void;
}

const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose, onImport }) => {
  const [inputText, setInputText] = useState('');
  const [aiStatus, setAiStatus] = useState<AiStatus>(AiStatus.IDLE);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setInputText(event.target?.result as string || '');
    };
    reader.readAsText(file);
  };

  const handleSmartImport = async (mode: 'merge' | 'replace') => {
    if (!inputText.trim()) return;
    setAiStatus(AiStatus.LOADING);
    setErrorMsg('');

    try {
      // First try standard parse
      let data;
      try {
        data = JSON.parse(inputText);
        if (!Array.isArray(data)) throw new Error("Non è un array");
      } catch (e) {
        // If standard parse fails, use AI
        console.log("Parsing standard fallito, tento riparazione IA...", e);
        data = await repairAndParseJson(inputText);
      }

      onImport(data, mode);
      setAiStatus(AiStatus.SUCCESS);
      setTimeout(() => {
        onClose();
        setAiStatus(AiStatus.IDLE);
        setInputText('');
      }, 1000);
    } catch (err) {
      setAiStatus(AiStatus.ERROR);
      setErrorMsg("Impossibile leggere i dati. La riparazione IA non è riuscita.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#18181b] border border-gray-800 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Upload className="text-emerald-400 w-5 h-5" />
            <h2 className="text-xl font-bold text-gray-100">Importazione Intelligente</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          <p className="text-gray-400 text-sm mb-4">
            Incolla qui sotto la tua lista JSON o carica un file. Il sistema cercherà di correggere automaticamente eventuali errori di formattazione.
          </p>

          <div className="mb-4">
             <label className="block text-sm font-medium text-gray-300 mb-2">Carica File</label>
             <input 
                type="file" 
                accept=".json,.txt"
                onChange={handleFileUpload}
                className="block w-full text-sm text-gray-400
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-full file:border-0
                  file:text-xs file:font-semibold
                  file:bg-emerald-900/30 file:text-emerald-400
                  hover:file:bg-emerald-900/50
                  cursor-pointer
                "
              />
          </div>

          <textarea 
            className="w-full h-48 bg-[#09090b] border border-gray-700 rounded-lg p-3 text-sm font-mono text-gray-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
            placeholder='[ { "name": "Shodan", "url": "..." }, ... ]'
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />

          {aiStatus === AiStatus.LOADING && (
            <div className="mt-4 flex items-center gap-2 text-emerald-400 text-sm animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Analisi e riparazione della struttura dati in corso...</span>
            </div>
          )}

          {aiStatus === AiStatus.ERROR && (
             <div className="mt-4 flex items-center gap-2 text-red-400 text-sm bg-red-900/20 p-3 rounded-lg border border-red-900">
             <AlertTriangle className="w-4 h-4" />
             <span>{errorMsg}</span>
           </div>
          )}
           {aiStatus === AiStatus.SUCCESS && (
             <div className="mt-4 flex items-center gap-2 text-emerald-400 text-sm bg-emerald-900/20 p-3 rounded-lg border border-emerald-900">
             <CheckCircle className="w-4 h-4" />
             <span>Importazione riuscita!</span>
           </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-800 flex flex-col sm:flex-row gap-3 bg-[#0e0e0e] rounded-b-xl">
          <button 
            disabled={aiStatus === AiStatus.LOADING}
            onClick={() => handleSmartImport('merge')}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            <FileJson className="w-4 h-4" />
            Unisci (Mantieni Esistenti)
          </button>
          
          <button 
            disabled={aiStatus === AiStatus.LOADING}
            onClick={() => {
              if (window.confirm("Questo sovrascriverà tutti i link attuali. Verrà creato un backup locale? No, i dati precedenti andranno persi. Procedere?")) {
                handleSmartImport('replace');
              }
            }}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-200 border border-red-900 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            <AlertTriangle className="w-4 h-4" />
            Sostituisci Tutto
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportModal;
