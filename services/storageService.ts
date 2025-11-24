import { BillData } from '../types';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const STORAGE_KEY = 'grace_bills_data';
const SUPABASE_CONFIG_KEY = 'grace_supabase_config';

// --- IMAGE UTILS ---

export const compressImage = (base64Str: string, maxWidth = 800, quality = 0.7): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height *= maxWidth / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
        resolve(base64Str); // Return original if compression fails
    }
  });
};

// --- DATA OPERATIONS (LOCAL STORAGE) ---

export const getStoredBills = (): BillData[] => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) { 
        console.error("Failed to load bills:", e);
        return []; 
    }
};

export const saveBillsToStorage = (bills: BillData[]) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(bills));
    } catch (e) {
        console.error("Failed to save bills (likely quota exceeded):", e);
        alert("Storage full! Please delete some old bills or images.");
    }
};

export const saveBillToStorage = async (bill: BillData) => {
    const bills = getStoredBills();
    const index = bills.findIndex(b => b.id === bill.id);
    if (index >= 0) {
        bills[index] = bill;
    } else {
        bills.unshift(bill);
    }
    saveBillsToStorage(bills);
    
    // Attempt cloud sync
    if (supabase) {
        await syncUpItem(bill);
    }
};

export const deleteBillFromStorage = async (id: string) => {
    const bills = getStoredBills().filter(b => b.id !== id);
    saveBillsToStorage(bills);
    
    // Attempt cloud sync
    if (supabase) {
        await deleteRemoteItem(id);
    }
};

export const clearAllBills = () => {
    try {
        localStorage.removeItem(STORAGE_KEY);
        // We do NOT clear Supabase config here, only data
    } catch (e) {
        console.error("Failed to clear bills:", e);
    }
};

// --- SUPABASE INTEGRATION ---

let supabase: SupabaseClient | null = null;

export const getSupabaseConfig = () => {
    const stored = localStorage.getItem(SUPABASE_CONFIG_KEY);
    return stored ? JSON.parse(stored) : null;
};

export const initSupabase = (url: string, key: string) => {
    try {
        supabase = createClient(url, key);
        localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify({ url, key }));
        return true;
    } catch (e) {
        console.error("Supabase Init Error", e);
        return false;
    }
};

export const disconnectSupabase = () => {
    supabase = null;
    localStorage.removeItem(SUPABASE_CONFIG_KEY);
};

export const isSupabaseConnected = () => !!supabase;

// Sync logic: Fetch all from remote, merge with local (Last Write Wins), Update both.
export const fullSync = async (): Promise<BillData[]> => {
    if (!supabase) return getStoredBills();

    try {
        // 1. Fetch Remote
        const { data: remoteRows, error } = await supabase.from('bills').select('*');
        if (error) throw error;

        const remoteBills: BillData[] = remoteRows.map((r: any) => r.data);
        const localBills = getStoredBills();

        // 2. Merge
        const mergedMap = new Map<string, BillData>();
        
        // Add all local
        localBills.forEach(b => mergedMap.set(b.id, b));

        // Merge remote (Overwriting if remote.updatedAt > local.updatedAt)
        remoteBills.forEach(r => {
            const local = mergedMap.get(r.id);
            if (!local || r.updatedAt > local.updatedAt) {
                mergedMap.set(r.id, r);
            }
        });

        const mergedBills = Array.from(mergedMap.values()).sort((a, b) => b.createdAt - a.createdAt);

        // 3. Save to Local
        saveBillsToStorage(mergedBills);

        // 4. Push updates to Remote (Optimistic: just upsert everything that changed locally or is missing remotely)
        // For simplicity in this demo, we upsert items that were newer locally or missing remotely
        // To be 100% robust we'd diff, but looping upserts is acceptable for small datasets
        for (const bill of mergedBills) {
             const remote = remoteBills.find(r => r.id === bill.id);
             if (!remote || bill.updatedAt > remote.updatedAt) {
                 await syncUpItem(bill);
             }
        }

        return mergedBills;
    } catch (e) {
        console.error("Sync Error", e);
        return getStoredBills();
    }
};

export const syncUpItem = async (bill: BillData) => {
    if (!supabase) return;
    try {
        // We use a simple table structure: id (text, pk), data (jsonb), updated_at (bigint)
        const payload = {
            id: bill.id,
            data: bill,
            updated_at: bill.updatedAt
        };
        const { error } = await supabase.from('bills').upsert(payload);
        if (error) console.error("Upload Error", error);
    } catch (e) {
        console.error("Upload Exception", e);
    }
};

export const deleteRemoteItem = async (id: string) => {
    if (!supabase) return;
    try {
        const { error } = await supabase.from('bills').delete().eq('id', id);
        if (error) console.error("Delete Error", error);
    } catch (e) {
        console.error("Delete Exception", e);
    }
};


// --- COLOR PALETTE (UI Helpers) ---
export const COLOR_PALETTE = [
  { name: 'slate', bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-900', ring: 'ring-slate-500' },
  { name: 'red', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-900', ring: 'ring-red-500' },
  { name: 'orange', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-900', ring: 'ring-orange-500' },
  { name: 'amber', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-900', ring: 'ring-amber-500' },
  { name: 'green', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-900', ring: 'ring-emerald-500' },
  { name: 'teal', bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-900', ring: 'ring-teal-500' },
  { name: 'blue', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-900', ring: 'ring-blue-500' },
  { name: 'indigo', bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-900', ring: 'ring-indigo-500' },
  { name: 'purple', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-900', ring: 'ring-purple-500' },
  { name: 'pink', bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-900', ring: 'ring-pink-500' },
];

export const getThemeStyles = (colorName?: string, description?: string) => {
    if (colorName) {
        const found = COLOR_PALETTE.find(c => c.name === colorName);
        if (found) return found;
    }
    if (description && description.trim().length > 0) {
        let hash = 0;
        for (let i = 0; i < description.length; i++) {
          hash = description.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash) % COLOR_PALETTE.length;
        return COLOR_PALETTE[index];
    }
    return COLOR_PALETTE[0]; 
};