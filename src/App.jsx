import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  MapPin,
  Settings,
  Search,
  Clock,
  XCircle,
  Activity,
  Home,
  Edit2,
  Trash2,
  Plus,
  CalendarDays,
  Check,
  FileUp,
  Loader2,
  ChevronLeftCircle,
  ChevronRightCircle,
  RefreshCw,
  Bell,
  MessageSquare,
  Info,
  CalendarCheck,
  DoorOpen,
  MessageSquareQuote,
  Send,
  Clipboard,
  ShieldAlert,
  Map as MapIcon,
  Upload,
  CheckCircle2,
  CalendarRange,
  StickyNote
} from 'lucide-react';

const logoImg = "logo.png";

// ==========================================
// CONFIGURAÇÃO DE APIS E INTEGRAÇÕES
// ==========================================
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxd-WKTuCg2_m6ba-x8XTwYoLG71tu38SMPzvAzjg5CQiEQ9oC6vav9iGAeRh2upAt7Kw/exec";

export default function App() {
  // --- Estados Principais ---
  const [currentView, setCurrentView] = useState('home');
  const [appointments, setAppointments] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [clinicNotes, setClinicNotes] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Estados do Calendário
  const [viewDate, setViewDate] = useState(new Date());
  
  // Estados de Modais
  const [showEditModal, setShowEditModal] = useState(false);
  const [editData, setEditData] = useState(null);
  
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventData, setEventData] = useState({ title: '', date: '', time: '', isBlocker: true, doctor: 'Todos' });

  // Estado para Confirmação de Exclusão
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  
  // --- Estados do Dashboard (Filtros) ---
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('Todos');
  const [filterDoctor, setFilterDoctor] = useState('Todos');
  const [filterCity, setFilterCity] = useState('Todas');
  const [filterDate, setFilterDate] = useState('');
  
  // --- Estados de Importação ---
  const [batchInput, setBatchInput] = useState('');
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [importing, setImporting] = useState(false);
  
  // --- Estados de Notas Rápidas ---
  const [newClinicNote, setNewClinicNote] = useState('');
  
  // --- Estados da Marcação ---
  const [step, setStep] = useState(1);
  const [bookingData, setBookingData] = useState({
    doctor: '', date: '', time: '', name: '', phone: '', city: '', status: 'Pendente', obs: ''
  });
  
  const [routeForm, setRouteForm] = useState({
    date: '', city: '', rooms: 1, startTime: '08:00', endTime: '21:00', shiftSplitTime: '13:00', morningRooms: 1, afternoonRooms: 2
  });

  // ==========================================
  // MOTOR ANTI-FUSO HORÁRIO (TEXTO PURO)
  // ==========================================
  
  const getTodayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const days = [];
    
    // Cria strings fixas para impedir que o navegador mude o dia dependendo do fuso
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const tempDate = new Date(year, month, d);
      days.push({
        day: d,
        dateStr: dateStr,
        label: tempDate.toLocaleDateString('pt-BR', { weekday: 'short' }).substring(0, 2)
      });
    }
    return days;
  };

  const normalizeToISO = (dateStr) => {
    if (!dateStr) return '';
    let s = String(dateStr).trim();
    if (s.includes('/')) {
      const parts = s.split('/');
      if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    if (s.includes('T')) return s.split('T')[0];
    return s.substring(0, 10);
  };

  const formatSafeDate = (rawDate) => {
    const iso = normalizeToISO(rawDate);
    if (!iso || iso.length !== 10) return '--/--/----';
    const parts = iso.split('-');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  // Extrai apenas HH:MM ignorando qualquer fuso horário atrelado
  const formatSafeTime = (rawTime) => {
    if (!rawTime) return '--:00';
    let t = String(rawTime).trim();
    
    // Captura estritamente os dois números antes e depois dos dois pontos
    const match = t.match(/(\d{1,2}):(\d{2})/);
    if (match) {
      return `${match[1].padStart(2, '0')}:${match[2]}`;
    }
    return '--:00';
  };

  const generateTimeSlots = (start = '08:00', end = '21:00') => {
    const safeStart = formatSafeTime(start);
    const safeEnd = formatSafeTime(end);
    const slots = [];
    let startHour = parseInt(safeStart.split(':')[0]);
    let endHour = parseInt(safeEnd.split(':')[0]);
    if (isNaN(startHour)) startHour = 8;
    if (isNaN(endHour)) endHour = 21;
    for (let i = startHour; i <= endHour; i++) {
      slots.push(`${i.toString().padStart(2, '0')}:00`);
    }
    return slots;
  };

  const cleanCity = (city) => {
    if (!city) return '';
    const trimmed = String(city).trim();
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  };

  const getRouteForDate = (dateStr) => {
    const targetISO = normalizeToISO(dateStr);
    return routes.find(r => normalizeToISO(r.date) === targetISO);
  };

  const getRoomsForSlot = (route, time) => {
    if (!route) return 99;
    const safeTime = formatSafeTime(time);
    const splitTime = formatSafeTime(route.shiftSplitTime);
    if (route.shiftSplitTime) {
      return safeTime < splitTime ? parseInt(route.morningRooms || 1) : parseInt(route.afternoonRooms || 2);
    }
    return route.rooms ? parseInt(route.rooms) : 99;
  };

  // ==========================================
  // TRAVA ABSOLUTA DE AGENDA (CEGA PARA FUSO)
  // ==========================================
  const checkSlotAvailability = (doctor, date, time, currentId = null) => {
    const targetISO = normalizeToISO(date);
    const targetTime = formatSafeTime(time);
    
    // 1. Verifica Eventos Bloqueadores
    const blockEvent = calendarEvents.find(e => 
      normalizeToISO(e.date) === targetISO && 
      formatSafeTime(e.time) === targetTime && 
      e.isBlocker && 
      (e.doctor === 'Todos' || e.doctor === doctor)
    );
    if (blockEvent) return { available: false, reason: blockEvent.title };

    // 2. Verifica Conflito de Doutor
    const doctorConflict = appointments.find(a => {
      if (a.id === currentId) return false;
      return (
        normalizeToISO(a.date) === targetISO && 
        formatSafeTime(a.time) === targetTime && 
        a.doctor === doctor && 
        a.status !== 'Cancelado' && 
        a.status !== 'Não Compareceu'
      );
    });
    if (doctorConflict) return { available: false, reason: 'Médico Ocupado' };
    
    // 3. Verifica Lotação de Salas
    const route = getRouteForDate(date);
    const rooms = getRoomsForSlot(route, targetTime);
    
    const totalAppointmentsAtSlot = appointments.filter(a => {
      if (a.id === currentId) return false;
      return (
        normalizeToISO(a.date) === targetISO && 
        formatSafeTime(a.time) === targetTime && 
        a.status !== 'Cancelado' && 
        a.status !== 'Não Compareceu'
      );
    });
    
    if (totalAppointmentsAtSlot.length >= rooms) {
      return { available: false, reason: 'Salas Esgotadas' };
    }
    
    return { available: true };
  };

  // ==========================================
  // LÓGICA DE SINCRONIZAÇÃO
  // ==========================================
  const syncWithGoogleSheets = async (action, data) => {
    if (!APPS_SCRIPT_URL) return { success: true };
    try {
      setLoading(true);
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, payload: data })
      });
      const result = await response.json();
      setLoading(false);
      return result;
    } catch (error) {
      console.error("Erro na sincronização:", error);
      setLoading(false);
      return { success: false, error };
    }
  };

  useEffect(() => {
    const loadAllData = async () => {
      setLoading(true);
      const res = await syncWithGoogleSheets('FETCH_ALL', {});
      if (res && res.success) {
        setAppointments(res.appointments || []);
        setRoutes(res.routes || []);
        setClinicNotes(res.clinicNotes || []);
        setCalendarEvents(res.events || []);
      }
      setLoading(false);
    };
    loadAllData();
  }, []);

  const changeMonth = (offset) => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1));

  // --- Manipulação de Dados ---
  const handleEventSubmit = async (e) => {
    e.preventDefault();
    const newEvent = { ...eventData, time: formatSafeTime(eventData.time), id: Date.now() };
    const updated = [...calendarEvents, newEvent];
    setCalendarEvents(updated);
    await syncWithGoogleSheets('ADD_EVENT', newEvent);
    setShowEventModal(false);
    setEventData({ title: '', date: '', time: '', isBlocker: true, doctor: 'Todos' });
  };

  const handleDeleteEvent = async (id) => {
    const updated = calendarEvents.filter(ev => ev.id !== id);
    setCalendarEvents(updated);
    await syncWithGoogleSheets('DELETE_EVENT', { id });
  };

  const handleDeleteRoute = async (date) => {
    const targetRoute = getRouteForDate(date);
    const normalizedDate = normalizeToISO(date);
    const updated = routes.filter(r => normalizeToISO(r.date) !== normalizedDate);
    setRoutes(updated);
    await syncWithGoogleSheets('DELETE_ROUTE', { 
      date: normalizedDate, 
      originalDate: targetRoute ? targetRoute.date : date 
    });
  };

  const handleAddRoute = async (e) => {
    e.preventDefault();
    const newRoute = { ...routeForm, rooms: Math.max(routeForm.morningRooms, routeForm.afternoonRooms) };
    const newRoutes = [...routes.filter(r => normalizeToISO(r.date) !== normalizeToISO(newRoute.date)), newRoute];
    setRoutes(newRoutes);
    await syncWithGoogleSheets('UPDATE_ROUTE', newRoute);
    setRouteForm({ date: '', city: '', rooms: 1, startTime: '08:00', endTime: '21:00', shiftSplitTime: '13:00', morningRooms: 1, afternoonRooms: 2 });
  };

  const handleAddClinicNote = async (e) => {
    if (e) e.preventDefault();
    if (!newClinicNote.trim()) return;
    const note = { id: Date.now(), text: newClinicNote, date: getTodayISO(), timestamp: new Date().toISOString() };
    const updated = [note, ...clinicNotes];
    setClinicNotes(updated);
    setNewClinicNote('');
    await syncWithGoogleSheets('SYNC_CLINIC_NOTES', updated);
  };

  const handleDeleteClinicNote = async (id) => {
    const updated = clinicNotes.filter(n => n.id !== id);
    setClinicNotes(updated);
    await syncWithGoogleSheets('SYNC_CLINIC_NOTES', updated);
  };

  const confirmDeleteAppointment = async (id) => {
    setAppointments(appointments.filter(app => app.id !== id));
    setDeleteConfirmId(null);
    await syncWithGoogleSheets('DELETE_APPOINTMENT', { id });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    const cleanedData = { ...editData, time: formatSafeTime(editData.time) };
    
    const check = checkSlotAvailability(cleanedData.doctor, cleanedData.date, cleanedData.time, cleanedData.id);
    if (!check.available) {
      alert(`Erro: Não é possível salvar. ${check.reason}`);
      return;
    }

    setAppointments(appointments.map(app => app.id === cleanedData.id ? cleanedData : app));
    await syncWithGoogleSheets('UPDATE_APPOINTMENT', cleanedData);
    setShowEditModal(false);
  };

  const handleBookingSubmit = async (e) => {
    if(e) e.preventDefault();
    
    const check = checkSlotAvailability(bookingData.doctor, bookingData.date, bookingData.time);
    if (!check.available) {
      alert(`Atenção: Este horário acabou de ser ocupado (${check.reason}). Escolha outro horário.`);
      return;
    }

    const newAppointment = { ...bookingData, time: formatSafeTime(bookingData.time), id: Date.now() };
    setAppointments([...appointments, newAppointment]);
    await syncWithGoogleSheets('ADD_APPOINTMENT', newAppointment);
    setBookingData({ doctor: '', date: '', time: '', name: '', phone: '', city: '', status: 'Pendente', obs: '' });
    setStep(1);
    setCurrentView('home');
  };

  const handleBatchImport = async () => {
    if (!batchInput.trim()) return;
    setImporting(true);
    const lines = batchInput.trim().split(/\r?\n/);
    const newApps = [];
    const timestamp = Date.now();
    
    lines.forEach((line, index) => {
      if (!line.trim() || line.toLowerCase().includes('nome;')) return;
      const parts = line.split(';');
      if (parts.length >= 6) {
        newApps.push({
          id: timestamp + index,
          name: parts[0]?.trim() || 'Sem Nome',
          phone: parts[1]?.trim() || '',
          date: parts[2]?.trim() || getTodayISO(),
          time: formatSafeTime(parts[3]?.trim() || '08:00'),
          doctor: parts[4]?.trim() || 'Dr. Willian',
          city: parts[5]?.trim() || 'Base',
          status: parts[6]?.trim() || 'Pendente',
          obs: parts[7]?.trim() || ''
        });
      }
    });
    
    if (newApps.length > 0) {
      setAppointments([...appointments, ...newApps]);
      await syncWithGoogleSheets('BATCH_IMPORT', newApps);
      setBatchInput('');
      setShowBatchModal(false);
    }
    setImporting(false);
  };

  // ==========================================
  // INTEGRAÇÃO WHATSAPP E RENDERIZAÇÃO
  // ==========================================
  const formatarNumeroWhatsApp = (telefone) => {
    if (!telefone) return '';
    let numero = String(telefone).replace(/\D/g, '');
    if (numero.startsWith('0')) numero = numero.substring(1);
    if (numero.startsWith('55') && numero.length >= 12) numero = numero.substring(2);
    if (numero.length === 10) numero = `${numero.substring(0, 2)}9${numero.substring(2)}`;
    return `55${numero}`;
  };

  const sendWhatsApp = (type, app) => {
    const numeroFormatado = formatarNumeroWhatsApp(app.phone);
    const cleanName = app.name ? app.name.trim().split(' ')[0] : 'Paciente';
    const cleanDate = formatSafeDate(app.date);
    const cleanTime = formatSafeTime(app.time);
    
    let msg = type === 'confirmacao'
      ? `Olá ${cleanName}, seu atendimento está agendado para o dia ${cleanDate} às ${cleanTime}. PODEMOS CONFIRMAR?`
      : `Olá ${cleanName}, lembrando que seu atendimento é hoje às ${cleanTime}. PODEMOS CONFIRMAR?`;
      
    window.open(`https://wa.me/${numeroFormatado}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const renderDashboard = () => {
    const uniqueCities = Array.from(new Set(appointments.map(a => cleanCity(a.city)))).filter(Boolean);
    
    // Usamos localeCompare para ordenar as Strings de forma cega para fusos
    const filtered = appointments.filter(app => {
      const matchSearch = String(app.name || "").toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = filterStatus === 'Todos' || app.status === filterStatus;
      const matchDoctor = filterDoctor === 'Todos' || app.doctor === filterDoctor;
      const matchCity = filterCity === 'Todas' || cleanCity(app.city) === filterCity;
      const matchDate = !filterDate || normalizeToISO(app.date) === filterDate;
      return matchSearch && matchStatus && matchDoctor && matchCity && matchDate;
    }).sort((a, b) => {
      const dateComp = normalizeToISO(a.date).localeCompare(normalizeToISO(b.date));
      if (dateComp !== 0) return dateComp;
      return formatSafeTime(a.time).localeCompare(formatSafeTime(b.time));
    });

    const filteredEvents = calendarEvents.filter(ev => {
      const matchDate = !filterDate || normalizeToISO(ev.date) === filterDate;
      const matchDoctor = filterDoctor === 'Todos' || ev.doctor === 'Todos' || ev.doctor === filterDoctor;
      return matchDate && matchDoctor;
    }).sort((a, b) => {
      const dateComp = normalizeToISO(a.date).localeCompare(normalizeToISO(b.date));
      if (dateComp !== 0) return dateComp;
      return formatSafeTime(a.time).localeCompare(formatSafeTime(b.time));
    });

    const pendentes = filtered.filter(a => a.status === 'Pendente');
    const confirmados = filtered.filter(a => a.status === 'Confirmado');
    const concluidos = filtered.filter(a => a.status === 'Concluído');
    const cancelados = filtered.filter(a => a.status === 'Cancelado' || a.status === 'Não Compareceu');
    
    const todayISO = getTodayISO();
    const statsHoje = appointments.filter(a => normalizeToISO(a.date) === todayISO).length;
    const statsPendentes = appointments.filter(a => a.status === 'Pendente').length;
    const statsConcluidos = appointments.filter(a => a.status === 'Concluído').length;
    const statsTotal = appointments.length;

    const renderCard = (app) => {
      const [hour, min] = formatSafeTime(app.time).split(':');
      let colorClass = 'bg-gray-500';
      let badgeClass = 'text-gray-600 border-gray-200';
      
      if (app.status === 'Pendente') { colorClass = 'bg-[#F59E0B]'; badgeClass = 'text-[#F59E0B] border-[#F59E0B]/30'; } 
      else if (app.status === 'Confirmado') { colorClass = 'bg-blue-500'; badgeClass = 'text-blue-600 border-blue-500/30'; } 
      else if (app.status === 'Concluído') { colorClass = 'bg-[#10B981]'; badgeClass = 'text-[#10B981] border-[#10B981]/30'; } 
      else { colorClass = 'bg-red-500'; badgeClass = 'text-red-600 border-red-500/30'; }

      return (
        <div key={app.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col sm:flex-row gap-5 hover:shadow-md transition-shadow">
          <div className={`${colorClass} text-white rounded-2xl w-16 h-16 flex-shrink-0 flex flex-col items-center justify-center shadow-sm`}>
            <span className="text-xl font-black leading-none">{hour}</span>
            <span className="text-xs font-bold opacity-80">{min}</span>
          </div>
          
          <div className="flex-1 flex flex-col justify-center min-w-0">
            <div className="flex justify-between items-start mb-4 gap-2">
              <h4 className="font-bold text-gray-800 text-lg leading-tight truncate">{app.name}</h4>
              <select
                className={`text-[11px] font-bold px-4 py-1.5 rounded-full border outline-none cursor-pointer text-center appearance-none shrink-0 bg-transparent ${badgeClass}`}
                value={app.status}
                onChange={async (e) => {
                  const newStatus = e.target.value;
                  setAppointments(appointments.map(a => a.id === app.id ? {...a, status: newStatus} : a));
                  await syncWithGoogleSheets('UPDATE_STATUS', { id: app.id, status: newStatus });
                }}
              >
                <option value="Pendente">Pendente</option>
                <option value="Confirmado">Confirmado</option>
                <option value="Concluído">Concluído</option>
                <option value="Cancelado">Cancelado</option>
                <option value="Não Compareceu">Não Compareceu</option>
              </select>
            </div>
            
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mt-auto">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 flex-1">
                <div>
                  <p className="text-gray-400 text-[10px] uppercase font-bold mb-0.5 tracking-wider">Data</p>
                  <p className="font-medium text-gray-700 text-xs truncate">{formatSafeDate(app.date)}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-[10px] uppercase font-bold mb-0.5 tracking-wider">Profissional</p>
                  <p className="font-medium text-gray-700 text-xs truncate">{app.doctor}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-[10px] uppercase font-bold mb-0.5 tracking-wider">Cidade</p>
                  <p className="font-medium text-gray-700 text-xs truncate">{app.city}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-[10px] uppercase font-bold mb-0.5 tracking-wider">Telefone</p>
                  <p className="font-medium text-gray-700 text-xs truncate">{app.phone}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 flex-shrink-0 mt-3 md:mt-0 pt-3 md:pt-0 border-t md:border-0 border-gray-100">
                {deleteConfirmId === app.id ? (
                  <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-xl border border-gray-200 animate-in fade-in">
                    <span className="text-[10px] text-red-500 font-bold uppercase px-1">Excluir?</span>
                    <button onClick={() => confirmDeleteAppointment(app.id)} className="px-2.5 py-1.5 bg-red-600 text-white text-[10px] font-bold rounded-lg hover:bg-red-700">Sim</button>
                    <button onClick={() => setDeleteConfirmId(null)} className="px-2.5 py-1.5 bg-gray-200 text-gray-600 text-[10px] font-bold rounded-lg hover:bg-gray-300">Não</button>
                  </div>
                ) : (
                  <>
                    <button onClick={() => sendWhatsApp('lembrete', app)} className="p-1.5 text-gray-400 hover:text-[#3C8173] hover:bg-gray-50 rounded-lg transition-colors" title="Enviar Lembrete"><Bell size={18} strokeWidth={2} /></button>
                    <button onClick={() => sendWhatsApp('confirmacao', app)} className="p-1.5 text-gray-400 hover:text-green-500 hover:bg-gray-50 rounded-lg transition-colors" title="Pedir Confirmação"><MessageSquare size={18} strokeWidth={2} /></button>
                    <button onClick={() => { setEditData({ ...app }); setShowEditModal(true); }} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-gray-50 rounded-lg transition-colors" title="Editar"><Edit2 size={18} strokeWidth={2} /></button>
                    <button onClick={() => setDeleteConfirmId(app.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-gray-50 rounded-lg transition-colors" title="Excluir"><Trash2 size={18} strokeWidth={2} /></button>
                  </>
                )}
              </div>
            </div>
            
            {app.obs && (
              <div className="mt-4 text-[11px] text-yellow-800 bg-yellow-50 p-2.5 rounded-lg border border-yellow-100 flex items-start gap-2">
                <MessageSquareQuote size={14} className="text-yellow-500 shrink-0 mt-0.5" />
                <span>{app.obs}</span>
              </div>
            )}
          </div>
        </div>
      );
    };

    const renderEventCard = (ev) => {
      const [hour, min] = formatSafeTime(ev.time).split(':');
      const colorClass = ev.isBlocker ? 'bg-[#9333EA]' : 'bg-[#6B7280]';
      const bgLight = ev.isBlocker ? 'bg-purple-50 border-purple-100' : 'bg-gray-50 border-gray-100';
      const textDark = ev.isBlocker ? 'text-purple-800' : 'text-gray-700';

      return (
        <div key={ev.id} className={`${bgLight} rounded-2xl shadow-sm border p-5 flex flex-col sm:flex-row gap-5 hover:shadow-md transition-shadow relative overflow-hidden`}>
          <div className="absolute top-0 right-0 w-16 h-16 bg-white/40 rounded-bl-[100px] -z-0"></div>
          <div className={`${colorClass} text-white rounded-2xl w-16 h-16 flex-shrink-0 flex flex-col items-center justify-center shadow-sm z-10`}>
            <span className="text-xl font-black leading-none">{hour}</span>
            <span className="text-xs font-bold opacity-80">{min}</span>
          </div>
          <div className="flex-1 flex flex-col justify-center min-w-0 z-10">
            <div className="flex justify-between items-start mb-2 gap-2">
              <h4 className={`font-bold ${textDark} text-lg leading-tight truncate flex items-center gap-2`}>
                {ev.isBlocker ? <ShieldAlert size={18} className="text-purple-600"/> : <StickyNote size={18} className="text-gray-500"/>}
                {ev.title}
              </h4>
              <div className="flex gap-2 items-center">
                <span className={`text-[9px] font-bold px-2 py-1 rounded-full border uppercase ${ev.isBlocker ? 'text-purple-600 border-purple-200 bg-purple-100' : 'text-gray-500 border-gray-200 bg-gray-100'}`}>
                  {ev.isBlocker ? 'Bloqueio' : 'Nota'}
                </span>
                <button onClick={() => handleDeleteEvent(ev.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-white rounded-lg transition-colors"><Trash2 size={16} /></button>
              </div>
            </div>
            <div className="flex gap-4">
              <div><p className="text-gray-400 text-[10px] uppercase font-bold mb-0.5 tracking-wider">Data</p><p className={`font-medium ${textDark} text-xs truncate`}>{formatSafeDate(ev.date)}</p></div>
              <div><p className="text-gray-400 text-[10px] uppercase font-bold mb-0.5 tracking-wider">Doutor Afetado</p><p className={`font-medium ${textDark} text-xs truncate`}>{ev.doctor}</p></div>
            </div>
          </div>
        </div>
      );
    };

    const renderGroup = (title, items, dotColor, isEventGroup = false) => {
      if (items.length === 0) return null;
      return (
        <div className="mb-8 animate-in fade-in">
          <div className="flex items-center gap-2 mb-4 px-2">
            <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`}></div>
            <h3 className="text-gray-500 font-bold text-sm">{title}</h3>
          </div>
          <div className="space-y-4">
            {items.map(item => isEventGroup ? renderEventCard(item) : renderCard(item))}
          </div>
        </div>
      );
    };

    return (
      <div className="flex flex-col gap-6">
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
            <input type="text" placeholder="Procurar paciente..." className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-gray-200 outline-none focus:border-[#3C8173]" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#3C8173]" value={filterDoctor} onChange={e => setFilterDoctor(e.target.value)}>
              <option value="Todos">Todos Profissionais</option>
              <option value="Dr. Willian">Dr. Willian</option>
              <option value="Dra. Bianca">Dra. Bianca</option>
            </select>
            <select className="px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#3C8173]" value={filterCity} onChange={e => setFilterCity(e.target.value)}>
              <option value="Todas">Todas Cidades</option>
              {uniqueCities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#3C8173]" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="Todos">Todos Status</option>
              <option value="Pendente">Pendente</option>
              <option value="Confirmado">Confirmado</option>
              <option value="Concluído">Concluído</option>
              <option value="Cancelado">Cancelado</option>
              <option value="Não Compareceu">Não Compareceu</option>
            </select>
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-gray-200">
              <CalendarCheck size={14} className="text-gray-400"/>
              <input type="date" className="text-sm outline-none bg-transparent" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
              {filterDate && <button onClick={() => setFilterDate('')} className="text-gray-300 hover:text-red-400"><XCircle size={14}/></button>}
            </div>
            <button onClick={() => { setSearchTerm(''); setFilterDoctor('Todos'); setFilterStatus('Todos'); setFilterCity('Todas'); setFilterDate(''); }} className="p-2 text-gray-400 hover:text-[#3C8173] bg-gray-50 rounded-xl"><RefreshCw size={16}/></button>
            <button onClick={() => setShowBatchModal(true)} className="p-2 text-white bg-[#3C8173] hover:bg-[#2D665B] rounded-xl shadow-sm"><Upload size={16} /></button>
            <button onClick={() => setShowEventModal(true)} className="p-2 text-white bg-[#9333EA] hover:bg-[#7E22CE] rounded-xl shadow-sm"><CalendarRange size={16} /></button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex flex-col justify-center">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Hoje</span><span className="text-2xl font-black text-gray-800 mt-1">{statsHoje}</span>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex flex-col justify-center">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Pendentes</span><span className="text-2xl font-black text-[#F59E0B] mt-1">{statsPendentes}</span>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex flex-col justify-center">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Concluídos</span><span className="text-2xl font-black text-[#10B981] mt-1">{statsConcluidos}</span>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex flex-col justify-center">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Total</span><span className="text-2xl font-black text-gray-800 mt-1">{statsTotal}</span>
          </div>
        </div>

        <div className="mt-4 w-full">
          {filtered.length === 0 && filteredEvents.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-3xl border border-gray-100 shadow-sm">
              <FileUp size={48} className="text-gray-200 mx-auto mb-4" />
              <p className="text-gray-400 text-sm">Nenhum registro encontrado para estes filtros.</p>
            </div>
          ) : (
            <>
              {renderGroup('Eventos do Calendário', filteredEvents, 'bg-[#9333EA]', true)}
              {renderGroup('Pendentes', pendentes, 'bg-[#F59E0B]')}
              {renderGroup('Confirmados', confirmados, 'bg-blue-500')}
              {renderGroup('Concluídos', concluidos, 'bg-[#10B981]')}
              {renderGroup('Cancelados / Não Compareceram', cancelados, 'bg-red-500')}
            </>
          )}
        </div>
      </div>
    );
  };

  const renderHome = () => (
    <div className="space-y-12 animate-in fade-in duration-700 pb-20 w-full">
      <div className="pt-10 md:pt-16 pb-6 flex flex-col items-center text-center">
        <div className="mb-10 transform hover:scale-105 transition-all duration-500 flex justify-center w-full max-w-2xl">
          <img src={logoImg} alt="WB FisioLife" className="w-full h-auto max-h-[350px] object-contain drop-shadow-2xl" onError={(e) => { e.target.style.display = "none"; }} />
        </div>
        <div className="flex justify-center mt-6 gap-4 flex-wrap">
          <button onClick={() => { setCurrentView('marcar'); setStep(1); }} className="group px-10 py-4 md:px-12 md:py-5 rounded-2xl font-bold text-gray-900 bg-[#D8B669] shadow-lg shadow-[#D8B669]/30 flex items-center hover:bg-[#c2a25c] transition-all transform hover:scale-105 active:scale-95 text-base md:text-lg">
            <Plus className="mr-3 group-hover:rotate-90 transition-transform" size={24} /> Nova Marcação
          </button>
          <button onClick={() => setShowEventModal(true)} className="group px-10 py-4 md:px-12 md:py-5 rounded-2xl font-bold text-white bg-[#9333EA] shadow-lg shadow-[#9333EA]/30 flex items-center hover:bg-[#7E22CE] transition-all transform hover:scale-105 active:scale-95 text-base md:text-lg">
            <CalendarRange className="mr-3 transition-transform" size={24} /> Novo Evento
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full animate-in fade-in slide-in-from-top-4">
        <div className="flex items-center gap-2 mb-4 px-2"><Clipboard className="text-[#D8B669]" size={20} /><h3 className="text-xl font-serif font-bold text-[#1F4C44]">Observações Gerais</h3></div>
        <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 p-6">
          <div className="relative">
            <textarea placeholder="Escrever observação rápida..." className="w-full p-5 pr-14 rounded-2xl bg-gray-50 border border-transparent focus:border-[#3C8173]/30 outline-none text-sm resize-none h-28 transition-all" value={newClinicNote} onChange={e => setNewClinicNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddClinicNote(); } }} />
            <button onClick={handleAddClinicNote} className="absolute right-4 bottom-4 w-10 h-10 bg-[#D8B669] text-[#1F4C44] rounded-full flex items-center justify-center shadow-md hover:bg-[#c2a25c] transition-all active:scale-90"><Send size={18} /></button>
          </div>
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            {clinicNotes.map(note => (
              <div key={note.id} className="group p-4 bg-[#FDFBF2]/50 rounded-2xl border border-yellow-100 relative hover:shadow-sm transition-all">
                <div className="flex justify-between items-start mb-1"><span className="text-[9px] font-bold text-yellow-600 uppercase tracking-widest">{formatSafeDate(note.date)}</span><button onClick={() => handleDeleteClinicNote(note.id)} className="opacity-0 group-hover:opacity-100 p-1 text-red-300 hover:text-red-500 transition-all rounded-lg"><Trash2 size={12}/></button></div>
                <p className="text-gray-700 text-sm leading-relaxed">{note.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-6 w-full">
        <div className="flex items-center gap-3 px-2"><CalendarDays className="text-[#3C8173]" size={24} /><h2 className="text-2xl font-serif font-bold text-[#1F4C44]">Agenda de Consultas e Eventos</h2></div>
        {renderDashboard()}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F4F9F8] font-sans text-gray-800 pb-20 relative overflow-x-hidden">
      <nav className="bg-white shadow-sm border-b border-gray-100 sticky top-0 z-40 h-20 flex items-center px-4">
        <div className="max-w-7xl mx-auto w-full flex justify-between items-center overflow-x-auto no-scrollbar">
          <div className="flex items-center cursor-pointer flex-shrink-0" onClick={() => setCurrentView('home')}>
            <img src={logoImg} alt="WB FisioLife" className="h-12 w-auto object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
          </div>
          <div className="flex items-center gap-2 sm:gap-4 ml-4">
            <button onClick={() => setCurrentView('home')} className={`p-3 rounded-2xl transition-all flex-shrink-0 ${currentView === 'home' ? 'bg-[#E5F0ED] text-[#2D665B]' : 'text-gray-400 hover:bg-gray-50'}`}><Home size={20}/></button>
            <button onClick={() => setCurrentView('config')} className={`flex items-center gap-2 px-4 py-2 rounded-2xl transition-all font-bold text-sm flex-shrink-0 ${currentView === 'config' ? 'bg-[#3C8173] text-[#F4F9F8]' : 'text-gray-400 hover:bg-gray-50'}`}><MapIcon size={18}/> <span className="hidden md:inline">Roteiros</span></button>
            <button onClick={() => { setCurrentView('marcar'); setStep(1); }} className={`px-4 py-2 rounded-2xl text-sm font-bold transition-all shadow-sm flex-shrink-0 whitespace-nowrap ${currentView === 'marcar' ? 'bg-[#3C8173] text-[#F4F9F8]' : 'text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>Nova Marcação</button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 pt-10">
        {loading && <div className="fixed top-0 left-0 w-full h-1 bg-[#D8B669] animate-pulse z-50"></div>}
        
        {currentView === 'home' && renderHome()}
        
        {currentView === 'config' && (
          <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-8 pb-20 animate-in fade-in">
            <div className="md:col-span-1 bg-white rounded-[2.5rem] shadow-xl p-10 h-fit border border-gray-100">
              <h3 className="text-2xl font-serif font-bold text-[#1F4C44] mb-8 flex items-center gap-2"><Plus size={24} className="text-[#D8B669]"/> Novo Roteiro</h3>
              <form onSubmit={handleAddRoute} className="space-y-6">
                <div><label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Data do Roteiro</label><input type="date" required className="w-full px-5 py-4 mt-1 rounded-2xl bg-gray-50 outline-none border border-transparent focus:border-[#3C8173]" value={routeForm.date} onChange={e => setRouteForm({...routeForm, date: e.target.value})} /></div>
                <div><label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Cidade / Local</label><input type="text" required placeholder="Ex: Guimarães" className="w-full px-5 py-4 mt-1 rounded-2xl bg-gray-50 outline-none border border-transparent focus:border-[#3C8173]" value={routeForm.city} onChange={e => setRouteForm({...routeForm, city: e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Hora Inicial</label><input type="time" required className="w-full px-5 py-4 mt-1 rounded-2xl bg-gray-50 outline-none border border-transparent focus:border-[#3C8173]" value={routeForm.startTime} onChange={e => setRouteForm({...routeForm, startTime: e.target.value})} /></div>
                  <div><label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Hora Final</label><input type="time" required className="w-full px-5 py-4 mt-1 rounded-2xl bg-gray-50 outline-none border border-transparent focus:border-[#3C8173]" value={routeForm.endTime} onChange={e => setRouteForm({...routeForm, endTime: e.target.value})} /></div>
                </div>
                <div><label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Começo Turno Tarde</label><input type="time" required className="w-full px-5 py-4 mt-1 rounded-2xl bg-gray-50 outline-none border border-transparent focus:border-[#3C8173]" value={routeForm.shiftSplitTime} onChange={e => setRouteForm({...routeForm, shiftSplitTime: e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Salas Manhã</label><input type="number" min="1" required className="w-full px-5 py-4 mt-1 rounded-2xl bg-gray-50 outline-none border border-transparent focus:border-[#3C8173]" value={routeForm.morningRooms} onChange={e => setRouteForm({...routeForm, morningRooms: parseInt(e.target.value) || 1})} /></div>
                  <div><label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Salas Tarde</label><input type="number" min="1" required className="w-full px-5 py-4 mt-1 rounded-2xl bg-gray-50 outline-none border border-transparent focus:border-[#3C8173]" value={routeForm.afternoonRooms} onChange={e => setRouteForm({...routeForm, afternoonRooms: parseInt(e.target.value) || 1})} /></div>
                </div>
                <button type="submit" className="w-full py-5 rounded-2xl font-bold text-white bg-[#3C8173] hover:bg-[#2D665B] shadow-lg transition-all transform hover:scale-[1.02]">Salvar Roteiro</button>
              </form>
            </div>
            <div className="md:col-span-2 bg-white rounded-[2.5rem] shadow-xl p-10 border border-gray-100">
              <h3 className="text-2xl font-serif font-bold text-[#1F4C44] mb-8 flex items-center gap-2"><MapIcon size={24} className="text-[#3C8173]"/> Roteiros Planeados</h3>
              <div className="space-y-4">
                {routes.length === 0 ? <div className="text-center py-20 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200"><p className="text-gray-400 italic">Nenhum roteiro configurado.</p></div> : routes.map((route, idx) => (
                  <div key={idx} className="flex items-center justify-between p-6 bg-gray-50 rounded-3xl group hover:bg-white hover:shadow-lg transition-all border border-transparent hover:border-gray-100">
                    <div className="flex items-center">
                      <div className="bg-[#E5F0ED] text-[#1F4C44] font-black p-4 rounded-2xl text-center min-w-[80px]">
                        <div className="text-2xl">{normalizeToISO(route.date).split('-')[2]}</div>
                        <div className="text-[10px] uppercase opacity-60">{normalizeToISO(route.date).split('-')[1]}/{normalizeToISO(route.date).split('-')[0]}</div>
                      </div>
                      <div className="ml-6">
                        <h4 className="font-bold text-gray-800 text-xl">{route.city}</h4>
                        <span className="text-xs text-[#3C8173] font-bold uppercase flex items-center gap-1 mt-1"><DoorOpen size={12}/> {route.morningRooms && route.afternoonRooms && route.morningRooms !== route.afternoonRooms ? `${route.morningRooms} Manhã / ${route.afternoonRooms} Tarde` : `${route.rooms} Salas`} | {route.startTime || '08:00'} às {route.endTime || '21:00'}</span>
                      </div>
                    </div>
                    <button onClick={() => handleDeleteRoute(route.date)} className="p-3 text-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded-xl bg-red-50 sm:bg-transparent"><Trash2 size={24} /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {currentView === 'marcar' && (
          <div className="max-w-3xl mx-auto bg-white rounded-3xl md:rounded-[2.5rem] shadow-xl border border-gray-100 overflow-hidden animate-in slide-in-from-bottom-10">
            <div className="bg-white border-b border-gray-100 p-6 md:p-8 text-center relative">
              <h2 className="text-2xl md:text-3xl font-serif font-bold text-[#1F4C44]">Nova Marcação Interna</h2>
              <div className="flex justify-center mt-4 md:mt-6 gap-2 md:gap-4">
                {[1, 2, 3, 4].map(i => (<div key={i} className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center text-xs md:text-sm font-bold transition-all ${step >= i ? 'bg-[#3C8173] text-white shadow-md' : 'bg-gray-100 text-gray-400'}`}>{i}</div>))}
              </div>
            </div>
            <div className="p-4 sm:p-6 md:p-8">
              {step === 1 && (
                <div className="animate-in fade-in slide-in-from-bottom-5">
                  <h3 className="text-lg md:text-xl font-bold text-gray-800 text-center mb-6">Escolha o Especialista</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <button onClick={() => { setBookingData({ ...bookingData, doctor: 'Dr. Willian' }); setStep(2); }} className="bg-gray-50 p-6 md:p-8 rounded-[2rem] border border-gray-100 hover:border-[#3C8173] hover:bg-[#F4F9F8] transition-all flex flex-col items-center group shadow-sm"><div className="w-16 h-16 md:w-20 md:h-20 bg-white shadow-sm rounded-full flex items-center justify-center mb-4 transition-transform group-hover:scale-110"><span className="text-3xl md:text-4xl font-serif font-black text-[#3C8173]">W</span></div><h4 className="text-lg md:text-xl font-bold text-gray-800">Dr. Willian</h4><p className="text-gray-500 mt-1 text-xs md:text-sm">Quiropraxista</p></button>
                    <button onClick={() => { setBookingData({ ...bookingData, doctor: 'Dra. Bianca' }); setStep(2); }} className="bg-gray-50 p-6 md:p-8 rounded-[2rem] border border-gray-100 hover:border-[#3C8173] hover:bg-[#F4F9F8] transition-all flex flex-col items-center group shadow-sm"><div className="w-16 h-16 md:w-20 md:h-20 bg-white shadow-sm rounded-full flex items-center justify-center mb-4 transition-transform group-hover:scale-110"><span className="text-3xl md:text-4xl font-serif font-black text-[#3C8173]">B</span></div><h4 className="text-lg md:text-xl font-bold text-gray-800">Dra. Bianca</h4><p className="text-gray-500 mt-1 text-xs md:text-sm">Fisioterapeuta</p></button>
                  </div>
                </div>
              )}
              {step === 2 && (
                <div className="animate-in fade-in slide-in-from-right-5">
                  <div className="flex items-center justify-between mb-4 md:mb-6 bg-gray-50 border border-gray-100 p-3 md:p-4 rounded-xl md:rounded-2xl">
                    <h3 className="text-sm md:text-base font-bold uppercase text-[#1F4C44]">{viewDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h3>
                    <div className="flex gap-2">
                      <button onClick={() => changeMonth(-1)} className="p-1.5 text-gray-400 hover:text-[#3C8173] hover:bg-white rounded-lg transition-colors"><ChevronLeftCircle size={22}/></button>
                      <button onClick={() => changeMonth(1)} className="p-1.5 text-gray-400 hover:text-[#3C8173] hover:bg-white rounded-lg transition-colors"><ChevronRightCircle size={22}/></button>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 md:grid-cols-7 gap-2 mb-6">
                    {getDaysInMonth(viewDate).map((dayObj) => {
                      const dateStr = dayObj.dateStr;
                      const route = getRouteForDate(dateStr);
                      const isSelected = bookingData.date === dateStr;
                      return (
                        <button key={dateStr} onClick={() => setBookingData({ ...bookingData, date: dateStr, city: route ? route.city : 'Base' })} className={`p-2 sm:p-3 rounded-xl sm:rounded-2xl border flex flex-col items-center justify-between transition-all min-h-[90px] sm:min-h-[110px] ${isSelected ? 'bg-[#F4F9F8] border-[#3C8173] text-[#1F4C44] shadow-sm scale-[1.02]' : 'bg-white hover:border-[#82BCAE] border-gray-100 text-gray-600'}`}>
                          <div className="flex flex-col items-center"><span className="text-[9px] font-bold opacity-60 uppercase mb-0.5">{dayObj.label}</span><span className="text-xl sm:text-2xl font-bold">{dayObj.day}</span></div>
                          <div className="w-full text-center mt-1"><div className={`text-[8px] sm:text-[9px] font-bold leading-tight break-words px-0.5 uppercase mb-1 ${isSelected ? 'text-[#3C8173]' : 'text-gray-400'}`}>{route ? route.city : 'Base'}</div>
                            {route && <div className={`text-[8px] sm:text-[9px] font-bold px-1.5 py-0.5 rounded-lg inline-block ${isSelected ? 'bg-[#E5F0ED] text-[#1F4C44]' : 'bg-gray-100 text-gray-500'}`}>{route.morningRooms && route.afternoonRooms && route.morningRooms !== route.afternoonRooms ? `${route.morningRooms}M/${route.afternoonRooms}T` : `${route.rooms || 1} Salas`}</div>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {bookingData.date && (
                    <div className="animate-in fade-in pt-2">
                      <div className="flex items-center gap-2 mb-4 p-3 bg-gray-50 text-gray-600 rounded-xl md:rounded-2xl text-[10px] md:text-xs font-bold border border-gray-100 leading-tight"><span className="flex items-center gap-1.5 shrink-0 text-[#3C8173]"><Info size={16} /> </span>Horários ocupados, bloqueados por eventos ou sem salas disponíveis são desativados automaticamente.</div>
                      <div className="flex flex-wrap gap-2 md:gap-3 justify-center">
                        {(() => {
                          const selectedRoute = getRouteForDate(bookingData.date);
                          const availableSlots = selectedRoute ? generateTimeSlots(selectedRoute.startTime, selectedRoute.endTime) : generateTimeSlots('08:00', '21:00');
                          return availableSlots.map(time => {
                            const check = checkSlotAvailability(bookingData.doctor, bookingData.date, time);
                            const isSelected = bookingData.time === time;
                            return (
                              <button key={time} disabled={!check.available} onClick={() => setBookingData({ ...bookingData, time })} className={`relative px-3 py-3 md:px-5 md:py-4 rounded-xl md:rounded-2xl text-xs md:text-sm font-bold transition-all flex flex-col items-center min-w-[80px] md:min-w-[100px] border ${isSelected ? 'bg-[#F4F9F8] border-[#3C8173] text-[#1F4C44] shadow-sm' : !check.available ? 'bg-gray-50 text-gray-300 cursor-not-allowed border-dashed border-gray-200 opacity-60' : 'bg-white border-gray-100 hover:border-[#82BCAE] hover:text-[#3C8173] text-gray-600'}`}>
                                <span>{time}</span>{!check.available && <span className="text-[8px] mt-1 text-red-400 flex items-center gap-0.5 uppercase tracking-tighter text-center"><ShieldAlert size={8} className="flex-shrink-0" /><span className="truncate max-w-[60px]">{check.reason}</span></span>}
                              </button>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between mt-8 pt-6 border-t border-gray-100">
                    <button onClick={() => setStep(1)} className="px-5 py-2.5 text-sm md:text-base md:px-6 md:py-3 font-bold text-gray-400 hover:text-gray-600 transition-colors">Voltar</button>
                    <button onClick={() => setStep(3)} disabled={!bookingData.date || !bookingData.time} className="px-6 py-2.5 text-sm md:text-base md:px-8 md:py-3 bg-[#3C8173] text-white font-bold rounded-xl shadow-md disabled:opacity-50 hover:bg-[#2D665B] transition-colors">Continuar</button>
                  </div>
                </div>
              )}
              {step === 3 && (
                <form onSubmit={(e) => { e.preventDefault(); setStep(4); }} className="animate-in fade-in slide-in-from-right-5 space-y-4">
                  <h3 className="text-lg md:text-xl font-bold text-gray-800 text-center mb-6">Dados do Paciente</h3>
                  <div className="p-4 bg-[#F4F9F8] rounded-2xl border border-[#E5F0ED] flex flex-col md:grid md:grid-cols-2 gap-3 text-xs md:text-sm font-bold text-[#1F4C44] mb-4"><div>🩺 {bookingData.doctor}</div><div>📅 {formatSafeDate(bookingData.date)} às {bookingData.time}</div><div>📍 {bookingData.city}</div></div>
                  <input type="text" required placeholder="Nome do Paciente" className="w-full px-4 py-3 md:px-5 md:py-4 rounded-xl md:rounded-2xl bg-gray-50 border border-gray-100 focus:border-[#3C8173] outline-none text-sm md:text-base text-gray-700" value={bookingData.name} onChange={e => setBookingData({...bookingData, name: e.target.value})} />
                  <input type="tel" required placeholder="WhatsApp" className="w-full px-4 py-3 md:px-5 md:py-4 rounded-xl md:rounded-2xl bg-gray-50 border border-gray-100 focus:border-[#3C8173] outline-none text-sm md:text-base text-gray-700" value={bookingData.phone} onChange={e => setBookingData({...bookingData, phone: e.target.value})} />
                  <textarea placeholder="Observações (Opcional)..." rows="3" className="w-full px-4 py-3 md:px-5 md:py-4 rounded-xl md:rounded-2xl bg-gray-50 border border-gray-100 focus:border-[#3C8173] outline-none resize-none text-sm md:text-base text-gray-700" value={bookingData.obs} onChange={e => setBookingData({...bookingData, obs: e.target.value})} />
                  <div className="flex justify-between mt-8 pt-6 border-t border-gray-100">
                    <button type="button" onClick={() => setStep(2)} className="px-5 py-2.5 text-sm md:text-base md:px-6 md:py-3 font-bold text-gray-400 hover:text-gray-600 transition-colors">Voltar</button>
                    <button type="submit" className="px-6 py-2.5 text-sm md:text-base md:px-8 md:py-3 bg-[#3C8173] text-white font-bold rounded-xl shadow-md hover:bg-[#2D665B] transition-all transform hover:scale-105">Revisar</button>
                  </div>
                </form>
              )}
              {step === 4 && (
                <div className="animate-in fade-in slide-in-from-right-5">
                  <h3 className="text-xl md:text-2xl font-bold text-[#1F4C44] text-center mb-6">Confirme os Dados</h3>
                  <div className="bg-white border border-gray-100 rounded-3xl shadow-sm p-6 md:p-8 space-y-4 md:space-y-6">
                    <div className="flex items-center gap-4 pb-4 border-b border-gray-50"><div className="w-12 h-12 bg-[#E5F0ED] rounded-full flex items-center justify-center text-[#3C8173] shrink-0"><CheckCircle2 size={24} /></div><div className="overflow-hidden"><p className="text-[10px] uppercase font-bold text-gray-400">Paciente</p><p className="text-lg font-bold text-gray-800 truncate">{bookingData.name}</p><p className="text-sm text-gray-500 truncate">{bookingData.phone}</p></div></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><p className="text-[10px] uppercase font-bold text-gray-400">Especialista</p><p className="text-sm font-bold text-[#1F4C44] truncate">{bookingData.doctor}</p></div>
                      <div><p className="text-[10px] uppercase font-bold text-gray-400">Local</p><p className="text-sm font-bold text-[#1F4C44] truncate">{bookingData.city}</p></div>
                      <div><p className="text-[10px] uppercase font-bold text-gray-400">Data</p><p className="text-sm font-bold text-[#1F4C44] truncate">{formatSafeDate(bookingData.date)}</p></div>
                      <div><p className="text-[10px] uppercase font-bold text-gray-400">Horário</p><p className="text-sm font-bold text-[#1F4C44] truncate">{bookingData.time}</p></div>
                    </div>
                    {bookingData.obs && <div className="pt-4 border-t border-gray-50"><p className="text-[10px] uppercase font-bold text-gray-400 mb-1">Observações</p><p className="text-sm text-gray-600 bg-gray-50 border border-gray-100 p-3 rounded-xl">{bookingData.obs}</p></div>}
                  </div>
                  <div className="flex justify-between mt-8 pt-6 border-t border-gray-100">
                    <button type="button" onClick={() => setStep(3)} className="px-5 py-2.5 text-sm md:text-base md:px-6 md:py-3 font-bold text-gray-400 hover:text-gray-600 transition-colors">Voltar</button>
                    <button onClick={handleBookingSubmit} className="px-6 py-2.5 text-sm md:text-base md:px-8 md:py-3 bg-[#D8B669] text-gray-900 font-bold rounded-xl shadow-md hover:bg-[#c2a25c] transition-all transform hover:scale-105 flex items-center gap-2"><Check size={18} /> Confirmar</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* MODAL DE EVENTO DO CALENDÁRIO */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="bg-[#9333EA] p-8 text-white flex justify-between items-center"><div><h2 className="text-2xl font-serif font-bold flex items-center gap-2"><CalendarRange size={24}/> Adicionar Evento</h2><p className="text-purple-200 text-xs mt-1">Crie notas ou bloqueie horários na agenda</p></div><button onClick={() => setShowEventModal(false)} className="text-white/40 hover:text-white bg-white/10 p-2 rounded-xl transition-colors"><XCircle size={24}/></button></div>
            <form onSubmit={handleEventSubmit} className="p-8 space-y-5">
              <div><label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Título do Evento / Motivo</label><input type="text" required placeholder="Ex: Reunião, Almoço, Manutenção..." className="w-full p-4 mt-1 bg-gray-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-purple-500" value={eventData.title} onChange={e => setEventData({...eventData, title: e.target.value})} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Data</label><input type="date" required className="w-full p-4 mt-1 bg-gray-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-purple-500" value={eventData.date} onChange={e => setEventData({...eventData, date: e.target.value})} /></div>
                <div><label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Horário</label><input type="time" required className="w-full p-4 mt-1 bg-gray-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-purple-500" value={eventData.time} onChange={e => setEventData({...eventData, time: e.target.value})} /></div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Doutor Afetado</label>
                <select className="w-full p-4 mt-1 bg-gray-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer" value={eventData.doctor} onChange={e => setEventData({...eventData, doctor: e.target.value})}>
                  <option value="Todos">Todos (Bloqueia a Clínica Inteira)</option><option value="Dr. Willian">Dr. Willian</option><option value="Dra. Bianca">Dra. Bianca</option>
                </select>
              </div>
              <div className="pt-2">
                <label className="flex items-center gap-3 p-4 bg-purple-50 rounded-2xl border border-purple-100 cursor-pointer hover:bg-purple-100 transition-colors">
                  <input type="checkbox" className="w-5 h-5 accent-purple-600 rounded" checked={eventData.isBlocker} onChange={e => setEventData({...eventData, isBlocker: e.target.checked})}/>
                  <div className="flex flex-col"><span className="font-bold text-purple-900 text-sm">Bloquear Horário na Agenda</span><span className="text-xs text-purple-700">Impede que novos agendamentos sejam feitos neste horário.</span></div>
                </label>
              </div>
              <div className="flex justify-end pt-4"><button type="submit" className="px-10 py-4 bg-[#9333EA] text-white font-bold rounded-2xl shadow-xl hover:bg-[#7E22CE] transition-all transform hover:scale-[1.02]">Salvar Evento</button></div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE IMPORTAÇÃO */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="bg-[#1F4C44] p-8 text-white flex justify-between items-center"><div><h2 className="text-2xl font-serif font-bold">Importação em Massa</h2><p className="text-[#82BCAE] text-[10px] uppercase mt-1 tracking-widest">Colar lista: Nome;Fone;Data;Hora;Doutor;Cidade;Status;Obs</p></div><button onClick={() => setShowBatchModal(false)} className="text-white/40 hover:text-white bg-white/10 p-2 rounded-xl transition-colors"><XCircle size={24}/></button></div>
            <div className="p-10 space-y-6">
              <textarea className="w-full h-64 px-6 py-4 rounded-2xl bg-gray-50 outline-none resize-none font-mono text-xs border border-transparent focus:border-[#3C8173]/30" placeholder="Exemplo: João Silva;912345678;2026-03-24;09:00;Dr. Willian;Guanambi;Confirmado;Primeira consulta" value={batchInput} onChange={e => setBatchInput(e.target.value)} />
              <div className="flex justify-end gap-4">
                <button onClick={() => setShowBatchModal(false)} className="px-8 py-4 font-bold text-gray-400 hover:text-gray-600 transition-colors">Cancelar</button>
                <button onClick={handleBatchImport} disabled={importing || !batchInput.trim()} className="px-10 py-4 bg-[#3C8173] text-white font-bold rounded-2xl shadow-xl flex items-center gap-2 hover:bg-[#2D665B] transition-all disabled:opacity-50">{importing ? <Loader2 className="animate-spin" size={20}/> : <CheckCircle2 size={20}/>} Importar Pacientes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE EDIÇÃO */}
      {showEditModal && editData && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="bg-[#1F4C44] p-8 text-white flex justify-between items-center"><h2 className="text-2xl font-serif font-bold">Editar Agendamento</h2><button onClick={() => setShowEditModal(false)} className="text-white/40 hover:text-white bg-white/10 p-2 rounded-xl transition-colors"><XCircle size={24}/></button></div>
            <form onSubmit={handleSaveEdit} className="p-10 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Data</label><input type="date" className="w-full p-4 bg-gray-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-[#3C8173]" value={normalizeToISO(editData.date)} onChange={e => setEditData({...editData, date: e.target.value})} /></div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Horário (Em Ponto)</label>
                  <select className="w-full p-4 bg-gray-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-[#3C8173]" value={formatSafeTime(editData.time)} onChange={e => setEditData({...editData, time: e.target.value})}>
                    {(() => {
                      const editRoute = getRouteForDate(editData.date);
                      const editTimeSlots = editRoute ? generateTimeSlots(editRoute.startTime || '08:00', editRoute.endTime || '21:00') : generateTimeSlots('08:00', '21:00');
                      return editTimeSlots.map(t => {
                        const check = checkSlotAvailability(editData.doctor, editData.date, t, editData.id);
                        return <option key={t} value={t} disabled={!check.available}>{t} {!check.available ? `(${check.reason})` : ''}</option>;
                      });
                    })()}
                  </select>
                </div>
              </div>
              <div className="space-y-2"><label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Nome do Paciente</label><input type="text" className="w-full p-4 bg-gray-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-[#3C8173]" value={editData.name} onChange={e => setEditData({...editData, name: e.target.value})} /></div>
              <div className="space-y-2"><label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Observações</label><textarea rows="3" className="w-full p-4 bg-gray-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-[#3C8173] resize-none" value={editData.obs} onChange={e => setEditData({...editData, obs: e.target.value})} /></div>
              <div className="flex justify-end pt-4"><button type="submit" className="px-10 py-4 bg-[#3C8173] text-white font-bold rounded-2xl shadow-xl hover:bg-[#2D665B] transition-all transform hover:scale-[1.02]">Guardar Alterações</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}