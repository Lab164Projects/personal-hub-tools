import React, { useEffect, useState, useMemo } from 'react';
import {
  Search, Plus, Sparkles, Download, Upload, Trash2,
  ExternalLink, Server, Globe, Shield, Wifi, Code,
  RotateCcw, Save, SearchCode, Cpu, Loader2,
  Pencil, AlertCircle, User as UserIcon, Filter, Cloud,
  Clock, PauseCircle, LogIn
} from 'lucide-react';
import { LinkItem, AiStatus, UserConfig } from './types';
import { enrichLinkData, semanticSearch, enrichLinksBatch } from './services/geminiService';
import {
  subscribeToLinks,
  addLink,
  updateLink,
  deleteLink,
  batchImportLinks,
  deleteAllLinks
} from './services/firestoreService';
import { auth } from './services/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';

import {
  RateLimitState,
  loadRateLimitState,
  canMakeRequest,
  recordRequest,
  recordError,
  recordSuccess,
  getCooldownRemainingMs,
  formatCooldownTime,
} from './services/rateLimitService';
import ImportModal from './components/ImportModal';
import AuthScreen from './components/AuthScreen';
import EditModal from './components/EditModal';
import ProfileModal from './components/ProfileModal';

// --- Helpers ---

const normalizeUrl = (url: string): string => {
  if (!url) return "";
  let s = url.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  if (s.endsWith('/')) s = s.slice(0, -1);
  return s;
};

