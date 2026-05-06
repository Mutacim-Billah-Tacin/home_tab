/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  Settings, 
  MessageSquare, 
  Plus, 
  Trash2, 
  ExternalLink, 
  CheckCircle2, 
  Circle,
  Clock,
  Cloud,
  Timer as TimerIcon,
  StickyNote,
  X,
  LogIn,
  LogOut,
  User as UserIcon,
  Loader2,
  Image as ImageIcon,
  AlarmClock,
  Bell,
  BellOff
} from 'lucide-react';
import { askGemini } from './lib/gemini';
import { 
  auth, 
  db, 
  loginWithGoogle, 
  logout, 
  handleFirestoreError, 
  OperationType 
} from './lib/firebase';
import { 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  setDoc,
  getDoc
} from 'firebase/firestore';
import type { Task, Note, Bookmark, Category, Alarm } from './types';

// Components
const GlassCard = ({ children, className = "", title = "", delay = 0 }: { children: React.ReactNode, className?: string, title?: string, delay?: number }) => (
  <motion.div 
    initial={{ opacity: 0, y: 20, scale: 0.98 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ 
      type: "spring",
      stiffness: 260,
      damping: 20,
      delay
    }}
    whileHover={{ y: -2, transition: { duration: 0.2 } }}
    className={`group/card bg-black/85 backdrop-blur-3xl border border-white/10 rounded-3xl p-6 shadow-2xl hover:border-white/20 transition-colors ${className}`}
  >
    {title && <h3 className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] mb-4 group-hover/card:text-white/60 transition-colors">{title}</h3>}
    {children}
  </motion.div>
);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [bgImage, setBgImage] = useState('https://images.unsplash.com/photo-1477346611705-65d1883cee1e?auto=format&fit=crop&q=80&w=2070');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [note, setNote] = useState<Note | null>(null);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAddingBookmark, setIsAddingBookmark] = useState(false);
  const [newBookmark, setNewBookmark] = useState({ title: '', url: '', category: 'General' });
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeTab, setActiveTab] = useState('All');
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [isAddingAlarm, setIsAddingAlarm] = useState(false);
  const [newAlarm, setNewAlarm] = useState({ time: '08:00', label: 'Wake up' });
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [messages, setMessages] = useState<{role: 'user' | 'ai', content: string}[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Pomodoro State
  const [timerStatus, setTimerStatus] = useState<'idle' | 'running' | 'paused'>('idle');
  const [timeLeft, setTimeLeft] = useState(25 * 60);

  // Auth & Data Subscription
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        // Only initialize if needed to satisfy 'isValidUser' and avoid redundant writes
        try {
          const userDoc = doc(db, 'users', u.uid);
          const userSnap = await getDoc(userDoc);
          if (!userSnap.exists()) {
            await setDoc(userDoc, {
              email: u.email || '',
              displayName: u.displayName || 'User',
              photoURL: u.photoURL || '',
              createdAt: serverTimestamp(),
            });
          }
        } catch (err) {
          console.error("User initialization failed:", err);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setTasks([]);
      setBookmarks([]);
      setNote(null);
      return;
    }

    // Tasks Sync
    const taskQuery = query(collection(db, 'tasks'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsubTasks = onSnapshot(taskQuery, (snapshot) => {
      setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'tasks'));

    // Bookmarks Sync
    const bookmarkQuery = query(collection(db, 'bookmarks'), where('userId', '==', user.uid), orderBy('createdAt', 'asc'));
    const unsubBookmarks = onSnapshot(bookmarkQuery, (snapshot) => {
      setBookmarks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bookmark)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'bookmarks'));

    // Note Sync (just one note for now)
    const noteQuery = query(collection(db, 'notes'), where('userId', '==', user.uid));
    const unsubNote = onSnapshot(noteQuery, (snapshot) => {
      if (!snapshot.empty) {
        setNote({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Note);
      } else {
        setNote(null);
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'notes'));

    // User Data Sync (lastWallpaper)
    const userRef = doc(db, 'users', user.uid);
    const unsubUser = onSnapshot(userRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        if (data.lastWallpaper) {
          // Only apply if it's different from the local one or if it's the first load
          const currentPref = localStorage.getItem('wallpaper_pref');
          if (data.lastWallpaper !== currentPref) {
             applyWallpaper(data.lastWallpaper, true);
          }
        }
      }
    });

    // Categories Sync
    const categoryQuery = query(collection(db, 'categories'), where('userId', '==', user.uid), orderBy('createdAt', 'asc'));
    const unsubCategories = onSnapshot(categoryQuery, (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'categories'));

    // Alarms Sync
    const alarmQuery = query(collection(db, 'alarms'), where('userId', '==', user.uid), orderBy('time', 'asc'));
    const unsubAlarms = onSnapshot(alarmQuery, (snapshot) => {
      setAlarms(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Alarm)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'alarms'));

    return () => {
      unsubTasks();
      unsubBookmarks();
      unsubNote();
      unsubUser();
      unsubCategories();
      unsubAlarms();
    };
  }, [user]);

  const addCategory = useCallback(async () => {
    if (!user || !newCategoryName.trim()) return;
    try {
      await addDoc(collection(db, 'categories'), {
        name: newCategoryName.trim(),
        userId: user.uid,
        createdAt: serverTimestamp()
      });
      setNewCategoryName('');
      setIsAddingCategory(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'categories');
    }
  }, [user, newCategoryName]);

  const deleteCategory = useCallback(async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'categories', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'categories');
    }
  }, [user]);

  const addAlarm = useCallback(async () => {
    if (!user || !newAlarm.time) return;
    try {
      await addDoc(collection(db, 'alarms'), {
        time: newAlarm.time,
        label: newAlarm.label || 'Alarm',
        enabled: true,
        userId: user.uid,
        createdAt: serverTimestamp()
      });
      setIsAddingAlarm(false);
      setNewAlarm({ time: '08:00', label: 'Wake up' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'alarms');
    }
  }, [user, newAlarm]);

  const toggleAlarm = useCallback(async (id: string, enabled: boolean) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'alarms', id), { enabled: !enabled });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'alarms');
    }
  }, [user]);

  const deleteAlarm = useCallback(async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'alarms', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'alarms');
    }
  }, [user]);

  const playAlarmSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1);
      oscillator.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.2);
      
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);

      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
      console.error('Audio context error:', e);
    }
  };

  // Alarm check effect
  useEffect(() => {
    const checkAlarms = () => {
      const now = new Date();
      const currentH = now.getHours().toString().padStart(2, '0');
      const currentM = now.getMinutes().toString().padStart(2, '0');
      const currentTimeStr = `${currentH}:${currentM}`;

      alarms.forEach(alarm => {
        if (alarm.enabled && alarm.time === currentTimeStr && now.getSeconds() === 0) {
          playAlarmSound();
          
          if ('Notification' in window) {
            if (Notification.permission === 'granted') {
              new Notification(`Alarm: ${alarm.label}`, { 
                body: `It's ${alarm.time}!`,
                icon: '/favicon.ico'
              });
            } else if (Notification.permission !== 'denied') {
              Notification.requestPermission();
            }
          }
        }
      });
    };

    const interval = setInterval(checkAlarms, 1000);
    return () => clearInterval(interval);
  }, [alarms]);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const menu = document.getElementById('system-menu-container');
      if (menu && !menu.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getFavicon = (url: string) => {
    try {
      const domain = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;
    } catch {
      return null;
    }
  };

  // Pomodoro Logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timerStatus === 'running' && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    } else if (timeLeft === 0) {
      setTimerStatus('idle');
      // No alert, just reset
    }
    return () => clearInterval(interval);
  }, [timerStatus, timeLeft]);

  const toggleTimer = () => {
    setTimerStatus(prev => prev === 'running' ? 'paused' : 'running');
  };

  const resetTimer = () => {
    setTimerStatus('idle');
    setTimeLeft(25 * 60);
  };

  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);

  // Search Suggestions Logic
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (searchQuery.length < 2) {
        setSuggestions([]);
        return;
      }
      try {
        const response = await fetch(`/api/suggestions?q=${encodeURIComponent(searchQuery)}`);
        const data = await response.json();
        setSuggestions(data || []);
        setActiveSuggestionIndex(-1);
      } catch (error) {
        console.error("Suggestions fetch error:", error);
      }
    };

    const debounceTimer = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery]);

  const handleSuggestionClick = (suggestion: string) => {
    window.location.href = `https://www.google.com/search?q=${encodeURIComponent(suggestion)}`;
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestionIndex(prev => Math.min(prev + 1, suggestions.slice(0, 8).length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestionIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && activeSuggestionIndex >= 0) {
      e.preventDefault();
      handleSuggestionClick(suggestions[activeSuggestionIndex]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleTask = useCallback(async (id: string, completed: boolean) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'tasks', id), { completed: !completed });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `tasks/${id}`);
    }
  }, [user]);

  const addTask = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const form = e.currentTarget;
    const input = form.elements.taskName as HTMLInputElement;
    if (!input.value.trim()) return;
    
    const taskText = input.value.trim();
    const taskCategory = activeTab === 'All' ? 'General' : activeTab;
    
    try {
      await addDoc(collection(db, 'tasks'), {
        text: taskText,
        completed: false,
        category: taskCategory,
        userId: user.uid,
        createdAt: serverTimestamp()
      });
      form.reset();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'tasks');
    }
  }, [user, activeTab]);

  const deleteTask = useCallback(async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'tasks', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `tasks/${id}`);
    }
  }, [user]);

  const handleAddBookmark = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newBookmark.title || !newBookmark.url) return;

    try {
      const finalUrl = newBookmark.url.startsWith('http') ? newBookmark.url : `https://${newBookmark.url}`;
      await addDoc(collection(db, 'bookmarks'), {
        title: newBookmark.title,
        url: finalUrl,
        userId: user.uid,
        category: activeTab,
        createdAt: serverTimestamp()
      });
      setNewBookmark({ title: '', url: '', category: 'General' });
      setIsAddingBookmark(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'bookmarks');
    }
  }, [user, newBookmark, activeTab]);

  const deleteBookmark = useCallback(async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'bookmarks', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `bookmarks/${id}`);
    }
  }, [user]);

  const updateNote = async (content: string) => {
    if (!user) return;
    try {
      if (note?.id) {
        await updateDoc(doc(db, 'notes', note.id), { content, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, 'notes'), { content, userId: user.uid, updatedAt: serverTimestamp() });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'notes');
    }
  };

  const noteTimeout = useRef<NodeJS.Timeout | null>(null);
  const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const content = e.target.value;
    if (noteTimeout.current) clearTimeout(noteTimeout.current);
    noteTimeout.current = setTimeout(() => {
      updateNote(content);
    }, 1000);
  };

  const handleAiSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!aiInput.trim() || isAiLoading) return;

    const userMessage = aiInput;
    setAiInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsAiLoading(true);

    const response = await askGemini(userMessage);
    setMessages(prev => [...prev, { role: 'ai', content: response || "I'm not sure how to answer that." }]);
    setIsAiLoading(false);
  };

  const [bgChoice, setBgChoice] = useState('nature');
  const [customBgSearch, setCustomBgSearch] = useState('');
  const [isWallpaperSearching, setIsWallpaperSearching] = useState(false);

  const [isWallpaperLoading, setIsWallpaperLoading] = useState(false);

  const applyWallpaper = (query: string, skipCloudSync = false) => {
    setIsWallpaperLoading(true);
    const timestamp = Date.now();
    // Use a clean Unsplash featured pattern
    const url = `https://images.unsplash.com/featured/1920x1080?${encodeURIComponent(query)}&sig=${timestamp}`;
    
    const img = new Image();
    img.src = url;
    img.onload = () => {
      setBgImage(url);
      setIsWallpaperLoading(false);
    };
    img.onerror = () => {
      // Quiet fallback
      const fallbackUrl = `https://picsum.photos/1920/1080?random=${timestamp}`;
      setBgImage(fallbackUrl);
      setIsWallpaperLoading(false);
    };
    
    localStorage.setItem('wallpaper_pref', query);
    
    // Save to Firestore if authenticated and not skipped
    if (user && !skipCloudSync) {
      setDoc(doc(db, 'users', user.uid), { 
        lastWallpaper: query,
        updatedAt: serverTimestamp() 
      }, { merge: true }).catch(() => {
        // Quietly handle sync issues
      });
    }
  };

  // Load saved wallpaper
  useEffect(() => {
    const saved = localStorage.getItem('wallpaper_pref');
    if (saved) {
      applyWallpaper(saved);
    }
  }, []);

  const randomizeBg = () => {
    const categories = [
      'nature', 'space', 'minimal', 'architecture', 'abstract', 
      'textures', 'dark', 'mountains', 'ocean', 'forest', 
      'urban', 'macro', 'nebula', 'desert', 'volcano'
    ];
    // Filter out the current category to ensure a change if possible
    const currentCat = localStorage.getItem('wallpaper_pref') || 'nature';
    const filtered = categories.filter(c => c !== currentCat);
    const randomCat = filtered[Math.floor(Math.random() * filtered.length)];
    applyWallpaper(randomCat);
  };

  return (
    <div 
      className="min-h-screen bg-cover bg-center bg-no-repeat transition-all duration-1000 relative overflow-hidden font-sans"
      style={{ backgroundImage: `url(${bgImage})` }}
    >
      {/* Overlay for better readability */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
      
      {/* Wallpaper Loading State */}
      <AnimatePresence>
        {isWallpaperLoading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/20 flex flex-col items-center justify-center z-[5] backdrop-blur-[4px]"
          >
            <Loader2 className="w-12 h-12 text-white/50 animate-spin mb-4" />
            <span className="text-white/40 text-xs font-bold uppercase tracking-[0.3em]">Redefining Atmosphere</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unified System Menu - Top Right */}
      <div className="fixed top-8 right-8 z-[50]" id="system-menu-container">
        <div className="relative">
          <button 
            id="system-menu-trigger"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={`w-14 h-14 backdrop-blur-3xl border rounded-2xl flex items-center justify-center transition-all shadow-2xl group ${
              isMenuOpen 
                ? 'bg-black/80 border-white/40 scale-95' 
                : 'bg-black/60 border-white/20 text-white/80 hover:bg-black/70'
            }`}
          >
            {user ? (
               <img src={user.photoURL || ''} className="w-9 h-9 rounded-full border-2 border-white/30 shadow-lg" alt="Menu" />
            ) : (
               <Settings className={`w-6 h-6 transition-transform duration-500 ${isMenuOpen ? 'rotate-90 text-white' : 'group-hover:rotate-45'}`} />
            )}
          </button>

          {/* Expanded Menu Dropdown */}
          <AnimatePresence>
            {isMenuOpen && (
              <motion.div 
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute top-full right-0 mt-4 w-72 bg-black/60 backdrop-blur-[50px] border border-white/20 rounded-[32px] overflow-hidden shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] z-50"
              >
                {/* Profile Header */}
                <div className="p-6 border-b border-white/10 bg-white/5">
                  {user ? (
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <img src={user.photoURL || ''} className="w-12 h-12 rounded-full border-2 border-white/30" alt="Avatar" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-white font-bold text-base truncate">{user.displayName}</span>
                        <span className="text-white/40 text-[10px] font-medium truncate">{user.email}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-white/40 text-[11px] font-bold uppercase tracking-widest mb-3">Welcome</p>
                      <button 
                        onClick={() => {
                          loginWithGoogle();
                          setIsMenuOpen(false);
                        }}
                        className="w-full flex items-center justify-center gap-3 py-3 bg-white text-black font-bold text-sm rounded-2xl hover:bg-white/90 active:scale-95 transition-all shadow-lg"
                      >
                        <svg viewBox="0 0 24 24" className="w-5 h-5"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                        Continue with Google
                      </button>
                    </div>
                  )}
                </div>

                {/* Menu Items */}
                <div className="p-3 space-y-1">
                  <button 
                    onClick={() => {
                      randomizeBg();
                      // Keep menu open for feedback if loading
                    }}
                    disabled={isWallpaperLoading}
                    className="w-full h-12 flex items-center justify-between px-4 text-white/70 hover:text-white hover:bg-white/10 rounded-2xl transition-all group/item disabled:opacity-50 disabled:cursor-not-wait"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center group-hover/item:bg-white/15 transition-colors">
                        {isWallpaperLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin text-white/40" />
                        ) : (
                          <ImageIcon className="w-4 h-4 group-hover/item:rotate-12 transition-transform" />
                        )}
                      </div>
                      <span className="text-xs font-bold uppercase tracking-wider">Atmosphere</span>
                    </div>
                    <div className="text-[10px] text-white/20 font-bold">
                      {isWallpaperLoading ? 'Loading...' : 'Shuffle'}
                    </div>
                  </button>

                  <button 
                    onClick={() => {
                      setIsAiOpen(true);
                      setIsMenuOpen(false);
                    }}
                    className="w-full h-12 flex items-center justify-between px-4 text-white/70 hover:text-white hover:bg-white/10 rounded-2xl transition-all group/ai"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-xl ${isAiOpen ? 'bg-indigo-500' : 'bg-white/5'} flex items-center justify-center transition-colors`}>
                        <MessageSquare className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold uppercase tracking-wider">AI Assistant</span>
                    </div>
                  </button>
                </div>
                
                {/* Bottom Footer - Sign Out and version */}
                <div className="px-6 py-4 bg-white/5 flex items-center justify-between border-t border-white/5">
                  {user ? (
                    <button 
                      onClick={() => {
                        logout();
                        setIsMenuOpen(false);
                      }}
                      className="flex items-center gap-2 text-red-400 hover:text-red-300 transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span className="text-[11px] font-bold uppercase tracking-widest">Sign Out</span>
                    </button>
                  ) : (
                    <span className="text-[10px] text-white/20 font-bold uppercase tracking-widest">v1.2.0</span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Main Content */}
      <main className="relative z-10 p-8 max-w-7xl mx-auto min-h-screen grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-6">
        
        {/* Top Header Section (Clock & Search) */}
        <div className="md:col-span-4 lg:col-span-6 flex flex-col items-center justify-center py-12">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center mb-10"
          >
            <h1 className="text-9xl font-black text-white tracking-tighter mb-2 drop-shadow-[0_20px_70px_rgba(0,0,0,0.7)]">
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </h1>
            <p className="text-white font-black text-2xl tracking-[0.6em] uppercase drop-shadow-[0_8px_16px_rgba(0,0,0,0.5)]">
              {currentTime.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </motion.div>

          <form 
            action="https://www.google.com/search" 
            method="GET"
            className="w-full max-w-3xl relative group"
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          >
            <div className="absolute left-7 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center pointer-events-none scale-125">
               <svg viewBox="0 0 24 24" className="w-full h-full drop-shadow-sm">
                 <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                 <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                 <path d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" fill="#FBBC05"/>
                 <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
               </svg>
            </div>
            <div className="relative w-full">
              <input 
                id="google-search-input"
                name="q"
                type="text" 
                value={searchQuery}
                onKeyDown={handleSearchKeyDown}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                placeholder="Search with Google..." 
                className="w-full bg-black/60 backdrop-blur-3xl border border-white/10 rounded-full py-6 px-20 text-xl text-white placeholder:text-white/50 focus:outline-none focus:ring-4 focus:ring-white/10 transition-all shadow-2xl group-hover:bg-black/70"
                autoComplete="off"
              />
              
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-7 top-1/2 -translate-y-1/2 p-2 text-white/30 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
            
            <AnimatePresence>
              {showSuggestions && suggestions.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute top-full left-0 right-0 mt-4 bg-black/60 backdrop-blur-3xl border border-white/20 rounded-3xl overflow-hidden z-50 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)]"
                >
                  {suggestions.slice(0, 8).map((suggestion, index) => (
                    <button
                      key={index}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()} // Prevent blur before click
                      onClick={() => handleSuggestionClick(suggestion)}
                      className={`w-full text-left px-8 py-4 flex items-center gap-4 transition-all text-lg first:pt-6 last:pb-6 ${
                        activeSuggestionIndex === index 
                          ? 'bg-white/20 text-white' 
                          : 'text-white/80 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <Search className={`w-5 h-5 transition-colors ${activeSuggestionIndex === index ? 'text-white' : 'text-white/30'}`} />
                      <span className="font-medium">{suggestion}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </form>
        </div>

        {/* Bento Grid */}
        <div className="md:col-span-4 lg:col-span-6 grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-6">
          {/* Quick Links */}
          <GlassCard className="md:col-span-4 lg:col-span-4" title="Shortcuts" delay={0.1}>
            <div className="flex flex-col gap-4 mb-6">
              <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
                <button
                  onClick={() => setActiveTab('All')}
                  className={`relative px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap overflow-hidden ${
                    activeTab === 'All' 
                      ? 'text-black shadow-lg shadow-white/10' 
                      : 'text-white/40 hover:text-white/60 bg-white/5'
                  }`}
                >
                  {activeTab === 'All' && (
                    <motion.div 
                      layoutId="activeTab"
                      className="absolute inset-0 bg-white shadow-lg shadow-white/10"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <span className="relative z-10">All</span>
                </button>
                {categories.map((cat) => (
                  <motion.div layout key={cat.id} className="relative group">
                    <button
                      onClick={() => setActiveTab(cat.name)}
                      className={`relative flex items-center pl-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap overflow-hidden ${
                        activeTab === cat.name 
                          ? 'text-black pr-4' 
                          : 'text-white/40 hover:text-white/60 bg-white/5 pr-4 group-hover:pr-3'
                      }`}
                    >
                      {activeTab === cat.name && (
                        <motion.div 
                          layoutId="activeTab"
                          className="absolute inset-0 bg-white shadow-lg shadow-white/10"
                          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                        />
                      )}
                      <span className="relative z-10">{cat.name}</span>
                      {user && (
                        <span 
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteCategory(e, cat.id!);
                          }}
                          className={`relative z-20 overflow-hidden transition-all duration-300 flex items-center justify-center max-w-0 opacity-0 group-hover:max-w-[20px] group-hover:opacity-100 group-hover:ml-2 p-0 rounded-full hover:bg-black/10 ${
                            activeTab === cat.name ? 'text-black/30 hover:text-black' : 'text-white/20 hover:text-white'
                          }`}
                        >
                          <X className="w-2.5 h-2.5 flex-shrink-0" />
                        </span>
                      )}
                    </button>
                  </motion.div>
                ))}
                <button 
                  onClick={() => setIsAddingCategory(true)}
                  className="w-8 h-8 flex-shrink-0 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all border border-white/5"
                  title="Add Category"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>

              <AnimatePresence>
                {isAddingCategory && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex gap-2 overflow-hidden"
                  >
                    <input
                      autoFocus
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Category name..."
                      className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addCategory();
                        if (e.key === 'Escape') setIsAddingCategory(false);
                      }}
                    />
                    <button 
                      onClick={addCategory}
                      className="px-3 py-1 bg-white text-black text-[10px] font-bold uppercase rounded-lg"
                    >
                      Save
                    </button>
                    <button 
                      onClick={() => setIsAddingCategory(false)}
                      className="px-3 py-1 bg-white/5 text-white/40 text-[10px] font-bold uppercase rounded-lg"
                    >
                      Cancel
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-4">
              <AnimatePresence mode="popLayout">
                {isAddingBookmark && (
                  <motion.form 
                    layout
                    initial={{ opacity: 0, scale: 0.9, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 10 }}
                    onSubmit={handleAddBookmark}
                    className="p-4 bg-black/40 border border-white/10 backdrop-blur-3xl rounded-2xl flex flex-col gap-2 z-20 shadow-2xl relative"
                  >
                    <button 
                      type="button" 
                      onClick={() => setIsAddingBookmark(false)}
                      className="absolute top-3 right-3 p-1 text-white/40 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <input 
                      autoFocus
                      placeholder="Title" 
                      value={newBookmark.title}
                      onChange={(e) => setNewBookmark({ ...newBookmark, title: e.target.value })}
                      className="bg-black/20 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
                    />
                    <input 
                      placeholder="URL (e.g. google.com)" 
                      value={newBookmark.url}
                      onChange={(e) => setNewBookmark({ ...newBookmark, url: e.target.value })}
                      className="bg-black/20 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
                    />

                    <button type="submit" className="bg-white text-black text-xs font-bold py-1.5 rounded-lg mt-1 hover:bg-white/90">
                      Add
                    </button>
                  </motion.form>
                )}

                {bookmarks
                  .filter(b => activeTab === 'All' || b.category === 'All' || b.category === activeTab || (!b.category && activeTab === 'General'))
                  .map((bookmark, index) => (
                  <motion.a 
                    layout
                    initial={{ opacity: 0, scale: 0.9, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ 
                      type: "spring", 
                      stiffness: 300, 
                      damping: 30,
                      delay: Math.min(index * 0.05, 0.3) 
                    }}
                    key={bookmark.id}
                    href={bookmark.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl flex items-center gap-3 transition-all relative overflow-hidden group/bookmark"
                  >
                    <div id="bookmark-icon-container" className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center group-hover/bookmark:scale-110 transition-all overflow-hidden p-1 shadow-lg shadow-black/20">
                      {getFavicon(bookmark.url) ? (
                        <img src={getFavicon(bookmark.url)!} className="w-6 h-6 object-contain" alt="" referrerPolicy="no-referrer" />
                      ) : (
                        <ExternalLink className="w-5 h-5 text-white/50" />
                      )}
                    </div>
                    <span className="text-white font-semibold truncate group-hover/bookmark:translate-x-1 transition-transform">{bookmark.title}</span>
                    {user && (
                        <button 
                            onClick={(e) => deleteBookmark(e, bookmark.id!)}
                            className="absolute top-2 right-2 p-1.5 text-white/20 hover:text-red-400 hover:bg-red-500/10 rounded-lg opacity-0 group-hover/bookmark:opacity-100 transition-all duration-200"
                            title="Remove Bookmark"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                  </motion.a>
                ))}
                {!isAddingBookmark && (
                  <motion.button 
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => setIsAddingBookmark(true)}
                    className="p-4 border-2 border-dashed border-white/10 rounded-2xl flex items-center justify-center text-white/40 hover:text-white/60 hover:border-white/20 transition-all aspect-square sm:aspect-auto"
                  >
                    <Plus className="w-6 h-6" />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </GlassCard>

          {/* Tasks Widget */}
          <GlassCard className="md:col-span-2 lg:col-span-2 row-span-2" title="Daily Tasks" delay={0.25}>
            <form onSubmit={addTask} className="mb-4">
              <div className="relative">
                <input 
                  name="taskName"
                  type="text" 
                  placeholder="Add task..." 
                  className="w-full bg-black/20 border border-white/10 rounded-xl py-2 px-4 text-white text-sm focus:outline-none focus:ring-1 focus:ring-white/30"
                />
                <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/40 hover:text-white">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </form>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
              <AnimatePresence mode="popLayout">
                {tasks.length === 0 && (
                  <motion.p 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-white/20 text-center py-8 italic"
                  >
                    No tasks found in this view
                  </motion.p>
                )}
                {tasks
                  .filter(t => activeTab === 'All' || t.category === activeTab || (!t.category && activeTab === 'General'))
                  .map((task, index) => (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ 
                      type: "spring", 
                      stiffness: 400, 
                      damping: 30,
                      delay: Math.min(index * 0.03, 0.2)
                    }}
                    key={task.id}
                    whileHover={{ x: 4, backgroundColor: "rgba(255, 255, 255, 0.1)" }}
                    className="flex items-center gap-3 p-3 bg-white/5 rounded-xl group transition-colors"
                  >
                    <button onClick={() => toggleTask(task.id!, task.completed!)} className="relative flex items-center justify-center">
                      <AnimatePresence mode="wait">
                        {task.completed ? (
                          <motion.div 
                            key="completed"
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.5, opacity: 0 }}
                          >
                            <CheckCircle2 className="w-5 h-5 text-green-400" />
                          </motion.div>
                        ) : (
                          <motion.div 
                            key="pending"
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.5, opacity: 0 }}
                          >
                            <Circle className="w-5 h-5 text-white/30" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </button>
                    <span className={`flex-1 text-sm ${task.completed ? 'text-white/30 line-through' : 'text-white/80'}`}>{task.text}</span>
                    <button onClick={() => deleteTask(task.id!)} className="opacity-0 group-hover:opacity-100 p-1 text-white/20 hover:text-red-400 transition-all">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </GlassCard>

          {/* Alarms Widget */}
          <GlassCard className="md:col-span-2 lg:col-span-2" title="Alarms" delay={0.4}>
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex flex-col">
                <span className="text-[10px] text-white/40 font-bold uppercase tracking-wider">Active reminders</span>
                <button 
                  onClick={playAlarmSound}
                  className="text-[9px] text-white/20 hover:text-white/60 transition-colors text-left"
                >
                  Test Sound
                </button>
              </div>
              <button 
                onClick={() => setIsAddingAlarm(!isAddingAlarm)}
                className="w-7 h-7 bg-white/5 hover:bg-white/20 rounded-lg flex items-center justify-center text-white transition-all shadow-lg shadow-white/5"
              >
                <Plus className={`w-4 h-4 transition-transform ${isAddingAlarm ? 'rotate-45' : ''}`} />
              </button>
            </div>

            <AnimatePresence>
              {isAddingAlarm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col gap-2 overflow-hidden"
                >
                  <div className="flex gap-2">
                    <input 
                      type="time"
                      value={newAlarm.time}
                      onChange={(e) => setNewAlarm({ ...newAlarm, time: e.target.value })}
                      className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none flex-1"
                    />
                    <input 
                      placeholder="Label"
                      value={newAlarm.label}
                      onChange={(e) => setNewAlarm({ ...newAlarm, label: e.target.value })}
                      className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none flex-[2]"
                    />
                  </div>
                  <button 
                    onClick={addAlarm}
                    className="w-full py-1.5 bg-white text-black text-[10px] font-bold uppercase rounded-lg hover:bg-white/90"
                  >
                    Set Alarm
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1 custom-scrollbar">
              <AnimatePresence mode="popLayout">
                {alarms.length === 0 && !isAddingAlarm && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center py-8 text-white/20"
                  >
                    <AlarmClock className="w-8 h-8 mb-2 opacity-50" />
                    <p className="text-xs italic">No Alarms Set</p>
                  </motion.div>
                )}
                {alarms.map(alarm => (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    key={alarm.id}
                    className={`group p-3 rounded-xl border border-white/5 flex items-center justify-between transition-all ${
                      alarm.enabled ? 'bg-white/5 shadow-inner shadow-white/5' : 'bg-black/20 opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        alarm.enabled ? 'bg-white/10 text-white' : 'bg-white/5 text-white/20'
                      }`}>
                        {alarm.enabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="text-sm font-mono font-bold text-white leading-none mb-1">{alarm.time}</div>
                        <div className="text-[10px] text-white/40 uppercase tracking-widest font-medium">{alarm.label}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => toggleAlarm(alarm.id!, alarm.enabled)}
                        className={`w-10 h-5 rounded-full transition-all relative ${
                          alarm.enabled ? 'bg-white' : 'bg-white/10'
                        }`}
                      >
                        <div className={`absolute top-1 w-3 h-3 rounded-full transition-all ${
                          alarm.enabled ? 'right-1 bg-black shadow-md' : 'left-1 bg-white/40'
                        }`} />
                      </button>
                      <button 
                        onClick={() => deleteAlarm(alarm.id!)}
                        className="p-1.5 text-white/20 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </GlassCard>

        {/* Notes Section */}
        <GlassCard className="md:col-span-2 lg:col-span-2 overflow-hidden" title="Quick Notes" delay={0.55}>
          <textarea 
            key={note?.id || 'new'}
            defaultValue={note?.content || ''}
            onChange={handleNoteChange}
            placeholder={user ? "Just start typing..." : "Login to save notes!"} 
            disabled={!user}
            className="w-full bg-transparent border-none focus:ring-0 text-white/80 placeholder:text-white/20 resize-none h-48 leading-relaxed"
          />
        </GlassCard>

      </div>
    </main>

      {/* AI Assistant Sidebar (Toggled from Menu) */}
      <AnimatePresence>
        {isAiOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAiOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-black/95 backdrop-blur-[50px] border-l border-white/10 shadow-2xl z-[70] p-8 flex flex-col"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-400 to-purple-400 shadow-lg shadow-blue-500/25" />
                  <h2 className="text-white text-xl font-medium">Orbit AI</h2>
                </div>
                <button onClick={() => setIsAiOpen(false)} className="p-2 text-white/40 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 px-1">
                <div className="bg-white/5 p-4 rounded-2xl rounded-tl-none text-white/80 text-sm leading-relaxed border border-white/5">
                  Hi! I'm Orbit AI. How can I help you with your browsing experience today?
                </div>
                {messages.map((msg, i) => (
                  <div 
                    key={i} 
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed border ${
                      msg.role === 'user' 
                        ? 'bg-blue-600/20 border-blue-500/30 text-white rounded-tr-none' 
                        : 'bg-white/5 border-white/5 text-white/80 rounded-tl-none'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {isAiLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white/5 p-4 rounded-2xl rounded-tl-none border border-white/5 animate-pulse">
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" />
                        <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:0.2s]" />
                        <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:0.4s]" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <form onSubmit={handleAiSubmit} className="mt-6 pt-6 border-t border-white/10">
                <div className="relative">
                  <input 
                    type="text" 
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    placeholder="Ask Gemini anything..." 
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 pr-12 transition-all"
                  />
                  <button 
                    disabled={isAiLoading || !aiInput.trim()}
                    type="submit"
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-xl flex items-center justify-center text-black shadow-lg hover:scale-105 disabled:opacity-50 disabled:scale-100 transition-all"
                  >
                    <Plus className="w-5 h-5 rotate-45" />
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}} />
    </div>
  );
}
