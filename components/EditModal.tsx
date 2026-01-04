import React, { useState, useEffect } from 'react';
import { LinkItem } from '../types';
import { X, Save, Link as LinkIcon } from 'lucide-react';

interface EditModalProps {
  isOpen: boolean;
  link: LinkItem | null;
  onClose: () => void;
  onSave: (updatedLink: LinkItem) => void;
}

const EditModal: React.FC<EditModalProps> = ({ isOpen, link, onClose, onSave }) => {
  const [formData, setFormData] = useState<LinkItem | null>(null);

  useEffect(() => {
    if (link) {
      setFormData({ ...link });
    }
  }, [link]);

  if (!isOpen || !formData) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#18181b] border border-gray-800 rounded-xl shadow-2xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <LinkIcon className="text-emerald-400 w-5 h-5" />
            <h2 className="text-lg font-bold text-gray-100">Modifica Tool</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Nome</label>
            <input 
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              className="w-full bg-[#09090b] border border-gray-700 rounded-lg p-2 text-sm text-gray-200 focus:border-emerald-500 outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">URL</label>
            <input 
              value={formData.url}
              onChange={e => setFormData({...formData, url: e.target.value})}
              className="w-full bg-[#09090b] border border-gray-700 rounded-lg p-2 text-sm text-gray-200 focus:border-emerald-500 outline-none font-mono"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Categoria</label>
            <input 
              value={formData.category}
              onChange={e => setFormData({...formData, category: e.target.value})}
              className="w-full bg-[#09090b] border border-gray-700 rounded-lg p-2 text-sm text-gray-200 focus:border-emerald-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Descrizione</label>
            <textarea 
              value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
              rows={4}
              className="w-full bg-[#09090b] border border-gray-700 rounded-lg p-2 text-sm text-gray-200 focus:border-emerald-500 outline-none resize-none"
            />
          </div>
          
          <div className="pt-2 flex gap-2">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors"
            >
              Annulla
            </button>
            <button 
              type="submit"
              className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              Salva Modifiche
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditModal;