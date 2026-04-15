"use client";

import { useAuth } from "@/lib/AuthContext";
import { createMatch } from "@/lib/matches";
import AuthGuard from "@/components/AuthGuard";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAdminLocations } from "@/lib/locations";
import { canCreatePublicMatch, isSuperAdmin, isLocationAdmin, canUseDeposit } from "@/lib/domain/user";
import { DEFAULT_DEPOSIT_COP, VALID_DEPOSITS_COP, formatCOP } from "@/lib/domain/wallet";
import { Timestamp } from "firebase/firestore";
import type { Location } from "@/lib/domain/location";
import type { MatchDuration } from "@/lib/domain/match";
import { toast } from "react-hot-toast";
import { handleError } from "@/lib/utils/error";
import {
  Plus,
  Calendar,
  MapPin,
  Settings2,
  Lock,
  Globe,
  ClipboardList,
  XCircle,
  CheckCircle2,
  Banknote,
  ChevronDown,
  Clock,
} from "lucide-react";

export default function NewMatchPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [date, setDate] = useState("");
  const [timeHour, setTimeHour] = useState("08");
  const [timeMinute, setTimeMinute] = useState("00");
  const [timePeriod, setTimePeriod] = useState("PM");
  const [duration, setDuration] = useState<MatchDuration>(60);
  const [maxPlayers, setMaxPlayers] = useState(14);
  const [isPrivate, setIsPrivate] = useState(false);
  const [allowGuests, setAllowGuests] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [requireDeposit, setRequireDeposit] = useState(false);
  const [depositAmount, setDepositAmount] = useState(DEFAULT_DEPOSIT_COP);

  const [submitting, setSubmitting] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState("");
  const [locationSearch, setLocationSearch] = useState("");
  const [locationOpen, setLocationOpen] = useState(false);

  useEffect(() => {
    if (authLoading || !profile) return;
    getAdminLocations(profile).then(setLocations);
  }, [profile, authLoading]);

  // Forzar privacidad automáticamente si no puede crear partidos públicos
  useEffect(() => {
    if (authLoading || !profile) return;
    if (!canCreatePublicMatch(profile)) {
      // Usamos un timeout ligero para evitar el warning de React por setState recursivo
      setTimeout(() => setIsPrivate(true), 0);
    }
    // Default depósito ON para location_admin
    if (isLocationAdmin(profile)) {
      setTimeout(() => setRequireDeposit(true), 0);
    }
  }, [profile, authLoading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const selectedLocation = locations.find(l => l.id === locationId);
    if (!selectedLocation) return;

    setSubmitting(true);

    const hrStr = parseInt(timeHour, 10);
    let hr24 = hrStr;
    if (timePeriod === "PM" && hrStr < 12) hr24 += 12;
    if (timePeriod === "AM" && hrStr === 12) hr24 = 0;
    const finalTime24 = `${hr24.toString().padStart(2, "0")}:${timeMinute}`;

    const startsAt = Timestamp.fromDate(
      new Date(`${date}T${finalTime24}:00`)
    );

    if (!date || !locationId) {
      toast.error("Por favor completa todos los campos del partido");
      setSubmitting(false);
      return;
    }

    if (startsAt.toDate() < new Date()) {
      toast.error("No puedes crear un partido en una fecha pasada");
      setSubmitting(false);
      return;
    }

    try {
      // Ensure maxPlayers is always even
      const finalMaxPlayers = maxPlayers % 2 !== 0 ? maxPlayers + 1 : maxPlayers;

      await createMatch({
        date,
        time: finalTime24,
        duration,
        startsAt,
        locationId,
        locationSnapshot: {
          name: selectedLocation.name,
          address: selectedLocation.address,
          lat: selectedLocation.lat,
          lng: selectedLocation.lng,
        },
        createdBy: user.uid,
        maxPlayers: finalMaxPlayers,
        isPrivate,
        allowGuests,
        ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
        ...(requireDeposit && profile && canUseDeposit(profile) ? { deposit: depositAmount } : {}),
      });

      toast.success("¡Partido creado exitosamente!");
      router.push("/");
    } catch (e: unknown) {
      handleError(e, "Error al crear el partido");
      setSubmitting(false);
    }
  }

  if (authLoading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-[#1f7a4f] rounded-full animate-spin"></div>
        </div>
      </AuthGuard>
    );
  }

  if (profile && !profile.roles.includes("admin")) {
    return (
      <AuthGuard>
        <div className="min-h-[60vh] flex flex-col items-center justify-center p-5 text-center">
          <div className="bg-red-50 text-red-600 w-16 h-16 rounded-full flex items-center justify-center mb-4 mx-auto">
            <XCircle className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">Acceso Denegado</h3>
          <p className="text-slate-600 mb-6">
            No tienes los permisos necesarios para crear partidos.
            Contacta a un administrador si crees que esto es un error.
          </p>
          <button
            onClick={() => router.push("/")}
            className="bg-[#1f7a4f] text-white px-6 py-3 rounded-xl font-bold shadow-md hover:bg-[#145c3a] transition-colors"
          >
            Volver al Inicio
          </button>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <main className="min-h-screen bg-slate-50 pb-24">
        <div className="max-w-md mx-auto">
          {/* HEADER VERDE */}
          <div className="bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] text-white p-6 pb-8 rounded-b-3xl shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
            <h2 className="text-2xl font-bold relative z-10 flex items-center gap-2">
              <Plus className="w-6 h-6" />
              <span className="text-emerald-50">Nuevo Partido</span>
            </h2>
            <p className="relative z-10 text-emerald-100 text-sm mt-1">
              Configura los detalles de tu próximo encuentro.
            </p>
          </div>

          <div className="px-4 -mt-4 relative z-20 space-y-4">
            {!profile?.roles.includes("admin") ? (
              <div className="bg-red-50 text-red-600 p-5 rounded-2xl border border-red-100 shadow-sm text-center font-medium">
                No tienes permisos para crear partidos.
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">

                {/* CARD: FECHA Y HORA */}
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <span className="bg-emerald-100 text-[#1f7a4f] p-1.5 rounded-lg"><Calendar className="w-4 h-4" /></span>
                    Cuándo
                  </h3>
                  <div className="space-y-5">
                    {/* FECHA */}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Fecha</label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        <input
                          type="date"
                          value={date}
                          onChange={e => setDate(e.target.value)}
                          required
                          min={new Date().toISOString().split("T")[0]}
                          className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 outline-none focus:ring-2 focus:ring-[#1f7a4f] focus:border-transparent transition-all"
                        />
                      </div>
                    </div>

                    {/* HORA */}
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        <Clock className="w-3.5 h-3.5" /> Hora
                      </label>
                      {/* Hora + AM/PM */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className="relative flex-1">
                          <select
                            value={timeHour}
                            onChange={e => setTimeHour(e.target.value)}
                            className="w-full appearance-none pl-4 pr-8 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-bold text-center outline-none focus:ring-2 focus:ring-[#1f7a4f] focus:border-transparent transition-all"
                          >
                            {Array.from({ length: 12 }, (_, i) => {
                              const hr = (i + 1).toString().padStart(2, "0");
                              return <option key={hr} value={hr}>{hr}</option>;
                            })}
                          </select>
                          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                        <span className="text-slate-300 font-bold text-xl">:</span>
                        {/* Minutos como chips */}
                        <div className="flex gap-1.5">
                          {["00", "15", "30", "45"].map(m => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setTimeMinute(m)}
                              className={`px-3 py-3 rounded-xl text-sm font-bold transition-all ${
                                timeMinute === m
                                  ? "bg-[#1f7a4f] text-white shadow-md shadow-emerald-200"
                                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                              }`}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* AM / PM segmented */}
                      <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
                        {["AM", "PM"].map(p => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setTimePeriod(p)}
                            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
                              timePeriod === p
                                ? "bg-[#1f7a4f] text-white shadow-md shadow-emerald-200"
                                : "text-slate-500 hover:text-slate-700"
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* DURACIÓN */}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Duración</label>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          [30, "30 min"],
                          [60, "1 h"],
                          [90, "1 h 30"],
                          [120, "2 h"],
                          [150, "2 h 30"],
                          [180, "3 h"],
                        ] as [MatchDuration, string][]).map(([val, label]) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setDuration(val)}
                            className={`py-2.5 rounded-xl text-sm font-bold transition-all ${
                              duration === val
                                ? "bg-[#1f7a4f] text-white shadow-md shadow-emerald-200"
                                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* CARD: UBICACIÓN */}
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <span className="bg-emerald-100 text-[#1f7a4f] p-1.5 rounded-lg"><MapPin className="w-4 h-4" /></span>
                    Dónde
                  </h3>
                  {/* Campo oculto para validación nativa del form */}
                  <input type="hidden" name="locationId" value={locationId} required />
                  <div className="relative mb-3">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none z-10" />
                    <input
                      type="text"
                      placeholder="Buscar cancha..."
                      value={locationSearch}
                      onFocus={() => setLocationOpen(true)}
                      onBlur={() => setTimeout(() => setLocationOpen(false), 150)}
                      onChange={e => {
                        setLocationSearch(e.target.value);
                        setLocationId("");
                        setLocationOpen(true);
                      }}
                      className="w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base text-slate-700 outline-none focus:ring-2 focus:ring-[#1f7a4f] focus:border-transparent transition-all"
                    />
                    <ChevronDown className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none transition-transform ${locationOpen ? "rotate-180" : ""}`} />
                    {locationOpen && (
                      <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                        {locations
                          .filter(l => l.name.toLowerCase().includes(locationSearch.toLowerCase()))
                          .map(loc => {
                            const formatted = loc.name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
                            return (
                              <button
                                key={loc.id}
                                type="button"
                                onMouseDown={() => {
                                  setLocationId(loc.id);
                                  setLocationSearch(formatted);
                                  setLocationOpen(false);
                                }}
                                className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                                  locationId === loc.id
                                    ? "bg-emerald-50 text-[#1f7a4f] font-bold"
                                    : "text-slate-700 hover:bg-slate-50"
                                }`}
                              >
                                {formatted}
                              </button>
                            );
                          })}
                        {locations.filter(l => l.name.toLowerCase().includes(locationSearch.toLowerCase())).length === 0 && (
                          <p className="px-4 py-3 text-sm text-slate-400">Sin resultados</p>
                        )}
                      </div>
                    )}
                  </div>
                  {profile && isSuperAdmin(profile) && (
                    <button
                      type="button"
                      onClick={() => router.push("/locations/new")}
                      className="inline-flex items-center gap-1.5 text-sm font-bold text-[#1f7a4f] hover:text-[#145c3a] transition-colors"
                    >
                      <Plus className="w-4 h-4" /> Añadir nueva cancha
                    </button>
                  )}
                </div>

                {/* CARD: DETALLES EXTRA */}
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <span className="bg-emerald-100 text-[#1f7a4f] p-1.5 rounded-lg"><Settings2 className="w-4 h-4" /></span>
                    Configuración
                  </h3>

                  <div className="mb-5">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Jugadores Máximos
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={10}
                        max={22}
                        step={2}
                        value={maxPlayers}
                        onChange={e => setMaxPlayers(Number(e.target.value))}
                        className="w-full accent-[#1f7a4f]"
                      />
                      <div className="bg-slate-100 px-3 py-1.5 rounded-lg font-bold text-slate-800 tabular-nums">
                        {maxPlayers}
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Número total de jugadores. Ej: 14 para Fútbol 7.
                    </p>
                    <div className="space-y-4">
                      {/* PRIVATE TOGGLE */}
                      <label className={`flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 transition-colors ${!profile || canCreatePublicMatch(profile) ? 'cursor-pointer hover:bg-slate-100' : 'opacity-70 cursor-not-allowed'}`}>
                        <div className="relative inline-flex items-center mt-0.5">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={isPrivate}
                            disabled={profile ? !canCreatePublicMatch(profile) : false}
                            onChange={e => setIsPrivate(e.target.checked)}
                          />
                          <div className={`w-11 h-6 bg-slate-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1f7a4f] ${profile && !canCreatePublicMatch(profile) ? '' : 'peer-focus:outline-none'}`}></div>
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                            Partido Privado
                            {isPrivate ? <Lock className="w-3.5 h-3.5 text-slate-500" /> : <Globe className="w-3.5 h-3.5 text-slate-500" />}
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">
                            {isPrivate
                              ? "Oculto de la sección Explorar. Solo quienes tengan el link podrán unirse."
                              : "Público en la sección Explorar. Cualquier usuario de la app puede verlo."}
                            {profile && !canCreatePublicMatch(profile) && " (Tu rol solo permite crear partidos privados)"}
                          </p>
                        </div>
                      </label>

                      {/* PERMITIR INVITADOS TOGGLE */}
                      <label className="flex items-start gap-3 cursor-pointer p-3 bg-slate-50 rounded-xl border border-slate-200 hover:bg-slate-100 transition-colors">
                        <div className="relative inline-flex items-center cursor-pointer mt-0.5">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={allowGuests}
                            onChange={e => setAllowGuests(e.target.checked)}
                          />
                          <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1f7a4f]"></div>
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                            Permitir Invitados
                            {allowGuests ? <CheckCircle2 className="w-3.5 h-3.5 text-[#1f7a4f]" /> : <XCircle className="w-3.5 h-3.5 text-slate-400" />}
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">
                            {allowGuests
                              ? "Los jugadores podrán llevar hasta 2 invitados sin cuenta."
                              : "Solo usuarios con cuenta en La Canchita podrán asistir (cero invitados)."}
                          </p>
                        </div>
                      </label>
                      {/* DEPÓSITO TOGGLE — solo super_admin y location_admin */}
                      {profile && canUseDeposit(profile) && (
                      <label className="flex items-start gap-3 cursor-pointer p-3 bg-slate-50 rounded-xl border border-slate-200 hover:bg-slate-100 transition-colors">
                        <div className="relative inline-flex items-center cursor-pointer mt-0.5">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={requireDeposit}
                            onChange={e => setRequireDeposit(e.target.checked)}
                          />
                          <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1f7a4f]"></div>
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                            Requerir Depósito
                            <Banknote className="w-3.5 h-3.5 text-slate-500" />
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">
                            {requireDeposit
                              ? "Los jugadores necesitan saldo en su billetera para inscribirse."
                              : "Sin depósito — los jugadores se inscriben gratis."}
                          </p>
                        </div>
                      </label>
                      )}

                      {/* MONTO DEL DEPÓSITO */}
                      {profile && canUseDeposit(profile) && requireDeposit && (
                        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 space-y-2">
                          <p className="text-xs font-bold text-slate-600">Monto del depósito</p>
                          <div className="flex gap-3">
                            {VALID_DEPOSITS_COP.map((amount) => (
                              <label
                                key={amount}
                                className={`flex-1 text-center cursor-pointer p-3 rounded-xl border-2 font-bold transition-all ${
                                  depositAmount === amount
                                    ? "border-[#1f7a4f] bg-white text-[#1f7a4f] shadow-sm"
                                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name="deposit"
                                  className="sr-only"
                                  checked={depositAmount === amount}
                                  onChange={() => setDepositAmount(amount)}
                                />
                                <span className="text-base">{formatCOP(amount)}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* CARD: INSTRUCCIONES */}
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-slate-800 mb-1 flex items-center gap-2">
                    <span className="bg-emerald-100 text-[#1f7a4f] p-1.5 rounded-lg"><ClipboardList className="w-4 h-4" /></span>
                    Instrucciones para jugadores
                    <span className="text-xs font-normal text-slate-400">(opcional)</span>
                  </h3>
                  <p className="text-[10px] text-slate-400 mb-3">
                    Visible para todos en la página del partido. Pago, puntualidad u otras condiciones.
                  </p>
                  <div className="relative">
                    <textarea
                      value={instructions}
                      maxLength={500}
                      rows={3}
                      placeholder="Ej: Pago $5000 en efectivo al llegar. Lleguen 10 minutos antes."
                      className="w-full px-3 py-2.5 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-[#1f7a4f] focus:border-transparent"
                      onChange={(e) => setInstructions(e.target.value)}
                    />
                    <span className={`absolute bottom-2 right-3 text-[10px] ${instructions.length >= 500 ? "text-red-500" : "text-slate-400"}`}>
                      {instructions.length}/500
                    </span>
                  </div>
                </div>

                {/* BOTÓN CREAR */}
                <button
                  type="submit"
                  disabled={submitting}
                  className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all active:scale-[0.98] ${submitting
                    ? "bg-slate-300 text-slate-500 cursor-not-allowed shadow-none"
                    : "bg-[#1f7a4f] text-white hover:bg-[#16603c] hover:shadow-xl"
                    }`}
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Creando partido...
                    </span>
                  ) : "Crear Partido"}
                </button>
              </form>
            )}
          </div>
        </div>
      </main>
    </AuthGuard>
  );
}
