
import React, { useState, useEffect, useRef } from 'react';
import { BillData, PackingStatus } from './types';
import { extractBillDetails } from './services/geminiService';
import { 
    getStoredBills, saveBillToStorage, deleteBillFromStorage, saveBillsToStorage, clearAllBills, 
    COLOR_PALETTE, compressImage, initSupabase, getSupabaseConfig, fullSync, isSupabaseConnected, disconnectSupabase
} from './services/storageService';
import BillCard from './components/BillCard';
import CameraCapture from './components/CameraCapture';
import DailyPlanner from './components/DailyPlanner';
import LoginScreen from './components/LoginScreen';
import * as XLSX from 'xlsx';
import { Camera, FileSpreadsheet, Plus, Calendar, Loader2, Clock, Archive, ListChecks, X, Trash2, CheckSquare, Palette, RotateCcw, ChevronLeft, ChevronRight, Image as ImageIcon, AlertOctagon, Save, Ban, AlertTriangle, Cloud, CloudOff, RefreshCw, Database, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Robust ID generation
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 6);

const getTodayDateString = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - (offset * 60 * 1000));
  return local.toISOString().split('T')[0];
};

const formatDateForDisplay = (dateStr: string) => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

const App: React.FC = () => {
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // App State
  const [allBills, setAllBills] = useState<BillData[]>([]);
  const [currentDate, setCurrentDate] = useState<string>(getTodayDateString());
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [processStatus, setProcessStatus] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  // Selection Mode State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Group Modal State
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState('');
  const [groupColorInput, setGroupColorInput] = useState('');

  // Duplicate Warning State
  const [duplicateAlert, setDuplicateAlert] = useState<{
      existing: BillData;
      newData: { customerName: string; address: string; invoiceNo: string; billDate: string };
      base64: string | undefined;
  } | null>(null);
  
  // Camera State
  const [showCamera, setShowCamera] = useState(false);

  // Daily Planner State
  const [showPlanner, setShowPlanner] = useState(false);

  // Cloud & Sync State
  const [showCloudSetup, setShowCloudSetup] = useState(false);
  const [cloudConfig, setCloudConfig] = useState({ url: '', key: '' });
  const [isCloudConnectedState, setIsCloudConnectedState] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Initial Load & Auth Check
  useEffect(() => {
    // Check Session (using specific key for this app to avoid collisions)
    const session = localStorage.getItem('grace_session');
    if (session === 'loggedin') {
        setIsAuthenticated(true);
    }

    // 1. Load Local Bills
    setAllBills(getStoredBills());

    // 2. Check Cloud Config
    const config = getSupabaseConfig();
    if (config) {
        initSupabase(config.url, config.key);
        setIsCloudConnectedState(true);
        handleSync(); // Auto sync on load
    }
  }, []);

  const handleLoginSuccess = () => {
      setIsAuthenticated(true);
  };

  const handleLogout = () => {
      if (window.confirm("Are you sure you want to logout?")) {
          localStorage.removeItem('grace_session');
          setIsAuthenticated(false);
      }
  };

  const handleSync = async () => {
      if (!isSupabaseConnected()) return;
      setIsSyncing(true);
      const synced = await fullSync();
      setAllBills(synced);
      setIsSyncing(false);
  };

  const handleConnectCloud = async () => {
      if (!cloudConfig.url || !cloudConfig.key) return alert("Please fill in both fields");
      
      const success = initSupabase(cloudConfig.url, cloudConfig.key);
      if (success) {
          setIsCloudConnectedState(true);
          setShowCloudSetup(false);
          await handleSync();
      } else {
          alert("Connection failed. Check console for details.");
      }
  };

  const handleDisconnectCloud = () => {
      disconnectSupabase();
      setIsCloudConnectedState(false);
      setCloudConfig({ url: '', key: '' });
      setShowCloudSetup(false);
  };

  // --- DATE NAVIGATION ---
  const navigateDate = (days: number) => {
    const date = new Date(currentDate);
    date.setDate(date.getDate() + days);
    setCurrentDate(date.toISOString().split('T')[0]);
  };

  // --- FILTERING LOGIC ---
  const todayNewBills = allBills
    .filter(b => b.entryDate === currentDate)
    .sort((a, b) => b.createdAt - a.createdAt);

  const backlogBills = allBills
    .filter(b => b.status === PackingStatus.PENDING && b.entryDate < currentDate)
    .sort((a, b) => a.entryDate.localeCompare(b.entryDate)); 

  // --- ACTIONS ---

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    if (isSelectionMode) setSelectedIds(new Set());
    setExpandedId(null);
  };

  const handleToggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const openGroupModal = () => {
      if (selectedIds.size === 0) return;
      const selectedBills = allBills.filter(b => selectedIds.has(b.id));
      const commonName = selectedBills.find(b => b.description)?.description || "";
      const commonColor = selectedBills.find(b => b.colorTheme)?.colorTheme || "";
      setGroupNameInput(commonName);
      setGroupColorInput(commonColor);
      setShowGroupModal(true);
  };

  const applyGroupSettings = () => {
      setShowGroupModal(false);
      
      const now = Date.now();
      const updates = allBills.map(b => {
          if (selectedIds.has(b.id)) {
              return { ...b, description: groupNameInput, colorTheme: groupColorInput || undefined, updatedAt: now };
          }
          return b;
      });
      
      setAllBills(updates);
      saveBillsToStorage(updates); // This now handles cloud sync implicitly for the whole batch isn't optimized but saves locally. 
      // Trigger full sync for batch update simplicity
      if (isCloudConnectedState) handleSync();
      
      setIsSelectionMode(false);
      setSelectedIds(new Set());
  };

  const handlePackSelected = () => {
    if (selectedIds.size === 0) return;
    if (window.confirm(`Mark ${selectedIds.size} bills as PACKED?`)) {
        const now = Date.now();
        const updates = allBills.map(b => {
            if (selectedIds.has(b.id)) {
                return { ...b, status: PackingStatus.PACKED, packedAt: now, updatedAt: now };
            }
            return b;
        });
        setAllBills(updates);
        saveBillsToStorage(updates);
        if (isCloudConnectedState) handleSync();

        setIsSelectionMode(false);
        setSelectedIds(new Set());
    }
  };

  const handleDeleteSelected = () => {
      if (selectedIds.size === 0) return;
      if (window.confirm(`Permanently delete ${selectedIds.size} bills?`)) {
          // Local Delete
          const updates = allBills.filter(b => !selectedIds.has(b.id));
          setAllBills(updates);
          saveBillsToStorage(updates);
          
          // Remote Delete Loop
          if (isCloudConnectedState) {
              selectedIds.forEach(id => deleteBillFromStorage(id)); // Reuse the single delete logic which handles remote
          }

          setIsSelectionMode(false);
          setSelectedIds(new Set());
      }
  }

  const handleClearAllData = () => {
    if (window.confirm("⚠️ WARNING: CLEAR ALL DATA? ⚠️\n\nThis will permanently delete all bills, images, and settings from this device.\n\nAre you sure?")) {
        if (window.confirm("Final Confirmation: This action cannot be undone. Delete everything?")) {
            clearAllBills();
            setAllBills([]);
        }
    }
  };

  // Helper to create and save bill after all checks
  const createBill = async (extracted: { customerName: string; address: string; invoiceNo: string; billDate: string }, base64Image?: string, manualData?: any) => {
    const newBill: BillData = {
      id: generateId(),
      imageUrl: base64Image || '', 
      customerName: extracted.customerName || '',
      address: extracted.address || '',
      invoiceNo: extracted.invoiceNo || '',
      billDate: extracted.billDate || '',
      status: PackingStatus.PENDING,
      isDelivery: false,
      hasCRN: false,
      isEditedBill: false,
      isAdditionalBill: false,
      boxCount: manualData?.boxCount || 0,
      description: manualData?.description || '', 
      entryDate: currentDate,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Update State & Storage
    const updatedBills = [newBill, ...allBills];
    setAllBills(updatedBills);
    await saveBillToStorage(newBill); // Handles Cloud Push
    setExpandedId(newBill.id);
  };

  const handleAddBill = async (file: File | null) => {
    setLoadingId('new');
    setProcessStatus('Compressing image...');
    
    let extracted = { customerName: '', address: '', invoiceNo: '', billDate: '' };
    let base64Image: string | undefined = undefined;

    try {
      if (file) {
          const reader = new FileReader();
          const rawBase64 = (await new Promise((resolve, reject) => {
              reader.onload = () => {
                  if (typeof reader.result === 'string') {
                      resolve(reader.result);
                  } else {
                      reject(new Error("Failed to read file"));
                  }
              };
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(file);
          })) as string;
          
          base64Image = await compressImage(rawBase64);
          
          setProcessStatus('Analyzing with AI...');
          extracted = await extractBillDetails(base64Image);

          // --- DUPLICATE CHECK LOGIC ---
          setProcessStatus('Checking for duplicates...');
          if (extracted.invoiceNo) {
              const normalizedNew = extracted.invoiceNo.trim().toLowerCase();
              if (normalizedNew.length > 0) {
                  const duplicate = allBills.find(b => b.invoiceNo && b.invoiceNo.trim().toLowerCase() === normalizedNew);
                  
                  if (duplicate) {
                      setLoadingId(null);
                      setProcessStatus('');
                      // TRIGGER POPUP
                      setDuplicateAlert({
                          existing: duplicate,
                          newData: extracted,
                          base64: base64Image
                      });
                      return; 
                  }
              }
          }
      }

      setProcessStatus('Saving bill...');
      await createBill(extracted, base64Image);
    } catch (error) {
      console.error(error);
      console.log("An error occurred processing the image.");
    } finally {
      if (!duplicateAlert) {
         setLoadingId(null);
         setProcessStatus('');
      }
    }
  };

  const handleManualQuickAdd = async (data: { customerName: string; invoiceNo: string; boxCount: number; description: string }) => {
      setLoadingId('new');
      setProcessStatus('Quick add...');
      await createBill({
          customerName: data.customerName,
          invoiceNo: data.invoiceNo,
          address: '',
          billDate: currentDate
      }, undefined, { boxCount: data.boxCount, description: data.description });
      setLoadingId(null);
      setProcessStatus('');
  };

  const handleConfirmDuplicate = async () => {
    if (duplicateAlert) {
        const { newData, base64 } = duplicateAlert;
        setDuplicateAlert(null); 
        setLoadingId('new_dup');
        setProcessStatus('Creating duplicate entry...');
        await createBill(newData, base64);
        setLoadingId(null);
        setProcessStatus('');
    }
  };

  const handleUpdateBill = async (updated: BillData) => {
    setAllBills(prev => prev.map(b => b.id === updated.id ? updated : b));
    await saveBillToStorage(updated);
  };

  const handleDeleteBill = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this bill?")) {
      await deleteBillFromStorage(id);
      setAllBills(prev => prev.filter(b => b.id !== id));
      if (expandedId === id) setExpandedId(null);
    }
  };

  const handleExportExcel = () => {
    const data = allBills.map(b => ({
      'Entry Date': b.entryDate,
      'Bill Date': b.billDate,
      'Customer Name': b.customerName,
      'Address': b.address,
      'Group Name': b.description,
      'Color Theme': b.colorTheme || 'Auto',
      'Invoice No': b.invoiceNo,
      'Status': b.status,
      'Packed At': b.packedAt ? new Date(b.packedAt).toLocaleString() : '',
      'Boxes': b.boxCount,
      'Delivery': b.isDelivery ? 'Yes' : 'No',
      'CRN': b.hasCRN ? 'Yes' : 'No',
      'Additional': b.isAdditionalBill ? 'Yes' : 'No',
      'Edited': b.isEditedBill ? 'Yes' : 'No',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Grace_Packing_Data");
    XLSX.writeFile(wb, `Grace_Packing_${currentDate}.xlsx`);
  };

  const handleCameraCapture = (file: File) => {
      handleAddBill(file);
  };

  // --- RENDER LOGIN SCREEN IF NOT AUTHENTICATED ---
  if (!isAuthenticated) {
      return <LoginScreen onLogin={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen pb-32 relative bg-[#f8f9fa]">
      
      {/* --- CAMERA FULLSCREEN --- */}
      <AnimatePresence>
        {showCamera && (
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[200] bg-black">
                <CameraCapture onCapture={handleCameraCapture} onClose={() => setShowCamera(false)} />
            </motion.div>
        )}
      </AnimatePresence>

      {/* --- HEADER --- */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-gray-200 shadow-sm px-4 py-3">
        <div className="flex justify-between items-center max-w-3xl mx-auto">
          <div>
            <h1 className="text-xl font-black text-black tracking-tight">Grace Best</h1>
            <button 
                onClick={() => setShowCloudSetup(true)}
                className={`flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 rounded-full transition-colors ${isCloudConnectedState ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
            >
               {isSyncing ? <RefreshCw size={10} className="animate-spin" /> : isCloudConnectedState ? <Cloud size={10} /> : <CloudOff size={10} />}
               {isSyncing ? 'Syncing...' : isCloudConnectedState ? 'Cloud Active' : 'Offline'}
            </button>
          </div>
          <div className="flex items-center gap-2">
             
             {/* Improved Date Navigator */}
             <div className="flex items-center bg-gray-100 rounded-xl p-1 mr-1">
                <button onClick={() => navigateDate(-1)} className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg text-black transition-all active:scale-90"><ChevronLeft size={18}/></button>
                <div className="relative flex items-center px-1 group overflow-hidden cursor-pointer">
                    <input type="date" value={currentDate} onChange={(e) => setCurrentDate(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"/>
                    <div className="flex items-center gap-1.5 px-2 py-1 pointer-events-none">
                      <Calendar size={16} className="text-gray-700"/>
                      <span className="text-sm font-bold text-black whitespace-nowrap">{formatDateForDisplay(currentDate)}</span>
                    </div>
                 </div>
                <button onClick={() => navigateDate(1)} className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg text-black transition-all active:scale-90"><ChevronRight size={18}/></button>
             </div>

             {currentDate !== getTodayDateString() && (
               <button onClick={() => setCurrentDate(getTodayDateString())} className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl font-bold hover:bg-indigo-200 transition-colors">
                  <RotateCcw size={18} />
               </button>
             )}
             
             <button onClick={() => setShowPlanner(true)} className={`p-2.5 rounded-xl transition-all ${showPlanner ? 'bg-black text-white shadow-lg' : 'bg-gray-100 text-black hover:bg-gray-200'}`} title="Planner & Chat">
                <ListChecks size={20} />
             </button>

             <button onClick={toggleSelectionMode} className={`p-2.5 rounded-xl transition-all ${isSelectionMode ? 'bg-black text-white shadow-lg scale-105' : 'bg-gray-100 text-black hover:bg-gray-200'}`} title="Select Multiple">
                <CheckSquare size={20} />
             </button>
             <button onClick={handleExportExcel} className="hidden sm:block p-2.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-xl transition-colors" title="Export Excel">
                <FileSpreadsheet size={20} />
             </button>
             <button onClick={handleClearAllData} className="p-2.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl transition-colors" title="Clear All Data">
                <Trash2 size={20} />
             </button>
             <button onClick={handleLogout} className="p-2.5 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-xl transition-colors" title="Logout">
                <LogOut size={20} />
             </button>
          </div>
        </div>
      </div>

      {/* Hidden Inputs */}
      <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={(e) => e.target.files?.[0] && handleAddBill(e.target.files[0])} className="hidden" />
      <input type="file" accept="image/*" ref={galleryInputRef} onChange={(e) => e.target.files?.[0] && handleAddBill(e.target.files[0])} className="hidden" />

      {/* --- DAILY PLANNER MODAL --- */}
      <AnimatePresence>
        {showPlanner && (
            <DailyPlanner 
                date={currentDate} 
                onClose={() => setShowPlanner(false)} 
                bills={todayNewBills}
                allBills={allBills}
                onDateChange={setCurrentDate}
                onQuickAdd={handleManualQuickAdd}
            />
        )}
      </AnimatePresence>

      <div className="max-w-3xl mx-auto p-4 space-y-6">
        
        <AnimatePresence mode="popLayout">
        
        {/* BACKLOG SECTION */}
        {backlogBills.length > 0 && (
            <motion.div layout initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="space-y-2">
                <div className="flex items-center gap-2 text-red-600 font-bold bg-red-50 p-3 rounded-xl border border-red-100">
                    <AlertTriangle size={18} /> <h2>Pending Backlog ({backlogBills.length})</h2>
                </div>
                <div className="space-y-2">
                    {backlogBills.map(bill => (
                        <BillCard 
                            key={bill.id} bill={bill} onChange={handleUpdateBill} onDelete={handleDeleteBill}
                            isExpanded={expandedId === bill.id} toggleExpand={() => setExpandedId(expandedId === bill.id ? null : bill.id)}
                            isSelectionMode={isSelectionMode} isSelected={selectedIds.has(bill.id)} onToggleSelect={() => handleToggleSelect(bill.id)}
                        />
                    ))}
                </div>
            </motion.div>
        )}

        {/* TODAY SECTION */}
        <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
                <h2 className="text-lg font-black text-black flex items-center gap-2">
                   <Clock size={18} className="text-black"/> 
                   {currentDate === getTodayDateString() ? "Today's Bills" : `Bills for ${formatDateForDisplay(currentDate)}`}
                </h2>
                <span className="text-xs font-bold text-gray-500 bg-white border border-gray-200 px-3 py-1 rounded-full shadow-sm">
                    {todayNewBills.length} Entries
                </span>
            </div>
            
            {/* --- LOADING INDICATOR --- */}
            {(loadingId === 'new' || loadingId === 'new_dup') && (
                <motion.div initial={{opacity:0, scale: 0.95}} animate={{opacity:1, scale: 1}} className="p-4 flex items-center gap-4 bg-white rounded-2xl shadow-lg border border-indigo-100 ring-1 ring-indigo-50">
                    <div className="relative flex items-center justify-center w-10 h-10 bg-indigo-50 rounded-full"><Loader2 size={20} className="text-indigo-600 animate-spin" /></div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-black text-black leading-tight">{loadingId === 'new_dup' ? 'Saving Duplicate' : 'Processing Bill'}</h3>
                        <div className="flex items-center gap-2 mt-1">
                             <div className="h-1 w-16 bg-gray-100 rounded-full overflow-hidden">
                                 <motion.div className="h-full bg-indigo-500" initial={{width: '10%'}} animate={{ width: processStatus.includes('Upload') ? '80%' : processStatus.includes('Anal') ? '50%' : '30%' }} transition={{ duration: 0.5 }}/>
                             </div>
                             <p className="text-xs font-bold text-indigo-500 truncate">{processStatus || 'Please wait...'}</p>
                        </div>
                    </div>
                </motion.div>
            )}

            {todayNewBills.length === 0 && !loadingId && (
                <div className="text-center py-16 bg-white rounded-3xl border border-gray-200 shadow-sm">
                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300"><Archive size={36} /></div>
                    <p className="text-black font-bold text-lg">No bills found</p>
                    <p className="text-gray-400 text-sm mt-1">{currentDate === getTodayDateString() ? "Tap the + button to start" : "Select a different date"}</p>
                </div>
            )}

            {todayNewBills.map(bill => (
                <BillCard 
                    key={bill.id} bill={bill} onChange={handleUpdateBill} onDelete={handleDeleteBill}
                    isExpanded={expandedId === bill.id} toggleExpand={() => setExpandedId(expandedId === bill.id ? null : bill.id)}
                    isSelectionMode={isSelectionMode} isSelected={selectedIds.has(bill.id)} onToggleSelect={() => handleToggleSelect(bill.id)}
                />
            ))}
        </div>
        </AnimatePresence>
      </div>

      {/* --- CLOUD SETUP MODAL --- */}
      <AnimatePresence>
      {showCloudSetup && (
        <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[300] bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4">
             <motion.div initial={{scale:0.9, y: 20}} animate={{scale:1, y: 0}} exit={{scale:0.9, y: 20}} className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl ring-1 ring-white/10">
                 <div className="flex justify-between items-start mb-4">
                     <div>
                         <h2 className="text-xl font-black mb-1 flex items-center gap-2"><Database size={24} className="text-indigo-600"/> Cloud Sync</h2>
                         <p className="text-sm text-gray-500">Connect to Supabase for multi-device sync.</p>
                     </div>
                     <button onClick={() => setShowCloudSetup(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 text-gray-500"><X size={18}/></button>
                 </div>

                 {!isCloudConnectedState ? (
                     <div className="space-y-4">
                        <div>
                             <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Project URL</label>
                             <input 
                                value={cloudConfig.url} onChange={e => setCloudConfig({...cloudConfig, url: e.target.value})}
                                placeholder="https://xyz.supabase.co"
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-medium text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                             />
                        </div>
                        <div>
                             <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">API Key (Anon)</label>
                             <input 
                                value={cloudConfig.key} onChange={e => setCloudConfig({...cloudConfig, key: e.target.value})}
                                placeholder="eyJh..."
                                type="password"
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-medium text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                             />
                        </div>
                        
                        <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 text-xs text-blue-800 leading-relaxed">
                            <strong className="block mb-1">Required Database Setup:</strong>
                            Create a table named <code>bills</code> with columns:
                            <ul className="list-disc pl-4 mt-1 space-y-0.5">
                                <li><code>id</code> (text, Primary Key)</li>
                                <li><code>data</code> (jsonb)</li>
                                <li><code>updated_at</code> (bigint)</li>
                            </ul>
                        </div>

                        <button onClick={handleConnectCloud} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all">
                            Connect
                        </button>
                     </div>
                 ) : (
                     <div className="text-center py-6 space-y-6">
                         <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto text-green-600">
                             <Cloud size={40} />
                         </div>
                         <div>
                             <h3 className="text-lg font-black text-gray-900">You're Connected!</h3>
                             <p className="text-sm text-gray-500">Your data is syncing automatically.</p>
                         </div>
                         <div className="flex gap-3">
                             <button onClick={handleSync} disabled={isSyncing} className="flex-1 py-3 bg-gray-100 text-gray-900 font-bold rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-2">
                                 <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} /> Sync Now
                             </button>
                             <button onClick={handleDisconnectCloud} className="flex-1 py-3 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 transition-colors">
                                 Disconnect
                             </button>
                         </div>
                     </div>
                 )}
             </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* --- DUPLICATE WARNING MODAL --- */}
      <AnimatePresence>
      {duplicateAlert && (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[250] flex items-center justify-center p-6 bg-gray-900/80 backdrop-blur-sm"
        >
           <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden ring-1 ring-white/20"
           >
              <div className="bg-orange-500 p-6 flex flex-col items-center text-center text-white">
                   <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-3 backdrop-blur-sm">
                      <AlertOctagon size={36} strokeWidth={2.5} />
                   </div>
                   <h2 className="text-2xl font-black mb-1">Duplicate Invoice</h2>
                   <p className="text-orange-100 text-sm font-medium">
                       Invoice <strong className="text-white px-1.5 py-0.5 bg-black/20 rounded">#{duplicateAlert.newData.invoiceNo}</strong> has already been scanned.
                   </p>
              </div>

              {/* Comparison View */}
              <div className="p-6">
                  <div className="flex items-stretch gap-2 mb-6">
                    {/* Existing Bill */}
                    <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-3 relative flex flex-col items-center text-center opacity-60">
                        <span className="absolute -top-3 bg-gray-200 text-gray-600 text-[9px] font-bold px-2 py-1 rounded-full uppercase tracking-wider">Previous</span>
                        <div className="h-16 w-full bg-gray-200 rounded-lg mb-2 overflow-hidden flex items-center justify-center">
                            {duplicateAlert.existing.imageUrl ? (
                                <img src={duplicateAlert.existing.imageUrl} className="w-full h-full object-cover" alt="Existing" />
                            ) : <ImageIcon size={20} className="text-gray-400"/>}
                        </div>
                        <div className="text-xs font-bold text-gray-900 truncate w-full">{duplicateAlert.existing.customerName}</div>
                        <div className="text-[10px] text-gray-500">{duplicateAlert.existing.billDate || 'No Date'}</div>
                    </div>

                    {/* New Bill */}
                    <div className="flex-1 bg-orange-50 border-2 border-orange-500 rounded-xl p-3 relative flex flex-col items-center text-center shadow-md">
                        <span className="absolute -top-3 bg-orange-500 text-white text-[9px] font-bold px-2 py-1 rounded-full uppercase tracking-wider shadow-sm">New Scan</span>
                        <div className="h-16 w-full bg-gray-200 rounded-lg mb-2 overflow-hidden flex items-center justify-center">
                            {duplicateAlert.base64 ? (
                                <img src={duplicateAlert.base64} className="w-full h-full object-cover" alt="New" />
                            ) : <ImageIcon size={20} className="text-gray-400"/>}
                        </div>
                        <div className="text-xs font-bold text-gray-900 truncate w-full">{duplicateAlert.newData.customerName || 'Scanning...'}</div>
                        <div className="text-[10px] text-gray-500">{duplicateAlert.newData.billDate || 'No Date'}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={() => setDuplicateAlert(null)}
                        className="py-3.5 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 hover:text-gray-900 transition-colors flex items-center justify-center gap-2"
                      >
                        <Ban size={18}/>
                        Ignore
                      </button>
                      <button 
                        onClick={handleConfirmDuplicate}
                        className="py-3.5 rounded-xl font-bold text-white bg-black hover:bg-gray-800 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-black/20"
                      >
                        <Save size={18} />
                        Save Copy
                      </button>
                  </div>
              </div>
           </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* --- GROUP ACTION MODAL --- */}
      <AnimatePresence>
      {showGroupModal && (
        <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[300] bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{scale:0.9, y: 20}} animate={{scale:1, y: 0}} exit={{scale:0.9, y: 20}} className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl ring-1 ring-white/10">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h2 className="text-xl font-black mb-1">Group Actions</h2>
                        <p className="text-sm text-gray-500">Editing {selectedIds.size} selected items</p>
                    </div>
                    <button onClick={() => setShowGroupModal(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 text-gray-500"><X size={18}/></button>
                </div>
                
                <div className="space-y-5">
                    <div>
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">Group Name / Shop</label>
                        <input 
                            value={groupNameInput}
                            onChange={(e) => setGroupNameInput(e.target.value)}
                            placeholder="e.g. Area 51 Shops"
                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-900 focus:ring-2 focus:ring-black/5 outline-none"
                        />
                    </div>

                    <div>
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">Color Theme</label>
                        <div className="flex flex-wrap gap-2">
                            {COLOR_PALETTE.map(c => (
                                <button
                                    key={c.name}
                                    onClick={() => setGroupColorInput(c.name)}
                                    className={`w-8 h-8 rounded-full border-2 transition-all ${c.bg} ${groupColorInput === c.name ? 'border-black scale-110 shadow-md ring-2 ring-black/10' : 'border-transparent hover:scale-105'}`}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex gap-3 mt-8">
                    <button onClick={() => setShowGroupModal(false)} className="flex-1 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-colors">Cancel</button>
                    <button onClick={applyGroupSettings} className="flex-1 py-3 rounded-xl font-bold text-white bg-black shadow-lg shadow-black/20 hover:scale-[1.02] transition-transform">Apply Changes</button>
                </div>
            </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* --- SELECTION BAR --- */}
      <AnimatePresence>
      {isSelectionMode && !showGroupModal && !duplicateAlert && (
          <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} className="fixed bottom-6 inset-x-4 max-w-3xl mx-auto bg-white text-gray-900 rounded-2xl p-2 shadow-2xl ring-1 ring-black/5 flex items-center justify-between z-40">
             <div className="flex items-center gap-3 px-4">
                <div className="bg-black text-white w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm">{selectedIds.size}</div>
                <span className="text-sm font-bold text-gray-500">Selected</span>
             </div>
             <div className="flex items-center gap-1">
                <button onClick={openGroupModal} disabled={selectedIds.size === 0} className="flex flex-col items-center justify-center p-2 px-4 rounded-xl active:bg-gray-100 disabled:opacity-30 transition-colors"><Palette size={22} className="text-indigo-600 mb-0.5"/><span className="text-[10px] font-bold">Group</span></button>
                <button onClick={handlePackSelected} disabled={selectedIds.size === 0} className="flex flex-col items-center justify-center p-2 px-4 rounded-xl active:bg-gray-100 disabled:opacity-30 transition-colors"><CheckSquare size={22} className="text-green-600 mb-0.5"/><span className="text-[10px] font-bold">Pack</span></button>
                <button onClick={handleDeleteSelected} disabled={selectedIds.size === 0} className="flex flex-col items-center justify-center p-2 px-4 rounded-xl active:bg-gray-100 disabled:opacity-30 transition-colors"><Trash2 size={22} className="text-red-500 mb-0.5"/><span className="text-[10px] font-bold">Delete</span></button>
                <div className="w-px h-8 bg-gray-200 mx-2"></div>
                <button onClick={toggleSelectionMode} className="p-3 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors"><X size={20} /></button>
             </div>
          </motion.div>
      )}
      </AnimatePresence>

      {/* --- STANDARD FAB --- */}
      <AnimatePresence>
      {!isSelectionMode && !duplicateAlert && !showPlanner && !showGroupModal && !showCloudSetup && (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="fixed bottom-8 right-6 flex flex-col gap-4 z-40">
            <button onClick={() => handleAddBill(null)} className="w-14 h-14 bg-white text-gray-900 rounded-2xl shadow-lg border border-gray-200 flex items-center justify-center hover:scale-105 active:scale-90 transition-all"><Plus size={28} strokeWidth={3} /></button>
            <button onClick={() => galleryInputRef.current?.click()} className="w-14 h-14 bg-white text-indigo-600 rounded-2xl shadow-lg border border-indigo-100 flex items-center justify-center hover:scale-105 active:scale-90 transition-all"><ImageIcon size={28} strokeWidth={2.5} /></button>
            <button onClick={() => setShowCamera(true)} className="w-16 h-16 bg-black text-white rounded-2xl shadow-2xl shadow-black/30 flex items-center justify-center hover:scale-105 active:scale-90 transition-all"><Camera size={32} strokeWidth={2} /></button>
          </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
};

export default App;
