import React, { useState, useEffect, useRef } from 'react';
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
  CheckCircle2
} from 'lucide-react';

// ==========================================
// CONFIGURAÇÃO DE APIS E INTEGRAÇÕES
// ==========================================
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwLIpBz0aS-C5AezGwWf2LecNtzIuNHqpQucCTcIJ72_dpgXu4rG4yHnaLp8Gs3f3brgA/exec"; 

const TIME_SLOTS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];

export default function App() {
  // --- Estados Principais ---
  const [currentView, setCurrentView] = useState('home'); 
  const [appointments, setAppointments] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [clinicNotes, setClinicNotes] = useState([]); 
  const [loading, setLoading] = useState(false);

  // Estados do Calendário
  const [viewDate, setViewDate] = useState(new Date());

  // Estados do Modal de Edição
  const [showEditModal, setShowEditModal] = useState(false);
  const [editData, setEditData] = useState(null);

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

  // --- Estados de Notas ---
  const [newClinicNote, setNewClinicNote] = useState('');

  // --- Estados da Marcação ---
  const [step, setStep] = useState(1);
  const [bookingData, setBookingData] = useState({
    doctor: '', date: '', time: '', name: '', phone: '', city: '', status: 'Pendente', obs: ''
  });

  const [routeForm, setRouteForm] = useState({ date: '', city: '', rooms: 1 });

  // ==========================================
  // FUNÇÕES DE UTILIDADE E CORREÇÃO DE FUSO
  // ==========================================
  
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
    return days;
  };

  const normalizeToISO = (dateStr) => {
    if (!dateStr) return '';
    let s = String(dateStr).trim();
    if (s.includes('/')) {
      const parts = s.split('/');
      if (parts.length === 3) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
    return s.split('T')[0];
  };

  const formatSafeDate = (rawDate) => {
    if (!rawDate) return '--/--/----';
    let s = String(rawDate).trim();
    if (s.includes('T')) s = s.split('T')[0];
    if (s.includes('-')) {
      const p = s.split('-');
      if (p.length === 3 && p[0].length === 4) return `${p[2]}/${p[1]}/${p[0]}`;
    }
    return s;
  };

  const formatSafeTime = (rawTime) => {
    if (!rawTime) return '--:00';
    let t = String(rawTime).trim();
    if (t.includes('T')) {
      const d = new Date(t);
      if (!isNaN(d.getTime())) {
        const hour = d.getHours().toString().padStart(2, '0');
        const min = d.getMinutes().toString().padStart(2, '0');
        return `${hour}:${min}`;
      }
      t = t.split('T')[1].substring(0, 5); 
    }
    if (t.includes(':')) {
      const parts = t.split(':');
      if (parts.length >= 2) {
        return `${parts[0].padStart(2, '0')}:${parts[1].substring(0, 2)}`;
      }
    }
    return '--:00';
  };

  const getRouteForDate = (dateStr) => {
    const targetISO = normalizeToISO(dateStr);
    return routes.find(r => normalizeToISO(r.date) === targetISO);
  };

  const checkSlotAvailability = (doctor, date, time, currentId = null) => {
    const targetISO = normalizeToISO(date);
    const targetTime = formatSafeTime(time);
    
    const route = getRouteForDate(date);
    const rooms = (route && route.rooms) ? parseInt(route.rooms) : 99;

    const doctorConflict = appointments.find(a => {
      if (a.id === currentId) return false; 
      const appISO = normalizeToISO(a.date);
      const appTime = formatSafeTime(a.time);
      return (
        appISO === targetISO && 
        appTime === targetTime && 
        a.doctor === doctor &&
        a.status !== 'Cancelado'
      );
    });

    if (doctorConflict) return { available: false, reason: 'Médico Ocupado' };

    const totalAppointmentsAtSlot = appointments.filter(a => {
      if (a.id === currentId) return false;
      const appISO = normalizeToISO(a.date);
      const appTime = formatSafeTime(a.time);
      return (
        appISO === targetISO && 
        appTime === targetTime && 
        a.status !== 'Cancelado'
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
      }
      setLoading(false);
    };
    loadAllData();
  }, []);

  const changeMonth = (offset) => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1));

  const handleDeleteRoute = async (date) => {
    const normalizedDate = normalizeToISO(date);
    const updated = routes.filter(r => normalizeToISO(r.date) !== normalizedDate);
    setRoutes(updated);
    await syncWithGoogleSheets('DELETE_ROUTE', { date: normalizedDate });
  };

  const handleAddRoute = async (e) => {
    e.preventDefault();
    const newRoutes = [...routes.filter(r => normalizeToISO(r.date) !== normalizeToISO(routeForm.date)), routeForm];
    setRoutes(newRoutes);
    await syncWithGoogleSheets('UPDATE_ROUTE', routeForm);
    setRouteForm({ date: '', city: '', rooms: 1 });
  };

  const handleAddClinicNote = async (e) => {
    if (e) e.preventDefault();
    if (!newClinicNote.trim()) return;
    const note = { id: Date.now(), text: newClinicNote, date: new Date().toLocaleDateString('pt-BR'), timestamp: new Date().toISOString() };
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
    setAppointments(appointments.map(app => app.id === cleanedData.id ? cleanedData : app));
    await syncWithGoogleSheets('UPDATE_APPOINTMENT', cleanedData);
    setShowEditModal(false);
  };

  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    const newAppointment = { ...bookingData, id: Date.now() };
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
          date: parts[2]?.trim() || new Date().toISOString().split('T')[0],
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

  const sendWhatsApp = (type, app) => {
    const safePhone = String(app.phone || '').replace(/\D/g, '');
    const cleanName = app.name || 'Paciente';
    const cleanDate = formatSafeDate(app.date);
    const cleanTime = formatSafeTime(app.time);
    let msg = type === 'confirmacao' 
      ? `Olá ${cleanName}! Passamos para confirmar a sua consulta com ${app.doctor} amanhã, dia ${cleanDate} às ${cleanTime} em ${app.city}. Está confirmado? 👍`
      : `Olá ${cleanName}! Lembramos que a sua consulta com ${app.doctor} é hoje às ${cleanTime} em ${app.city}. Ficamos à sua espera! 😊`;
    
    window.open(`https://wa.me/${safePhone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // ==========================================
  // RENDERIZAÇÃO
  // ==========================================
  
  const renderDashboard = () => {
    const uniqueCities = Array.from(new Set(appointments.map(a => a.city))).filter(Boolean);
    const filtered = appointments.filter(app => {
      const matchSearch = String(app.name || "").toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = filterStatus === 'Todos' || app.status === filterStatus;
      const matchDoctor = filterDoctor === 'Todos' || app.doctor === filterDoctor;
      const matchCity = filterCity === 'Todas' || app.city === filterCity;
      const matchDate = !filterDate || normalizeToISO(app.date) === normalizeToISO(filterDate);
      return matchSearch && matchStatus && matchDoctor && matchCity && matchDate;
    }).sort((a, b) => {
      const dateA = new Date(normalizeToISO(a.date));
      const dateB = new Date(normalizeToISO(b.date));
      if (dateA - dateB !== 0) return dateA - dateB;
      return formatSafeTime(a.time).localeCompare(formatSafeTime(b.time));
    });

    const getStatusColor = (status) => {
      switch (status) {
        case 'Confirmado': return 'bg-blue-100 text-blue-800 border-blue-200';
        case 'Concluído': return 'bg-green-100 text-green-800 border-green-200';
        case 'Cancelado': return 'bg-red-100 text-red-800 border-red-200';
        default: return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      }
    };

    return (
      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100">
        <div className="p-6 border-b border-gray-100 bg-gray-50 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[250px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input type="text" placeholder="Procurar paciente..." className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 outline-none focus:ring-2 focus:ring-[#3C8173]" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            <button onClick={() => setShowBatchModal(true)} className="flex items-center px-4 py-2.5 bg-[#3C8173] text-white font-bold rounded-xl hover:bg-[#2D665B] shadow-sm transition-all active:scale-95">
              <Upload size={18} className="mr-2" /> Importar Lista
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
             <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-gray-300">
              <CalendarCheck size={16} className="text-gray-400"/><input type="date" className="text-sm outline-none bg-transparent" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
              {filterDate && <button onClick={() => setFilterDate('')} className="text-gray-300 hover:text-red-400"><XCircle size={14}/></button>}
            </div>
            <select className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium" value={filterCity} onChange={e => setFilterCity(e.target.value)}>
              <option value="Todas">Todas Cidades</option>
              {uniqueCities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium" value={filterDoctor} onChange={e => setFilterDoctor(e.target.value)}>
              <option value="Todos">Médicos</option><option value="Dr. Willian">Dr. Willian</option><option value="Dra. Bianca">Dra. Bianca</option>
            </select>
            <select className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="Todos">Status</option><option value="Pendente">Pendente</option><option value="Confirmado">Confirmado</option><option value="Concluído">Concluído</option><option value="Cancelado">Cancelado</option>
            </select>
            <button onClick={() => { setSearchTerm(''); setFilterDoctor('Todos'); setFilterStatus('Todos'); setFilterCity('Todas'); setFilterDate(''); }} className="p-2 text-gray-400 hover:text-red-500"><RefreshCw size={18}/></button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-white border-b border-gray-100 text-[10px] text-gray-400 uppercase tracking-widest">
                <th className="p-4 font-bold">Paciente</th>
                <th className="p-4 font-bold">Agenda</th>
                <th className="p-4 font-bold">Local e Salas</th>
                <th className="p-4 font-bold">Status</th>
                <th className="p-4 font-bold text-center">Mensagens</th>
                <th className="p-4 font-bold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-20 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <FileUp size={48} className="text-gray-200" />
                      <p className="text-gray-400 italic">Nenhum agendamento encontrado.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map(app => {
                  const route = getRouteForDate(app.date);
                  return (
                    <tr key={app.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-4">
                        <div className="font-bold text-gray-800">{app.name}</div>
                        <div className="text-xs text-gray-500">{app.phone}</div>
                        {app.obs && (
                          <div className="mt-2 p-2 bg-yellow-50 border border-yellow-100 rounded-lg text-[11px] text-yellow-800 flex items-start shadow-sm">
                            <MessageSquareQuote size={12} className="mr-1.5 mt-0.5 shrink-0 opacity-60" />
                            <span className="leading-tight">{app.obs}</span>
                          </div>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="text-sm font-bold text-[#1F4C44] flex items-center">
                           <CalendarIcon size={14} className="mr-1.5 opacity-40"/>
                           {formatSafeDate(app.date)}
                        </div>
                        <div className="text-xs text-gray-400 font-bold mt-2 flex items-center">
                          <Clock size={12} className="mr-1.5 opacity-40"/>
                          {formatSafeTime(app.time)}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm font-medium text-gray-700">{app.doctor}</div>
                        <div className="text-xs text-[#3C8173] font-bold flex items-center mt-1.5">
                          <MapPin size={12} className="mr-1.5 opacity-70"/> {app.city}
                        </div>
                        {route && (
                          <div className="inline-flex items-center mt-2 px-2 py-0.5 rounded-lg bg-[#E5F0ED] text-[#1F4C44] text-[10px] font-bold">
                            <DoorOpen size={12} className="mr-1" /> {route.rooms} Salas
                          </div>
                        )}
                      </td>
                      <td className="p-4">
                        <select 
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-full border outline-none cursor-pointer ${getStatusColor(app.status)}`} 
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
                        </select>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => sendWhatsApp('confirmacao', app)} className="p-2 text-green-600 hover:bg-green-100 rounded-xl transition-all" title="Confirmação"><MessageSquare size={18} /></button>
                          <button onClick={() => sendWhatsApp('lembrete', app)} className="p-2 text-[#3C8173] hover:bg-green-100 rounded-xl transition-all" title="Lembrete"><Bell size={18} /></button>
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        {deleteConfirmId === app.id ? (
                          <div className="flex items-center justify-end gap-2 animate-in fade-in">
                            <button onClick={() => confirmDeleteAppointment(app.id)} className="px-3 py-1 bg-red-600 text-white text-[10px] font-bold rounded-lg">Eliminar</button>
                            <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1 bg-gray-200 text-gray-600 text-[10px] font-bold rounded-lg">Sair</button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => { setEditData({ ...app }); setShowEditModal(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={18} /></button>
                            <button onClick={() => setDeleteConfirmId(app.id)} className="p-2 text-red-400 hover:bg-red-50 rounded-lg"><Trash2 size={18} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderHome = () => (
    <div className="space-y-12 animate-in fade-in duration-700 pb-20">
      <div className="pt-10 md:pt-16 pb-6 flex flex-col items-center text-center">
        
        <div className="mb-8 transform hover:scale-105 transition-transform duration-500">
          <img src="https://ui-avatars.com/api/?name=WB&background=3C8173&color=fff&size=256" alt="WB FisioLife" className="w-32 h-32 object-contain drop-shadow-sm rounded-full" />
        </div>

        <div className="flex flex-col items-center gap-1">
          <h1 className="text-4xl md:text-6xl font-serif font-black text-[#3C8173] tracking-tighter uppercase">
            WB <span className="text-[#3C8173]/90">Fisiolife</span>
          </h1>
          <p className="text-[10px] md:text-xs font-bold text-[#3C8173]/70 uppercase tracking-[0.3em] mt-2 border-t border-[#D8B669] pt-2">
            Quiropraxia | Fisioterapia | Especialidades
          </p>
        </div>

        <div className="flex justify-center mt-10">
          <button 
            onClick={() => { setCurrentView('marcar'); setStep(1); }} 
            className="group px-12 py-5 rounded-2xl font-bold text-gray-900 bg-[#D8B669] shadow-lg shadow-[#D8B669]/30 flex items-center hover:bg-[#c2a25c] transition-all transform hover:scale-105 active:scale-95 text-lg"
          >
            <Plus className="mr-3 group-hover:rotate-90 transition-transform" size={24} /> Nova Marcação
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full animate-in fade-in slide-in-from-top-4">
        <div className="flex items-center gap-2 mb-4 px-2">
           <Clipboard className="text-[#D8B669]" size={20} />
           <h3 className="text-xl font-serif font-bold text-[#1F4C44]">Observações</h3>
        </div>
        
        <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 p-6">
            <div className="relative">
              <textarea 
                placeholder="Escrever observação..." 
                className="w-full p-5 pr-14 rounded-2xl bg-gray-50 border border-transparent focus:border-[#3C8173]/30 outline-none text-sm resize-none h-28 transition-all" 
                value={newClinicNote} 
                onChange={e => setNewClinicNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddClinicNote(); } }}
              />
              <button 
                onClick={handleAddClinicNote} 
                className="absolute right-4 bottom-4 w-10 h-10 bg-[#D8B669] text-[#1F4C44] rounded-full flex items-center justify-center shadow-md hover:bg-[#c2a25c] transition-all active:scale-90"
              >
                <Send size={18} />
              </button>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {clinicNotes.map(note => (
                <div key={note.id} className="group p-4 bg-[#FDFBF2]/50 rounded-2xl border border-yellow-100 relative hover:shadow-sm transition-all">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[9px] font-bold text-yellow-600 uppercase tracking-widest">{note.date}</span>
                    <button 
                      onClick={() => handleDeleteClinicNote(note.id)} 
                      className="opacity-0 group-hover:opacity-100 p-1 text-red-300 hover:text-red-500 transition-all rounded-lg"
                    >
                      <Trash2 size={12}/>
                    </button>
                  </div>
                  <p className="text-gray-700 text-sm leading-relaxed">{note.text}</p>
                </div>
              ))}
              {clinicNotes.length === 0 && (
                <p className="col-span-2 text-center text-gray-300 text-xs py-4 italic">Nenhuma observação guardada.</p>
              )}
            </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center gap-3 px-2">
            <CalendarDays className="text-[#3C8173]" size={24} />
            <h2 className="text-2xl font-serif font-bold text-[#1F4C44]">Agenda de Consultas</h2>
        </div>
        {renderDashboard()}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F4F9F8] font-sans text-gray-800 pb-20 relative overflow-x-hidden">
      <nav className="bg-white shadow-sm border-b border-gray-100 sticky top-0 z-40 h-20 flex items-center px-4">
        <div className="max-w-7xl mx-auto w-full flex justify-between items-center">
          <div className="flex items-center cursor-pointer" onClick={() => setCurrentView('home')}>
            <img src="https://ui-avatars.com/api/?name=WB&background=3C8173&color=fff&size=128" alt="WB FisioLife" className="w-8 h-8 object-contain mr-2 rounded-full" />
            <span className="font-serif font-black text-2xl text-[#1F4C44]">WB<span className="text-[#3C8173]">Fisiolife</span></span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <button onClick={() => setCurrentView('home')} className={`p-3 rounded-2xl transition-all ${currentView === 'home' ? 'bg-[#E5F0ED] text-[#2D665B]' : 'text-gray-400 hover:bg-gray-50'}`}><Home size={20}/></button>
            <button onClick={() => setCurrentView('config')} className={`flex items-center gap-2 px-4 py-2 rounded-2xl transition-all font-bold text-sm ${currentView === 'config' ? 'bg-[#3C8173] text-[#F4F9F8]' : 'text-gray-400 hover:bg-gray-50'}`}>
              <MapIcon size={18}/> <span className="hidden sm:inline">Roteiros</span>
            </button>
            <button onClick={() => { setCurrentView('marcar'); setStep(1); }} className={`px-5 py-2.5 rounded-2xl text-sm font-bold transition-all shadow-sm ${currentView === 'marcar' ? 'bg-[#3C8173] text-[#F4F9F8]' : 'text-gray-600 hover:bg-gray-50'}`}>Nova Marcação</button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 pt-10">
        {loading && <div className="fixed top-0 left-0 w-full h-1 bg-[#D8B669] animate-pulse z-50"></div>}
        
        {currentView === 'home' && renderHome()}
        
        {currentView === 'config' && (
          <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-8 pb-20 animate-in fade-in">
            <div className="md:col-span-1 bg-white rounded-[2.5rem] shadow-xl p-10 h-fit border border-gray-100">
              <h3 className="text-2xl font-serif font-bold text-[#1F4C44] mb-8 flex items-center gap-2">
                <Plus size={24} className="text-[#D8B669]"/> Novo Roteiro
              </h3>
              <form onSubmit={handleAddRoute} className="space-y-6">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Data do Roteiro</label>
                  <input type="date" required className="w-full px-5 py-4 mt-1 rounded-2xl bg-gray-50 outline-none border border-transparent focus:border-[#3C8173] transition-all" value={routeForm.date} onChange={e => setRouteForm({...routeForm, date: e.target.value})} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Cidade / Local</label>
                  <input type="text" required placeholder="Ex: Guimarães" className="w-full px-5 py-4 mt-1 rounded-2xl bg-gray-50 outline-none border border-transparent focus:border-[#3C8173] transition-all" value={routeForm.city} onChange={e => setRouteForm({...routeForm, city: e.target.value})} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Número de Salas</label>
                  <input type="number" min="1" required placeholder="Salas Disponíveis" className="w-full px-5 py-4 mt-1 rounded-2xl bg-gray-50 outline-none border border-transparent focus:border-[#3C8173] transition-all" value={routeForm.rooms || ''} onChange={e => setRouteForm({...routeForm, rooms: parseInt(e.target.value) || 0})} />
                </div>
                <button type="submit" className="w-full py-5 rounded-2xl font-bold text-white bg-[#3C8173] hover:bg-[#2D665B] shadow-lg transition-all transform hover:scale-[1.02]">Salvar Roteiro</button>
              </form>
            </div>
            <div className="md:col-span-2 bg-white rounded-[2.5rem] shadow-xl p-10 border border-gray-100">
              <h3 className="text-2xl font-serif font-bold text-[#1F4C44] mb-8 flex items-center gap-2">
                <MapIcon size={24} className="text-[#3C8173]"/> Roteiros Planeados
              </h3>
              <div className="space-y-4">
                {routes.length === 0 ? (
                  <div className="text-center py-20 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
                    <p className="text-gray-400 italic">Nenhum roteiro configurado.</p>
                  </div>
                ) : (
                  routes.map((route, idx) => (
                    <div key={idx} className="flex items-center justify-between p-6 bg-gray-50 rounded-3xl group hover:bg-white hover:shadow-lg transition-all border border-transparent hover:border-gray-100">
                      <div className="flex items-center">
                        <div className="bg-[#E5F0ED] text-[#1F4C44] font-black p-4 rounded-2xl text-center min-w-[80px]">
                          <div className="text-[10px] uppercase opacity-60">{new Date(normalizeToISO(route.date)).toLocaleDateString('pt-BR', { weekday: 'short' })}</div>
                          <div className="text-2xl">{normalizeToISO(route.date).split('-')[2]}</div>
                        </div>
                        <div className="ml-6">
                          <h4 className="font-bold text-gray-800 text-xl">{route.city}</h4>
                          <span className="text-xs text-[#3C8173] font-bold uppercase flex items-center gap-1 mt-1">
                            <DoorOpen size={12}/> {route.rooms} Salas Disponíveis
                          </span>
                        </div>
                      </div>
                      <button onClick={() => handleDeleteRoute(route.date)} className="p-3 text-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded-xl bg-red-50 sm:bg-transparent">
                        <Trash2 size={24} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* MARCAÇÃO PASSO A PASSO */}
        {currentView === 'marcar' && (
          <div className="max-w-4xl mx-auto bg-white rounded-[3rem] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10">
            <div className="bg-[#2D665B] p-10 text-white text-center">
              <h2 className="text-4xl font-serif font-bold">Nova Marcação</h2>
              <div className="flex justify-center mt-10 gap-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${step >= i ? 'bg-[#D8B669] border-[#D8B669] text-gray-900' : 'border-white/20 text-white/40'}`}>{i}</div>
                ))}
              </div>
            </div>
            <div className="p-12">
              {step === 1 && (
                <div className="animate-in fade-in slide-in-from-bottom-5">
                  <h3 className="text-2xl font-serif font-bold text-gray-800 text-center mb-10">Escolha o Especialista</h3>
                  <div className="grid md:grid-cols-2 gap-8">
                    <button onClick={() => { setBookingData({ ...bookingData, doctor: 'Dr. Willian' }); setStep(2); }} className="bg-gray-50 p-10 rounded-[2.5rem] border-2 border-transparent hover:border-[#3C8173] hover:bg-white transition-all flex flex-col items-center group">
                      <div className="w-24 h-24 bg-[#E5F0ED] rounded-full flex items-center justify-center mb-6 transition-transform group-hover:scale-110"><span className="text-5xl font-serif font-black text-[#3C8173]">W</span></div>
                      <h4 className="text-2xl font-serif font-bold text-gray-800">Dr. Willian</h4><p className="text-gray-400 mt-2 text-sm italic">Quiropraxista</p>
                    </button>
                    <button onClick={() => { setBookingData({ ...bookingData, doctor: 'Dra. Bianca' }); setStep(2); }} className="bg-gray-50 p-10 rounded-[2.5rem] border-2 border-transparent hover:border-[#3C8173] hover:bg-white transition-all flex flex-col items-center group">
                      <div className="w-24 h-24 bg-[#E5F0ED] rounded-full flex items-center justify-center mb-6 transition-transform group-hover:scale-110"><span className="text-5xl font-serif font-black text-[#3C8173]">B</span></div>
                      <h4 className="text-2xl font-serif font-bold text-gray-800">Dra. Bianca</h4><p className="text-gray-400 mt-2 text-sm italic">Fisioterapeuta</p>
                    </button>
                  </div>
                </div>
              )}
              {step === 2 && (
                <div className="animate-in fade-in slide-in-from-right-5">
                  <div className="flex items-center justify-between mb-8 bg-gray-50 p-4 rounded-2xl">
                    <h3 className="text-lg font-bold uppercase text-[#1F4C44]">{viewDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h3>
                    <div className="flex gap-2"><button onClick={() => changeMonth(-1)} className="p-2 text-[#3C8173] hover:bg-white rounded-xl"><ChevronLeftCircle size={24}/></button><button onClick={() => changeMonth(1)} className="p-2 text-[#3C8173] hover:bg-white rounded-xl"><ChevronRightCircle size={24}/></button></div>
                  </div>
                  <div className="grid grid-cols-4 md:grid-cols-7 gap-2 mb-10">
                    {getDaysInMonth(viewDate).map((d) => {
                      const dateStr = d.toISOString().split('T')[0];
                      const route = getRouteForDate(dateStr);
                      const isSelected = bookingData.date === dateStr;
                      return (
                        <button 
                          key={dateStr} 
                          onClick={() => setBookingData({ ...bookingData, date: dateStr, city: route ? route.city : 'Base' })} 
                          className={`p-3 rounded-2xl border flex flex-col items-center justify-between transition-all min-h-[110px] sm:min-h-[130px] ${isSelected ? 'bg-[#3C8173] text-white shadow-lg scale-105 border-transparent' : 'bg-white hover:border-[#3C8173] border-gray-100'}`}
                        >
                          <div className="flex flex-col items-center">
                            <span className="text-[9px] font-bold opacity-60 uppercase mb-0.5">{d.toLocaleDateString('pt-BR', { weekday: 'short' }).substring(0,2)}</span>
                            <span className="text-xl sm:text-2xl font-black">{d.getDate()}</span>
                          </div>
                          
                          <div className="w-full text-center mt-1">
                            <div className={`text-[9px] sm:text-[10px] font-bold leading-tight break-words px-0.5 uppercase mb-1 ${isSelected ? 'text-white' : 'text-[#3C8173]'}`}>
                              {route ? route.city : 'Base'}
                            </div>
                            {route && (
                              <div className={`text-[8px] sm:text-[9px] font-bold px-1.5 py-0.5 rounded-lg inline-block ${isSelected ? 'bg-[#2D665B] text-white' : 'bg-[#E5F0ED] text-[#1F4C44]'}`}>
                                {route.rooms} Salas
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {bookingData.date && (
                    <div className="animate-in fade-in pt-4">
                        <div className="flex items-center gap-2 mb-6 p-3 bg-blue-50 text-blue-700 rounded-2xl text-[11px] font-bold border border-blue-100">
                           <span className="animate-pulse flex items-center gap-1.5"><Info size={16} /> </span>
                           Horários ocupados ou sem salas disponíveis são bloqueados automaticamente.
                        </div>

                        <div className="flex flex-wrap gap-3 justify-center">
                            {TIME_SLOTS.map(time => {
                              const check = checkSlotAvailability(bookingData.doctor, bookingData.date, time);
                              const isSelected = bookingData.time === time;
                              
                              return (
                                <button 
                                  key={time} 
                                  disabled={!check.available}
                                  onClick={() => setBookingData({ ...bookingData, time })} 
                                  className={`relative px-6 py-4 rounded-2xl text-sm font-bold transition-all flex flex-col items-center min-w-[110px] ${
                                    isSelected 
                                    ? 'bg-[#3C8173] text-white shadow-lg' 
                                    : !check.available 
                                      ? 'bg-gray-100 text-gray-300 cursor-not-allowed border-dashed border-2 border-gray-200 opacity-60' 
                                      : 'bg-white border border-gray-200 hover:border-[#3C8173] hover:text-[#3C8173]'
                                  }`}
                                >
                                  <span>{time}</span>
                                  {!check.available && (
                                    <span className="text-[8px] mt-1 text-red-400 flex items-center gap-0.5 uppercase tracking-tighter">
                                      <ShieldAlert size={8} /> {check.reason}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                        </div>
                    </div>
                  )}
                  <div className="flex justify-between mt-12 pt-8 border-t"><button onClick={() => setStep(1)} className="px-8 py-4 font-bold text-gray-400">Voltar</button><button onClick={() => setStep(3)} disabled={!bookingData.date || !bookingData.time} className="px-12 py-4 bg-[#D8B669] text-gray-900 font-bold rounded-2xl shadow-xl disabled:opacity-50">Continuar</button></div>
                </div>
              )}
              {step === 3 && (
                <form onSubmit={handleBookingSubmit} className="animate-in fade-in slide-in-from-right-5 space-y-6">
                  <div className="p-6 bg-[#F4F9F8] rounded-[2rem] border border-[#E5F0ED] grid grid-cols-2 gap-4 text-sm font-bold text-[#1F4C44]">
                    <div>🩺 {bookingData.doctor}</div><div>📅 {formatSafeDate(bookingData.date)} às {bookingData.time}</div><div>📍 {bookingData.city}</div>
                  </div>
                  <input type="text" required placeholder="Nome do Paciente" className="w-full px-6 py-4 rounded-2xl bg-gray-50 border border-transparent focus:border-[#3C8173] outline-none" value={bookingData.name} onChange={e => setBookingData({...bookingData, name: e.target.value})} />
                  <input type="tel" required placeholder="WhatsApp" className="w-full px-6 py-4 rounded-2xl bg-gray-50 border border-transparent focus:border-[#3C8173] outline-none" value={bookingData.phone} onChange={e => setBookingData({...bookingData, phone: e.target.value})} />
                  <textarea placeholder="Observações..." rows="3" className="w-full px-6 py-4 rounded-2xl bg-gray-50 border border-transparent focus:border-[#3C8173] outline-none resize-none" value={bookingData.obs} onChange={e => setBookingData({...bookingData, obs: e.target.value})} />
                  <div className="flex justify-between mt-12 pt-8 border-t"><button type="button" onClick={() => setStep(2)} className="px-8 py-4 font-bold text-gray-400">Voltar</button><button type="submit" className="px-12 py-4 bg-[#3C8173] text-white font-bold rounded-2xl shadow-xl hover:bg-[#c2a25c] transition-all transform hover:scale-105">Confirmar</button></div>
                </form>
              )}
            </div>
          </div>
        )}
      </main>

      {/* MODAL DE IMPORTAÇÃO */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="bg-[#1F4C44] p-8 text-white flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-serif font-bold">Importação em Massa</h2>
                <p className="text-[#82BCAE] text-[10px] uppercase mt-1 tracking-widest">Colar lista: Nome;Fone;Data;Hora;Doutor;Cidade;Status;Obs</p>
              </div>
              <button onClick={() => setShowBatchModal(false)} className="text-white/40 hover:text-white bg-white/10 p-2 rounded-xl transition-colors"><XCircle size={24}/></button>
            </div>
            <div className="p-10 space-y-6">
              <textarea 
                className="w-full h-64 px-6 py-4 rounded-2xl bg-gray-50 outline-none resize-none font-mono text-xs border border-transparent focus:border-[#3C8173]/30 transition-all" 
                placeholder="Exemplo: João Silva;912345678;2026-03-24;09:00;Dr. Willian;Guanambi;Confirmado;Primeira consulta" 
                value={batchInput} 
                onChange={e => setBatchInput(e.target.value)} 
              />
              <div className="flex justify-end gap-4">
                <button onClick={() => setShowBatchModal(false)} className="px-8 py-4 font-bold text-gray-400 hover:text-gray-600 transition-colors">Cancelar</button>
                <button 
                  onClick={handleBatchImport} 
                  disabled={importing || !batchInput.trim()} 
                  className="px-10 py-4 bg-[#3C8173] text-white font-bold rounded-2xl shadow-xl flex items-center gap-2 hover:bg-[#2D665B] transition-all disabled:opacity-50"
                >
                  {importing ? <Loader2 className="animate-spin" size={20}/> : <CheckCircle2 size={20}/>} Importar Pacientes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE EDIÇÃO */}
      {showEditModal && editData && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="bg-[#1F4C44] p-8 text-white flex justify-between items-center">
              <h2 className="text-2xl font-serif font-bold">Editar Agendamento</h2>
              <button onClick={() => setShowEditModal(false)} className="text-white/40 hover:text-white bg-white/10 p-2 rounded-xl transition-colors"><XCircle size={24}/></button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-10 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Data</label>
                    <input type="date" className="w-full p-4 bg-gray-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-[#3C8173]" value={normalizeToISO(editData.date)} onChange={e => setEditData({...editData, date: e.target.value})} />
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Horário (Em Ponto)</label>
                    <select 
                      className="w-full p-4 bg-gray-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-[#3C8173]" 
                      value={formatSafeTime(editData.time)} 
                      onChange={e => setEditData({...editData, time: e.target.value})}
                    >
                      {TIME_SLOTS.map(t => {
                        const check = checkSlotAvailability(editData.doctor, editData.date, t, editData.id);
                        return (
                          <option key={t} value={t} disabled={!check.available}>
                            {t} {!check.available ? `(${check.reason})` : ''}
                          </option>
                        );
                      })}
                    </select>
                 </div>
              </div>
              <div className="space-y-2">
                 <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Nome do Paciente</label>
                 <input type="text" className="w-full p-4 bg-gray-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-[#3C8173]" value={editData.name} onChange={e => setEditData({...editData, name: e.target.value})} />
              </div>
              <div className="space-y-2">
                 <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Observações</label>
                 <textarea rows="3" className="w-full p-4 bg-gray-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-[#3C8173] resize-none" value={editData.obs} onChange={e => setEditData({...editData, obs: e.target.value})} />
              </div>
              <div className="flex justify-end pt-4">
                 <button type="submit" className="px-10 py-4 bg-[#3C8173] text-white font-bold rounded-2xl shadow-xl hover:bg-[#2D665B] transition-all transform hover:scale-[1.02]">Guardar Alterações</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}