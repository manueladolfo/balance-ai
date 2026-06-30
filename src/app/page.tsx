'use client';

import React, { useState, useEffect, useRef } from 'react';
import jsPDF from 'jspdf';
import EntryModal, { AccountingEntry } from '@/components/EntryModal';
import { supabase } from '@/lib/supabase';

interface Document {
  id: string;
  name: string;
  storage_path: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  type: 'Factura' | 'Recibo' | 'Ticket' | 'Extracto' | 'Otro';
  ia_description?: string;
  created_at: string;
}

interface Message {
  sender: 'user' | 'ai';
  text: string;
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

  const [activeTab, setActiveTab] = useState<'dashboard' | 'documents' | 'settings'>('dashboard');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [searchQuery, setSearchQuery] = useState('');

  // DB Data states
  const [documents, setDocuments] = useState<Document[]>([]);
  const [entries, setEntries] = useState<AccountingEntry[]>([]);
  const [pgcAccounts, setPgcAccounts] = useState<any[]>([]);
  const [supabaseStatus, setSupabaseStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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
  const chatStreamEndRef = useRef<HTMLDivElement>(null);

  // Upload & Training states
  const [subaccountDigits, setSubaccountDigits] = useState(8);
  const [uploadType, setUploadType] = useState<'Factura' | 'Recibo' | 'Ticket' | 'Extracto' | 'Otro'>('Factura');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingFileName, setProcessingFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pgcInputRef = useRef<HTMLInputElement>(null);

  const [showSupabaseHelp, setShowSupabaseHelp] = useState(false);
  const [showGeminiHelp, setShowGeminiHelp] = useState(false);
  const [geminiInputKey, setGeminiInputKey] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);

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
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'processing' | 'completed' | 'error'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | '30days'>('all');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);

  // Notifications/Toasts
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

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

  // 1. Fetch data on mount
  const fetchData = async () => {
    try {
      const res = await fetch('/api/documents');
      const data = await res.json();
      if (res.ok) {
        setDocuments(data.documents || []);
        setEntries(data.entries || []);
        setHasGeminiKey(data.hasGeminiKey);
        setSupabaseStatus('connected');
      } else {
        setSupabaseStatus('error');
      }

      const pgcRes = await fetch('/api/pgc');
      const pgcData = await pgcRes.json();
      if (pgcRes.ok) {
        setPgcAccounts(pgcData.accounts || []);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      showToast('Error al conectar con el servidor.', 'error');
      setSupabaseStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
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

  // 2. File Upload flow
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setProcessingFileName(file.name);
    setIsUploading(true);
    setUploadProgress(10);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', uploadType);

    try {
      // Step A: Upload file
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      setUploadProgress(40);

      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        throw new Error(uploadData.error || 'Error al subir archivo.');
      }

      const { documentId } = uploadData;
      setUploadProgress(60);

      // Step B: Trigger AI Analysis
      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId })
      });
      setUploadProgress(90);

      const analyzeData = await analyzeRes.json();
      if (!analyzeRes.ok) {
        throw new Error(analyzeData.error || 'Error al analizar el documento.');
      }

      setUploadProgress(100);
      showToast(`Documento "${file.name}" procesado con éxito. Asiento contable generado.`, 'success');
      
      // Reload documents and entries
      await fetchData();

      // Automatically open modal for the new entry
      const newEntry = entries.find(ent => ent.document_id === documentId);
      if (newEntry) {
        setActiveEntryForModal(newEntry);
      } else {
        // Fetch again to ensure we get the latest
        const latestRes = await fetch('/api/documents');
        const latestData = await latestRes.json();
        const latestEntry = latestData.entries?.find((ent: any) => ent.document_id === documentId);
        if (latestEntry) setActiveEntryForModal(latestEntry);
      }

    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Error durante el procesamiento.', 'error');
    } finally {
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
        setProcessingFileName('');
      }, 1000);
    }
  };

  // 3. PGC Import flow
  const handlePgcUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
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

        const res = await fetch('/api/pgc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accounts })
        });

        if (res.ok) {
          showToast(`Se han importado ${accounts.length} subcuentas al Plan Contable.`, 'success');
          // Reload PGC
          const pgcRes = await fetch('/api/pgc');
          const pgcData = await pgcRes.json();
          if (pgcRes.ok) setPgcAccounts(pgcData.accounts || []);
        } else {
          const data = await res.json();
          throw new Error(data.error || 'Error al guardar el plan contable.');
        }

      } catch (err: any) {
        console.error(err);
        showToast(err.message || 'Error al procesar el archivo PGC.', 'error');
      }
    };

    reader.readAsText(file);
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

  // 4. Chat logic
  const handleSendMessage = async () => {
    if (!chatInput.trim() || isChatLoading) return;

    const userMessage = chatInput;
    setChatMessages(prev => [...prev, { sender: 'user', text: userMessage }]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          selectedDocumentIds: selectedDocIds
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
      setChatMessages(prev => [...prev, { sender: 'ai', text: `Error: ${err.message || 'No se pudo contactar con Gemini.'}` }]);
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

    try {
      showToast(`Generando archivos para Sage ContaPlus ${version} (${format.toUpperCase()})...`, 'info');
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      
      showToast(`Descarga completada. Descomprime el archivo ZIP para obtener los ficheros de ContaPlus.`, 'success');
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Error en la exportación.', 'error');
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
      showToast('Descarga iniciada.', 'success');
    } catch (err: any) {
      console.error('Error al descargar:', err);
      showToast('Error al descargar el archivo de Supabase Storage.', 'error');
    }
  };

  // 8. Approve and Contabilizar (PUT)
  const handleApproveDocument = async (documentId: string) => {
    try {
      showToast('Aprobando y registrando asiento contable...', 'info');
      const res = await fetch('/api/documents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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

  // Filter documents by search query, status and date
  const filteredDocs = documents.filter(doc => {
    const query = searchQuery.toLowerCase();
    const nameMatch = doc.name.toLowerCase().includes(query);
    const descMatch = doc.ia_description?.toLowerCase().includes(query) || false;
    const typeMatch = doc.type.toLowerCase().includes(query);
    const matchesSearch = nameMatch || descMatch || typeMatch;

    const matchesStatus = statusFilter === 'all' || doc.status === statusFilter;

    let matchesDate = true;
    if (dateFilter === '30days') {
      const docDate = new Date(doc.created_at);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      matchesDate = docDate >= thirtyDaysAgo;
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
                  className="w-full bg-transparent border-b border-outline-variant/40 py-2.5 text-sm font-medium focus:outline-none focus:border-primary transition-all placeholder:opacity-40"
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
                    className="w-full bg-transparent border-b border-outline-variant/40 py-2.5 pr-10 text-sm font-medium focus:outline-none focus:border-primary transition-all placeholder:opacity-40"
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
                  className="w-full bg-transparent border-b border-outline-variant/40 py-2.5 text-sm font-medium focus:outline-none focus:border-primary transition-all placeholder:opacity-40"
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
                  className="w-full bg-transparent border-b border-outline-variant/40 py-2.5 text-sm font-medium focus:outline-none focus:border-primary transition-all placeholder:opacity-40"
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
                  className="w-full bg-transparent border-b border-outline-variant/40 py-2.5 text-sm font-medium focus:outline-none focus:border-primary transition-all placeholder:opacity-40"
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
                    className="w-full bg-transparent border-b border-outline-variant/40 py-2.5 pr-10 text-sm font-medium focus:outline-none focus:border-primary transition-all placeholder:opacity-40"
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
                className="w-full bg-transparent border-b border-outline-variant/40 py-2.5 text-sm font-medium text-center focus:outline-none focus:border-primary transition-all placeholder:opacity-40"
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

      {/* SideNavBar */}
      <aside className="fixed left-0 top-0 h-full z-40 py-8 flex flex-col justify-between w-64 bg-surface-container-low border-r border-outline-variant/5">
        <div className="px-6">
          {/* Logo & Brand Header - Centrado y Grande (x4), sin letras ni cajas pesadas */}
          <div className="flex justify-center mb-10 pt-4 select-none">
            <div className="flex items-center justify-center w-40 h-40 shrink-0">
              <img alt="Balance AI Logo" className="w-full h-full object-contain logo-invert" src="/logo.png" />
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-3">
            <button 
              onClick={() => setActiveTab('dashboard')}
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
              onClick={() => setActiveTab('documents')}
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
              onClick={() => setActiveTab('settings')}
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

          <button 
            onClick={() => setActiveTab('documents')}
            className="mt-8 w-full flex items-center justify-center gap-sm bg-primary text-white py-2.5 rounded-sm font-bold hover:opacity-90 active:scale-[0.98] transition-all"
          >
            <span className="material-symbols-outlined text-[18px] text-white">add</span>
            <span className="text-label-bold font-label-bold text-white uppercase tracking-wider text-xs">Nueva Entrada</span>
          </button>
        </div>

        {/* Sidebar Footer */}
        <div className="px-6 space-y-3">
          <div className="flex items-center gap-4 px-4 py-2.5 text-on-surface-variant hover:text-on-surface cursor-pointer rounded-sm hover:bg-surface-container-high transition-colors">
            <span className="material-symbols-outlined text-[18px]">help</span>
            <span className="text-label-bold font-label-bold">Ayuda & Soporte</span>
          </div>
          <div 
            onClick={async () => {
              if (supabase) {
                await supabase.auth.signOut();
              }
              setIsLoggedIn(false);
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
      <main className="flex-1 ml-64 flex flex-col h-screen overflow-hidden">
        
        {/* Top Bar Header */}
        <header className="flex justify-between items-center px-8 w-full shrink-0 h-16 bg-surface border-b border-outline-variant/5">
          <div className="flex items-center gap-md flex-1">
            {activeTab === 'dashboard' && (
              <div className="flex items-center gap-sm">
                <span className="font-bold text-headline-md text-primary font-headline-md">Histórico de Documentos</span>
              </div>
            )}
            {activeTab === 'documents' && (
              <span className="font-bold text-headline-md text-primary font-headline-md">Carga de Documentos</span>
            )}
            {activeTab === 'settings' && (
              <span className="font-bold text-headline-md text-primary font-headline-md">Configuración del Sistema</span>
            )}
          </div>
          
          <div className="flex items-center gap-md">
            {/* Search Toggle Icon */}
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-3 text-on-surface-variant text-sm pointer-events-none">search</span>
              <input 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-surface-container-low border border-outline-variant/10 rounded-sm py-1 pl-8 pr-3 text-[11px] font-medium w-40 focus:w-56 focus:outline-none focus:ring-1 focus:ring-secondary/30 focus:border-secondary transition-all" 
                placeholder="Buscar..." 
                type="text"
              />
            </div>

            {/* Notifications Bell */}
            <button 
              onClick={() => showToast('No tienes notificaciones pendientes.', 'info')}
              className="p-1.5 rounded-sm hover:bg-surface-container-low text-on-surface-variant hover:text-on-surface transition-colors relative focus:outline-none"
              title="Notificaciones"
            >
              <span className="material-symbols-outlined text-[20px]">notifications</span>
              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-error rounded-full"></span>
            </button>

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
                <span className="material-symbols-outlined text-[18px] text-white">person</span>
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
        <div className="flex-1 overflow-hidden flex flex-col p-lg gap-lg min-h-0">
          
          {/* TAB 1: PANEL DE CONTROL (HISTORIAL Y CHAT HORIZONTAL ABAJO) */}
          {activeTab === 'dashboard' && (
            <div className="flex-1 flex flex-col gap-8 min-h-0 overflow-hidden pt-4">
              
              {/* Fila de Tarjetas KPI - Más altas, espaciadas y con sombras sutiles */}
              <div className="grid grid-cols-3 gap-8 shrink-0">
                {/* KPI 1 */}
                <div className="bg-surface p-6 rounded-sm border border-outline-variant/10 text-left flex flex-col justify-between h-[96px] shadow-precision">
                  <span className="block text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Documentos Procesados</span>
                  <div className="flex items-baseline gap-xs">
                    <span className="text-xl font-bold font-mono-data text-primary">1,284</span>
                    <span className="text-[10px] font-bold text-secondary">+12%</span>
                  </div>
                </div>

                {/* KPI 2 */}
                <div className="bg-surface p-6 rounded-sm border border-outline-variant/10 text-left flex flex-col justify-between h-[96px] shadow-precision">
                  <span className="block text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Precisión de IA</span>
                  <div className="flex items-baseline gap-xs">
                    <span className="text-xl font-bold font-mono-data text-[#006d37]">99.8%</span>
                    <span className="text-[9px] text-on-surface-variant font-semibold">Optimizado</span>
                  </div>
                </div>

                {/* KPI 3 */}
                <div className="bg-surface p-6 rounded-sm border border-outline-variant/10 text-left flex flex-col justify-between h-[96px] shadow-precision">
                  <span className="block text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Tiempo Ahorrado</span>
                  <div className="flex items-baseline gap-xs">
                    <span className="text-xl font-bold font-mono-data text-primary">42h</span>
                    <span className="text-[9px] text-on-surface-variant font-semibold">Este mes</span>
                  </div>
                </div>
              </div>

              {/* Fila de Filtros y Acciones - Más espaciada y limpia */}
              <div className="flex justify-between items-center bg-surface px-6 py-3.5 rounded-sm border border-outline-variant/10 shrink-0 select-none shadow-precision mb-1">
                <div className="flex items-center gap-3">
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

                  {/* Date Filter Toggle */}
                  <button 
                    onClick={() => setDateFilter(prev => prev === 'all' ? '30days' : 'all')}
                    className={`flex items-center gap-2 px-4 py-1.5 border rounded-sm text-xs font-semibold transition-all focus:outline-none focus:ring-0 ${
                      dateFilter === '30days'
                        ? 'bg-primary/5 border-primary/20 text-primary font-bold'
                        : 'border-outline-variant/10 text-on-surface hover:bg-surface-container-low'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                    Últimos 30 días
                  </button>
                </div>
                <div className="relative">
                  <button 
                    onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
                    disabled={selectedDocIds.length === 0}
                    className="flex items-center gap-2 px-4 py-1.5 bg-secondary text-white rounded-sm text-xs font-semibold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none focus:outline-none"
                  >
                    <span className="material-symbols-outlined text-[14px] text-white">download_for_offline</span>
                    Exportar ContaPlus ({selectedDocIds.length})
                    <span className="material-symbols-outlined text-[12px] text-white ml-0.5">expand_more</span>
                  </button>

                  {isExportDropdownOpen && selectedDocIds.length > 0 && (
                    <div className="absolute right-0 mt-2 w-56 bg-surface border border-outline-variant/10 rounded-sm shadow-md z-20 py-1 text-left">
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

              {/* Tabla de Historial de Documentos */}
              <section className="flex-1 flex flex-col bg-surface rounded-sm border border-outline-variant/10 overflow-hidden min-h-0 shadow-precision">
                <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
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
                                    <span className="font-semibold text-primary">{doc.name}</span>
                                    <span className="text-[9px] text-on-surface-variant truncate max-w-[200px] italic">
                                      {doc.status === 'completed' ? `Factura de Servicio` : 
                                       doc.status === 'processing' ? 'Procesando...' : 
                                       doc.status === 'error' ? 'Revisión Necesaria' : 'Pendiente'}
                                    </span>
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

              {/* Gemini Chat Area - Reubicado abajo en horizontal de ancho completo */}
              <div className="h-72 flex flex-col bg-surface border border-outline-variant/10 rounded-sm overflow-hidden shrink-0 select-none shadow-precision mt-4">
                {/* Chat Header - Diseño integrado y minimalista */}
                <div className="bg-surface-container-low px-6 py-3.5 flex items-center justify-between shrink-0 border-b border-outline-variant/10">
                  <div className="flex items-center gap-2 text-primary">
                    <span className="material-symbols-outlined text-secondary text-sm material-symbols-fill">auto_awesome</span>
                    <span className="font-bold text-xs text-primary">Chat con Gemini Intelligence</span>
                  </div>
                  {selectedDocIds.length > 0 && (
                    <span className="bg-secondary/10 text-secondary px-2.5 py-1 rounded-sm text-[9px] font-bold tracking-wider animate-pulse">
                      {selectedDocIds.length} DOC SELECCIONADO{selectedDocIds.length > 1 ? 'S' : ''}
                    </span>
                  )}
                </div>

                {/* Chat messages area */}
                <div className="flex-1 p-6 overflow-y-auto custom-scrollbar space-y-4 bg-surface-container-lowest/10">
                  {/* Mensaje de Bienvenida del Asistente */}
                  <div className="flex gap-3 max-w-full">
                    <div className="w-6 h-6 rounded-sm bg-primary/10 flex-shrink-0 flex items-center justify-center text-primary">
                      <span className="material-symbols-outlined text-xs material-symbols-fill text-primary">auto_awesome</span>
                    </div>
                    <div className="flex flex-col text-left max-w-[90%]">
                      <span className="text-[8px] text-on-surface-variant font-bold uppercase tracking-wider mb-1">Gemini • 10:24 AM</span>
                      <div className="p-3 px-4 bg-surface-container-low text-on-surface rounded-sm border border-outline-variant/5 text-xs leading-relaxed">
                        ¡Hola! He indexado tu libro mayor y PGC. Selecciona uno o más documentos de la tabla superior y pídeme que los sume, analice el IVA, extraiga discrepancias o categorice los gastos.
                      </div>
                    </div>
                  </div>

                  {chatMessages.slice(1).map((msg, index) => (
                    <div key={index} className={`flex gap-3 max-w-full ${msg.sender === 'user' ? 'justify-end' : ''}`}>
                      {msg.sender === 'ai' && (
                        <div className="w-6 h-6 rounded-sm bg-primary/10 flex-shrink-0 flex items-center justify-center text-primary">
                          <span className="material-symbols-outlined text-xs material-symbols-fill text-primary">auto_awesome</span>
                        </div>
                      )}
                      <div className={`flex flex-col max-w-[90%] ${msg.sender === 'user' ? 'text-right items-end' : 'text-left'}`}>
                        <span className="text-[8px] text-on-surface-variant font-bold uppercase tracking-wider mb-1">
                          {msg.sender === 'user' ? 'Tú • 10:25 AM' : 'Gemini • 10:26 AM'}
                        </span>
                        <div className={`p-3 px-4 rounded-sm text-xs leading-relaxed border ${
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
                    <div className="flex gap-3 max-w-full">
                      <div className="w-6 h-6 rounded-sm bg-primary/10 flex-shrink-0 flex items-center justify-center text-primary">
                        <span className="material-symbols-outlined text-xs animate-spin">progress_activity</span>
                      </div>
                      <div className="bg-surface-container-low p-3 px-4 rounded-sm border border-outline-variant/5 text-xs text-on-surface-variant italic">
                        Gemini está procesando...
                      </div>
                    </div>
                  )}
                  <div ref={chatStreamEndRef} />
                </div>

                {/* Input area - Horizontal y de ancho completo abajo */}
                <div className="p-4 px-6 bg-surface border-t border-outline-variant/10 shrink-0">
                  <div className="border border-outline-variant/10 rounded-sm overflow-hidden flex items-center bg-surface-container-lowest px-4 py-3 focus-within:border-primary/50 transition-colors">
                    <button 
                      onClick={() => showToast('Adjuntar archivos próximamente.', 'info')}
                      className="flex items-center text-on-surface-variant hover:text-primary mr-3 focus:outline-none"
                      title="Adjuntar archivo"
                    >
                      <span className="material-symbols-outlined text-base">attach_file</span>
                    </button>
                    <input 
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSendMessage(); }}
                      disabled={isChatLoading}
                      className="flex-1 bg-transparent py-3 text-sm focus:outline-none disabled:opacity-60 text-on-surface placeholder:text-on-surface-variant/60" 
                      placeholder={selectedDocIds.length > 0 
                        ? "Preguntar sobre filas seleccionadas..." 
                        : "Escribe tu consulta al asistente contable..."
                      } 
                      type="text"
                    />
                    <button 
                      onClick={handleSendMessage}
                      disabled={isChatLoading || !chatInput.trim()}
                      className="w-10 h-10 flex items-center justify-center bg-secondary text-white rounded-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none ml-3 focus:outline-none"
                    >
                      <span className="material-symbols-outlined text-sm text-white">send</span>
                    </button>
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* TAB 2: CARGA Y CONFIGURACIÓN (DETALLADA) */}
          {activeTab === 'documents' && (
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-8 min-h-0 pt-4 pb-12">
              
              <div className="mb-4 text-left select-none">
                <p className="text-sm text-on-surface-variant leading-relaxed">
                  Centraliza tus facturas, recibos y extractos bancarios para que Gemini genere tus asientos contables de forma automatizada.
                </p>
              </div>

              {/* Pills selector de tipo de carga */}
              <div className="flex items-center gap-4 shrink-0 select-none mb-2">
                <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">Tipo de Documento:</span>
                <div className="flex flex-wrap gap-2">
                  {['Factura', 'Recibo', 'Ticket', 'Extracto', 'Otro'].map((type) => (
                    <button
                      key={type}
                      onClick={() => setUploadType(type as any)}
                      className={`px-4 py-1.5 text-xs font-semibold rounded-sm border transition-all focus:outline-none ${
                        uploadType === type 
                          ? 'bg-secondary-container/20 border-secondary-container/30 text-on-secondary-container font-semibold' 
                          : 'bg-surface border-outline-variant/10 text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      {type === 'Extracto' ? 'Extractos' : type === 'Otro' ? 'Otros' : `${type}s`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grid layout - Responsivo para Tablet y Móvil */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-8 shrink-0">
                
                {/* Left Side: Upload zone */}
                <div className="col-span-1 md:col-span-7 lg:col-span-8 flex flex-col gap-6">
                  <div 
                    onClick={() => fileInputRef.current?.click()}
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
                      onChange={handleFileUpload}
                      className="hidden" 
                      type="file" 
                      accept=".pdf,.png,.jpg,.jpeg"
                    />
                  </div>

                  {/* Processing Status Block */}
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
                          className="h-full bg-secondary progress-shimmer transition-all duration-500" 
                          style={{ width: `${uploadProgress}%` }}
                        ></div>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-on-surface-variant leading-none">
                        <span>Procesando: <strong className="text-on-surface font-semibold">{processingFileName}</strong></span>
                        <span className="flex items-center gap-xs"><span className="material-symbols-outlined text-xs">bolt</span> Extracción estructurada OCR y mapeo PGC</span>
                      </div>
                    </div>
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

                    {/* CSV upload PGC button */}
                    <div className="space-y-2">
                      <button 
                        onClick={() => pgcInputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-2 border border-outline-variant/15 hover:bg-surface-container-low text-xs py-2.5 rounded-sm text-primary font-semibold transition-colors focus:outline-none select-none"
                      >
                        <span className="material-symbols-outlined text-sm">table_chart</span>
                        <span>Importar Plan Contable (CSV)</span>
                      </button>
                      <input 
                        ref={pgcInputRef}
                        onChange={handlePgcUpload}
                        type="file" 
                        accept=".csv,.txt" 
                        className="hidden"
                      />
                      <p className="text-[9px] text-on-surface-variant/60 text-center select-none">
                        Mapee su catálogo de cuentas contables de Sage o ERP en formato CSV.
                      </p>
                    </div>
                  </div>

                  {/* System Metrics */}
                  <div className="bg-surface rounded-sm border border-outline-variant/10 p-8 flex flex-col gap-6 text-left select-none shadow-precision">
                    <div className="flex justify-between items-center">
                      <span className="block text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">Velocidad Extracción</span>
                      <span className="text-sm font-bold font-mono-data text-[#006d37]">0.4s / pág</span>
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
                      : 'La clave API de Gemini no se encuentra. Asegúrate de configurar la variable de entorno GEMINI_API_KEY en tu servidor.'}
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

      {/* Banner de error de conexión con Supabase */}
      {supabaseStatus === 'error' && (
        <div className="fixed bottom-0 left-0 right-0 bg-red-600 text-white py-1.5 px-4 text-center text-xs font-semibold select-none z-[9999] shadow-[0_-2px_10px_rgba(0,0,0,0.2)]">
          ⚠️ Pérdida de conexión con Supabase o la base de datos.
        </div>
      )}
    </div>
  );
}
