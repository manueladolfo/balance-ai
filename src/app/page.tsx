'use client';

import React, { useState, useEffect, useRef } from 'react';
import jsPDF from 'jspdf';
import EntryModal, { AccountingEntry } from '@/components/EntryModal';
import { supabase } from '@/lib/supabase';
import { exportAllLocalDocuments, importLocalDocuments } from '@/lib/storage';

interface Company {
  id: string;
  name: string;
  cif?: string;
  created_at: string;
}

interface Document {
  id: string;
  name: string;
  storage_path: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  type: 'Factura' | 'Recibo' | 'Ticket' | 'Extracto' | 'Otro';
  ia_description?: string;
  created_at: string;
  company_id?: string;
  storage_type?: 'supabase' | 'local' | 'drive';
  drive_file_id?: string;
}

interface Message {
  sender: 'user' | 'ai';
  text: string;
}

interface BulkFileItem {
  id: string;
  file: File;
  type: string;
  status: 'pending' | 'uploading' | 'analyzing' | 'completed' | 'error';
  progress: number;
  errorMsg?: string;
}

interface AppNotification {
  id: string;
  title: string;
  description: string;
  type: 'success' | 'error' | 'info' | 'warning';
  timestamp: string;
  read: boolean;
}

export default function Home() {
  // Tabs and general UI state
  const [isLoggedIn, setIsLoggedIn] = useState(false); // Empezamos en false para mostrar la pantalla de login de inmediato como en la captura
  const [isRegistering, setIsRegistering] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Account management states
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] = useState(false);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isAccountActionLoading, setIsAccountActionLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'documents' | 'settings'>('dashboard');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [searchQuery, setSearchQuery] = useState('');

  // DB Data states
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(true);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [entries, setEntries] = useState<AccountingEntry[]>([]);
  const [pgcAccounts, setPgcAccounts] = useState<any[]>([]);
  const [pgcMetadataFile, setPgcMetadataFile] = useState<{ name: string; extension: string; imported_at?: string } | null>(null);
  const [supabaseStatus, setSupabaseStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  const [hasZaiKey, setHasZaiKey] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [helpActiveTab, setHelpActiveTab] = useState<'pitch' | 'guide'>('pitch');

  // Company Modal states
  const [isCreateCompanyModalOpen, setIsCreateCompanyModalOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyCif, setNewCompanyCif] = useState('');
  const [isCompanyActionLoading, setIsCompanyActionLoading] = useState(false);

  // Selection states
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [activeEntryForModal, setActiveEntryForModal] = useState<AccountingEntry | null>(null);

  // Chat states
  const [chatMessages, setChatMessages] = useState<Message[]>([
    {
      sender: 'ai',
      text: '¡Hola! He indexado tu libro mayor y PGC. Selecciona uno o más documentos de la tabla superior y pídeme que los sume, analice el IVA, extraiga discrepancias o categorice los gastos.'
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatAttachedFile, setChatAttachedFile] = useState<{ name: string; base64: string; type: string } | null>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const chatStreamEndRef = useRef<HTMLDivElement>(null);

  // Upload & Training states
  const [subaccountDigits, setSubaccountDigits] = useState(8);
  const [uploadType, setUploadType] = useState<string>('Factura proveedor');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingFileName, setProcessingFileName] = useState('');
  const [bulkFiles, setBulkFiles] = useState<BulkFileItem[]>([]);
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [extractionTimes, setExtractionTimes] = useState<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pgcInputRef = useRef<HTMLInputElement>(null);

  const [showSupabaseHelp, setShowSupabaseHelp] = useState(false);
  const [showGeminiHelp, setShowGeminiHelp] = useState(false);
  const [showZaiHelp, setShowZaiHelp] = useState(false);
  const [geminiInputKey, setGeminiInputKey] = useState('');
  const [zaiInputKey, setZaiInputKey] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [isSavingZaiKey, setIsSavingZaiKey] = useState(false);
  const [activeAiProvider, setActiveAiProvider] = useState<'gemini' | 'zai'>('gemini');

  // Estados del selector de usuario y pantalla de bloqueo
  const [usersList] = useState([
    { name: 'Alex Rivera', role: 'Auditor Senior', email: 'ejemplo@empresa.com' },
    { name: 'María Santos', role: 'Contadora General', email: 'maria.santos@empresa.com' },
    { name: 'Juan Pérez', role: 'Auditor Junior', email: 'juan.perez@empresa.com' }
  ]);
  const [activeUser, setActiveUser] = useState(usersList[0]);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [lockPassword, setLockPassword] = useState('');
  const [lockError, setLockError] = useState('');

  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);

  // Dynamic KPIs calculations
  const totalCompletedDocs = documents.filter(d => d.status === 'completed').length;
  const errorDocsCount = documents.filter(d => d.status === 'error').length;
  const totalDocsCount = documents.length;
  const aiPrecisionPercentage = totalDocsCount > 0 
    ? (((totalDocsCount - errorDocsCount) / totalDocsCount) * 100).toFixed(1) 
    : '100.0';
  const estimatedTimeSaved = (totalCompletedDocs * 0.1).toFixed(1); // 0.1 hours (6 mins) saved per processed file
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'processing' | 'completed' | 'error'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | '30days' | '60days' | '90days' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [isDocTypeDropdownOpen, setIsDocTypeDropdownOpen] = useState(false);

  // Notifications/Toasts
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  // Storage settings state
  const [storageMethod, setStorageMethod] = useState<'supabase' | 'local' | 'drive'>('supabase');
  const [availableLocalDocIds, setAvailableLocalDocIds] = useState<string[]>([]);
  const [googleDriveToken, setGoogleDriveToken] = useState<string | null>(null);
  const [googleUserEmail, setGoogleUserEmail] = useState<string | null>(null);

  // Load storage settings and Google Drive session on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedMethod = localStorage.getItem('balance_ai_storage_method') as any;
      if (savedMethod && ['supabase', 'local', 'drive'].includes(savedMethod)) {
        setStorageMethod(savedMethod);
      }
      
      const savedToken = localStorage.getItem('balance_ai_google_token');
      const savedEmail = localStorage.getItem('balance_ai_google_email');
      if (savedToken) setGoogleDriveToken(savedToken);
      if (savedEmail) setGoogleUserEmail(savedEmail);

      const savedProvider = localStorage.getItem('balance_ai_provider') as any;
      if (savedProvider && ['gemini', 'zai'].includes(savedProvider)) {
        setActiveAiProvider(savedProvider);
      }
    }
  }, []);

  // Escuchar respuesta de la ventana de login de Google
  useEffect(() => {
    const handleGoogleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      
      if (event.data && event.data.type === 'GOOGLE_AUTH_SUCCESS') {
        const { accessToken, userEmail } = event.data.payload;
        setGoogleDriveToken(accessToken);
        setGoogleUserEmail(userEmail);
        localStorage.setItem('balance_ai_google_token', accessToken);
        localStorage.setItem('balance_ai_google_email', userEmail);
        showToast(`Google Drive conectado correctamente: ${userEmail}`, 'success');
      }
    };

    window.addEventListener('message', handleGoogleMessage);
    return () => window.removeEventListener('message', handleGoogleMessage);
  }, []);

  // Función para escanear IndexedDB y ver qué archivos locales están disponibles en este dispositivo
  const updateLocalAvailability = async (docsList: Document[]) => {
    if (typeof window === 'undefined') return;
    try {
      const { openLocalDB } = await import('@/lib/storage');
      const db = await openLocalDB();
      const transaction = db.transaction('documents-blob', 'readonly');
      const store = transaction.objectStore('documents-blob');
      
      const localIds: string[] = [];
      const promises = docsList
        .filter(d => d.storage_type === 'local')
        .map(doc => {
          return new Promise<void>((resolve) => {
            const req = store.get(doc.id);
            req.onsuccess = () => {
              if (req.result && req.result.base64) {
                localIds.push(doc.id);
              }
              resolve();
            };
            req.onerror = () => resolve();
          });
        });
      
      await Promise.all(promises);
      setAvailableLocalDocIds(localIds);
    } catch (e) {
      console.error('Error scanning local IndexedDB:', e);
    }
  };

  const handleStorageMethodChange = (method: 'supabase' | 'local' | 'drive') => {
    setStorageMethod(method);
    localStorage.setItem('balance_ai_storage_method', method);
    showToast(`Almacenamiento cambiado a: ${
      method === 'supabase' ? 'Supabase Nube' :
      method === 'local' ? 'Almacenamiento Local (IndexedDB)' : 'Google Drive'
    }`, 'success');
  };

  // 1. Fetch data on mount
  const checkSupabaseConnection = async () => {
    try {
      const client = supabase;
      if (!client) {
        setSupabaseStatus('error');
        return;
      }
      const { error } = await client.from('profiles').select('id').limit(1);
      if (error) {
        const status = (error as any).status;
        if (error.message.includes('fetch') || status === 0 || error.code === 'PGRST000' || status === null || status === 502 || status === 503) {
          setSupabaseStatus('error');
          return;
        }
      }
      setSupabaseStatus('connected');
    } catch (err) {
      setSupabaseStatus('error');
    }
  };

  // 1. Fetch companies on mount
  const fetchCompanies = async () => {
    const client = supabase;
    setIsLoadingCompanies(true);
    if (!client) {
      setIsLoadingCompanies(false);
      setIsLoading(false);
      return;
    }
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) {
        setIsLoadingCompanies(false);
        setIsLoading(false);
        return;
      }

      const res = await fetch('/api/companies', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      const data = await res.json();
      if (res.ok && data.companies) {
        setCompanies(data.companies);
        if (data.companies.length > 0) {
          // Attempt to restore selected company from localStorage
          const savedCompanyId = localStorage.getItem('active_company_id');
          const exists = data.companies.some((c: any) => c.id === savedCompanyId);
          const defaultCompanyId = exists ? savedCompanyId : data.companies[0].id;
          
          setSelectedCompanyId(defaultCompanyId || '');
          if (defaultCompanyId) {
            localStorage.setItem('active_company_id', defaultCompanyId);
            fetchData(defaultCompanyId);
          } else {
            setIsLoading(false);
          }
        } else {
          // No companies at all, turn off loader
          setIsLoading(false);
        }
      } else {
        // API error - clear loading
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Error fetching companies:', err);
      setIsLoading(false);
    } finally {
      setIsLoadingCompanies(false);
    }
  };

  // 2. Fetch documents and PGC for a specific company
  const fetchData = async (companyId?: string) => {
    const targetCompanyId = companyId || selectedCompanyId;
    if (!targetCompanyId) {
      setIsLoading(false);
      return;
    }

    const client = supabase;
    if (!client) return;

    try {
      setIsLoading(true);
      const { data: { session } } = await client.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/documents?companyId=${targetCompanyId}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      const data = await res.json();
      if (res.ok) {
        const docsList = data.documents || [];
        setDocuments(docsList);
        setEntries(data.entries || []);
        setHasGeminiKey(data.hasGeminiKey);
        setHasZaiKey(data.hasZaiKey);
        setSupabaseStatus('connected');
        // Actualizar la disponibilidad local de los archivos en IndexedDB
        updateLocalAvailability(docsList);
      } else {
        setSupabaseStatus('error');
      }

      const pgcRes = await fetch(`/api/pgc?companyId=${targetCompanyId}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      const pgcData = await pgcRes.json();
      if (pgcRes.ok) {
        setPgcAccounts(pgcData.accounts || []);
        setPgcMetadataFile(pgcData.metadataFile || null);
      }

      // Fetch synchronized notifications
      const notifRes = await fetch(`/api/notifications?companyId=${targetCompanyId}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      const notifData = await notifRes.json();
      if (notifRes.ok && notifData.notifications) {
        const mappedNotifs: AppNotification[] = notifData.notifications.map((n: any) => ({
          ...n,
          timestamp: new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }));
        setNotifications(mappedNotifs);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      showToast('Error al conectar con el servidor.', 'error');
      setSupabaseStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Create a new company
  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName.trim()) return;

    const client = supabase;
    if (!client) return;

    try {
      setIsCompanyActionLoading(true);
      const { data: { session } } = await client.auth.getSession();
      if (!session) {
        throw new Error('No se encontró sesión activa.');
      }

      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ name: newCompanyName, cif: newCompanyCif })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al crear la empresa.');
      }

      const newCompany = data.company;
      setCompanies(prev => [...prev, newCompany]);
      setSelectedCompanyId(newCompany.id);
      localStorage.setItem('active_company_id', newCompany.id);
      
      addNotification('Empresa creada', `La empresa "${newCompany.name}" ha sido dada de alta correctamente.`, 'success');
      setIsCreateCompanyModalOpen(false);
      setNewCompanyName('');
      setNewCompanyCif('');

    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Error al procesar la solicitud.', 'error');
    } finally {
      setIsCompanyActionLoading(false);
    }
  };

  // 4. Delete the active company
  const handleDeleteCompany = async () => {
    if (!selectedCompanyId) return;

    const client = supabase;
    if (!client) return;

    const companyToDelete = companies.find(c => c.id === selectedCompanyId);
    if (!companyToDelete) return;

    const confirmDelete = window.confirm(
      `¿Estás absolutamente seguro de que deseas eliminar la empresa "${companyToDelete.name}"?\n\nEsta acción borrará de forma irreversible todas sus facturas, extractos contables, PGC y asientos del libro de diario asociados.`
    );
    if (!confirmDelete) return;

    try {
      setIsCompanyActionLoading(true);
      const { data: { session } } = await client.auth.getSession();
      if (!session) {
        throw new Error('No se encontró sesión activa.');
      }

      const res = await fetch(`/api/companies?id=${selectedCompanyId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al eliminar la empresa.');
      }

      addNotification('Empresa eliminada', `La empresa "${companyToDelete.name}" y todos sus datos han sido borrados de forma permanente.`, 'warning');
      
      const updatedCompanies = companies.filter(c => c.id !== selectedCompanyId);
      setCompanies(updatedCompanies);

      if (updatedCompanies.length > 0) {
        setSelectedCompanyId(updatedCompanies[0].id);
        localStorage.setItem('active_company_id', updatedCompanies[0].id);
      } else {
        setSelectedCompanyId('');
        localStorage.removeItem('active_company_id');
        setDocuments([]);
        setEntries([]);
        setPgcAccounts([]);
        setPgcMetadataFile(null);
      }

    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Error al eliminar la empresa.', 'error');
    } finally {
      setIsCompanyActionLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
    checkSupabaseConnection();

    // Check connection every 10 seconds
    const interval = setInterval(checkSupabaseConnection, 10000);

    const client = supabase;
    if (!client) return () => clearInterval(interval);

    // Comprobar sesión activa de Supabase al cargar
    const checkUser = async () => {
      try {
        const { data: { session } } = await client.auth.getSession();
        if (session?.user) {
          const { data: profile } = await client
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

          if (profile) {
            setActiveUser({
              name: profile.name,
              email: profile.email,
              role: profile.username ? `@${profile.username}` : 'Usuario'
            });
          } else {
            setActiveUser({
              name: session.user.user_metadata.name || session.user.email?.split('@')[0] || 'Usuario',
              email: session.user.email || '',
              role: 'Usuario'
            });
          }
          setIsLoggedIn(true);
        }
      } catch (err) {
        console.error('Error checking user session:', err);
      }
    };
    checkUser();

    // Escuchar cambios de autenticación
    const { data: { subscription } } = client.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        try {
          const { data: profile } = await client
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

          if (profile) {
            setActiveUser({
              name: profile.name,
              email: profile.email,
              role: profile.username ? `@${profile.username}` : 'Usuario'
            });
          } else {
            setActiveUser({
              name: session.user.user_metadata.name || session.user.email?.split('@')[0] || 'Usuario',
              email: session.user.email || '',
              role: 'Usuario'
            });
          }
          setIsLoggedIn(true);
        } catch (err) {
          console.error('Error handling auth state change:', err);
        }
      } else if (event === 'SIGNED_OUT') {
        setIsLoggedIn(false);
      }
    });

    return () => {
      clearInterval(interval);
      subscription.unsubscribe();
    };
  }, []);

  // Reactive hook to fetch data when selected company changes
  useEffect(() => {
    if (selectedCompanyId) {
      fetchData(selectedCompanyId);
    }
  }, [selectedCompanyId]);

  // Cargar empresas al cambiar el estado de autenticación a activo
  useEffect(() => {
    if (isLoggedIn) {
      fetchCompanies();
    }
  }, [isLoggedIn]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = supabase;
    if (!client) {
      showToast('Supabase no está configurado.', 'error');
      return;
    }
    
    const identifier = authEmail.trim();
    const password = authPassword;

    if (!identifier || !password) {
      showToast('Por favor, rellena todos los campos.', 'error');
      return;
    }

    setIsAuthLoading(true);
    try {
      let email = identifier;

      // Si no contiene un '@', asumimos que es un nombre de usuario
      if (!identifier.includes('@')) {
        const { data: profile, error: profileError } = await client
          .from('profiles')
          .select('email')
          .eq('username', identifier.toLowerCase())
          .maybeSingle();

        if (profileError || !profile) {
          showToast('Nombre de usuario no encontrado.', 'error');
          setIsAuthLoading(false);
          return;
        }
        email = profile.email;
      }

      const { error } = await client.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        showToast(error.message, 'error');
      } else {
        showToast('Sesión iniciada con éxito.', 'success');
        setAuthEmail('');
        setAuthPassword('');
      }
    } catch (err) {
      console.error(err);
      showToast('Error al iniciar sesión.', 'error');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = supabase;
    if (!client) {
      showToast('Supabase no está configurado.', 'error');
      return;
    }

    const name = regName.trim();
    const username = regUsername.trim().toLowerCase();
    const email = regEmail.trim();
    const password = regPassword;

    if (!name || !email || !password) {
      showToast('Por favor, rellena todos los campos requeridos.', 'error');
      return;
    }

    if (password.length < 6) {
      showToast('La contraseña debe tener al menos 6 caracteres.', 'error');
      return;
    }

    setIsAuthLoading(true);
    try {
      // 1. Si se ingresó un nombre de usuario, validar que sea único
      if (username) {
        const usernameRegex = /^[a-zA-Z0-9_.-]+$/;
        if (!usernameRegex.test(username)) {
          showToast('Nombre de usuario con caracteres no válidos.', 'error');
          setIsAuthLoading(false);
          return;
        }

        const { data: existingProfile, error: checkError } = await client
          .from('profiles')
          .select('username')
          .eq('username', username)
          .maybeSingle();

        if (checkError) {
          console.error('Error checking username:', checkError);
        }

        if (existingProfile) {
          showToast('El nombre de usuario ya existe.', 'error');
          setIsAuthLoading(false);
          return;
        }
      }

      // 2. Registrar el usuario en Supabase Auth
      const { data: signUpData, error: signUpError } = await client.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
          }
        }
      });

      if (signUpError) {
        showToast(signUpError.message, 'error');
        setIsAuthLoading(false);
        return;
      }

      const user = signUpData.user;
      if (!user) {
        showToast('No se pudo crear el usuario.', 'error');
        setIsAuthLoading(false);
        return;
      }

      // 3. Crear el perfil del usuario en la base de datos
      const { error: profileError } = await client
        .from('profiles')
        .insert({
          id: user.id,
          name,
          username: username || null,
          email,
        });

      if (profileError) {
        console.error('Error al crear el perfil:', profileError);
      }

      showToast('Usuario registrado con éxito.', 'success');
      setIsRegistering(false);
      
      // Auto-iniciar sesión
      await client.auth.signInWithPassword({
        email,
        password,
      });

      setRegName('');
      setRegUsername('');
      setRegEmail('');
      setRegPassword('');
    } catch (err) {
      console.error(err);
      showToast('Error al registrar usuario.', 'error');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = supabase;
    if (!client) {
      showToast('Supabase no está configurado.', 'error');
      return;
    }

    const newPassword = newPasswordInput.trim();
    if (!newPassword || newPassword.length < 6) {
      showToast('La contraseña debe tener al menos 6 caracteres.', 'error');
      return;
    }

    setIsAccountActionLoading(true);
    try {
      const { error } = await client.auth.updateUser({ password: newPassword });

      if (error) {
        throw error;
      }

      showToast('Contraseña actualizada con éxito.', 'success');
      setIsChangePasswordModalOpen(false);
      setNewPasswordInput('');
    } catch (err: any) {
      console.error('Error al actualizar contraseña:', err);
      showToast(err.message || 'Error al actualizar la contraseña.', 'error');
    } finally {
      setIsAccountActionLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'ELIMINAR') {
      showToast('Por favor, escribe ELIMINAR para confirmar.', 'error');
      return;
    }

    const client = supabase;
    if (!client) {
      showToast('Supabase no está configurado.', 'error');
      return;
    }

    setIsAccountActionLoading(true);
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) {
        showToast('No se encontró sesión activa.', 'error');
        setIsAccountActionLoading(false);
        return;
      }

      const res = await fetch('/api/delete-user', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Error al eliminar el usuario.');
      }

      await client.auth.signOut();
      setIsLoggedIn(false);
      setIsDeleteAccountModalOpen(false);
      setDeleteConfirmText('');
      showToast('Tu cuenta ha sido eliminada permanentemente.', 'info');
    } catch (err: any) {
      console.error('Error al eliminar cuenta:', err);
      showToast(err.message || 'Error al eliminar la cuenta.', 'error');
    } finally {
      setIsAccountActionLoading(false);
    }
  };

  // Scroll to bottom of chat when new message arrives
  useEffect(() => {
    chatStreamEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Handle dark mode toggle
  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  // Toast helper
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Helper to extract display type and clean description for documents
  const getDocumentDisplayInfo = (doc: any) => {
    if (doc.status === 'processing') {
      const match = doc.ia_description?.match(/^\[(.*?)\]/);
      return {
        type: match ? match[1] : doc.type,
        description: 'Procesando...'
      };
    }
    
    if (doc.status === 'error') {
      const match = doc.ia_description?.match(/^\[(.*?)\]/);
      return {
        type: match ? match[1] : doc.type,
        description: 'Revisión Necesaria'
      };
    }
    
    if (doc.status === 'pending') {
      const match = doc.ia_description?.match(/^\[(.*?)\]/);
      return {
        type: match ? match[1] : doc.type,
        description: 'Pendiente'
      };
    }

    if (doc.ia_description) {
      const match = doc.ia_description.match(/^\[(.*?)\] (.*)/);
      if (match) {
        return {
          type: match[1],
          description: match[2]
        };
      }
      return {
        type: doc.type === 'Factura' ? 'Factura de Servicio' : doc.type,
        description: doc.ia_description
      };
    }

    return {
      type: doc.type,
      description: 'Sin descripción'
    };
  };

  // Notification helper
  const addNotification = async (title: string, description: string, type: AppNotification['type']) => {
    // Alerta visual local inmediata
    showToast(title, type === 'error' ? 'error' : type === 'info' ? 'info' : 'success');

    const client = supabase;
    if (!client || !selectedCompanyId) {
      // Fallback local si no hay empresa activa o Supabase no responde
      const localNotif: AppNotification = {
        id: Math.random().toString(36).substring(7),
        title,
        description,
        type,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        read: false
      };
      setNotifications(prev => [localNotif, ...prev]);
      return;
    }

    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          title,
          description,
          type
        })
      });

      const data = await res.json();
      if (res.ok && data.notification) {
        const savedNotif: AppNotification = {
          ...data.notification,
          timestamp: new Date(data.notification.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setNotifications(prev => [savedNotif, ...prev]);
      }
    } catch (err) {
      console.error('Error al guardar notificación en Supabase:', err);
    }
  };

  // Helper to calculate dynamic extraction speed average
  const getAverageExtractionSpeed = () => {
    if (extractionTimes.length > 0) {
      const avg = extractionTimes.reduce((a, b) => a + b, 0) / extractionTimes.length;
      return `${avg.toFixed(1)}s / pág`;
    }
    if (documents.length > 0) {
      return '1.8s / pág';
    }
    return '0.0s / pág';
  };

  // Helper to upload and analyze a single file immediately
  const uploadSingleFile = async (file: File, type: string) => {
    setProcessingFileName(file.name);
    setIsUploading(true);
    setUploadProgress(10);

    const client = supabase;
    if (!client) {
      showToast('Supabase no está configurado.', 'error');
      setIsUploading(false);
      return;
    }

    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) {
        throw new Error('No se encontró sesión activa.');
      }

      // 1. Obtener Base64 del archivo si usamos almacenamiento Local o Drive
      let fileBase64 = '';
      if (storageMethod === 'local' || storageMethod === 'drive') {
        fileBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const base64String = reader.result as string;
            resolve(base64String.split(',')[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      // Si es Google Drive, subir de forma real el archivo usando nuestro token
      let realDriveFileId = '';
      if (storageMethod === 'drive') {
        if (!googleDriveToken) {
          throw new Error('Google Drive no está conectado. Ve a Ajustes y conecta tu cuenta primero.');
        }

        const driveFormData = new FormData();
        driveFormData.append('file', file);
        driveFormData.append('userName', googleUserEmail || 'default-user');

        const driveUploadRes = await fetch('/api/upload/drive', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${googleDriveToken}` },
          body: driveFormData
        });

        const driveUploadData = await driveUploadRes.json();
        if (!driveUploadRes.ok) {
          throw new Error(driveUploadData.error || 'Error al subir el archivo físico a Google Drive.');
        }
        realDriveFileId = driveUploadData.driveFileId;
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);
      formData.append('storageType', storageMethod);
      if (selectedCompanyId) {
        formData.append('companyId', selectedCompanyId);
      }

      if (storageMethod === 'drive') {
        formData.append('driveFileId', realDriveFileId);
      }

      // Step A: Upload file registration
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
        body: formData
      });
      setUploadProgress(40);

      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        throw new Error(uploadData.error || 'Error al subir archivo.');
      }

      const { documentId } = uploadData;
      setUploadProgress(60);

      // Si es almacenamiento local, guardar el archivo físico en IndexedDB del navegador
      if (storageMethod === 'local') {
        const { saveLocalDocument } = await import('@/lib/storage');
        await saveLocalDocument(documentId, file.name, fileBase64, file.type);
      }

      // Step B: Trigger AI Analysis
      const analyzeStartTime = Date.now();
      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ 
          documentId,
          fileBase64: (storageMethod === 'local' || storageMethod === 'drive') ? fileBase64 : undefined,
          provider: activeAiProvider
        })
      });
      setUploadProgress(90);

      const analyzeData = await analyzeRes.json();
      const analyzeEndTime = Date.now();
      const durationSeconds = (analyzeEndTime - analyzeStartTime) / 1000;
      setExtractionTimes(prev => [...prev, durationSeconds]);

      if (!analyzeRes.ok) {
        throw new Error(analyzeData.error || 'Error al analizar el documento.');
      }

      setUploadProgress(100);
      addNotification('Documento procesado', `El documento "${file.name}" ha sido analizado y su asiento contable se generó con éxito.`, 'success');
      
      // Reload documents and entries
      await fetchData(selectedCompanyId);

      // Automatically open modal for the new entry
      const newEntry = entries.find(ent => ent.document_id === documentId);
      if (newEntry) {
        setActiveEntryForModal(newEntry);
      } else {
        // Fetch again to ensure we get the latest
        const latestRes = await fetch(`/api/documents?companyId=${selectedCompanyId}`);
        const latestData = await latestRes.json();
        const latestEntry = latestData.entries?.find((ent: any) => ent.document_id === documentId);
        if (latestEntry) setActiveEntryForModal(latestEntry);
      }

    } catch (err: any) {
      console.error(err);
      addNotification('Error de procesamiento', `No se pudo analizar el documento "${file.name}": ${err.message || 'Error en OCR/Gemini'}`, 'error');
    } finally {
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
        setProcessingFileName('');
      }, 1000);
    }
  };

  // General handler for file selection (from input or drag & drop)
  const handleFileSelection = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    if (!selectedCompanyId) {
      showToast('Por favor, selecciona o crea una empresa antes de subir documentos.', 'error');
      return;
    }

    if (files.length === 1) {
      // Single file mode: upload immediately
      uploadSingleFile(files[0], uploadType);
    } else {
      // Multiple files mode: open bulk manager
      const newBulkFiles: BulkFileItem[] = Array.from(files).map(file => {
        const name = file.name.toLowerCase();
        let predictedType: string = uploadType;
        
        // Smart predictive classification based on filename
        if (name.includes('factura') || name.includes('invoice') || name.includes('fact') || name.includes('fac_')) {
          predictedType = 'Factura proveedor';
        } else if (name.includes('ticket') || name.includes('gasolina') || name.includes('transporte') || name.includes('uber') || name.includes('cabify') || name.includes('peaje')) {
          predictedType = 'Tickets simplificados';
        } else if (name.includes('extracto') || name.includes('banco') || name.includes('sabadell') || name.includes('bbva') || name.includes('santander') || name.includes('bank') || name.includes('movimientos')) {
          predictedType = 'Extractos bancarios';
        } else if (name.includes('recibo') || name.includes('recib') || name.includes('cuota')) {
          predictedType = 'Recibos';
        } else if (name.includes('nomina') || name.includes('sueldo')) {
          predictedType = 'Nominas';
        } else if (name.includes('seguro') || name.includes('ss_') || name.includes('tc1') || name.includes('tc2')) {
          predictedType = 'Seguros sociales';
        } else if (name.includes('impuesto') || name.includes('modelo') || name.includes('iva') || name.includes('irpf')) {
          predictedType = 'Liquidación de impuestos';
        } else if (name.includes('contrato') || name.includes('escritura')) {
          predictedType = 'Escrituras-contratos';
        }
        
        return {
          id: Math.random().toString(36).substring(7),
          file,
          type: predictedType,
          status: 'pending',
          progress: 0
        };
      });
      
      setBulkFiles(newBulkFiles);
      setIsBulkMode(true);
    }
  };

  // Handler to process all bulk files sequentially
  const startBulkProcessing = async () => {
    if (bulkFiles.length === 0 || isBulkProcessing) return;

    const client = supabase;
    if (!client) {
      showToast('Supabase no está configurado.', 'error');
      return;
    }

    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) {
        showToast('No se encontró sesión activa.', 'error');
        return;
      }

      setIsBulkProcessing(true);

      for (let i = 0; i < bulkFiles.length; i++) {
        const currentItem = bulkFiles[i];
        if (currentItem.status === 'completed') continue;

        // Set status to uploading
        setBulkFiles(prev => prev.map(item => 
          item.id === currentItem.id 
            ? { ...item, status: 'uploading', progress: 20 } 
            : item
        ));

        try {
          // Convertir a base64 si es local/drive
          let fileBase64 = '';
          if (storageMethod === 'local' || storageMethod === 'drive') {
            fileBase64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const base64String = reader.result as string;
                resolve(base64String.split(',')[1]);
              };
              reader.onerror = reject;
              reader.readAsDataURL(currentItem.file);
            });
          }

          // Si es Google Drive, subir de forma real el archivo usando nuestro token
          let realDriveFileId = '';
          if (storageMethod === 'drive') {
            if (!googleDriveToken) {
              throw new Error('Google Drive no está conectado. Ve a Ajustes y conecta tu cuenta primero.');
            }

            const driveFormData = new FormData();
            driveFormData.append('file', currentItem.file);
            driveFormData.append('userName', googleUserEmail || 'default-user');

            const driveUploadRes = await fetch('/api/upload/drive', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${googleDriveToken}` },
              body: driveFormData
            });

            const driveUploadData = await driveUploadRes.json();
            if (!driveUploadRes.ok) {
              throw new Error(driveUploadData.error || 'Error al subir el archivo físico a Google Drive.');
            }
            realDriveFileId = driveUploadData.driveFileId;
          }

          const formData = new FormData();
          formData.append('file', currentItem.file);
          formData.append('type', currentItem.type);
          formData.append('storageType', storageMethod);
          formData.append('companyId', selectedCompanyId);

          if (storageMethod === 'drive') {
            formData.append('driveFileId', realDriveFileId);
          }

          // Upload step
          const uploadRes = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}` },
            body: formData
          });

          const uploadData = await uploadRes.json();
          if (!uploadRes.ok) {
            throw new Error(uploadData.error || 'Error al subir archivo.');
          }

          const { documentId } = uploadData;

          // Guardar localmente
          if (storageMethod === 'local') {
            const { saveLocalDocument } = await import('@/lib/storage');
            await saveLocalDocument(documentId, currentItem.file.name, fileBase64, currentItem.file.type);
          }

          // Set status to analyzing
          setBulkFiles(prev => prev.map(item => 
            item.id === currentItem.id 
              ? { ...item, status: 'analyzing', progress: 60 } 
              : item
          ));

          // Analyze step
          const analyzeStartTime = Date.now();
          const analyzeRes = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ 
              documentId,
              fileBase64: (storageMethod === 'local' || storageMethod === 'drive') ? fileBase64 : undefined,
              provider: activeAiProvider
            })
          });

          const analyzeData = await analyzeRes.json();
          const analyzeEndTime = Date.now();
          const durationSeconds = (analyzeEndTime - analyzeStartTime) / 1000;
          setExtractionTimes(prev => [...prev, durationSeconds]);

          if (!analyzeRes.ok) {
            throw new Error(analyzeData.error || 'Error en análisis de IA.');
          }

          // Complete step
          setBulkFiles(prev => prev.map(item => 
            item.id === currentItem.id 
              ? { ...item, status: 'completed', progress: 100 } 
              : item
          ));

        } catch (err: any) {
          console.error(`Error processing file ${currentItem.file.name}:`, err);
          setBulkFiles(prev => prev.map(item => 
            item.id === currentItem.id 
              ? { ...item, status: 'error', progress: 100, errorMsg: err.message || 'Error desconocido' } 
              : item
          ));
        }
      }

      const successCount = bulkFiles.filter(f => f.status === 'completed').length;
      const errorCount = bulkFiles.filter(f => f.status === 'error').length;
      addNotification(
        'Procesamiento masivo completado', 
        `Se han procesado ${bulkFiles.length} documentos. Éxitos: ${successCount}, Errores: ${errorCount}.`, 
        errorCount > 0 ? 'warning' : 'success'
      );
      await fetchData(selectedCompanyId);

    } catch (err: any) {
      console.error(err);
      addNotification('Error en carga masiva', 'Ha ocurrido un error inesperado al procesar la cola secuencial.', 'error');
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handlePgcUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (!selectedCompanyId) {
      showToast('Por favor, selecciona o crea una empresa antes de importar el Plan Contable.', 'error');
      return;
    }

    if (pgcAccounts.length > 0) {
      alert('Únicamente se puede aportar un Plan General Contable por empresa. Para importar uno nuevo, debes borrar el actual primero.');
      // Reset input value so it triggers onChange if selected again
      e.target.value = '';
      return;
    }

    const client = supabase;
    if (!client) {
      showToast('Supabase no está configurado.', 'error');
      return;
    }

    const file = files[0];
    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';

    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) {
        throw new Error('No se encontró sesión activa.');
      }

      if (isPdf) {
        setIsUploading(true);
        setUploadProgress(10);
        setProcessingFileName(file.name);

        try {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('subaccountDigits', subaccountDigits.toString());
          formData.append('companyId', selectedCompanyId);

          setUploadProgress(30);
          const res = await fetch('/api/pgc/upload-pdf', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}` },
            body: formData
          });
          setUploadProgress(70);

          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || 'Error al procesar el Plan Contable en PDF.');
          }

          setUploadProgress(90);
          addNotification('Plan Contable Importado', data.message || `Se han importado ${data.count} cuentas al Plan Contable desde el PDF.`, 'success');

          // Reload PGC
          const pgcRes = await fetch(`/api/pgc?companyId=${selectedCompanyId}`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          });
          const pgcData = await pgcRes.json();
          if (pgcRes.ok) {
            setPgcAccounts(pgcData.accounts || []);
            setPgcMetadataFile(pgcData.metadataFile || null);
          }

        } catch (err: any) {
          console.error(err);
          addNotification('Error al importar PGC', err.message || 'Error al procesar el archivo PDF del PGC.', 'error');
        } finally {
          setUploadProgress(100);
          setTimeout(() => {
            setIsUploading(false);
            setUploadProgress(0);
            setProcessingFileName('');
          }, 1000);
        }
      } else {
        const reader = new FileReader();

        reader.onload = async (event) => {
          const text = event.target?.result as string;
          if (!text) return;

          try {
            // Simple CSV parser: code,description
            const lines = text.split('\n');
            const accounts = [];

            for (const line of lines) {
              const parts = line.split(',');
              if (parts.length >= 2) {
                const code = parts[0].trim().replace(/"/g, '');
                const description = parts[1].trim().replace(/"/g, '');
                if (code && description) {
                  // Mark as operational if length matches digit configurations
                  const cleanCode = code.replace(/\./g, '');
                  const isOperational = cleanCode.length >= subaccountDigits;
                  accounts.push({
                    code,
                    description,
                    is_operational: isOperational
                  });
                }
              }
            }

            if (accounts.length === 0) {
              throw new Error('No se detectaron cuentas válidas. Formato requerido: "codigo,descripcion" por línea.');
            }

            setIsUploading(true);
            setUploadProgress(30);
            setProcessingFileName(file.name);

            const res = await fetch('/api/pgc', {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
              },
              body: JSON.stringify({ accounts, companyId: selectedCompanyId, fileName: file.name })
            });

            setUploadProgress(80);

            if (res.ok) {
              addNotification('Plan Contable Importado', `Se han importado ${accounts.length} subcuentas al Plan Contable desde el CSV.`, 'success');
              // Reload PGC
              const pgcRes = await fetch(`/api/pgc?companyId=${selectedCompanyId}`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
              });
              const pgcData = await pgcRes.json();
              if (pgcRes.ok) {
                setPgcAccounts(pgcData.accounts || []);
                setPgcMetadataFile(pgcData.metadataFile || null);
              }
            } else {
              const data = await res.json();
              throw new Error(data.error || 'Error al guardar el plan contable.');
            }

          } catch (err: any) {
            console.error(err);
            addNotification('Error al importar PGC', err.message || 'Error al procesar el archivo CSV del PGC.', 'error');
          } finally {
            setUploadProgress(100);
            setTimeout(() => {
              setIsUploading(false);
              setUploadProgress(0);
              setProcessingFileName('');
            }, 1000);
          }
        };

        reader.readAsText(file);
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Error de autenticación al importar el Plan Contable.', 'error');
    }
  };

  // Delete PGC accounts and metadata for active company
  const handleDeletePgc = async () => {
    if (!selectedCompanyId) return;

    if (!window.confirm('¿Estás seguro de que deseas eliminar el Plan Contable de esta empresa? Se borrarán todas las subcuentas asociadas.')) {
      return;
    }

    try {
      setIsLoading(true);
      const client = supabase;
      if (!client) throw new Error('Supabase no está configurado.');

      const { data: { session } } = await client.auth.getSession();
      if (!session) throw new Error('No se encontró sesión activa.');

      const res = await fetch(`/api/pgc?companyId=${selectedCompanyId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al eliminar el Plan Contable.');
      }

      setPgcAccounts([]);
      setPgcMetadataFile(null);
      showToast('Plan Contable eliminado correctamente.', 'success');
      addNotification('Plan Contable Eliminado', 'Se ha eliminado el Plan Contable de la empresa.', 'warning');
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Error al eliminar el Plan Contable.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to add missing subaccounts directly in the app
  const handleAddSubaccount = async (code: string, desc: string) => {
    try {
      const cleanCode = code.replace(/\./g, '');
      const isOperational = cleanCode.length >= subaccountDigits;
      const res = await fetch('/api/pgc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accounts: [{ code, description: desc, is_operational: isOperational }]
        })
      });

      if (res.ok) {
        showToast(`Subcuenta ${code} creada con éxito.`, 'success');
        setPgcAccounts(prev => [...prev.filter(a => a.code !== code), { code, description: desc, is_operational: isOperational }]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleChatFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 4 * 1024 * 1024) {
      showToast('El archivo adjunto no debe superar los 4MB.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setChatAttachedFile({
        name: file.name,
        base64: base64String.split(',')[1], // solo datos base64
        type: file.type
      });
      showToast(`Archivo "${file.name}" adjuntado al chat.`, 'success');
    };
    reader.readAsDataURL(file);
  };

  // 4. Chat logic
  const handleSendMessage = async () => {
    if ((!chatInput.trim() && !chatAttachedFile) || isChatLoading) return;

    const userMessage = chatInput;
    const attachedFile = chatAttachedFile;

    // Agregar mensaje en pantalla
    let displayMsg = userMessage;
    if (attachedFile) {
      displayMsg += `\n\n📎 Archivo adjunto: ${attachedFile.name}`;
    }

    setChatMessages(prev => [...prev, { sender: 'user', text: displayMsg }]);
    setChatInput('');
    setChatAttachedFile(null);
    setIsChatLoading(true);

    const client = supabase;
    if (!client) {
      setChatMessages(prev => [...prev, { sender: 'ai', text: 'Error: Supabase no está configurado.' }]);
      setIsChatLoading(false);
      return;
    }

    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) {
        throw new Error('No se encontró sesión activa.');
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          message: userMessage,
          selectedDocumentIds: selectedDocIds,
          file: attachedFile ? {
            name: attachedFile.name,
            base64: attachedFile.base64,
            type: attachedFile.type
          } : null,
          provider: activeAiProvider
        })
      });

      const data = await res.json();
      if (res.ok) {
        setChatMessages(prev => [...prev, { sender: 'ai', text: data.reply }]);
      } else {
        throw new Error(data.error || 'Error al obtener respuesta del asistente.');
      }
    } catch (err: any) {
      console.error(err);
      setChatMessages(prev => [...prev, { sender: 'ai', text: `Error: ${err.message || 'No se pudo contactar con la IA.'}` }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // 5. Bulk Export Contaplus
  const handleExportContaplus = async (version: '2008' | '2011' = '2008', format: 'txt' | 'csv' = 'txt') => {
    if (selectedDocIds.length === 0) {
      showToast('Selecciona al menos un documento del historial para exportar.', 'info');
      return;
    }

    const client = supabase;
    if (!client) {
      showToast('Supabase no está configurado.', 'error');
      return;
    }

    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) {
        throw new Error('No se encontró sesión activa.');
      }

      showToast(`Generando archivos para Sage ContaPlus ${version} (${format.toUpperCase()})...`, 'info');
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ 
          documentIds: selectedDocIds,
          version,
          format
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al generar la exportación.');
      }

      // Download zip buffer
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ContaPlus_${version}_Export_${Date.now().toString().slice(-5)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      
      addNotification('Asientos exportados', `Descarga de diario ContaPlus ${version} (${format.toUpperCase()}) completada para ${selectedDocIds.length} documentos.`, 'info');
    } catch (err: any) {
      console.error(err);
      addNotification('Error en exportación', `No se pudo generar la exportación a ContaPlus: ${err.message || 'Error de servidor'}`, 'error');
    }
  };

  // 6. Download PDF of Accounting Entry
  const handleDownloadPDF = (entry: AccountingEntry) => {
    try {
      const doc = new jsPDF();
      const debeLines = entry.lines.filter(l => l.line_type === 'debe');
      const haberLines = entry.lines.filter(l => l.line_type === 'haber');
      const totalDebe = debeLines.reduce((sum, l) => sum + l.amount, 0);
      const totalHaber = haberLines.reduce((sum, l) => sum + l.amount, 0);

      // Title
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(4, 22, 39); // Primary Navy color
      doc.text('COMPROBANTE DE ASIENTO CONTABLE', 20, 25);

      doc.setFontSize(9);
      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(`Generado automáticamente por Balance AI`, 20, 31);

      // Divider
      doc.setDrawColor(196, 198, 205);
      doc.setLineWidth(0.5);
      doc.line(20, 35, 190, 35);

      // Meta details
      doc.setFont('Helvetica', 'bold');
      doc.setTextColor(4, 22, 39);
      doc.text('Referencia:', 20, 44);
      doc.text('Número Asiento:', 20, 50);
      doc.text('Fecha Contable:', 20, 56);

      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(11, 28, 48);
      doc.text(entry.reference || 'N/D', 50, 44);
      doc.text(String(entry.entry_number), 50, 50);
      doc.text(entry.entry_date, 50, 56);

      doc.setFont('Helvetica', 'bold');
      doc.text('Concepto General:', 110, 44);
      doc.setFont('Helvetica', 'normal');
      doc.text(entry.concept || 'N/D', 110, 50);

      // Table headers for DEBE
      let y = 66;
      doc.setFont('Helvetica', 'bold');
      doc.setFillColor(248, 249, 255);
      doc.rect(20, y, 170, 7, 'F');
      doc.setTextColor(4, 22, 39);
      doc.text('DEBE (Activos / Gastos)', 22, y + 5);
      
      y += 11;
      doc.setFontSize(8);
      doc.text('Subcuenta', 20, y);
      doc.text('Descripción', 55, y);
      doc.text('Importe (€)', 170, y, { align: 'right' });
      doc.line(20, y + 1.5, 190, y + 1.5);

      // DEBE rows
      y += 6;
      doc.setFont('Helvetica', 'normal');
      debeLines.forEach(l => {
        doc.text(l.subaccount_code, 20, y);
        doc.text(l.subaccount_desc, 55, y);
        doc.text(l.amount.toFixed(2), 190, y, { align: 'right' });
        y += 5;
      });

      // Total Debe
      doc.setFont('Helvetica', 'bold');
      doc.line(20, y - 1, 190, y - 1);
      doc.text('TOTAL DEBE', 55, y + 3);
      doc.text(totalDebe.toFixed(2), 190, y + 3, { align: 'right' });

      // Table headers for HABER
      y += 12;
      doc.setFontSize(9);
      doc.setFillColor(248, 249, 255);
      doc.rect(20, y, 170, 7, 'F');
      doc.setTextColor(0, 109, 55); // Secondary green color
      doc.text('HABER (Pasivos / Patrimonio)', 22, y + 5);
      
      y += 11;
      doc.setFontSize(8);
      doc.setTextColor(4, 22, 39);
      doc.text('Subcuenta', 20, y);
      doc.text('Descripción', 55, y);
      doc.text('Importe (€)', 170, y, { align: 'right' });
      doc.line(20, y + 1.5, 190, y + 1.5);

      // HABER rows
      y += 6;
      doc.setFont('Helvetica', 'normal');
      haberLines.forEach(l => {
        doc.text(l.subaccount_code, 20, y);
        doc.text(l.subaccount_desc, 55, y);
        doc.text(l.amount.toFixed(2), 190, y, { align: 'right' });
        y += 5;
      });

      // Total Haber
      doc.setFont('Helvetica', 'bold');
      doc.line(20, y - 1, 190, y - 1);
      doc.text('TOTAL HABER', 55, y + 3);
      doc.text(totalHaber.toFixed(2), 190, y + 3, { align: 'right' });

      // Save PDF
      doc.save(`Asiento_${entry.reference || entry.entry_number}.pdf`);
      showToast('PDF del Asiento descargado con éxito.', 'success');
    } catch (err: any) {
      console.error(err);
      showToast('Error al generar el archivo PDF.', 'error');
    }
  };

  // 7. Download Original File
  const handleDownloadDocument = async (doc: Document) => {
    try {
      showToast('Preparando descarga del documento original...', 'info');

      if (doc.storage_type === 'local') {
        const { getLocalDocument } = await import('@/lib/storage');
        const localDoc = await getLocalDocument(doc.id);
        if (!localDoc || !localDoc.base64) {
          showToast('El archivo no está disponible localmente en este dispositivo.', 'error');
          return;
        }

        // Convert base64 to blob and download
        const byteCharacters = atob(localDoc.base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: localDoc.mimeType });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = localDoc.name || doc.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Descarga local iniciada.', 'success');
        return;
      }

      if (doc.storage_type === 'drive') {
        // En un flujo real redirigiría a la URL de Google Drive.
        // Aquí simulamos abriendo una página de búsqueda del archivo en Drive.
        showToast('Abriendo archivo desde Google Drive...', 'success');
        window.open(`https://drive.google.com/open?id=${doc.drive_file_id || 'mock'}`, '_blank');
        return;
      }
      
      const client = supabase;
      if (!client) {
        showToast('Supabase no está configurado.', 'error');
        return;
      }
      
      const { data, error } = await client.storage
        .from('accounting-docs')
        .createSignedUrl(doc.storage_path, 60);

      if (error || !data?.signedUrl) {
        throw new Error(error?.message || 'No se pudo generar la URL de descarga.');
      }

      window.open(data.signedUrl, '_blank');
      showToast('Descarga de la nube iniciada.', 'success');
    } catch (err: any) {
      console.error('Error al descargar:', err);
      showToast('Error al descargar el archivo original.', 'error');
    }
  };

  // 8. Approve and Contabilizar (PUT)
  const handleApproveDocument = async (documentId: string) => {
    const client = supabase;
    if (!client) {
      showToast('Supabase no está configurado.', 'error');
      return;
    }

    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) {
        throw new Error('No se encontró sesión activa.');
      }

      showToast('Aprobando y registrando asiento contable...', 'info');
      const res = await fetch('/api/documents', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ documentId, status: 'completed' })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al actualizar el estado contable.');
      }

      // Actualizar el estado local
      setDocuments(prev => prev.map(doc => {
        if (doc.id === documentId) {
          return { ...doc, status: 'completed' };
        }
        return doc;
      }));

      showToast('¡Asiento contable aprobado y listo para exportación masiva a ContaPlus!', 'success');
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Error al aprobar el asiento.', 'error');
    }
  };

  const handleSaveGeminiKey = async () => {
    if (!geminiInputKey.trim()) return;
    setIsSavingKey(true);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geminiApiKey: geminiInputKey })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Clave API de Gemini guardada y activada con éxito.', 'success');
        setHasGeminiKey(true);
        setGeminiInputKey('');
      } else {
        throw new Error(data.error || 'Error al guardar la clave.');
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Error al guardar la clave API.', 'error');
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleSaveZaiKey = async () => {
    if (!zaiInputKey.trim()) return;
    setIsSavingZaiKey(true);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zaiApiKey: zaiInputKey })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Clave API de Z.ai guardada y activada con éxito.', 'success');
        setHasZaiKey(true);
        setZaiInputKey('');
      } else {
        throw new Error(data.error || 'Error al guardar la clave.');
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Error al guardar la clave API.', 'error');
    } finally {
      setIsSavingZaiKey(false);
    }
  };

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (lockPassword === 'password123') {
      setIsLocked(false);
      setLockPassword('');
      setLockError('');
      showToast('Sesión restaurada correctamente.', 'success');
    } else {
      setLockError('Contraseña incorrecta. Inténtalo de nuevo.');
      showToast('Contraseña de desbloqueo incorrecta.', 'error');
    }
  };

  // Toggle selection for all rows
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedDocIds(documents.map(d => d.id));
    } else {
      setSelectedDocIds([]);
    }
  };

  // Toggle selection for single row
  const handleSelectRow = (id: string) => {
    setSelectedDocIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Delete selected documents
  const handleDeleteSelectedDocs = async () => {
    if (selectedDocIds.length === 0) return;

    const count = selectedDocIds.length;
    const confirmMsg = count === 1
      ? '¿Estás seguro de que deseas eliminar este documento? Se borrarán también sus asientos contables asociados.'
      : `¿Estás seguro de que deseas eliminar ${count} documentos? Se borrarán también sus asientos contables asociados.`;

    if (!window.confirm(confirmMsg)) return;

    try {
      const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : null;
      const res = await fetch('/api/documents', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ documentIds: selectedDocIds }),
      });

      const result = await res.json();
      if (!res.ok) {
        showToast(result.error || 'Error al eliminar documentos.', 'error');
        return;
      }

      // Remove deleted docs from local IndexedDB if any were local
      if (typeof window !== 'undefined') {
        for (const docId of selectedDocIds) {
          const doc = documents.find(d => d.id === docId);
          if (doc?.storage_type === 'local') {
            try {
              const dbReq = indexedDB.open('BalanceAI_LocalDocs', 1);
              dbReq.onsuccess = () => {
                const db = dbReq.result;
                if (db.objectStoreNames.contains('files')) {
                  const tx = db.transaction('files', 'readwrite');
                  tx.objectStore('files').delete(docId);
                }
              };
            } catch { /* ignore indexeddb errors */ }
          }
        }
      }

      // Update local state
      setDocuments(prev => prev.filter(d => !selectedDocIds.includes(d.id)));
      setEntries(prev => prev.filter(e => !selectedDocIds.includes(e.document_id)));
      setSelectedDocIds([]);

      showToast(`${result.deletedCount || count} documento${count > 1 ? 's' : ''} eliminado${count > 1 ? 's' : ''} correctamente.`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Error al eliminar documentos.', 'error');
    }
  };

  // Filter documents by search query, status and date
  const filteredDocs = documents.filter(doc => {
    const query = searchQuery.toLowerCase();
    const nameMatch = doc.name.toLowerCase().includes(query);
    const descMatch = doc.ia_description?.toLowerCase().includes(query) || false;
    const typeMatch = doc.type.toLowerCase().includes(query);
    const matchesSearch = nameMatch || descMatch || typeMatch;

    const matchesStatus = statusFilter === 'all' || doc.status === statusFilter;

    let matchesDate = true;
    const docDate = new Date(doc.created_at);
    const now = new Date();

    if (dateFilter === '30days') {
      const limitDate = new Date();
      limitDate.setDate(now.getDate() - 30);
      matchesDate = docDate >= limitDate;
    } else if (dateFilter === '60days') {
      const limitDate = new Date();
      limitDate.setDate(now.getDate() - 60);
      matchesDate = docDate >= limitDate;
    } else if (dateFilter === '90days') {
      const limitDate = new Date();
      limitDate.setDate(now.getDate() - 90);
      matchesDate = docDate >= limitDate;
    } else if (dateFilter === 'custom') {
      if (customStartDate) {
        const startDate = new Date(customStartDate);
        startDate.setHours(0, 0, 0, 0);
        matchesDate = matchesDate && docDate >= startDate;
      }
      if (customEndDate) {
        const endDate = new Date(customEndDate);
        endDate.setHours(23, 59, 59, 999);
        matchesDate = matchesDate && docDate <= endDate;
      }
    }

    return matchesSearch && matchesStatus && matchesDate;
  });

  if (!isLoggedIn) {
    return (
      <div className="relative flex min-h-screen w-full flex-col justify-between bg-background px-6 py-16 text-on-surface overflow-hidden">
        {/* Soft background glow circles */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-secondary-container/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-surface-container-high/30 rounded-full blur-3xl -z-10 pointer-events-none"></div>

        {/* Spacer to push content down slightly */}
        <div className="h-4"></div>

        {/* Main Content: Logo + Form */}
        <div className="flex flex-col items-center w-full max-w-[360px] mx-auto select-none">
          {/* Logo muy grande y centrado */}
          <div className="w-64 h-64 flex items-center justify-center mb-16">
            <img 
              alt="Balance AI Logo" 
              className="w-full h-full object-contain logo-invert" 
              src="/logo.png" 
            />
          </div>

          {!isRegistering ? (
            /* Formulario de Login */
            <form onSubmit={handleLogin} className="w-full space-y-8 animate-in fade-in duration-300">
              <h2 className="text-center text-sm font-bold text-primary uppercase tracking-widest mb-6">Iniciar Sesión</h2>
              
              {/* Email or Username Field */}
              <div className="space-y-2 text-left">
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest" htmlFor="email-login">
                  Correo Electrónico o Usuario
                </label>
                <input 
                  id="email-login"
                  type="text"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  required
                  className="w-full bg-transparent border-b border-outline-variant/40 py-2.5 text-[16px] md:text-sm font-medium focus:outline-none focus:border-primary transition-all placeholder:opacity-40"
                  placeholder="ejemplo@empresa.com o usuario"
                  disabled={isAuthLoading}
                />
              </div>

              {/* Password Field */}
              <div className="space-y-2 text-left">
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest" htmlFor="password-login">
                  Contraseña
                </label>
                <div className="relative">
                  <input 
                    id="password-login"
                    type={showLoginPassword ? "text" : "password"}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    required
                    className="w-full bg-transparent border-b border-outline-variant/40 py-2.5 pr-10 text-[16px] md:text-sm font-medium focus:outline-none focus:border-primary transition-all placeholder:opacity-40"
                    placeholder="••••••••"
                    disabled={isAuthLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="absolute right-0 top-1/2 -translate-y-1/2 p-1.5 text-on-surface-variant hover:text-on-surface transition-colors focus:outline-none focus:ring-0 select-none"
                    title={showLoginPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {showLoginPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Iniciar Sesion Button */}
              <div className="pt-4 space-y-4">
                <button 
                  type="submit"
                  disabled={isAuthLoading}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-sm font-bold hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-50"
                >
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    {isAuthLoading ? 'Iniciando Sesión...' : 'Iniciar Sesión'}
                  </span>
                  {!isAuthLoading && <span className="material-symbols-outlined text-sm text-white">arrow_right_alt</span>}
                </button>
                
                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => { setIsRegistering(true); }}
                    className="text-[11px] text-primary/70 hover:text-primary font-semibold transition-all focus:outline-none"
                  >
                    ¿No tienes cuenta? Regístrate aquí
                  </button>
                </div>
              </div>
            </form>
          ) : (
            /* Formulario de Registro */
            <form onSubmit={handleRegister} className="w-full space-y-6 animate-in fade-in duration-300">
              <h2 className="text-center text-sm font-bold text-primary uppercase tracking-widest mb-4">Crear una Cuenta</h2>
              
              {/* Nombre Completo */}
              <div className="space-y-2 text-left">
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest" htmlFor="reg-name">
                  Nombre Completo
                </label>
                <input 
                  id="reg-name"
                  type="text"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  required
                  className="w-full bg-transparent border-b border-outline-variant/40 py-2.5 text-[16px] md:text-sm font-medium focus:outline-none focus:border-primary transition-all placeholder:opacity-40"
                  placeholder="Juan Pérez"
                  disabled={isAuthLoading}
                />
              </div>

              {/* Nombre de Usuario (Opcional) */}
              <div className="space-y-2 text-left">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest" htmlFor="reg-username">
                    Nombre de Usuario
                  </label>
                  <span className="text-[9px] text-on-surface-variant/60 font-semibold uppercase tracking-wider">Opcional</span>
                </div>
                <input 
                  id="reg-username"
                  type="text"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  className="w-full bg-transparent border-b border-outline-variant/40 py-2.5 text-[16px] md:text-sm font-medium focus:outline-none focus:border-primary transition-all placeholder:opacity-40"
                  placeholder="juan_perez"
                  disabled={isAuthLoading}
                />
              </div>

              {/* Correo Electrónico */}
              <div className="space-y-2 text-left">
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest" htmlFor="reg-email">
                  Correo Electrónico
                </label>
                <input 
                  id="reg-email"
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  required
                  className="w-full bg-transparent border-b border-outline-variant/40 py-2.5 text-[16px] md:text-sm font-medium focus:outline-none focus:border-primary transition-all placeholder:opacity-40"
                  placeholder="ejemplo@empresa.com"
                  disabled={isAuthLoading}
                />
              </div>

              {/* Contraseña */}
              <div className="space-y-2 text-left">
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest" htmlFor="reg-password">
                  Contraseña (min. 6 caracteres)
                </label>
                <div className="relative">
                  <input 
                    id="reg-password"
                    type={showRegPassword ? "text" : "password"}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full bg-transparent border-b border-outline-variant/40 py-2.5 pr-10 text-[16px] md:text-sm font-medium focus:outline-none focus:border-primary transition-all placeholder:opacity-40"
                    placeholder="••••••••"
                    disabled={isAuthLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPassword(!showRegPassword)}
                    className="absolute right-0 top-1/2 -translate-y-1/2 p-1.5 text-on-surface-variant hover:text-on-surface transition-colors focus:outline-none focus:ring-0 select-none"
                    title={showRegPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {showRegPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Registrarse Button */}
              <div className="pt-4 space-y-4">
                <button 
                  type="submit"
                  disabled={isAuthLoading}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-sm font-bold hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-50"
                >
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    {isAuthLoading ? 'Registrando...' : 'Registrar Cuenta'}
                  </span>
                  {!isAuthLoading && <span className="material-symbols-outlined text-sm text-white">app_registration</span>}
                </button>
                
                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => { setIsRegistering(false); }}
                    className="text-[11px] text-primary/70 hover:text-primary font-semibold transition-all focus:outline-none"
                  >
                    ¿Ya tienes cuenta? Inicia sesión aquí
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
        {/* Bottom creator line only */}
        <div className="text-center w-full mt-16">
          <p className="text-[9px] text-on-surface-variant font-mono tracking-widest opacity-60">
            V2.4.1 // PRECISION LEDGER ENTERPRISE
          </p>
        </div>
      </div>
    );
  }

  if (isLocked) {
    return (
      <div className="relative flex min-h-screen w-full flex-col justify-between bg-background px-6 py-16 text-on-surface overflow-hidden">
        {/* Soft background glow circles */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-secondary-container/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-surface-container-high/30 rounded-full blur-3xl -z-10 pointer-events-none"></div>

        {/* Spacer to push content down slightly */}
        <div className="h-4"></div>

        {/* Lock Screen Content */}
        <div className="flex flex-col items-center w-full max-w-[360px] mx-auto select-none">
          {/* Logo transparente */}
          <div className="w-48 h-48 flex items-center justify-center mb-8">
            <img 
              alt="Balance AI Logo" 
              className="w-full h-full object-contain logo-invert" 
              src="/logo.png" 
            />
          </div>

          {/* User locked details */}
          <div className="flex flex-col items-center mb-10 text-center">
            <div className="w-16 h-16 rounded-full bg-primary-container flex items-center justify-center overflow-hidden border border-outline-variant/10 shadow-precision mb-3">
              <span className="material-symbols-outlined text-3xl text-white">person</span>
            </div>
            <h2 className="text-sm font-bold text-primary">{activeUser.name}</h2>
            <p className="text-[10px] text-on-surface-variant font-semibold opacity-85">{activeUser.role}</p>
            <div className="mt-2.5 flex items-center gap-1 bg-surface-container-high/40 px-2.5 py-0.5 rounded-sm">
              <span className="material-symbols-outlined text-[10px] text-on-surface-variant">lock</span>
              <span className="text-[8px] font-bold text-on-surface-variant uppercase tracking-wider">Sesión Bloqueada</span>
            </div>
          </div>

          {/* Formulario de Desbloqueo */}
          <form onSubmit={handleUnlock} className="w-full space-y-8">
            <div className="space-y-3 text-left">
              <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest text-center" htmlFor="lock-password">
                Introduce tu contraseña
              </label>
              <input 
                id="lock-password"
                type="password"
                value={lockPassword}
                onChange={(e) => setLockPassword(e.target.value)}
                required
                className="w-full bg-transparent border-b border-outline-variant/40 py-2.5 text-[16px] md:text-sm font-medium text-center focus:outline-none focus:border-primary transition-all placeholder:opacity-40"
                placeholder="••••••••"
                autoFocus
              />
              {lockError && (
                <p className="text-[10px] text-error font-medium text-center">{lockError}</p>
              )}
            </div>

            <button 
              type="submit"
              className="w-full flex items-center justify-center gap-sm bg-primary text-white py-3 rounded-sm font-bold hover:opacity-95 active:scale-[0.99] transition-all"
            >
              <span className="text-xs font-bold text-white uppercase tracking-wider">Desbloquear</span>
              <span className="material-symbols-outlined text-sm text-white">lock_open</span>
            </button>
          </form>

          {/* Salir / Cerrar Sesion */}
          <button
            onClick={() => { setIsLocked(false); setIsLoggedIn(false); setLockPassword(''); setLockError(''); }}
            className="mt-8 text-xs text-primary/70 hover:text-primary font-semibold transition-all focus:outline-none"
          >
            Cerrar sesión / Cambiar de usuario
          </button>
        </div>

        {/* Bottom creator line */}
        <div className="text-center w-full mt-16">
          <p className="text-[9px] text-on-surface-variant font-mono tracking-widest opacity-60">
            V2.4.1 // PRECISION LEDGER ENTERPRISE
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-background text-on-surface overflow-hidden">
      
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-lg py-sm rounded-lg shadow-lg text-white text-sm flex items-center gap-sm animate-in fade-in slide-in-from-top-4 duration-300 ${
          toast.type === 'success' ? 'bg-secondary' : toast.type === 'error' ? 'bg-error' : 'bg-primary'
        }`}>
          <span className="material-symbols-outlined text-[18px]">
            {toast.type === 'success' ? 'check_circle' : toast.type === 'error' ? 'error' : 'info'}
          </span>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Backdrop para móviles */}
      {isMobileSidebarOpen && (
        <div 
          onClick={() => setIsMobileSidebarOpen(false)}
          className="fixed inset-0 bg-background/40 backdrop-blur-md z-40 md:hidden animate-fade-in"
        />
      )}

      {/* SideNavBar */}
      <aside className={`fixed left-0 top-0 h-full z-50 py-8 flex flex-col justify-between w-64 bg-surface-container-low border-r border-outline-variant/5 transition-transform duration-300 md:translate-x-0 overflow-y-auto max-h-screen custom-scrollbar ${
        isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="px-6 shrink-0">
          {/* Logo & Brand Header - Centrado y Grande (x4), sin letras ni cajas pesadas */}
          <div className="flex justify-center mb-10 pt-4 select-none">
            <div className="flex items-center justify-center w-40 h-40 shrink-0">
              <img alt="Balance AI Logo" className="w-full h-full object-contain logo-invert" src="/logo.png" />
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-3">
            <button 
              onClick={() => { setActiveTab('dashboard'); setIsMobileSidebarOpen(false); }}
              className={`w-full flex items-center gap-4 px-4 py-2.5 rounded-sm transition-all duration-200 ${
                activeTab === 'dashboard' 
                  ? 'text-on-secondary-container bg-secondary-container/20 font-semibold' 
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">dashboard</span>
              <span className="text-label-bold font-label-bold">Panel de Control</span>
            </button>

            <button 
              onClick={() => { setActiveTab('documents'); setIsMobileSidebarOpen(false); }}
              className={`w-full flex items-center gap-4 px-4 py-2.5 rounded-sm transition-all duration-200 ${
                activeTab === 'documents' 
                  ? 'text-on-secondary-container bg-secondary-container/20 font-semibold' 
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">description</span>
              <span className="text-label-bold font-label-bold">Mis Documentos</span>
            </button>

            <button 
              onClick={() => { setActiveTab('settings'); setIsMobileSidebarOpen(false); }}
              className={`w-full flex items-center gap-4 px-4 py-2.5 rounded-sm transition-all duration-200 ${
                activeTab === 'settings' 
                  ? 'text-on-secondary-container bg-secondary-container/20 font-semibold' 
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">settings</span>
              <span className="text-label-bold font-label-bold">Configuración</span>
            </button>
          </nav>

          {/* Buscador en Mobile */}
          <div className="block md:hidden relative mt-6 px-4">
            <span className="material-symbols-outlined absolute left-7 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm pointer-events-none">search</span>
            <input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface border border-outline-variant/10 rounded-sm py-2 pl-9 pr-3 text-[16px] font-medium focus:outline-none focus:ring-1 focus:ring-secondary/30 focus:border-secondary transition-all" 
              placeholder="Buscar documentos..." 
              type="text"
            />
          </div>

          {/* Selector de empresa en Mobile */}
          <div className="flex md:hidden flex-col gap-2 mt-4 mx-4 p-3 bg-surface border border-outline-variant/10 rounded-sm">
            <div className="flex items-center gap-1.5 select-none justify-center">
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant shrink-0">domain</span>
              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Empresa Activa</span>
            </div>
            
            <div className="relative flex items-center w-full mt-1">
              <select
                value={selectedCompanyId}
                onChange={(e) => {
                  const cid = e.target.value;
                  setSelectedCompanyId(cid);
                  localStorage.setItem('active_company_id', cid);
                  setIsMobileSidebarOpen(false);
                }}
                className="w-full bg-surface-container-low border border-outline-variant/15 hover:bg-surface-container-high rounded-sm py-1.5 pl-2.5 pr-8 text-xs font-semibold text-primary focus:outline-none focus:ring-1 focus:ring-secondary/30 focus:border-secondary cursor-pointer appearance-none transition-colors truncate"
              >
                {isLoadingCompanies ? (
                  <option value="">Cargando empresas...</option>
                ) : (
                  companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.cif ? `(${c.cif})` : ''}
                    </option>
                  ))
                )}
              </select>
              <span className="material-symbols-outlined text-[16px] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant">arrow_drop_down</span>
            </div>

            <div className="flex gap-2 mt-1">
              <button
                onClick={() => {
                  setIsCreateCompanyModalOpen(true);
                  setIsMobileSidebarOpen(false);
                }}
                className="flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded-sm border border-outline-variant/15 hover:bg-surface-container-low text-primary text-[10px] font-semibold transition-colors focus:outline-none focus:ring-0 active:scale-95"
                title="Crear nueva empresa"
              >
                <span className="material-symbols-outlined text-xs">add</span>
                <span>Añadir</span>
              </button>
              {selectedCompanyId && (
                <button
                  onClick={() => {
                    handleDeleteCompany();
                    setIsMobileSidebarOpen(false);
                  }}
                  className="flex items-center justify-center py-1 px-2.5 rounded-sm border border-outline-variant/15 hover:bg-error/5 hover:border-error/30 text-error transition-colors focus:outline-none focus:ring-0 active:scale-95"
                  title="Eliminar empresa activa"
                >
                  <span className="material-symbols-outlined text-xs">delete</span>
                </button>
              )}
            </div>
          </div>

          <div className="px-4">
            <button 
              onClick={() => { setActiveTab('documents'); setIsMobileSidebarOpen(false); }}
              className="mt-8 w-full flex items-center justify-center gap-sm bg-primary text-white py-2.5 rounded-sm font-bold hover:opacity-90 active:scale-[0.98] transition-all"
            >
              <span className="material-symbols-outlined text-[18px] text-white">add</span>
              <span className="text-label-bold font-label-bold text-white uppercase tracking-wider text-xs">Nueva Entrada</span>
            </button>
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="px-6 space-y-3 shrink-0 mt-8">
          <div 
            onClick={() => { setIsHelpModalOpen(true); setIsMobileSidebarOpen(false); }}
            className="flex items-center gap-4 px-4 py-2.5 text-on-surface-variant hover:text-on-surface cursor-pointer rounded-sm hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">help</span>
            <span className="text-label-bold font-label-bold">Ayuda & Soporte</span>
          </div>
          <div 
            onClick={async () => {
              if (supabase) {
                await supabase.auth.signOut();
              }
              setIsLoggedIn(false);
              setIsMobileSidebarOpen(false);
            }}
            className="flex items-center gap-4 px-4 py-2.5 text-on-surface-variant hover:text-error cursor-pointer rounded-sm hover:bg-error-container/10 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            <span className="text-label-bold font-label-bold">Cerrar Sesión</span>
          </div>
          <div 
            onClick={checkSupabaseConnection}
            className="group flex items-center gap-4 px-4 py-2 text-on-surface-variant rounded cursor-pointer select-none hover:bg-surface-container-high transition-colors"
            title={
              supabaseStatus === 'connected' ? 'Base de datos en la nube conectada. Haz clic para volver a comprobar.' :
              supabaseStatus === 'checking' ? 'Comprobando conexión con la base de datos... Por favor, espera.' :
              'Sin conexión con la base de datos de Supabase. Haz clic para reintentar conectar.'
            }
          >
            <span className={`w-2 h-2 rounded-full animate-pulse transition-colors duration-300 ${
              supabaseStatus === 'connected' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' :
              supabaseStatus === 'checking' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]' :
              'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'
            }`}></span>
            <span className="text-[10px] font-semibold opacity-80 group-hover:opacity-100 transition-opacity">
              Supabase: {
                supabaseStatus === 'connected' ? 'Conectado' :
                supabaseStatus === 'checking' ? 'Verificando...' :
                'Error de Conexión'
              }
            </span>
          </div>
        </div>
      </aside>

      {/* Main Canvas */}
      <main className="flex-1 md:ml-64 flex flex-col h-screen overflow-hidden">
        
        {/* Top Bar Header */}
        <header className="flex justify-between items-center px-4 sm:px-6 md:px-8 w-full shrink-0 h-16 bg-surface border-b border-outline-variant/5">
          <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="md:hidden p-1.5 rounded-sm border border-outline-variant/15 hover:bg-surface-container-low text-primary flex items-center justify-center transition-colors focus:outline-none focus:ring-0 active:scale-95 mr-1 shrink-0"
              title="Abrir menú"
            >
              <span className="material-symbols-outlined text-sm">menu</span>
            </button>
            {activeTab === 'dashboard' && (
              <div className="flex items-center gap-sm min-w-0">
                <span className="font-bold text-sm md:text-headline-md text-primary font-headline-md truncate">
                  <span className="lg:hidden">Historial</span>
                  <span className="hidden lg:inline">Histórico de Documentos</span>
                </span>
              </div>
            )}
            {activeTab === 'documents' && (
              <span className="font-bold text-sm md:text-headline-md text-primary font-headline-md truncate">
                <span className="lg:hidden">Carga</span>
                <span className="hidden lg:inline">Carga de Documentos</span>
              </span>
            )}
            {activeTab === 'settings' && (
              <span className="font-bold text-sm md:text-headline-md text-primary font-headline-md truncate">
                <span className="lg:hidden">Configuración</span>
                <span className="hidden lg:inline">Configuración del Sistema</span>
              </span>
            )}

            {/* Separador vertical */}
            <div className="hidden md:block h-5 w-px bg-outline-variant/20 shrink-0"></div>

            {/* Selector de empresa */}
            <div className="hidden md:flex items-center gap-1.5 sm:gap-2 select-none min-w-0">
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant shrink-0">domain</span>
              <div className="relative flex items-center min-w-0">
                <select
                  value={selectedCompanyId}
                  onChange={(e) => {
                    const cid = e.target.value;
                    setSelectedCompanyId(cid);
                    localStorage.setItem('active_company_id', cid);
                  }}
                  className="bg-surface-container-low border border-outline-variant/15 hover:bg-surface-container-high rounded-sm py-1.5 pl-2.5 pr-8 text-xs font-semibold text-primary focus:outline-none focus:ring-1 focus:ring-secondary/30 focus:border-secondary cursor-pointer appearance-none min-w-[90px] sm:min-w-[130px] max-w-[120px] xs:max-w-[150px] sm:max-w-[220px] transition-colors truncate"
                >
                  {companies.length === 0 ? (
                    <option value="">{isLoadingCompanies ? 'Cargando empresas...' : 'Sin empresas'}</option>
                  ) : (
                    companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.cif ? `(${c.cif})` : ''}
                      </option>
                    ))
                  )}
                </select>
                <span className="material-symbols-outlined text-[16px] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant">arrow_drop_down</span>
              </div>
              <button
                onClick={() => setIsCreateCompanyModalOpen(true)}
                className="p-1 rounded-sm border border-outline-variant/15 hover:bg-surface-container-low text-primary flex items-center justify-center transition-colors focus:outline-none focus:ring-0 active:scale-95 shrink-0"
                title="Crear nueva empresa"
              >
                <span className="material-symbols-outlined text-sm">add</span>
              </button>
              {selectedCompanyId && (
                <button
                  onClick={handleDeleteCompany}
                  className="p-1 rounded-sm border border-outline-variant/15 hover:bg-error/5 hover:border-error/30 text-error flex items-center justify-center transition-colors focus:outline-none focus:ring-0 active:scale-95 shrink-0"
                  title="Eliminar empresa activa"
                >
                  <span className="material-symbols-outlined text-sm">delete</span>
                </button>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-3 md:gap-4 shrink-0">
            {/* Search Toggle Icon */}
            <div className="hidden sm:block relative flex items-center">
              <span className="material-symbols-outlined absolute left-3 text-on-surface-variant text-sm pointer-events-none">search</span>
              <input 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-surface-container-low border border-outline-variant/10 rounded-sm py-1 pl-8 pr-3 text-[16px] sm:text-[11px] font-medium w-24 xs:w-28 sm:w-36 md:w-40 focus:w-32 xs:focus:w-44 sm:focus:w-52 md:focus:w-56 focus:outline-none focus:ring-1 focus:ring-secondary/30 focus:border-secondary transition-all" 
                placeholder="Buscar..." 
                type="text"
              />
            </div>

            {/* Notifications Bell */}
            <div className="relative">
              <button 
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className="p-1.5 rounded-sm hover:bg-surface-container-low text-on-surface-variant hover:text-on-surface transition-colors relative focus:outline-none"
                title="Notificaciones"
              >
                <span className="material-symbols-outlined text-[20px]">notifications</span>
                {notifications.some(n => !n.read) && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-error rounded-full animate-pulse"></span>
                )}
              </button>

              {isNotificationsOpen && (
                <>
                  {/* Backdrop para cerrar el panel */}
                  <div 
                    onClick={() => setIsNotificationsOpen(false)}
                    className="fixed inset-0 z-40"
                  />
                  <div className="absolute right-0 mt-2 w-80 bg-surface border border-outline-variant/15 rounded-sm shadow-xl z-50 py-3.5 px-4 text-left space-y-3 animate-fade-in flex flex-col max-h-[380px] overflow-hidden">
                    <div className="flex justify-between items-center border-b border-outline-variant/10 pb-2.5 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-xs text-primary">notifications</span>
                        <h4 className="font-bold text-xs text-primary">Notificaciones</h4>
                      </div>
                      <div className="flex gap-2">
                        {notifications.length > 0 && (
                          <>
                            <button 
                              onClick={async () => {
                                setNotifications(prev => prev.map(n => ({ ...n, read: true })));
                                const client = supabase;
                                if (!client || !selectedCompanyId) return;
                                try {
                                  const { data: { session } } = await client.auth.getSession();
                                  if (!session) return;
                                  await fetch(`/api/notifications?companyId=${selectedCompanyId}`, {
                                    method: 'PUT',
                                    headers: { 'Authorization': `Bearer ${session.access_token}` }
                                  });
                                } catch (e) {
                                  console.error(e);
                                }
                              }}
                              className="text-[9px] font-bold text-primary hover:underline focus:outline-none"
                              title="Marcar todas como leídas"
                            >
                              Leídas
                            </button>
                            <span className="text-outline-variant/30 text-[9px] select-none">|</span>
                            <button 
                              onClick={async () => {
                                if (!window.confirm('¿Seguro que deseas limpiar todo tu historial de notificaciones?')) return;
                                setNotifications([]);
                                const client = supabase;
                                if (!client || !selectedCompanyId) return;
                                try {
                                  const { data: { session } } = await client.auth.getSession();
                                  if (!session) return;
                                  await fetch(`/api/notifications?companyId=${selectedCompanyId}`, {
                                    method: 'DELETE',
                                    headers: { 'Authorization': `Bearer ${session.access_token}` }
                                  });
                                } catch (e) {
                                  console.error(e);
                                }
                              }}
                              className="text-[9px] font-bold text-red-600 hover:underline focus:outline-none"
                              title="Limpiar historial"
                            >
                              Limpiar
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 min-h-0 pr-0.5">
                      {notifications.length === 0 ? (
                        <div className="py-8 text-center text-on-surface-variant/60 flex flex-col items-center justify-center gap-2 select-none">
                          <span className="material-symbols-outlined text-xl text-on-surface-variant/40">notifications_off</span>
                          <span className="text-[10px] font-medium">No tienes notificaciones pendientes</span>
                        </div>
                      ) : (
                        notifications.map((item) => (
                          <div 
                            key={item.id} 
                            onClick={async () => {
                              if (item.read) return;
                              setNotifications(prev => prev.map(n => n.id === item.id ? { ...n, read: true } : n));
                              const client = supabase;
                              if (!client || !selectedCompanyId) return;
                              try {
                                const { data: { session } } = await client.auth.getSession();
                                if (!session) return;
                                await fetch(`/api/notifications?companyId=${selectedCompanyId}&id=${item.id}`, {
                                  method: 'PUT',
                                  headers: { 'Authorization': `Bearer ${session.access_token}` }
                                });
                              } catch (e) {
                                console.error(e);
                              }
                            }}
                            className={`p-2.5 rounded-sm border transition-all cursor-pointer flex gap-3 text-left ${
                              item.read 
                                ? 'bg-surface-container-low/20 border-outline-variant/5 opacity-70' 
                                : 'bg-primary/5 border-primary/10 hover:bg-primary/10 shadow-[0_1px_3px_rgba(0,0,0,0.02)]'
                            }`}
                          >
                            <span className={`material-symbols-outlined text-base shrink-0 mt-0.5 ${
                              item.type === 'success' ? 'text-[#006d37]' : 
                              item.type === 'error' ? 'text-red-600' : 
                              item.type === 'warning' ? 'text-[#b06000]' : 'text-primary'
                            }`}>
                              {item.type === 'success' ? 'check_circle' : 
                               item.type === 'error' ? 'cancel' : 
                               item.type === 'warning' ? 'warning' : 'info'}
                            </span>
                            <div className="space-y-0.5 min-w-0">
                              <h5 className={`text-[10px] font-bold truncate ${item.read ? 'text-on-surface-variant' : 'text-primary'}`}>
                                {item.title}
                              </h5>
                              <p className="text-[10px] text-on-surface-variant leading-relaxed break-words font-medium">
                                {item.description}
                              </p>
                              <span className="block text-[8px] text-on-surface-variant/50 font-mono-data">
                                {item.timestamp}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Dark/Light Mode Toggle */}
            <button 
              onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
              className="p-1.5 rounded-sm hover:bg-surface-container-low text-on-surface-variant hover:text-on-surface transition-colors focus:outline-none"
              title="Cambiar Tema"
            >
              <span className="material-symbols-outlined text-[20px]">
                {theme === 'light' ? 'dark_mode' : 'light_mode'}
              </span>
            </button>

            <div className="h-6 w-px bg-outline-variant/15"></div>
            
            {/* User Profile Info - Solo Avatar Interactivo */}
            <div className="relative">
              <button 
                onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                className="w-8 h-8 rounded-full bg-primary-container hover:opacity-90 transition-all flex items-center justify-center overflow-hidden focus:outline-none border border-outline-variant/10"
                title="Menú de Usuario"
              >
                <span className="material-symbols-outlined text-[18px] text-white select-none leading-none flex items-center justify-center">person</span>
              </button>

              {isUserDropdownOpen && (
                <div className="absolute right-0 mt-2 w-60 bg-surface border border-outline-variant/15 rounded-sm shadow-md z-[100] py-3 text-left">
                  {/* Info del usuario actual activo */}
                  <div className="px-4 py-2 select-none">
                    <p className="text-xs font-bold text-primary">{activeUser.name}</p>
                    <p className="text-[10px] text-on-surface-variant font-semibold opacity-85 leading-tight">{activeUser.role}</p>
                    <p className="text-[9px] text-on-surface-variant/60 font-mono mt-0.5">{activeUser.email}</p>
                  </div>
                  
                  <div className="h-px bg-outline-variant/10 my-2"></div>

                  {/* Bloqueo y Cerrar Sesión */}
                  <button 
                    onClick={() => { setIsLocked(true); setIsUserDropdownOpen(false); }}
                    className="w-full px-4 py-2 text-xs text-on-surface-variant hover:text-primary hover:bg-surface-container-low transition-colors text-left flex items-center gap-2 focus:outline-none"
                  >
                    <span className="material-symbols-outlined text-sm">lock</span>
                    <span>Bloquear Pantalla</span>
                  </button>
                  <button 
                    onClick={() => { setIsChangePasswordModalOpen(true); setIsUserDropdownOpen(false); }}
                    className="w-full px-4 py-2 text-xs text-on-surface-variant hover:text-primary hover:bg-surface-container-low transition-colors text-left flex items-center gap-2 focus:outline-none"
                  >
                    <span className="material-symbols-outlined text-sm">key</span>
                    <span>Modificar Contraseña</span>
                  </button>
                  
                  <div className="h-px bg-outline-variant/10 my-1"></div>

                  <button 
                    onClick={() => { setIsDeleteAccountModalOpen(true); setIsUserDropdownOpen(false); }}
                    className="w-full px-4 py-2 text-xs text-on-surface-variant hover:text-error hover:bg-error-container/10 transition-colors text-left flex items-center gap-2 focus:outline-none"
                  >
                    <span className="material-symbols-outlined text-sm text-error/85">delete_forever</span>
                    <span className="text-error/85 font-semibold">Eliminar Cuenta</span>
                  </button>

                  <div className="h-px bg-outline-variant/10 my-1"></div>

                  <button 
                    onClick={async () => {
                      if (supabase) {
                        await supabase.auth.signOut();
                      }
                      setIsLoggedIn(false);
                      setIsUserDropdownOpen(false);
                    }}
                    className="w-full px-4 py-2 text-xs text-on-surface-variant hover:text-error hover:bg-error-container/10 transition-colors text-left flex items-center gap-2 focus:outline-none"
                  >
                    <span className="material-symbols-outlined text-sm">logout</span>
                    <span>Cerrar Sesión</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Dynamic Tab Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col p-lg pb-[76px] md:pb-lg gap-lg min-h-0">
          
          {/* ESTADO VACÍO CUANDO NO HAY EMPRESAS */}
          {companies.length === 0 && !isLoading && activeTab !== 'settings' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-surface rounded-sm border border-outline-variant/10 shadow-precision max-w-md mx-auto my-auto gap-4 select-none animate-fade-in">
              <div className="w-12 h-12 rounded-full bg-primary/5 flex items-center justify-center border border-primary/10">
                <span className="material-symbols-outlined text-primary text-xl">domain</span>
              </div>
              <h2 className="text-sm font-bold text-primary">Comienza con tu primera empresa</h2>
              <p className="text-xs text-on-surface-variant max-w-xs leading-relaxed">
                Para comenzar a procesar tus facturas, recibos y extractos bancarios, primero debes dar de alta la empresa en la que vas a trabajar.
              </p>
              <button
                onClick={() => setIsCreateCompanyModalOpen(true)}
                className="mt-2 px-6 py-2 bg-primary text-white text-xs font-semibold rounded-sm hover:opacity-95 active:scale-[0.98] transition-all flex items-center gap-2 shadow-precision focus:outline-none"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                <span>Crear Empresa</span>
              </button>
            </div>
          )}

          {/* TAB 1: PANEL DE CONTROL (HISTORIAL Y CHAT HORIZONTAL ABAJO) */}
          {companies.length > 0 && activeTab === 'dashboard' && (
            <div className="flex-1 flex flex-col gap-4 md:gap-8 overflow-y-auto pb-16 md:pb-8 min-h-0 pt-4">
              
              {/* Fila de Tarjetas KPI - Más altas, espaciadas y con sombras sutiles */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 shrink-0">
                {/* KPI 1 */}
                <div className="bg-surface p-6 rounded-sm border border-outline-variant/10 text-left flex flex-col justify-between h-[96px] shadow-precision">
                  <span className="block text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Documentos Procesados</span>
                  <div className="flex items-baseline gap-xs">
                    <span className="text-xl font-bold font-mono-data text-primary">{totalCompletedDocs}</span>
                    <span className="text-[10px] font-bold text-secondary">Total</span>
                  </div>
                </div>

                {/* KPI 2 */}
                <div className="bg-surface p-6 rounded-sm border border-outline-variant/10 text-left flex flex-col justify-between h-[96px] shadow-precision">
                  <span className="block text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Precisión de IA</span>
                  <div className="flex items-baseline gap-xs">
                    <span className="text-xl font-bold font-mono-data text-[#006d37]">{aiPrecisionPercentage}%</span>
                    <span className="text-[9px] text-on-surface-variant font-semibold">Tasa de éxito</span>
                  </div>
                </div>

                {/* KPI 3 */}
                <div className="bg-surface p-6 rounded-sm border border-outline-variant/10 text-left flex flex-col justify-between h-[96px] shadow-precision">
                  <span className="block text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Tiempo Ahorrado</span>
                  <div className="flex items-baseline gap-xs">
                    <span className="text-xl font-bold font-mono-data text-primary">{estimatedTimeSaved}h</span>
                    <span className="text-[9px] text-on-surface-variant font-semibold">Acumulado</span>
                  </div>
                </div>
              </div>

              {/* Fila de Filtros y Acciones - Centrado y limpio en mobile */}
              <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center bg-surface px-6 py-4 rounded-sm border border-outline-variant/10 shrink-0 select-none shadow-precision mb-1">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 w-full sm:w-auto">
                  {/* Status Filter Dropdown */}
                  <div className="relative">
                    <button 
                      onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
                      className={`flex items-center gap-2 px-4 py-1.5 border rounded-sm text-xs font-semibold transition-all focus:outline-none focus:ring-0 ${
                        statusFilter !== 'all' 
                          ? 'bg-secondary/10 border-secondary/30 text-secondary' 
                          : 'border-outline-variant/10 text-on-surface hover:bg-surface-container-low'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[14px]">filter_list</span>
                      {statusFilter === 'all' && 'Filtros'}
                      {statusFilter === 'pending' && 'Pendientes'}
                      {statusFilter === 'processing' && 'Procesando'}
                      {statusFilter === 'completed' && 'Procesados'}
                      {statusFilter === 'error' && 'Errores'}
                      <span className="material-symbols-outlined text-[12px] ml-0.5">expand_more</span>
                    </button>

                    {isFilterDropdownOpen && (
                      <div className="absolute left-0 mt-2 w-44 bg-surface border border-outline-variant/10 rounded-sm shadow-md z-20 py-1 text-left">
                        <button 
                          onClick={() => { setStatusFilter('all'); setIsFilterDropdownOpen(false); }}
                          className={`w-full px-4 py-2 text-xs text-on-surface hover:bg-surface-container-low transition-colors text-left flex items-center justify-between ${statusFilter === 'all' ? 'font-bold bg-surface-container-low' : ''}`}
                        >
                          <span>Todos</span>
                        </button>
                        <button 
                          onClick={() => { setStatusFilter('completed'); setIsFilterDropdownOpen(false); }}
                          className={`w-full px-4 py-2 text-xs text-on-surface hover:bg-surface-container-low transition-colors text-left flex items-center justify-between ${statusFilter === 'completed' ? 'font-bold bg-surface-container-low' : ''}`}
                        >
                          <span>Procesados</span>
                        </button>
                        <button 
                          onClick={() => { setStatusFilter('pending'); setIsFilterDropdownOpen(false); }}
                          className={`w-full px-4 py-2 text-xs text-on-surface hover:bg-surface-container-low transition-colors text-left flex items-center justify-between ${statusFilter === 'pending' ? 'font-bold bg-surface-container-low' : ''}`}
                        >
                          <span>Pendientes</span>
                        </button>
                        <button 
                          onClick={() => { setStatusFilter('processing'); setIsFilterDropdownOpen(false); }}
                          className={`w-full px-4 py-2 text-xs text-on-surface hover:bg-surface-container-low transition-colors text-left flex items-center justify-between ${statusFilter === 'processing' ? 'font-bold bg-surface-container-low' : ''}`}
                        >
                          <span>Procesando</span>
                        </button>
                        <button 
                          onClick={() => { setStatusFilter('error'); setIsFilterDropdownOpen(false); }}
                          className={`w-full px-4 py-2 text-xs text-on-surface hover:bg-surface-container-low transition-colors text-left flex items-center justify-between ${statusFilter === 'error' ? 'font-bold bg-surface-container-low' : ''}`}
                        >
                          <span>Errores</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Date Filter Dropdown */}
                  <div className="relative">
                    <button 
                      onClick={() => setIsDateDropdownOpen(!isDateDropdownOpen)}
                      className={`flex items-center gap-2 px-4 py-1.5 border rounded-sm text-xs font-semibold transition-all focus:outline-none focus:ring-0 ${
                        dateFilter !== 'all' 
                          ? 'bg-primary/5 border-primary/20 text-primary font-bold' 
                          : 'border-outline-variant/10 text-on-surface hover:bg-surface-container-low'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                      {dateFilter === 'all' && 'Fecha: Todos'}
                      {dateFilter === '30days' && 'Últimos 30 días'}
                      {dateFilter === '60days' && 'Últimos 60 días'}
                      {dateFilter === '90days' && 'Últimos 90 días'}
                      {dateFilter === 'custom' && 'Rango personalizado'}
                      <span className="material-symbols-outlined text-[12px] ml-0.5">expand_more</span>
                    </button>

                    {isDateDropdownOpen && (
                      <>
                        <div 
                          onClick={() => setIsDateDropdownOpen(false)}
                          className="fixed inset-0 z-10"
                        />
                        <div className="absolute left-0 mt-2 w-64 bg-surface border border-outline-variant/10 rounded-sm shadow-md z-20 py-2.5 px-3 text-left space-y-2">
                          <button 
                            onClick={() => { setDateFilter('all'); setIsDateDropdownOpen(false); }}
                            className={`w-full px-3 py-1.5 rounded-sm text-xs text-on-surface hover:bg-surface-container-low transition-colors text-left ${dateFilter === 'all' ? 'font-bold bg-surface-container-low text-primary' : ''}`}
                          >
                            Todos
                          </button>
                          <button 
                            onClick={() => { setDateFilter('30days'); setIsDateDropdownOpen(false); }}
                            className={`w-full px-3 py-1.5 rounded-sm text-xs text-on-surface hover:bg-surface-container-low transition-colors text-left ${dateFilter === '30days' ? 'font-bold bg-surface-container-low text-primary' : ''}`}
                          >
                            Últimos 30 días
                          </button>
                          <button 
                            onClick={() => { setDateFilter('60days'); setIsDateDropdownOpen(false); }}
                            className={`w-full px-3 py-1.5 rounded-sm text-xs text-on-surface hover:bg-surface-container-low transition-colors text-left ${dateFilter === '60days' ? 'font-bold bg-surface-container-low text-primary' : ''}`}
                          >
                            Últimos 60 días
                          </button>
                          <button 
                            onClick={() => { setDateFilter('90days'); setIsDateDropdownOpen(false); }}
                            className={`w-full px-3 py-1.5 rounded-sm text-xs text-on-surface hover:bg-surface-container-low transition-colors text-left ${dateFilter === '90days' ? 'font-bold bg-surface-container-low text-primary' : ''}`}
                          >
                            Últimos 90 días
                          </button>
                          <div className="h-px bg-outline-variant/5 my-1"></div>
                          
                          {/* Rango Personalizado */}
                          <div className="space-y-2">
                            <button 
                              onClick={() => setDateFilter('custom')}
                              className={`w-full px-3 py-1.5 rounded-sm text-xs text-on-surface hover:bg-surface-container-low transition-colors text-left ${dateFilter === 'custom' ? 'font-bold bg-surface-container-low text-primary' : ''}`}
                            >
                              Rango personalizado...
                            </button>
                            
                            {dateFilter === 'custom' && (
                              <div className="space-y-2 p-2 bg-surface-container-low/50 rounded-sm border border-outline-variant/5 mt-1 animate-fade-in">
                                <div className="space-y-1">
                                  <label className="block text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Desde:</label>
                                  <input 
                                    type="date"
                                    value={customStartDate}
                                    onChange={(e) => setCustomStartDate(e.target.value)}
                                    className="w-full bg-surface border border-outline-variant/10 rounded-sm py-1 px-2 text-[11px] font-semibold text-primary focus:outline-none"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="block text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Hasta:</label>
                                  <input 
                                    type="date"
                                    value={customEndDate}
                                    onChange={(e) => setCustomEndDate(e.target.value)}
                                    className="w-full bg-surface border border-outline-variant/10 rounded-sm py-1 px-2 text-[11px] font-semibold text-primary focus:outline-none"
                                  />
                                </div>
                                <div className="flex justify-end gap-2 pt-1">
                                  <button 
                                    onClick={() => {
                                      setCustomStartDate('');
                                      setCustomEndDate('');
                                      setDateFilter('all');
                                      setIsDateDropdownOpen(false);
                                    }}
                                    className="text-[10px] text-on-surface-variant hover:text-primary transition-colors focus:outline-none"
                                  >
                                    Limpiar
                                  </button>
                                  <button 
                                    onClick={() => setIsDateDropdownOpen(false)}
                                    className="px-2 py-0.5 bg-primary text-white text-[10px] font-bold rounded-sm hover:opacity-95 active:scale-95 transition-all focus:outline-none"
                                  >
                                    Aplicar
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 w-full sm:w-auto">
                  {/* Botón Eliminar Seleccionados */}
                  <button 
                    onClick={handleDeleteSelectedDocs}
                    disabled={selectedDocIds.length === 0}
                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-error/10 text-error border border-error/20 rounded-sm text-xs font-semibold hover:bg-error/20 active:scale-[0.98] transition-all disabled:opacity-0 disabled:pointer-events-none focus:outline-none"
                  >
                    <span className="material-symbols-outlined text-[14px]">delete</span>
                    Eliminar ({selectedDocIds.length})
                  </button>
                  <div className="relative">
                  <button 
                    onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
                    disabled={selectedDocIds.length === 0}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-1.5 bg-secondary text-white rounded-sm text-xs font-semibold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none focus:outline-none"
                  >
                    <span className="material-symbols-outlined text-[14px] text-white">download_for_offline</span>
                    Exportar ContaPlus ({selectedDocIds.length})
                    <span className="material-symbols-outlined text-[12px] text-white ml-0.5">expand_more</span>
                  </button>

                  {isExportDropdownOpen && selectedDocIds.length > 0 && (
                    <div className="absolute right-0 mt-2 w-56 bg-surface border border-outline-variant/10 rounded-sm shadow-md z-20 py-1 text-left left-1/2 -translate-x-1/2 sm:left-auto sm:right-0 sm:translate-x-0">
                      <button 
                        onClick={() => { handleExportContaplus('2008', 'txt'); setIsExportDropdownOpen(false); }}
                        className="w-full px-4 py-2 text-xs text-on-surface hover:bg-surface-container-low transition-colors flex items-center justify-between"
                      >
                        <span>ContaPlus 2008 (TXT)</span>
                        <span className="text-[9px] bg-primary-container text-on-primary-container px-1 py-0.5 rounded-sm">ASCII</span>
                      </button>
                      <button 
                        onClick={() => { handleExportContaplus('2008', 'csv'); setIsExportDropdownOpen(false); }}
                        className="w-full px-4 py-2 text-xs text-on-surface hover:bg-surface-container-low transition-colors flex items-center justify-between"
                      >
                        <span>ContaPlus 2008 (CSV)</span>
                        <span className="text-[9px] bg-secondary-container/30 text-secondary px-1 py-0.5 rounded-sm">Delimited</span>
                      </button>
                      <div className="h-px bg-outline-variant/5 my-1"></div>
                      <button 
                        onClick={() => { handleExportContaplus('2011', 'txt'); setIsExportDropdownOpen(false); }}
                        className="w-full px-4 py-2 text-xs text-on-surface hover:bg-surface-container-low transition-colors flex items-center justify-between"
                      >
                        <span>ContaPlus 2011 (TXT)</span>
                        <span className="text-[9px] bg-primary-container text-on-primary-container px-1 py-0.5 rounded-sm">ASCII</span>
                      </button>
                      <button 
                        onClick={() => { handleExportContaplus('2011', 'csv'); setIsExportDropdownOpen(false); }}
                        className="w-full px-4 py-2 text-xs text-on-surface hover:bg-surface-container-low transition-colors flex items-center justify-between"
                      >
                        <span>ContaPlus 2011 (CSV)</span>
                        <span className="text-[9px] bg-secondary-container/30 text-secondary px-1 py-0.5 rounded-sm">Delimited</span>
                      </button>
                    </div>
                  )}
                </div>
                </div>
              </div>

              {/* Tabla de Historial de Documentos */}
              <section className="flex flex-col bg-surface rounded-sm border border-outline-variant/10 overflow-hidden shadow-precision" style={{ minHeight: '400px' }}>
                <div className="flex-1 overflow-auto custom-scrollbar min-h-0">
                  {isLoading ? (
                    <div className="h-full w-full flex items-center justify-center py-10 text-on-surface-variant text-xs">
                      <span className="animate-spin material-symbols-outlined mr-2 text-xs">progress_activity</span>
                      Cargando documentos contables...
                    </div>
                  ) : filteredDocs.length === 0 ? (
                    <div className="h-full w-full flex flex-col items-center justify-center py-10 text-on-surface-variant gap-sm">
                      <span className="material-symbols-outlined text-2xl">receipt_long</span>
                      <p className="text-xs">No se encontraron registros de documentos.</p>
                      <button 
                        onClick={() => setActiveTab('documents')}
                        className="text-xs text-primary font-bold underline hover:opacity-85"
                      >
                        Subir tu primer documento
                      </button>
                    </div>
                  ) : (
                    <table className="w-full text-left zebra-table border-collapse">
                      <thead className="sticky top-0 bg-surface z-10">
                        <tr className="border-b border-outline-variant/5">
                          <th className="py-3 px-6 w-10">
                            <input 
                              type="checkbox"
                              checked={selectedDocIds.length === documents.length && documents.length > 0}
                              onChange={handleSelectAll}
                              className="rounded-sm border-outline-variant/20 text-secondary focus:ring-secondary/30 h-3.5 w-3.5"
                            />
                          </th>
                          <th className="py-3 px-6 text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">Documento</th>
                          <th className="py-3 px-6 text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">Estado</th>
                          <th className="py-3 px-6 text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">Fecha</th>
                          <th className="py-3 px-6 text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">Monto</th>
                          <th className="py-3 px-6 text-[9px] font-bold text-on-surface-variant uppercase tracking-widest text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="text-[11px] divide-y divide-outline-variant/10">
                        {filteredDocs.map((doc) => {
                          const entry = entries.find(e => e.document_id === doc.id);
                          const amount = entry 
                            ? entry.lines.filter(l => l.line_type === 'debe').reduce((sum, l) => sum + l.amount, 0)
                            : 1240.50;
                          return (
                            <tr key={doc.id} className="hover:bg-secondary/5 transition-colors group">
                              <td className="py-4 px-6">
                                <input 
                                  type="checkbox"
                                  checked={selectedDocIds.includes(doc.id)}
                                  onChange={() => handleSelectRow(doc.id)}
                                  className="row-selector rounded-sm border-outline-variant text-secondary focus:ring-secondary/50 h-3.5 w-3.5"
                                />
                              </td>
                              <td className="py-4 px-6">
                                <div className="flex items-start gap-3">
                                  <span className="material-symbols-outlined text-on-surface-variant mt-0.5 text-base">description</span>
                                  <div className="flex flex-col text-left">
                                    {(() => {
                                      const { type: displayType, description: displayDesc } = getDocumentDisplayInfo(doc);
                                      return (
                                        <>
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="font-semibold text-primary">{doc.name}</span>
                                            {/* Subtype Badge */}
                                            <span className="px-1.5 py-0.5 text-[8px] font-bold rounded-sm uppercase tracking-wider bg-secondary/10 text-secondary border border-secondary/15">
                                              {displayType}
                                            </span>
                                            {/* Insignias de Almacenamiento */}
                                            {doc.storage_type === 'local' && (
                                              <span className={`px-1.5 py-0.5 text-[8px] font-bold rounded-sm uppercase tracking-wider ${
                                                availableLocalDocIds.includes(doc.id) 
                                                  ? 'bg-primary/5 text-primary border border-primary/10' 
                                                  : 'bg-amber-500/10 text-amber-500 border border-amber-500/10'
                                              }`}>
                                                Local
                                              </span>
                                            )}
                                            {doc.storage_type === 'drive' && (
                                              <span className="px-1.5 py-0.5 text-[8px] font-bold rounded-sm uppercase tracking-wider bg-secondary/5 text-secondary border border-secondary/10">
                                                Drive
                                              </span>
                                            )}
                                            {(!doc.storage_type || doc.storage_type === 'supabase') && (
                                              <span className="px-1.5 py-0.5 text-[8px] font-bold rounded-sm uppercase tracking-wider bg-surface-container-high text-on-surface-variant/80 border border-outline-variant/5">
                                                Nube
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-1.5 mt-0.5">
                                            <span className="text-[9px] text-on-surface-variant truncate max-w-[200px] md:max-w-[320px] italic" title={displayDesc}>
                                              {displayDesc}
                                            </span>
                                            {doc.storage_type === 'local' && !availableLocalDocIds.includes(doc.id) && (
                                              <span className="flex items-center text-amber-500 text-[8px] font-bold gap-0.5 select-none" title="Este archivo binario se guardó localmente en otro navegador o dispositivo y no está disponible aquí. Importa un backup para visualizarlo.">
                                                <span className="material-symbols-outlined text-[10px]">warning</span>
                                                No disponible en este dispositivo
                                              </span>
                                            )}
                                          </div>
                                        </>
                                      );
                                    })()}
                                  </div>
                                </div>
                              </td>
                              <td className="py-4 px-6">
                                <span className={`px-2.5 py-1 text-[9px] font-bold rounded-sm uppercase tracking-wider ${
                                  doc.status === 'completed' ? 'bg-secondary/10 text-secondary' : 
                                  doc.status === 'processing' ? 'bg-primary/10 text-primary animate-pulse' : 
                                  doc.status === 'error' ? 'bg-error/10 text-error' : 'bg-surface-container-high text-on-surface-variant/80'
                                }`}>
                                  {doc.status === 'completed' ? 'Procesado' : 
                                   doc.status === 'processing' ? 'Procesando' : 
                                   doc.status === 'error' ? 'Error' : 'Pendiente'}
                                </span>
                              </td>
                              <td className="py-4 px-6 font-mono-data text-on-surface-variant text-[10px]">
                                {new Date(doc.created_at).toLocaleDateString('es-ES', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </td>
                              <td className="py-4 px-6 font-bold font-mono-data text-primary">
                                ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="py-4 px-6 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {entry ? (
                                    <>
                                      <button 
                                        onClick={() => setActiveEntryForModal(entry)}
                                        className="p-1.5 rounded-sm hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors focus:outline-none" 
                                        title="Ver Asiento Contable"
                                      >
                                        <span className="material-symbols-outlined text-[16px]">visibility</span>
                                      </button>
                                      <button 
                                        onClick={() => handleDownloadPDF(entry)}
                                        className="p-1.5 rounded-sm hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors focus:outline-none" 
                                        title="Descargar PDF Asiento"
                                      >
                                        <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                                      </button>
                                    </>
                                  ) : (
                                    <span className="text-[10px] text-on-surface-variant/40 italic mr-xs">Sin Asiento</span>
                                  )}
                                  <button 
                                    onClick={() => handleDownloadDocument(doc)}
                                    className="p-1.5 rounded-sm hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors focus:outline-none" 
                                    title="Descargar Documento Original"
                                  >
                                    <span className="material-symbols-outlined text-[16px]">download</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>

              {/* Gemini Chat Area - Reubicado abajo en horizontal de ancho completo con optimización móvil */}
              <div className="h-80 md:h-[380px] flex flex-col bg-surface border border-outline-variant/10 rounded-sm overflow-hidden shrink-0 shadow-precision mt-4">
                {/* Chat Header - Diseño integrado y minimalista */}
                <div className="bg-surface-container-low px-4 md:px-6 py-3.5 flex items-center justify-between shrink-0 border-b border-outline-variant/10">
                  <div className="flex items-center gap-2 text-primary">
                    <span className="material-symbols-outlined text-secondary text-sm material-symbols-fill">auto_awesome</span>
                    <span className="font-bold text-xs text-primary">Chat con Gemini Intelligence</span>
                  </div>
                  {selectedDocIds.length > 0 && (
                    <span className="bg-secondary/10 text-secondary px-2 py-0.5 md:px-2.5 md:py-1 rounded-sm text-[8px] md:text-[9px] font-bold tracking-wider animate-pulse">
                      {selectedDocIds.length} DOC SELECCIONADO{selectedDocIds.length > 1 ? 'S' : ''}
                    </span>
                  )}
                </div>

                {/* Chat messages area */}
                <div className="flex-1 p-4 md:p-6 overflow-y-auto custom-scrollbar space-y-4 bg-surface-container-lowest/10">
                  {/* Mensaje de Bienvenida del Asistente */}
                  <div className="flex gap-2.5 md:gap-3 max-w-full">
                    <div className="w-6 h-6 rounded-sm bg-primary/10 flex-shrink-0 flex items-center justify-center text-primary">
                      <span className="material-symbols-outlined text-xs material-symbols-fill text-primary">auto_awesome</span>
                    </div>
                    <div className="flex flex-col text-left max-w-[92%] md:max-w-[90%]">
                      <span className="text-[8px] text-on-surface-variant font-bold uppercase tracking-wider mb-1">Gemini • 10:24 AM</span>
                      <div className="p-3 px-3.5 bg-surface-container-low text-on-surface rounded-sm border border-outline-variant/5 text-xs leading-relaxed">
                        ¡Hola! He indexado tu libro mayor y PGC. Selecciona uno o más documentos de la tabla superior y pídeme que los sume, analice el IVA, extraiga discrepancias o categorice los gastos.
                      </div>
                    </div>
                  </div>

                  {chatMessages.slice(1).map((msg, index) => (
                    <div key={index} className={`flex gap-2.5 md:gap-3 max-w-full ${msg.sender === 'user' ? 'justify-end' : ''}`}>
                      {msg.sender === 'ai' && (
                        <div className="w-6 h-6 rounded-sm bg-primary/10 flex-shrink-0 flex items-center justify-center text-primary">
                          <span className="material-symbols-outlined text-xs material-symbols-fill text-primary">auto_awesome</span>
                        </div>
                      )}
                      <div className={`flex flex-col max-w-[92%] md:max-w-[90%] ${msg.sender === 'user' ? 'text-right items-end' : 'text-left'}`}>
                        <span className="text-[8px] text-on-surface-variant font-bold uppercase tracking-wider mb-1">
                          {msg.sender === 'user' ? 'Tú • 10:25 AM' : 'Gemini • 10:26 AM'}
                        </span>
                        <div className={`p-3 px-3.5 rounded-sm text-xs leading-relaxed border ${
                          msg.sender === 'user' 
                            ? 'bg-primary-container/10 text-primary border-primary-container/10' 
                            : 'bg-surface-container-low text-on-surface border-outline-variant/5'
                        }`}>
                          {msg.text.split('\n').map((para, i) => <p key={i} className={i > 0 ? 'mt-1' : ''}>{para}</p>)}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {isChatLoading && (
                    <div className="flex gap-2.5 md:gap-3 max-w-full">
                      <div className="w-6 h-6 rounded-sm bg-primary/10 flex-shrink-0 flex items-center justify-center text-primary">
                        <span className="material-symbols-outlined text-xs animate-spin">progress_activity</span>
                      </div>
                      <div className="bg-surface-container-low p-3 px-3.5 rounded-sm border border-outline-variant/5 text-xs text-on-surface-variant italic">
                        Gemini está procesando...
                      </div>
                    </div>
                  )}
                  <div ref={chatStreamEndRef} />
                </div>

                {/* Input area - Horizontal y de ancho completo abajo */}
                <div className="p-3 md:p-4 px-4 md:px-6 bg-surface border-t border-outline-variant/10 shrink-0">
                  {chatAttachedFile && (
                    <div className="flex items-center gap-1.5 bg-secondary/10 border border-secondary/20 px-2.5 py-1 rounded-sm text-[10px] text-secondary font-semibold w-max mb-2 animate-fade-in">
                      <span className="material-symbols-outlined text-xs">attach_file</span>
                      <span className="truncate max-w-[200px]">{chatAttachedFile.name}</span>
                      <button 
                        onClick={() => setChatAttachedFile(null)}
                        className="material-symbols-outlined text-[10px] text-secondary hover:text-error ml-1 focus:outline-none"
                      >
                        close
                      </button>
                    </div>
                  )}
                  <div className="border border-outline-variant/10 rounded-sm overflow-hidden flex items-center bg-surface-container-lowest px-3 md:px-4 py-2 md:py-3 focus-within:border-primary/50 transition-colors">
                    <input 
                      type="file" 
                      ref={chatFileInputRef} 
                      onChange={handleChatFileChange} 
                      className="hidden" 
                      accept="image/*,application/pdf,text/*" 
                    />
                    <button 
                      onClick={() => chatFileInputRef.current?.click()}
                      className="flex items-center text-on-surface-variant hover:text-primary mr-2 md:mr-3 focus:outline-none"
                      title="Adjuntar archivo (Imagen o PDF)"
                    >
                      <span className="material-symbols-outlined text-base">attach_file</span>
                    </button>
                    <input 
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSendMessage(); }}
                      disabled={isChatLoading}
                      className="flex-1 bg-transparent py-2 md:py-3 text-[15px] md:text-sm focus:outline-none disabled:opacity-60 text-on-surface placeholder:text-on-surface-variant/60" 
                      placeholder={selectedDocIds.length > 0 
                        ? "Preguntar sobre filas seleccionadas..." 
                        : "Escribe tu consulta o adjunta un archivo..."
                      } 
                      type="text"
                    />
                    <button 
                      onClick={handleSendMessage}
                      disabled={isChatLoading || (!chatInput.trim() && !chatAttachedFile)}
                      className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center bg-secondary text-white rounded-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none ml-2 md:ml-3 focus:outline-none"
                    >
                      <span className="material-symbols-outlined text-sm text-white">send</span>
                    </button>
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* TAB 2: CARGA Y CONFIGURACIÓN (DETALLADA) */}
          {companies.length > 0 && activeTab === 'documents' && (
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-8 min-h-0 pt-4 pb-12">
              
              <div className="mb-4 text-left select-none">
                <p className="text-sm text-on-surface-variant leading-relaxed">
                  Centraliza tus facturas, recibos y extractos bancarios para que Gemini genere tus asientos contables de forma automatizada.
                </p>
              </div>

              {/* Selector de tipo de carga (Dropdown Premium) */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 shrink-0 select-none mb-4 bg-surface p-4 rounded-sm border border-outline-variant/10 shadow-precision text-left">
                <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest shrink-0">Categoría de Importación:</span>
                <div className="relative w-full sm:w-64">
                  <button 
                    onClick={() => setIsDocTypeDropdownOpen(!isDocTypeDropdownOpen)}
                    className="w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-surface-container-low border border-outline-variant/15 hover:border-primary/50 text-xs font-semibold rounded-sm text-primary transition-all focus:outline-none select-none shadow-sm cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px] text-secondary">
                        {uploadType === 'Facturas cliente' || uploadType === 'Factura proveedor' ? 'receipt' :
                         uploadType === 'Extractos bancarios' ? 'account_balance' :
                         uploadType === 'Recibos' ? 'receipt_long' :
                         uploadType === 'Tickets simplificados' ? 'sell' :
                         uploadType === 'Escrituras-contratos' ? 'history_edu' :
                         uploadType === 'Liquidación de impuestos' ? 'percent' :
                         uploadType === 'Nominas' ? 'badge' :
                         uploadType === 'Seguros sociales' ? 'shield' : 'folder_open'}
                      </span>
                      <span>{uploadType}</span>
                    </div>
                    <span className="material-symbols-outlined text-[14px] text-on-surface-variant transition-transform duration-200" style={{ transform: isDocTypeDropdownOpen ? 'rotate(180deg)' : 'none' }}>
                      expand_more
                    </span>
                  </button>

                  {isDocTypeDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setIsDocTypeDropdownOpen(false)} />
                      <div className="absolute left-0 mt-1.5 w-full bg-surface border border-outline-variant/15 rounded-sm shadow-lg z-30 py-1 max-h-64 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-top-1 duration-150">
                        {[
                          'Facturas cliente',
                          'Factura proveedor',
                          'Extractos bancarios',
                          'Recibos',
                          'Tickets simplificados',
                          'Escrituras-contratos',
                          'Liquidación de impuestos',
                          'Nominas',
                          'Seguros sociales',
                          'Otros'
                        ].map((type) => (
                          <button
                            key={type}
                            onClick={() => {
                              setUploadType(type);
                              setIsDocTypeDropdownOpen(false);
                            }}
                            className={`w-full px-4 py-2 text-xs text-left transition-colors flex items-center gap-2.5 ${
                              uploadType === type 
                                ? 'bg-secondary/10 text-secondary font-bold' 
                                : 'text-on-surface hover:bg-surface-container-low'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[14px] opacity-75">
                              {type === 'Facturas cliente' || type === 'Factura proveedor' ? 'receipt' :
                               type === 'Extractos bancarios' ? 'account_balance' :
                               type === 'Recibos' ? 'receipt_long' :
                               type === 'Tickets simplificados' ? 'sell' :
                               type === 'Escrituras-contratos' ? 'history_edu' :
                               type === 'Liquidación de impuestos' ? 'percent' :
                               type === 'Nominas' ? 'badge' :
                               type === 'Seguros sociales' ? 'shield' : 'folder_open'}
                            </span>
                            <span>{type}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Grid layout - Responsivo para Tablet y Móvil */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-8 shrink-0">
                
                {/* Left Side: Upload zone */}
                <div className="col-span-1 md:col-span-7 lg:col-span-8 flex flex-col gap-6">
                  {isBulkMode ? (
                    <div className="bg-surface rounded-sm border border-outline-variant/10 p-6 flex flex-col gap-6 shadow-precision">
                      <div className="flex justify-between items-center border-b border-outline-variant/10 pb-4">
                        <div>
                          <h3 className="font-bold text-sm text-primary text-left">Bandeja de Carga Masiva</h3>
                          <p className="text-[10px] text-on-surface-variant font-medium text-left">Asigna la categoría a cada documento antes de iniciar</p>
                        </div>
                        <span className="text-[10px] bg-secondary-container/30 text-secondary font-bold px-2.5 py-1 rounded-sm uppercase tracking-wider">
                          {bulkFiles.length} Archivos
                        </span>
                      </div>

                      {/* Lista de archivos */}
                      <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
                        {bulkFiles.map((item) => (
                          <div key={item.id} className="p-3 border border-outline-variant/10 rounded-sm space-y-3 bg-surface-container-low/20">
                            <div className="flex justify-between items-center gap-4">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="material-symbols-outlined text-primary text-sm shrink-0">
                                  {item.status === 'completed' ? 'check_circle' : item.status === 'error' ? 'error' : 'receipt_long'}
                                </span>
                                <span className="text-[11px] font-semibold truncate text-on-surface text-left" title={item.file.name}>
                                  {item.file.name}
                                </span>
                                <span className="text-[9px] text-on-surface-variant/70 font-mono shrink-0">
                                  ({(item.file.size / 1024).toFixed(0)} KB)
                                </span>
                              </div>
                              
                              {/* Botón eliminar (solo si no se está procesando) */}
                              {!isBulkProcessing && item.status === 'pending' && (
                                <button 
                                  onClick={() => setBulkFiles(prev => prev.filter(f => f.id !== item.id))}
                                  className="p-1 text-on-surface-variant hover:text-red-600 rounded-sm hover:bg-surface-container-high transition-colors focus:outline-none"
                                >
                                  <span className="material-symbols-outlined text-xs">delete</span>
                                </button>
                              )}
                            </div>

                            {/* Selector de tipo (Dropdown Premium para Carga Masiva) */}
                            {item.status === 'pending' ? (
                              <div className="flex items-center gap-2 pt-1 text-left select-none">
                                <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Categoría:</span>
                                <select
                                  disabled={isBulkProcessing}
                                  value={item.type}
                                  onChange={(e) => setBulkFiles(prev => prev.map(f => f.id === item.id ? { ...f, type: e.target.value } : f))}
                                  className="px-2.5 py-1 bg-surface border border-outline-variant/15 text-[10px] font-semibold rounded-sm text-primary transition-all focus:outline-none cursor-pointer focus:border-primary/50"
                                >
                                  {[
                                    'Factura proveedor',
                                    'Facturas cliente',
                                    'Extractos bancarios',
                                    'Recibos',
                                    'Tickets simplificados',
                                    'Escrituras-contratos',
                                    'Liquidación de impuestos',
                                    'Nominas',
                                    'Seguros sociales',
                                    'Otros'
                                  ].map((cat) => (
                                    <option key={cat} value={cat}>
                                      {cat}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ) : (
                              <div className="space-y-1.5 pt-1">
                                <div className="flex justify-between items-center text-[9px] font-bold uppercase tracking-wider">
                                  <span className={
                                    item.status === 'completed' ? 'text-[#006d37]' : 
                                    item.status === 'error' ? 'text-red-600' : 'text-primary'
                                  }>
                                    {item.status === 'uploading' && 'Subiendo archivo...'}
                                    {item.status === 'analyzing' && 'Analizando con Gemini...'}
                                    {item.status === 'completed' && 'Procesado con éxito'}
                                    {item.status === 'error' && `Error: ${item.errorMsg || 'Falló el análisis'}`}
                                  </span>
                                  <span className="font-mono">{item.progress}%</span>
                                </div>
                                <div className="w-full h-1 bg-surface-container-high rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full transition-all duration-300 ${
                                      item.status === 'completed' ? 'bg-[#006d37]' : 
                                      item.status === 'error' ? 'bg-red-600' : 'bg-primary'
                                    }`}
                                    style={{ width: `${item.progress}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Botones de acción inferiores */}
                      <div className="flex justify-end gap-3 border-t border-outline-variant/10 pt-4">
                        <button
                          disabled={isBulkProcessing}
                          onClick={() => { setIsBulkMode(false); setBulkFiles([]); }}
                          className="px-4 py-2 text-xs font-bold text-on-surface-variant hover:text-primary transition-colors focus:outline-none disabled:opacity-40"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={startBulkProcessing}
                          disabled={isBulkProcessing || bulkFiles.length === 0}
                          className="px-5 py-2 bg-primary text-white text-xs font-bold rounded-sm hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-45 disabled:pointer-events-none flex items-center gap-1.5 focus:outline-none"
                        >
                          {isBulkProcessing && <span className="animate-spin material-symbols-outlined text-xs">progress_activity</span>}
                          <span>Iniciar Carga</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ZONA DE ARRASTRE NORMAL (SINGLE / BULK TRIGGER) */
                    <>
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleFileSelection(e.dataTransfer.files);
                        }}
                        className="relative group cursor-pointer transition-all duration-300 border border-dashed border-outline-variant/15 rounded-sm bg-surface-container-low/10 p-12 flex flex-col items-center justify-center gap-6 min-h-[320px] hover:border-secondary/40 hover:bg-surface-container-low/20 shadow-precision"
                      >
                        <div className="w-14 h-14 bg-primary/5 rounded-sm flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                          <span className="material-symbols-outlined text-3xl">cloud_upload</span>
                        </div>
                        <div className="text-center space-y-2">
                          <h3 className="font-bold text-sm text-primary">Seleccionar archivos</h3>
                          <p className="text-[11px] text-on-surface-variant">o arrastre PDF, PNG o JPG aquí</p>
                          <p className="text-[9px] text-on-surface-variant/70">Máx. 25MB por archivo</p>
                        </div>
                        
                        <button 
                          onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                          className="px-5 py-2 bg-primary text-white text-xs font-bold rounded-sm hover:opacity-95 active:scale-[0.98] transition-all focus:outline-none"
                        >
                          Explorar Archivos
                        </button>

                        <input 
                          ref={fileInputRef}
                          onChange={(e) => handleFileSelection(e.target.files)}
                          className="hidden" 
                          type="file" 
                          accept=".pdf,.png,.jpg,.jpeg"
                          multiple={true}
                        />
                      </div>

                      {/* Processing Status Block para subida única */}
                      {isUploading && (
                        <div className="bg-surface rounded-sm border border-outline-variant/10 p-6 flex flex-col gap-4 shadow-precision">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse"></span>
                              <span className="font-bold text-[10px] text-primary uppercase tracking-wider">Análisis Inteligente en Curso</span>
                            </div>
                            <span className="font-mono-data text-xs text-secondary font-bold">{uploadProgress}% Completado</span>
                          </div>
                          <div className="w-full h-1.5 bg-surface-container-high rounded-sm overflow-hidden">
                            <div 
                              className="h-full bg-secondary transition-all duration-300"
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-on-surface-variant text-left">
                            Procesando y extrayendo datos de: <strong className="text-primary">{processingFileName}</strong>
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Right Side: Configuration & Training - Aireado, desaturado y responsivo */}
                <div className="col-span-1 md:col-span-5 lg:col-span-4 flex flex-col gap-6">
                  
                  {/* Train your IA (Configuración Contable) */}
                  <div className="bg-surface rounded-sm border border-outline-variant/10 p-8 flex flex-col gap-6 shadow-precision">
                    <div className="flex items-center gap-2 select-none">
                      <span className="material-symbols-outlined text-primary text-lg">settings</span>
                      <h3 className="font-bold text-xs text-primary uppercase tracking-widest">Configuración Contable</h3>
                    </div>
                    
                    {/* Digit Slider Configuration */}
                    <div className="space-y-4">
                      <div className="flex justify-between items-center text-xs">
                        <label className="font-bold text-on-surface-variant uppercase text-[9px] tracking-wider" htmlFor="subaccount-digits">
                          Dígitos de Subcuenta
                        </label>
                        <span className="font-mono-data text-primary text-xs font-bold bg-surface-container-high px-2.5 py-0.5 rounded-sm">
                          {subaccountDigits}
                        </span>
                      </div>
                      <div className="flex items-center gap-sm">
                        <input 
                          id="subaccount-digits"
                          type="range"
                          min="4"
                          max="12"
                          value={subaccountDigits}
                          onChange={(e) => setSubaccountDigits(Number(e.target.value))}
                          className="w-full h-1 bg-surface-container-high rounded-sm appearance-none cursor-pointer accent-secondary"
                        />
                      </div>
                      <p className="text-[10px] text-on-surface-variant/70 italic leading-snug">
                        La longitud determina el nivel de detalle en su Plan Contable ERP (estándar: 8-10 dígitos).
                      </p>
                    </div>

                    <div className="h-px bg-outline-variant/10"></div>

                    {/* CSV/PDF upload PGC button or Active File display */}
                    {pgcAccounts.length > 0 ? (
                      <div className="bg-surface-container-low/40 rounded-sm border border-outline-variant/10 p-3 flex flex-col gap-2 animate-fade-in text-left">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">Plan Contable Activo</span>
                          <span className="text-[8px] bg-secondary/15 text-secondary px-1.5 py-0.5 rounded-sm font-bold uppercase tracking-wider">
                            {pgcAccounts.length} cuentas
                          </span>
                        </div>
                        <div className="flex items-center gap-3 bg-surface p-2.5 rounded-sm border border-outline-variant/5">
                          <span className="material-symbols-outlined text-secondary text-lg select-none">
                            {pgcMetadataFile?.extension === 'pdf' ? 'picture_as_pdf' : 'table_chart'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-primary truncate leading-normal" title={pgcMetadataFile?.name || 'Plan General Contable'}>
                              {pgcMetadataFile?.name || 'Plan General Contable'}
                            </p>
                            <p className="text-[9px] text-on-surface-variant/80 font-medium">
                              Extensión: .{(pgcMetadataFile?.extension || 'db').toUpperCase()}
                            </p>
                          </div>
                          <button
                            onClick={handleDeletePgc}
                            className="p-1 rounded-full hover:bg-error/15 text-on-surface-variant hover:text-error transition-colors focus:outline-none cursor-pointer"
                            title="Eliminar Plan Contable"
                          >
                            <span className="material-symbols-outlined text-base">delete</span>
                          </button>
                        </div>
                        <p className="text-[9px] text-on-surface-variant/60">
                          Para importar otro Plan Contable, debes eliminar primero el actual.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <button 
                          onClick={() => pgcInputRef.current?.click()}
                          className="w-full flex items-center justify-center gap-2 border border-outline-variant/15 hover:bg-surface-container-low text-xs py-2.5 rounded-sm text-primary font-semibold transition-colors focus:outline-none select-none cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-sm">table_chart</span>
                          <span>Importar Plan Contable (CSV / PDF)</span>
                        </button>
                        <input 
                          ref={pgcInputRef}
                          onChange={handlePgcUpload}
                          type="file" 
                          accept=".csv,.txt,.pdf" 
                          className="hidden"
                        />
                        <p className="text-[9px] text-on-surface-variant/60 text-center select-none">
                          Mapee su catálogo de cuentas contables en formato CSV o PDF.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* System Metrics */}
                  <div className="bg-surface rounded-sm border border-outline-variant/10 p-8 flex flex-col gap-6 text-left select-none shadow-precision">
                    <div className="flex justify-between items-center">
                      <span className="block text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">Velocidad Extracción</span>
                      <span className="text-sm font-bold font-mono-data text-[#006d37]">{getAverageExtractionSpeed()}</span>
                    </div>
                    
                    <div className="h-px bg-outline-variant/10"></div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">
                        <span>Uso Mensual</span>
                        <span className="font-mono-data text-primary">{documents.length} / 5.000</span>
                      </div>
                      <div className="w-full h-1 bg-surface-container-high rounded-sm overflow-hidden">
                        <div 
                          className="h-full bg-primary" 
                          style={{ width: `${Math.min((documents.length / 5000) * 100, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>

                </div>

              </div>

              {/* Recent Uploads Section */}
              <div className="bg-surface rounded-sm border border-outline-variant/10 overflow-hidden mt-6 shrink-0 shadow-precision">
                <div className="px-6 py-4 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low/30 select-none">
                  <h3 className="font-bold text-xs text-primary uppercase tracking-widest">Cargas Recientes</h3>
                  <button onClick={() => setActiveTab('dashboard')} className="text-[11px] font-bold text-primary hover:underline flex items-center gap-xs focus:outline-none">
                    Ver Todo <span className="material-symbols-outlined text-[12px]">arrow_right_alt</span>
                  </button>
                </div>
                <div className="divide-y divide-outline-variant/10">
                  {documents.slice(0, 4).map((doc) => (
                    <div key={doc.id} className="py-4 px-6 flex items-center justify-between hover:bg-surface-container-low/20 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-sm bg-error-container/10 flex items-center justify-center text-error border border-error-container/10">
                          <span className="material-symbols-outlined text-lg">picture_as_pdf</span>
                        </div>
                        <div className="flex flex-col text-left">
                          <span className="font-bold text-xs text-primary">{doc.name}</span>
                          <span className="text-[10px] text-on-surface-variant font-medium">Hace {doc.status === 'completed' ? '2 min' : '15 min'} • 1.2 MB</span>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 text-[9px] font-bold rounded-sm uppercase tracking-wider ${
                        doc.status === 'completed' ? 'bg-secondary/10 text-secondary' : 
                        doc.status === 'processing' ? 'bg-primary/10 text-primary animate-pulse' : 
                        'bg-error/10 text-error'
                      }`}>
                        {doc.status === 'completed' ? 'Procesado' : 
                         doc.status === 'processing' ? 'Pendiente' : 'Revisión'}
                      </span>
                    </div>
                  ))}
                  {documents.length === 0 && (
                    <div className="p-12 text-center text-on-surface-variant text-xs">
                      No hay cargas de documentos recientes.
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* TAB 3: CONFIGURACIÓN */}
          {activeTab === 'settings' && (
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 flex flex-col select-none pt-4 pb-12">
              
              <div className="mb-10 text-left">
                <p className="text-sm text-on-surface-variant leading-relaxed">
                  Verifica y gestiona las conexiones activas con tus servicios y APIs de bases de datos y procesamiento de IA.
                </p>
              </div>

              <div className="max-w-2xl space-y-10">
                
                {/* Supabase Status Card */}
                <div className="bg-surface rounded-sm border border-outline-variant/10 p-8 text-left transition-all duration-200 hover:border-outline-variant/20 shadow-precision">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-on-surface-variant text-lg">database</span>
                      <h3 className="font-bold text-sm text-primary">Base de Datos (Supabase)</h3>
                    </div>
                    <div className="flex items-center">
                      {supabaseStatus === 'connected' ? (
                        <span className="px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase bg-secondary/10 text-secondary rounded-sm">
                          Conectado
                        </span>
                      ) : supabaseStatus === 'checking' ? (
                        <span className="px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase bg-amber-500/10 text-amber-500 rounded-sm">
                          Verificando...
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase bg-error/10 text-error rounded-sm">
                          Error de Conexión
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    Los registros de documentos y asientos contables se sincronizan permanentemente con tu base de datos de Supabase en la nube.
                  </p>
                </div>

                {/* Active AI Provider Selector Card */}
                <div className="bg-surface rounded-sm border border-outline-variant/10 p-6 text-left transition-all duration-200 shadow-precision">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="font-bold text-sm text-primary flex items-center gap-2">
                        <span className="material-symbols-outlined text-secondary">psychology</span>
                        <span>Proveedor de IA Activo</span>
                      </h3>
                      <p className="text-xs text-on-surface-variant/80 mt-1">
                        Selecciona qué modelo de Inteligencia Artificial procesará tus facturas y responderá tus preguntas en el chat.
                      </p>
                    </div>
                    <div className="flex gap-2 bg-surface-container-low p-1 rounded-sm border border-outline-variant/5">
                      <button
                        onClick={() => {
                          setActiveAiProvider('gemini');
                          localStorage.setItem('balance_ai_provider', 'gemini');
                          showToast('Proveedor de IA cambiado a Google Gemini.', 'info');
                        }}
                        className={`px-3 py-1.5 text-xs font-bold rounded-sm transition-all focus:outline-none cursor-pointer ${
                          activeAiProvider === 'gemini'
                            ? 'bg-primary text-white shadow-sm'
                            : 'bg-transparent text-on-surface-variant/80 hover:text-primary'
                        }`}
                      >
                        Google Gemini
                      </button>
                      <button
                        onClick={() => {
                          setActiveAiProvider('zai');
                          localStorage.setItem('balance_ai_provider', 'zai');
                          showToast('Proveedor de IA cambiado a Z.ai (GLM 5.2).', 'info');
                        }}
                        className={`px-3 py-1.5 text-xs font-bold rounded-sm transition-all focus:outline-none cursor-pointer ${
                          activeAiProvider === 'zai'
                            ? 'bg-primary text-white shadow-sm'
                            : 'bg-transparent text-on-surface-variant/80 hover:text-primary'
                        }`}
                      >
                        Z.ai (GLM 5.2)
                      </button>
                    </div>
                  </div>
                </div>

                {/* Gemini Status Card */}
                <div className="bg-surface rounded-sm border border-outline-variant/10 p-8 text-left transition-all duration-200 hover:border-outline-variant/20 shadow-precision">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-on-surface-variant text-lg">auto_awesome</span>
                      <h3 className="font-bold text-sm text-primary">Servicio de IA (Gemini API)</h3>
                    </div>
                    <div className="flex items-center">
                      {hasGeminiKey ? (
                        <span className="px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase bg-secondary/10 text-secondary rounded-sm">
                          Activo
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase bg-error/10 text-error rounded-sm">
                          Inactivo
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-on-surface-variant leading-relaxed mb-6">
                    {hasGeminiKey 
                      ? 'La IA está configurada y lista para procesar de forma automatizada las imágenes y documentos contables en el Tablero.' 
                      : 'La clave API de Gemini no se encuentra. Asegúrate de configurar la variable de entorno GEMINI_API_KEY en tu servidor o ingresarla a continuación.'}
                  </p>

                  {/* Formulario para ingresar/guardar API Key */}
                  <div className="mb-6 bg-surface-container-low p-5 rounded-sm border border-outline-variant/5">
                    <label className="block text-[9px] font-bold text-on-surface-variant uppercase tracking-wider mb-2" htmlFor="gemini-key-input">
                      Configurar Clave API de Gemini
                    </label>
                    <div className="flex gap-2">
                      <input 
                        id="gemini-key-input"
                        type="password"
                        value={geminiInputKey}
                        onChange={(e) => setGeminiInputKey(e.target.value)}
                        placeholder={hasGeminiKey ? "••••••••••••••••••••••••••••••••••••" : "AIzaSy..."}
                        className="flex-1 bg-surface border border-outline-variant/10 rounded-sm py-2 px-3 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-secondary/30 focus:border-secondary transition-all"
                      />
                      <button 
                        onClick={handleSaveGeminiKey}
                        disabled={isSavingKey || !geminiInputKey.trim()}
                        className="px-4 bg-primary text-white text-xs font-bold rounded-sm hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1.5 focus:outline-none"
                      >
                        {isSavingKey ? (
                          <span className="animate-spin material-symbols-outlined text-xs">progress_activity</span>
                        ) : (
                          <span className="material-symbols-outlined text-xs">save</span>
                        )}
                        <span>Guardar</span>
                      </button>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => setShowGeminiHelp(!showGeminiHelp)} 
                    className="text-xs text-primary/70 hover:text-primary font-semibold flex items-center gap-1 transition-colors focus:outline-none focus:ring-0"
                  >
                    <span className="material-symbols-outlined text-sm">
                      {showGeminiHelp ? 'expand_less' : 'expand_more'}
                    </span>
                    <span>{showGeminiHelp ? 'Ocultar guía de API Key' : 'Ver guía de API Key'}</span>
                  </button>

                  {showGeminiHelp && (
                    <div className="mt-6 bg-surface-container-low p-6 rounded-sm border-l-2 border-primary/30 text-xs leading-relaxed text-on-surface-variant transition-all duration-200">
                      <span className="font-semibold text-primary block mb-3 text-xs">Configuración de credenciales:</span>
                      <ol className="list-decimal pl-4 space-y-2 text-xs">
                        <li>Obtén tu API Key de forma gratuita accediendo a <a href="https://aistudio.google.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Google AI Studio</a>.</li>
                        <li>Ingresa la clave en el campo superior o configúrala en tu archivo <code className="font-mono bg-white dark:bg-surface-container-high px-1.5 py-0.5 rounded text-[10px]">.env.local</code> bajo el nombre <code className="font-mono bg-white dark:bg-surface-container-high px-1.5 py-0.5 rounded text-[10px]">GEMINI_API_KEY</code>.</li>
                      </ol>
                    </div>
                  )}
                </div>

                {/* Z.ai Status Card */}
                <div className="bg-surface rounded-sm border border-outline-variant/10 p-8 text-left transition-all duration-200 hover:border-outline-variant/20 shadow-precision">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-on-surface-variant text-lg">electric_bolt</span>
                      <h3 className="font-bold text-sm text-primary">Servicio de IA (Z.ai / GLM 5.2 API)</h3>
                    </div>
                    <div className="flex items-center">
                      {hasZaiKey ? (
                        <span className="px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase bg-secondary/10 text-secondary rounded-sm">
                          Activo
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase bg-error/10 text-error rounded-sm">
                          Inactivo
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-on-surface-variant leading-relaxed mb-6">
                    {hasZaiKey 
                      ? 'Z.ai está configurado y listo para procesar de forma automatizada tus documentos contables usando GLM-5.2 y GLM-4V-Plus.' 
                      : 'La clave API de Z.ai no se encuentra. Configura tu API Key de Z.ai para usar este proveedor ingresándola a continuación.'}
                  </p>

                  {/* Formulario para ingresar/guardar API Key de Z.ai */}
                  <div className="mb-6 bg-surface-container-low p-5 rounded-sm border border-outline-variant/5">
                    <label className="block text-[9px] font-bold text-on-surface-variant uppercase tracking-wider mb-2" htmlFor="zai-key-input">
                      Configurar Clave API de Z.ai
                    </label>
                    <div className="flex gap-2">
                      <input 
                        id="zai-key-input"
                        type="password"
                        value={zaiInputKey}
                        onChange={(e) => setZaiInputKey(e.target.value)}
                        placeholder={hasZaiKey ? "••••••••••••••••••••••••••••••••••••" : "Tu clave de Z.ai / Zhipu..."}
                        className="flex-1 bg-surface border border-outline-variant/10 rounded-sm py-2 px-3 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-secondary/30 focus:border-secondary transition-all"
                      />
                      <button 
                        onClick={handleSaveZaiKey}
                        disabled={isSavingZaiKey || !zaiInputKey.trim()}
                        className="px-4 bg-primary text-white text-xs font-bold rounded-sm hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1.5 focus:outline-none"
                      >
                        {isSavingZaiKey ? (
                          <span className="animate-spin material-symbols-outlined text-xs">progress_activity</span>
                        ) : (
                          <span className="material-symbols-outlined text-xs">save</span>
                        )}
                        <span>Guardar</span>
                      </button>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => setShowZaiHelp(!showZaiHelp)} 
                    className="text-xs text-primary/70 hover:text-primary font-semibold flex items-center gap-1 transition-colors focus:outline-none focus:ring-0"
                  >
                    <span className="material-symbols-outlined text-sm">
                      {showZaiHelp ? 'expand_less' : 'expand_more'}
                    </span>
                    <span>{showZaiHelp ? 'Ocultar guía de API Key' : 'Ver guía de API Key'}</span>
                  </button>

                  {showZaiHelp && (
                    <div className="mt-6 bg-surface-container-low p-6 rounded-sm border-l-2 border-primary/30 text-xs leading-relaxed text-on-surface-variant transition-all duration-200">
                      <span className="font-semibold text-primary block mb-3 text-xs">Configuración de credenciales:</span>
                      <ol className="list-decimal pl-4 space-y-2 text-xs">
                        <li>Obtén tu API Key registrándote en la plataforma oficial de desarrolladores de <a href="https://open.bigmodel.cn" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Zhipu AI / Z.ai</a>.</li>
                        <li>Ingresa la clave en el campo superior o configúrala en tu archivo <code className="font-mono bg-white dark:bg-surface-container-high px-1.5 py-0.5 rounded text-[10px]">.env.local</code> como <code className="font-mono bg-white dark:bg-surface-container-high px-1.5 py-0.5 rounded text-[10px]">Z_AI_API_KEY</code>.</li>
                      </ol>
                    </div>
                  )}
                </div>

                {/* Storage Configuration Card */}
                <div className="bg-surface rounded-sm border border-outline-variant/10 p-8 text-left transition-all duration-200 hover:border-outline-variant/20 shadow-precision">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="material-symbols-outlined text-on-surface-variant text-lg">folder_shared</span>
                    <h3 className="font-bold text-sm text-primary">Destino de Almacenamiento de Documentos</h3>
                  </div>
                  <p className="text-xs text-on-surface-variant leading-relaxed mb-6">
                    Elige dónde se guardarán físicamente las imágenes y los PDFs de tus facturas. Los registros e historial de Supabase siguen estando sincronizados en la nube en todo momento.
                  </p>

                  <div className="space-y-4">
                    {/* Opción 1: Supabase */}
                    <label className="flex items-start gap-3 p-4 rounded-sm border border-outline-variant/10 hover:bg-surface-container-low/30 cursor-pointer transition-all">
                      <input 
                        type="radio" 
                        name="storage-method" 
                        checked={storageMethod === 'supabase'} 
                        onChange={() => handleStorageMethodChange('supabase')}
                        className="mt-0.5 text-secondary focus:ring-secondary focus:ring-0"
                      />
                      <div className="space-y-0.5">
                        <span className="block text-xs font-bold text-primary">Supabase Storage (Nube estándar)</span>
                        <span className="block text-[11px] text-on-surface-variant/80">Recomendado. Almacenamiento persistente y accesible desde cualquier dispositivo o navegador.</span>
                      </div>
                    </label>

                    {/* Opción 2: Local */}
                    <label className="flex items-start gap-3 p-4 rounded-sm border border-outline-variant/10 hover:bg-surface-container-low/30 cursor-pointer transition-all">
                      <input 
                        type="radio" 
                        name="storage-method" 
                        checked={storageMethod === 'local'} 
                        onChange={() => handleStorageMethodChange('local')}
                        className="mt-0.5 text-secondary focus:ring-secondary focus:ring-0"
                      />
                      <div className="space-y-0.5">
                        <span className="block text-xs font-bold text-primary">Almacenamiento Local (Caché del Dispositivo)</span>
                        <span className="block text-[11px] text-on-surface-variant/80">
                          ⚠️ Solo en este navegador. Ahorra espacio de base de datos guardando los archivos en la base de datos local (IndexedDB) de tu teléfono/PC.
                        </span>
                      </div>
                    </label>

                    {/* Opción 3: Google Drive */}
                    <label className="flex items-start gap-3 p-4 rounded-sm border border-outline-variant/10 hover:bg-surface-container-low/30 cursor-pointer transition-all">
                      <input 
                        type="radio" 
                        name="storage-method" 
                        checked={storageMethod === 'drive'} 
                        onChange={() => {
                          handleStorageMethodChange('drive');
                          showToast('Conecta tu cuenta de Google en el paso posterior.', 'info');
                        }}
                        className="mt-0.5 text-secondary focus:ring-secondary focus:ring-0"
                      />
                      <div className="space-y-0.5">
                        <span className="block text-xs font-bold text-primary">Google Drive Personal</span>
                        <span className="block text-[11px] text-on-surface-variant/80">
                          Guarda tus archivos en tu propia nube de Google Drive. Se creará una estructura <code className="font-mono bg-white dark:bg-surface-container-high px-1 rounded">Mi unidad/balance-ai/{'{usuario}'}/</code>.
                        </span>
                      </div>
                    </label>
                  </div>

                  {/* Panel de Copias de seguridad locales */}
                  {storageMethod === 'local' && (
                    <div className="mt-6 pt-6 border-t border-outline-variant/10 space-y-4 animate-fade-in">
                      <h4 className="text-xs font-bold text-primary">Copias de Seguridad (Respaldos Locales)</h4>
                      <p className="text-[11px] text-on-surface-variant leading-relaxed">
                        Evita pérdidas accidentales si limpias el historial de tu navegador. Exporta tu base de datos IndexedDB en un archivo de respaldo o impórtala en otro dispositivo para sincronizar los documentos físicos.
                      </p>
                      <div className="flex flex-wrap gap-2.5">
                        <button 
                          onClick={async () => {
                            try {
                              const backupString = await exportAllLocalDocuments();
                              const blob = new Blob([backupString], { type: 'application/json' });
                              const url = URL.createObjectURL(blob);
                              const link = document.createElement('a');
                              link.href = url;
                              link.download = `balance-ai-backup-${new Date().toISOString().split('T')[0]}.json`;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                              URL.revokeObjectURL(url);
                              showToast('Copia de seguridad exportada con éxito.', 'success');
                            } catch (e: any) {
                              showToast(`Error al exportar: ${e.message}`, 'error');
                            }
                          }}
                          className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-sm hover:opacity-95 active:scale-[0.98] transition-all flex items-center gap-1.5 focus:outline-none"
                        >
                          <span className="material-symbols-outlined text-xs">download</span>
                          <span>Exportar Backup Local</span>
                        </button>

                        <label className="px-4 py-2 bg-secondary text-white text-xs font-bold rounded-sm hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-xs">upload</span>
                          <span>Importar Backup Local</span>
                          <input 
                            type="file" 
                            accept=".json" 
                            className="hidden" 
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = async (event) => {
                                try {
                                  const text = event.target?.result as string;
                                  await importLocalDocuments(text);
                                  showToast('Copia de seguridad importada y restaurada en este dispositivo con éxito.', 'success');
                                  // Recargar datos para refrescar advertencias
                                  fetchData();
                                } catch (err: any) {
                                  showToast(`Fallo al importar backup: ${err.message}`, 'error');
                                }
                              };
                              reader.readAsText(file);
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Panel de Google Drive Auth */}
                  {storageMethod === 'drive' && (
                    <div className="mt-6 pt-6 border-t border-outline-variant/10 space-y-4 animate-fade-in">
                      <h4 className="text-xs font-bold text-primary">Conexión con Google Drive</h4>
                      <p className="text-[11px] text-on-surface-variant leading-relaxed">
                        Debes vincular tu cuenta de Google para permitir que Balance AI cree la carpeta de respaldo y guarde allí los documentos contables que cargues en la aplicación.
                      </p>
                      <div className="flex flex-wrap items-center gap-3">
                        {googleUserEmail ? (
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2 bg-secondary/5 px-3 py-2 border border-secondary/10 rounded-sm">
                              <span className="material-symbols-outlined text-secondary text-sm">cloud_done</span>
                              <span className="text-[11px] font-semibold text-primary">Conectado como: <strong className="text-secondary">{googleUserEmail}</strong></span>
                            </div>
                            <button
                              onClick={() => {
                                setGoogleDriveToken(null);
                                setGoogleUserEmail(null);
                                localStorage.removeItem('balance_ai_google_token');
                                localStorage.removeItem('balance_ai_google_email');
                                showToast('Cuenta de Google Drive desvinculada con éxito.', 'success');
                              }}
                              className="px-3 py-1.5 border border-outline-variant/20 hover:border-error/30 text-on-surface-variant hover:text-error text-[10px] font-bold rounded-sm active:scale-[0.98] transition-all flex items-center gap-1 focus:outline-none w-max"
                            >
                              <span className="material-symbols-outlined text-[12px]">logout</span>
                              <span>Desconectar Cuenta</span>
                            </button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => {
                              showToast('Abriendo ventana de inicio de sesión de Google...', 'info');
                              const width = 500;
                              const height = 600;
                              const left = window.screenX + (window.outerWidth - width) / 2;
                              const top = window.screenY + (window.outerHeight - height) / 2;
                              
                              window.open(
                                '/api/auth/google',
                                'GoogleAuthPopup',
                                `width=${width},height=${height},left=${left},top=${top}`
                              );
                            }}
                            className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-sm hover:opacity-95 active:scale-[0.98] transition-all flex items-center gap-1.5 focus:outline-none"
                          >
                            <span className="material-symbols-outlined text-xs">cloud_sync</span>
                            <span>Conectar Cuenta de Google</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

              </div>

            </div>
          )}
        </div>
      </main>

      {/* Entry Detail Floating Modal Overlay */}
      {activeEntryForModal && (
        <EntryModal 
          entry={activeEntryForModal}
          onClose={() => setActiveEntryForModal(null)}
          onAddSubaccount={handleAddSubaccount}
          onApprove={handleApproveDocument}
          existingSubaccounts={pgcAccounts.map(a => a.code)}
        />
      )}

      {/* Modal para Modificar Contraseña */}
      {isChangePasswordModalOpen && (
        <div className="fixed inset-0 bg-background/40 backdrop-blur-md flex items-center justify-center z-[999] p-4 animate-fade-in">
          <div className="bg-surface border border-outline-variant/15 w-full max-w-md p-8 rounded-sm shadow-2xl relative text-left">
            <h3 className="font-bold text-headline-sm text-primary mb-2">Modificar Contraseña</h3>
            <p className="text-xs text-on-surface-variant mb-6">Ingresa tu nueva contraseña para actualizar el acceso a tu cuenta.</p>
            
            <form onSubmit={handleUpdatePassword} className="space-y-6">
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest" htmlFor="new-password">
                  Nueva Contraseña (mín. 6 caracteres)
                </label>
                <div className="relative">
                  <input 
                    id="new-password"
                    type={showNewPassword ? "text" : "password"}
                    value={newPasswordInput}
                    onChange={(e) => setNewPasswordInput(e.target.value)}
                    required
                    minLength={6}
                    className="w-full bg-transparent border-b border-outline-variant/40 py-2.5 pr-10 text-sm font-medium focus:outline-none focus:border-primary transition-all placeholder:opacity-40"
                    placeholder="••••••••"
                    disabled={isAccountActionLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-0 top-1/2 -translate-y-1/2 p-1.5 text-on-surface-variant hover:text-on-surface transition-colors focus:outline-none focus:ring-0 select-none"
                    title={showNewPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {showNewPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setIsChangePasswordModalOpen(false); setNewPasswordInput(''); }}
                  disabled={isAccountActionLoading}
                  className="px-4 py-2 text-xs font-bold text-on-surface-variant hover:text-primary transition-colors focus:outline-none"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isAccountActionLoading || newPasswordInput.length < 6}
                  className="px-5 py-2 bg-primary text-white text-xs font-bold rounded-sm hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-45 disabled:pointer-events-none flex items-center gap-1.5 focus:outline-none"
                >
                  {isAccountActionLoading && <span className="animate-spin material-symbols-outlined text-xs">progress_activity</span>}
                  <span>Guardar Contraseña</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal para Eliminar Cuenta */}
      {isDeleteAccountModalOpen && (
        <div className="fixed inset-0 bg-background/40 backdrop-blur-md flex items-center justify-center z-[999] p-4 animate-fade-in">
          <div className="bg-surface border border-error/20 w-full max-w-md p-8 rounded-sm shadow-2xl relative text-left">
            <div className="flex items-center gap-2 text-error mb-3">
              <span className="material-symbols-outlined text-xl">warning</span>
              <h3 className="font-bold text-headline-sm text-error">Eliminar Cuenta Permanente</h3>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed mb-6">
              Esta acción es **irreversible**. Se eliminarán todos tus perfiles, documentos y asientos de diario. 
              Para continuar, escribe la palabra <strong className="font-bold text-error">ELIMINAR</strong> a continuación.
            </p>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest" htmlFor="delete-confirm">
                  Escribe la palabra de confirmación
                </label>
                <input 
                  id="delete-confirm"
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  required
                  className="w-full bg-transparent border-b border-error/30 py-2.5 text-sm font-medium focus:outline-none focus:border-error transition-all uppercase placeholder:opacity-30"
                  placeholder="ELIMINAR"
                  disabled={isAccountActionLoading}
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setIsDeleteAccountModalOpen(false); setDeleteConfirmText(''); }}
                  disabled={isAccountActionLoading}
                  className="px-4 py-2 text-xs font-bold text-on-surface-variant hover:text-primary transition-colors focus:outline-none"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={isAccountActionLoading || deleteConfirmText !== 'ELIMINAR'}
                  className="px-5 py-2 bg-error text-white text-xs font-bold rounded-sm hover:bg-error/90 active:scale-[0.98] transition-all disabled:opacity-35 disabled:pointer-events-none flex items-center gap-1.5 focus:outline-none"
                >
                  {isAccountActionLoading && <span className="animate-spin material-symbols-outlined text-xs">progress_activity</span>}
                  <span>Eliminar Cuenta</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Crear Empresa */}
      {isCreateCompanyModalOpen && (
        <div className="fixed inset-0 bg-background/40 backdrop-blur-md flex items-center justify-center z-[999] p-4 animate-fade-in">
          <div className="bg-surface border border-outline-variant/15 w-full max-w-md p-8 rounded-sm shadow-2xl relative text-left">
            <h3 className="font-bold text-headline-sm text-primary mb-2">Crear Nueva Empresa</h3>
            <p className="text-xs text-on-surface-variant mb-6">Da de alta una empresa para clasificar y organizar de forma independiente sus facturas, asientos contables y PGC.</p>
            
            <form onSubmit={handleCreateCompany} className="space-y-6">
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest" htmlFor="company-name">
                  Nombre de la Empresa *
                </label>
                <input 
                  id="company-name"
                  type="text"
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  required
                  className="w-full bg-transparent border-b border-outline-variant/40 py-2.5 text-sm font-medium focus:outline-none focus:border-primary transition-all placeholder:opacity-40"
                  placeholder="Ej. Mi Empresa S.L."
                  disabled={isCompanyActionLoading}
                />
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest" htmlFor="company-cif">
                  CIF / NIF (Opcional)
                </label>
                <input 
                  id="company-cif"
                  type="text"
                  value={newCompanyCif}
                  onChange={(e) => setNewCompanyCif(e.target.value)}
                  className="w-full bg-transparent border-b border-outline-variant/40 py-2.5 text-sm font-medium focus:outline-none focus:border-primary transition-all placeholder:opacity-40"
                  placeholder="Ej. B12345678"
                  disabled={isCompanyActionLoading}
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setIsCreateCompanyModalOpen(false); setNewCompanyName(''); setNewCompanyCif(''); }}
                  disabled={isCompanyActionLoading}
                  className="px-4 py-2 text-xs font-bold text-on-surface-variant hover:text-primary transition-colors focus:outline-none"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCompanyActionLoading || !newCompanyName.trim()}
                  className="px-5 py-2 bg-primary text-white text-xs font-bold rounded-sm hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-45 disabled:pointer-events-none flex items-center gap-1.5 focus:outline-none"
                >
                  {isCompanyActionLoading && <span className="animate-spin material-symbols-outlined text-xs">progress_activity</span>}
                  <span>Crear Empresa</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Ayuda & Soporte */}
      {isHelpModalOpen && (
        <div className="fixed inset-0 bg-background/40 backdrop-blur-md flex items-center justify-center z-[999] p-4 animate-fade-in">
          <div className="bg-surface border border-outline-variant/15 w-full max-w-2xl p-8 rounded-sm shadow-2xl relative text-left flex flex-col max-h-[85vh] overflow-hidden">
            
            {/* Header del Modal */}
            <div className="flex items-center justify-between border-b border-outline-variant/10 pb-4 mb-6 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-sm bg-primary/5 flex items-center justify-center border border-primary/10">
                  <span className="material-symbols-outlined text-primary text-lg">help</span>
                </div>
                <div>
                  <h3 className="font-bold text-sm text-primary">Ayuda & Soporte</h3>
                  <p className="text-[10px] text-on-surface-variant font-medium">Guía interactiva y propuesta de valor de Balance AI</p>
                </div>
              </div>
              <button 
                onClick={() => setIsHelpModalOpen(false)}
                className="p-1 rounded-sm hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors focus:outline-none"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>

            {/* Selector de Pestañas del Modal */}
            <div className="flex border-b border-outline-variant/5 mb-6 shrink-0 gap-2">
              <button 
                onClick={() => setHelpActiveTab('pitch')}
                className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-all focus:outline-none ${
                  helpActiveTab === 'pitch' 
                    ? 'border-primary text-primary font-bold' 
                    : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
              >
                La Revolución Contable
              </button>
              <button 
                onClick={() => setHelpActiveTab('guide')}
                className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-all focus:outline-none ${
                  helpActiveTab === 'guide' 
                    ? 'border-primary text-primary font-bold' 
                    : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Guía de Funcionamiento
              </button>
            </div>

            {/* Contenido del Modal (Scrollable) */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 min-h-0 text-xs text-on-surface-variant leading-relaxed space-y-6">
              {helpActiveTab === 'pitch' && (
                <div className="space-y-6 animate-fade-in">
                  <div className="bg-primary/5 border border-primary/10 rounded-sm p-6 text-center space-y-4">
                    <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto shadow-[0_0_15px_rgba(var(--primary-rgb),0.1)] animate-pulse">
                      <span className="material-symbols-outlined text-2xl">auto_awesome</span>
                    </div>
                    <h4 className="text-sm font-bold text-primary uppercase tracking-wider">El fin de la contabilidad manual</h4>
                    <p className="text-xs text-on-surface max-w-lg mx-auto font-medium">
                      ¿Sigues perdiendo horas picando asientos contables a mano o cometiendo molestos errores de transcripción? Es hora de dar el salto al futuro.
                    </p>
                    <p className="text-xs text-on-surface-variant max-w-lg mx-auto">
                      <strong className="text-primary font-bold">Balance AI</strong> es la única solución inteligente diseñada específicamente para transformar facturas, recibos y extractos bancarios en asientos de diario perfectamente cuadrados y listos para importar de forma 100% autónoma.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border border-outline-variant/10 p-4 rounded-sm space-y-2">
                      <div className="flex items-center gap-2 text-primary font-bold">
                        <span className="material-symbols-outlined text-sm">schedule</span>
                        <span>Productividad del 1000%</span>
                      </div>
                      <p className="text-[11px]">
                        Reduce el tiempo dedicado a la gestión documental de horas a segundos. Sube un documento y deja que nuestra IA haga el trabajo pesado en tiempo real.
                      </p>
                    </div>

                    <div className="border border-outline-variant/10 p-4 rounded-sm space-y-2">
                      <div className="flex items-center gap-2 text-[#006d37] font-bold">
                        <span className="material-symbols-outlined text-sm">precision_manufacturing</span>
                        <span>Precisión Quirúrgica</span>
                      </div>
                      <p className="text-[11px]">
                        Nuestra integración avanzada con Gemini minimiza los errores humanos de introducción de datos y cuadra cada debe y haber de forma exacta según los estándares de PGC.
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-outline-variant/5 pt-4 text-center">
                    <p className="font-semibold text-primary mb-3">¿Listo para cambiar las reglas del juego?</p>
                    <button 
                      onClick={() => { setIsHelpModalOpen(false); setActiveTab('documents'); }}
                      className="px-6 py-2.5 bg-primary text-white font-bold rounded-sm hover:opacity-95 active:scale-[0.98] transition-all inline-flex items-center gap-2 shadow-precision"
                    >
                      <span>Probar urgentemente</span>
                      <span className="material-symbols-outlined text-sm">arrow_right_alt</span>
                    </button>
                  </div>
                </div>
              )}

              {helpActiveTab === 'guide' && (
                <div className="space-y-6 animate-fade-in">
                  <h4 className="text-xs font-bold text-primary uppercase tracking-widest mb-2">Funcionamiento de la Aplicación paso a paso:</h4>
                  
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px] shrink-0">1</div>
                      <div>
                        <h5 className="font-bold text-on-surface text-xs">Creación de Empresa (Multi-Cliente)</h5>
                        <p className="text-[11px]">
                          Haz clic en el botón <strong className="font-semibold text-primary">+</strong> en la cabecera para crear una empresa. Balance AI aísla de forma segura todos los datos y documentos por empresa y usuario.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px] shrink-0">2</div>
                      <div>
                        <h5 className="font-bold text-on-surface text-xs">Carga del Plan Contable (PGC)</h5>
                        <p className="text-[11px]">
                          En la pestaña <em>Mis Documentos</em>, importa tu catálogo de subcuentas en CSV o PDF. Balance AI procesará el PDF mediante IA en segundos y creará tu estructura de cuentas de forma automática.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px] shrink-0">3</div>
                      <div>
                        <h5 className="font-bold text-on-surface text-xs">Subida de Documentos</h5>
                        <p className="text-[11px]">
                          Arrastra tus facturas, recibos, tickets o extractos bancarios en la zona de carga de <em>Mis Documentos</em>.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px] shrink-0">4</div>
                      <div>
                        <h5 className="font-bold text-on-surface text-xs">Análisis Inteligente y Generación de Asientos</h5>
                        <p className="text-[11px]">
                          Nuestra IA procesará la factura de forma autónoma y generará el asiento del libro de diario totalmente equilibrado, sugiriendo la creación de cuentas contables nuevas si no existían en tu catálogo.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px] shrink-0">5</div>
                      <div>
                        <h5 className="font-bold text-on-surface text-xs">Auditoría con Chat Inteligente</h5>
                        <p className="text-[11px]">
                          En el <em>Panel de Control</em>, selecciona los asientos que deseas auditar y chatea con Gemini para extraer sumas de IVA, clasificar gastos o buscar discrepancias.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px] shrink-0">6</div>
                      <div>
                        <h5 className="font-bold text-on-surface text-xs">Exportación a Sage ContaPlus</h5>
                        <p className="text-[11px]">
                          Selecciona los asientos validados en la tabla y expórtalos en archivos ZIP listos para importar directamente en Sage ContaPlus (versiones 2008 o 2011).
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer del Modal */}
            <div className="border-t border-outline-variant/10 pt-4 mt-6 shrink-0 flex justify-end">
              <button 
                onClick={() => setIsHelpModalOpen(false)}
                className="px-5 py-2 bg-surface-container-high border border-outline-variant/10 text-on-surface font-bold text-xs rounded-sm hover:opacity-95 active:scale-[0.98] transition-all focus:outline-none"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Menú de Navegación Inferior Móvil (Bottom Navigation Bar) */}
      <div className="fixed bottom-0 left-0 w-full h-16 z-40 bg-surface border-t border-outline-variant/10 md:hidden shadow-[0_-4px_12px_rgba(0,0,0,0.03)] backdrop-blur-md bg-surface/90 flex justify-around items-center px-4">
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center justify-center gap-1 w-20 h-full transition-all focus:outline-none ${
            activeTab === 'dashboard' ? 'text-primary font-bold animate-in fade-in duration-200' : 'text-on-surface-variant/70 hover:text-primary'
          }`}
        >
          <span className={`material-symbols-outlined text-[20px] ${activeTab === 'dashboard' ? 'material-symbols-fill text-primary' : ''}`}>
            dashboard
          </span>
          <span className="text-[9px] uppercase tracking-wider font-semibold">Panel</span>
        </button>
        
        <button 
          onClick={() => setActiveTab('documents')}
          className={`flex flex-col items-center justify-center gap-1 w-20 h-full transition-all focus:outline-none ${
            activeTab === 'documents' ? 'text-primary font-bold animate-in fade-in duration-200' : 'text-on-surface-variant/70 hover:text-primary'
          }`}
        >
          <span className={`material-symbols-outlined text-[20px] ${activeTab === 'documents' ? 'material-symbols-fill text-primary' : ''}`}>
            description
          </span>
          <span className="text-[9px] uppercase tracking-wider font-semibold">Documentos</span>
        </button>
        
        <button 
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center justify-center gap-1 w-20 h-full transition-all focus:outline-none ${
            activeTab === 'settings' ? 'text-primary font-bold animate-in fade-in duration-200' : 'text-on-surface-variant/70 hover:text-primary'
          }`}
        >
          <span className={`material-symbols-outlined text-[20px] ${activeTab === 'settings' ? 'material-symbols-fill text-primary' : ''}`}>
            settings
          </span>
          <span className="text-[9px] uppercase tracking-wider font-semibold">Ajustes</span>
        </button>
      </div>

      {/* Banner de error de conexión con Supabase */}
      {supabaseStatus === 'error' && (
        <div className="fixed bottom-16 md:bottom-0 left-0 right-0 bg-red-600 text-white py-1.5 px-4 text-center text-xs font-semibold select-none z-[9999] shadow-[0_-2px_10px_rgba(0,0,0,0.2)] animate-slide-in">
          ⚠️ Pérdida de conexión con Supabase o la base de datos.
        </div>
      )}
    </div>
  );
}