const CategoryBadge: React.FC<{ category: string }> = ({ category }) => {
  let colorClass = "bg-gray-800 text-gray-300 border-gray-700";
  let Icon = Globe;

  const lower = category.toLowerCase();
  if (lower.includes('threat') || lower.includes('intel') || lower.includes('sicurezza')) {
    colorClass = "bg-red-900/30 text-red-200 border-red-900/50";
    Icon = Shield;
  } else if (lower.includes('server') || lower.includes('asset') || lower.includes('host')) {
    colorClass = "bg-blue-900/30 text-blue-200 border-blue-900/50";
    Icon = Server;
  } else if (lower.includes('code') || lower.includes('dork') || lower.includes('codice')) {
    colorClass = "bg-purple-900/30 text-purple-200 border-purple-900/50";
    Icon = Code;
  } else if (lower.includes('wifi') || lower.includes('net') || lower.includes('rete')) {
    colorClass = "bg-amber-900/30 text-amber-200 border-amber-900/50";
    Icon = Wifi;
  } else if (lower.includes('scanner') || lower.includes('vuln')) {
    colorClass = "bg-orange-900/30 text-orange-200 border-orange-900/50";
    Icon = SearchCode;
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${colorClass}`}>
      <Icon className="w-3 h-3" />
      {category}
    </span>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingLinks, setLoadingLinks] = useState(false);

  const [links, setLinks] = useState<LinkItem[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const [isAiSearch, setIsAiSearch] = useState(false);
  const [aiSearchResults, setAiSearchResults] = useState<string[]>([]);
  const [aiSearchStatus, setAiSearchStatus] = useState<AiStatus>(AiStatus.IDLE);

  // New Item Form
  const [newUrl, setNewUrl] = useState('');

  // Modals
  const [showImportModal, setShowImportModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkItem | null>(null);

  // AI Queue
  const [queueDelay, setQueueDelay] = useState(6000);
  const [isQueueProcessing, setIsQueueProcessing] = useState(false);

  // Rate Limiting State
  const [rateLimitState, setRateLimitState] = useState<RateLimitState>(() => loadRateLimitState());
  const [cooldownDisplay, setCooldownDisplay] = useState('');

  // --- AUTH & DATA SYNC ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setLoadingLinks(true);
        // Subscribe to Firestore updates
        const unsubLinks = subscribeToLinks(
          currentUser.uid,
          (remoteLinks) => {
            // AUTO-MIGRATION CHECK
            if (remoteLinks.length === 0) {
              const local = localStorage.getItem('personal_hub_links');
              if (local) {
                const localParsed = JSON.parse(local);
                if (localParsed.length > 0) {
                  if (confirm(`Trovati ${localParsed.length} link locali. Vuoi caricarli nel Cloud?`)) {
                    batchImportLinks(currentUser.uid, localParsed);
                  }
                }
              }
            }
            setLinks(remoteLinks);
            setLoadingLinks(false);
          },
          (error) => {
            console.error("Firestore Error:", error);
            setLoadingLinks(false);
          }
        );
        return () => unsubLinks();
      } else {
        setLinks([]);
      }
    });

    return () => unsubscribe();
  }, []);

  // --- COOLDOWN TIMER ---
  useEffect(() => {
    if (!rateLimitState.isInCooldown) {
      setCooldownDisplay('');
      return;
    }

    const updateCooldown = () => {
      const remaining = getCooldownRemainingMs(rateLimitState);
      if (remaining <= 0) {
        setRateLimitState(prev => ({ ...prev, isInCooldown: false, consecutiveErrors: 0 }));
        setCooldownDisplay('');
      } else {
        setCooldownDisplay(formatCooldownTime(remaining));
      }
    };

    updateCooldown();
    const interval = setInterval(updateCooldown, 1000);
    return () => clearInterval(interval);
  }, [rateLimitState.isInCooldown, rateLimitState.cooldownUntil]);

  // --- AUTOMATIC AI QUEUE PROCESSOR WITH RATE LIMITING ---
  useEffect(() => {
    if (!user || isQueueProcessing) return;

    // STOP IMMEDIATELY if in cooldown. Do not write to Firestore.
    // The UI handles the visual indication of "Queued" or "Cooldown".
    if (rateLimitState.isInCooldown) {
      return;
    }

    // Double check rate limit state before firing
    if (!canMakeRequest(rateLimitState)) {
      console.log('Rate limit reached (check), waiting...');
      return;
    }

    const timer = setTimeout(async () => {
      // Re-check inside timeout
      if (rateLimitState.isInCooldown) return;

      // GET BATCH (Max 3 items)
      const batchItems = links
        .filter(l => l.aiProcessingStatus === 'pending' || l.aiProcessingStatus === 'queued')
        .slice(0, 3);

      if (batchItems.length === 0) return;

      setIsQueueProcessing(true);

      // Mark batch as processing
      for (const item of batchItems) {
        await updateLink(user.uid, { ...item, aiProcessingStatus: 'processing' });
      }

      setRateLimitState(prev => recordRequest(prev));

      try {
        const itemsPayload = batchItems.map(item => ({
          id: item.id,
          name: item.name,
          url: item.url,
          currentDescription: item.description
        }));

        const results = await enrichLinksBatch(itemsPayload);

        // Process results
        for (const item of batchItems) {
          const result = results[item.id];

          let newDesc = item.description;
          let newCat = item.category;
          let newTags = item.tags;
          let newStatus: 'done' | 'error' = 'done';

          if (result) {
            const isAiError = result.description?.includes("non disponibile") || result.category?.includes("Errore");

            if (!isAiError) {
              // SIMPLIFIED LOGIC: Always use AI result if available and valid.
              if (result.description && result.description.length > 5) {
                newDesc = result.description;
              }

              newCat = (result.category && result.category !== "Non categorizzato") ? result.category : item.category;
              newTags = (result.tags && result.tags.length > 0) ? result.tags : item.tags;
            } else {
              // AI returned error-like text. Mark as done but keep original.
              newStatus = 'done';
            }
          } else {
            newStatus = 'error';
          }

          const updated = {
            ...item,
            description: newDesc,
            category: newCat,
            tags: newTags,
            aiProcessingStatus: newStatus
          };
          await updateLink(user.uid, updated);
        }

        setRateLimitState(prev => recordSuccess(prev));
        if (queueDelay > 4000) setQueueDelay(4000);

      } catch (error: any) {
        console.error("Batch Enrichment Failed:", error);

        const isRateLimit = error?.message?.includes('429') ||
          error?.message?.toLowerCase().includes('rate');

        setRateLimitState(prev => recordError(prev, isRateLimit));

        // Revert status
        for (const item of batchItems) {
          await updateLink(user.uid, {
            ...item,
            aiProcessingStatus: isRateLimit ? 'queued' : 'error',
            lastErrorAt: Date.now()
          });
        }

        if (!isRateLimit) setQueueDelay(prev => Math.min(prev * 2, 60000));

      } finally {
        setIsQueueProcessing(false);
      }
    }, queueDelay);

    return () => clearTimeout(timer);
  }, [links, user, isQueueProcessing, queueDelay, rateLimitState]);

  // Handle Search
  useEffect(() => {
    const runSearch = async () => {
      if (!isAiSearch || !searchQuery.trim()) {
        setAiSearchResults([]);
        setAiSearchStatus(AiStatus.IDLE);
        return;
      }

      setAiSearchStatus(AiStatus.LOADING);
      const timer = setTimeout(async () => {
        const ids = await semanticSearch(searchQuery, links);
        setAiSearchResults(ids);
        setAiSearchStatus(AiStatus.SUCCESS);
      }, 800);

      return () => clearTimeout(timer);
    };

    runSearch();
  }, [searchQuery, isAiSearch, links]); // Added links dependency for search

  const availableCategories = useMemo(() => {
    const cats = new Set(links.map(l => l.category).filter(c => c && c !== 'Non categorizzato'));
    return Array.from(cats).sort();
  }, [links]);

  const filteredLinks = useMemo(() => {
    let result = links;
    if (categoryFilter) {
      result = result.filter(l => l.category === categoryFilter);
    }
    if (searchQuery) {
      if (isAiSearch && aiSearchResults.length > 0) {
        result = result.filter(l => aiSearchResults.includes(l.id));
      } else if (!isAiSearch) {
        const q = searchQuery.toLowerCase();
        result = result.filter(l =>
          l.name.toLowerCase().includes(q) ||
          l.url.toLowerCase().includes(q) ||
          l.category.toLowerCase().includes(q) ||
          l.tags?.some(t => t.toLowerCase().includes(q))
        );
      }
    }
    return result;
  }, [links, searchQuery, isAiSearch, aiSearchResults, categoryFilter]);

  const handleAddLink = async () => {
    if (!newUrl.trim() || !user) return;

    const normalizedNew = normalizeUrl(newUrl);
    const existing = links.find(l => normalizeUrl(l.url) === normalizedNew);
    if (existing) {
      alert(`Link già presente: ${existing.name} (${existing.category})`);
      return;
    }

    let url = newUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    let name = '';
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, '');
      const namePart = hostname.split('.')[0];
      name = namePart.charAt(0).toUpperCase() + namePart.slice(1);
    } catch {
      name = url;
    }

    const newItem: LinkItem = {
      id: crypto.randomUUID(), // Temp ID, replaced mostly by Firestore ID if using addDoc, but we use our ID model
      name: name,
      url: url,
      category: 'In attesa di classificazione...',
      description: 'Generazione automatica in corso...',
      tags: [],
      addedAt: Date.now(),
      aiProcessingStatus: 'pending'
    };

    // Add to Firestore
    try {
      await addLink(user.uid, newItem);
      setNewUrl('');
    } catch (e) {
      console.error("Error adding link:", e);
      alert("Errore salvataggio Cloud.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    if (window.confirm("Rimuovere questo tool dal Cloud?")) {
      try {
        await deleteLink(user.uid, id);
      } catch (e) {
        console.error("Delete Error", e);
      }
    }
  };

  const handleUpdateLink = async (updatedLink: LinkItem) => {
    if (!user) return;
    try {
      await updateLink(user.uid, updatedLink);
    } catch (e) {
      console.error("Update Error", e);
    }
  };

  const handleExport = () => {
    const dataStr = JSON.stringify(links, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tools_pentest_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (importedData: any[], mode: 'merge' | 'replace') => {
    if (!user) return;

    const cleanImportUrl = (rawUrl: string): string => {
      if (!rawUrl) return '#';
      // Handle Markdown links [text](url) -> url
      const mdMatch = rawUrl.match(/\[.*?\]\((.*?)\)/);
      if (mdMatch && mdMatch[1]) return mdMatch[1].trim();
      // Handle potential bare brackets/parens if user just pasted weirdly
      return rawUrl.replace(/[\[\]\(\)]/g, '').trim();
    };

    const processed: LinkItem[] = importedData.map((item: any) => {
      const cleanedUrl = cleanImportUrl(item.url);
      return {
        id: item.id || crypto.randomUUID(),
        name: item.name || 'Sconosciuto',
        url: cleanedUrl,
        category: item.category || 'Non categorizzato',
        description: item.description || 'In attesa di analisi...',
        tags: item.tags || [],
        addedAt: item.addedAt || Date.now(),
        aiProcessingStatus: ((item.description && item.category !== 'Non categorizzato') ? 'done' : 'pending') as 'done' | 'pending'
      };
    });

    if (mode === 'replace') {
      if (!confirm("ATTENZIONE: Stai per cancellare TUTTO il database Cloud e sostituirlo con questo backup.\n\nQuesta azione è IRREVERSIBILE.\n\nVuoi procedere?")) return;

      setLoadingLinks(true);
      try {
        // 1. Wipe existing
        await deleteAllLinks(user.uid);
        // 2. Import new
        await batchImportLinks(user.uid, processed);
        alert("Backup ripristinato con successo (Database sostituito).");
      } catch (e) {
        console.error("Replace Error:", e);
        alert("Errore durante il ripristino. Riprova.");
      } finally {
        setLoadingLinks(false);
      }
      const currentUrls = new Set(links.map(l => normalizeUrl(l.url)));
      const newItems = processed.filter((l: LinkItem) => !currentUrls.has(normalizeUrl(l.url)));

      if (newItems.length > 0) {
        await batchImportLinks(user.uid, newItems);
        alert(`Import completato: ${newItems.length} tool aggiunti al Cloud.`);
      } else {
        alert("Nessun nuovo elemento da aggiungere.");
      }
    }
  };

  const handleAuthSuccess = () => {
    // Handled by onAuthStateChanged
  };

  if (!user) {
    return <AuthScreen onAuthenticated={handleAuthSuccess} />;
  }

  return (
    <div className="min-h-screen pb-20">
      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={handleImport}
      />

      <EditModal
        isOpen={!!editingLink}
        link={editingLink}
        onClose={() => setEditingLink(null)}
        onSave={handleUpdateLink}
      />

      {user && (
        <ProfileModal
          isOpen={showProfileModal}
          onClose={() => setShowProfileModal(false)}
          currentUser={{ email: user.email || '', isSetup: true }}
          onUpdateUser={() => { }}
          onWipeDatabase={async () => {
            if (confirm("SEI SICURO? Cancellare TUTTO l'archivio Cloud?\nQuesta operazione non può essere annullata.")) {
              try {
                await deleteAllLinks(user.uid);
                alert("Database Cloud formattato con successo.");
                setShowProfileModal(false);
              } catch (e) {
                console.error(e);
                alert("Errore durante la cancellazione.");
              }
            }
          }}
        />
      )}

      {/* Header / Nav */}
      <header className="sticky top-0 z-40 bg-[#09090b]/80 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                <Cpu className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-100 tracking-tight">Personal Tools Hub</h1>
                <p className="text-xs text-gray-500">Cloud Sync Active • {user.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto justify-end">

              {loadingLinks && (
                <span className="text-xs text-emerald-500 flex items-center gap-1 animate-pulse">
                  <Cloud className="w-3 h-3" /> Sync...
                </span>
              )}

              <div className="w-px h-6 bg-gray-800 mx-1"></div>

              <button onClick={() => setShowProfileModal(true)} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-all flex items-center gap-2" title="Profilo">
                <UserIcon className="w-5 h-5" />
                <span className="text-xs hidden md:inline">Account</span>
              </button>

              <button onClick={() => setShowImportModal(true)} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-all" title="Importa JSON">
                <Upload className="w-5 h-5" />
              </button>
              <button onClick={handleExport} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-all" title="Esporta JSON">
                <Download className="w-5 h-5" />
              </button>
              <button onClick={() => { if (confirm("Uscire dal sistema?")) signOut(auth); }} className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-900/10 rounded-lg transition-all flex items-center gap-2" title="Logout">
                <LogIn className="w-5 h-5 rotate-180" />
                <span className="text-xs hidden lg:inline">Esci</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Actions Bar: Search, Filter & Add */}
        <div className="grid lg:grid-cols-2 gap-6">

          {/* Search & Filter Row */}
          <div className="flex gap-2">
            {/* Smart Search */}
            <div className="bg-[#18181b] p-1.5 rounded-xl border border-gray-800 flex items-center shadow-lg relative flex-1">
              <div className="pl-3 pr-2 text-gray-500">
                {isAiSearch ? <Sparkles className="w-5 h-5 text-emerald-400 animate-pulse" /> : <Search className="w-5 h-5" />}
              </div>
              <input
                type="text"
                placeholder={isAiSearch ? "IA: 'Trova scanner wifi...'" : "Cerca..."}
                className="flex-1 bg-transparent border-none outline-none text-gray-200 placeholder-gray-500 text-sm h-10 w-full min-w-0"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button
                onClick={() => setIsAiSearch(!isAiSearch)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all border shrink-0 ${isAiSearch
                  ? "bg-emerald-900/30 text-emerald-400 border-emerald-800"
                  : "bg-gray-800 text-gray-400 border-gray-700 hover:text-gray-200"
                  }`}
              >
                {isAiSearch ? 'IA ON' : 'IA OFF'}
              </button>
            </div>

            {/* Category Filter Dropdown */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Filter className="h-4 w-4 text-gray-500" />
              </div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="h-full pl-9 pr-4 bg-[#18181b] border border-gray-800 text-gray-300 text-sm rounded-xl focus:ring-emerald-500 focus:border-emerald-500 block w-full appearance-none outline-none cursor-pointer hover:bg-[#202023]"
              >
                <option value="">Tutte le categorie</option>
                {availableCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          {/* AI Add */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddLink()}
                className="w-full h-full bg-[#18181b] border border-gray-800 rounded-xl pl-4 pr-4 text-sm text-gray-200 placeholder-gray-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                placeholder="Incolla URL (Analisi Automatica)..."
              />
            </div>
            <button
              onClick={handleAddLink}
              className="px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-all shadow-lg shadow-emerald-900/20 flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">Aggiungi</span>
            </button>
          </div>
        </div>

        {/* Results Info */}
        <div className="flex items-center justify-between text-xs text-gray-500 uppercase tracking-wider font-semibold">
          <div className="flex items-center gap-4">
            <span>{filteredLinks.length} Strumenti Cloud</span>
            {cooldownDisplay && (
              <span className="flex items-center gap-1 text-orange-400 normal-case">
                <PauseCircle className="w-3 h-3" /> Cooldown: {cooldownDisplay}
              </span>
            )}
            {!cooldownDisplay && (isQueueProcessing || links.some(l => l.aiProcessingStatus === 'pending')) && (
              <span className="flex items-center gap-1 text-emerald-500 normal-case">
                <Loader2 className={`w-3 h-3 ${isQueueProcessing ? 'animate-spin' : 'opacity-50'}`} />
                {isQueueProcessing ? 'Analisi Cloud in corso...' : 'In attesa di analisi...'}
              </span>
            )}
            {links.filter(l => l.aiProcessingStatus === 'queued').length > 0 && (
              <span className="flex items-center gap-1 text-yellow-500 normal-case">
                <Clock className="w-3 h-3" /> {links.filter(l => l.aiProcessingStatus === 'queued').length} in coda
              </span>
            )}
          </div>
          {(searchQuery || categoryFilter) && (
            <span>
              Filtri: {categoryFilter ? categoryFilter : 'Tutti'} • {isAiSearch ? 'Semantico' : 'Keyword'}
            </span>
          )}
        </div>

        {/* Grid List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredLinks.map((link) => (
            <div key={link.id} className="group bg-[#18181b] hover:bg-[#202023] border border-gray-800 hover:border-gray-700 rounded-xl p-5 transition-all duration-200 flex flex-col shadow-sm relative overflow-hidden">

              {/* AI Processing Status Indicator */}
              {link.aiProcessingStatus === 'processing' && (
                <div className="absolute top-0 right-0 p-2">
                  <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                </div>
              )}
              {link.aiProcessingStatus === 'pending' && (
                <div className="absolute top-0 right-0 p-2">
                  <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" title="In coda per IA"></div>
                </div>
              )}
              {link.aiProcessingStatus === 'queued' && (
                <div className="absolute top-0 right-0 p-2" title="In attesa - API rate limited">
                  <Clock className="w-4 h-4 text-yellow-500" />
                </div>
              )}

              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 font-bold text-xs border border-gray-700">
                    {link.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-gray-200 font-semibold leading-tight group-hover:text-emerald-400 transition-colors">
                      {link.name}
                    </h3>
                  </div>
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  <button onClick={() => setEditingLink(link)} className="text-gray-500 hover:text-blue-400 p-1 bg-gray-900/50 rounded" title="Modifica">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(link.id)} className="text-gray-500 hover:text-red-400 p-1 bg-gray-900/50 rounded" title="Elimina">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Sezione descrizione */}
              <div className="flex-1 mb-4">
                <p className={`text-sm line-clamp-3 ${link.aiProcessingStatus === 'pending' || link.aiProcessingStatus === 'processing' ? 'text-gray-500 italic' : 'text-gray-400'}`}>
                  {link.description || 'Nessuna descrizione.'}
                </p>
                {link.aiProcessingStatus === 'error' && (
                  <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Errore analisi IA (Riproverà)
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                <CategoryBadge category={link.category} />
                {link.tags?.slice(0, 3).map(tag => (
                  <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded border border-gray-800 text-gray-500 bg-gray-900/50">
                    #{tag}
                  </span>
                ))}
              </div>

              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="mt-auto w-full flex items-center justify-center gap-2 py-2 bg-gray-900/50 hover:bg-gray-800 border border-gray-800 rounded-lg text-xs font-medium text-gray-400 hover:text-emerald-400 transition-all"
              >
                <ExternalLink className="w-3 h-3" />
                Apri Strumento
              </a>
            </div>
          ))}

          {filteredLinks.length === 0 && (
            <div className="col-span-full py-20 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-800/50 mb-4">
                <Search className="w-6 h-6 text-gray-600" />
              </div>
              <h3 className="text-gray-300 font-medium">Nessuno strumento nel Cloud</h3>
              <p className="text-gray-500 text-sm mt-1">Aggiungi il tuo primo strumento per iniziare.</p>
            </div>
          )}
        </div>

      </main>

      {/* Cloud Note */}
      <div className="fixed bottom-4 right-4 max-w-sm hidden lg:block">
        <div className="bg-[#18181b]/90 backdrop-blur border border-gray-800 p-3 rounded-lg shadow-2xl flex gap-3 items-center">
          <div className="p-2 bg-emerald-900/20 rounded-md">
            <Cloud className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <p className="text-xs text-gray-300 font-medium">Firebase Sync Attivo</p>
            <p className="text-[10px] text-gray-500">I dati sono salvati in tempo reale nel cloud.</p>
          </div>
        </div>
      </div>
    </div>
  );
}