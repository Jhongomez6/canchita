"use client";

import { useAuth } from "@/lib/AuthContext";
import { createMatch } from "@/lib/matches";
import AuthGuard from "@/components/AuthGuard";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getUserProfile } from "@/lib/users";
import { getActiveLocations } from "@/lib/locations";
import { Timestamp } from "firebase/firestore";
import type { UserProfile } from "@/lib/domain/user";
import type { Location } from "@/lib/domain/location";
import { toast } from "react-hot-toast";
import { handleError } from "@/lib/utils/error";

export default function NewMatchPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  const [date, setDate] = useState("");
  const [timeHour, setTimeHour] = useState("08");
  const [timeMinute, setTimeMinute] = useState("00");
  const [timePeriod, setTimePeriod] = useState("PM");
  const [maxPlayers, setMaxPlayers] = useState(14);
  const [isPrivate, setIsPrivate] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState("");

  useEffect(() => {
    getActiveLocations().then(setLocations);
  }, []);

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

    try {
      // Ensure maxPlayers is always even
      const finalMaxPlayers = maxPlayers % 2 !== 0 ? maxPlayers + 1 : maxPlayers;

      await createMatch({
        date,
        time: finalTime24,
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
      });

      toast.success("¡Partido creado exitosamente!");
      router.push("/");
    } catch (e: unknown) {
      handleError(e, "Error al crear el partido");
      setSubmitting(false);
    }
  }

  if (loading) {
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
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
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
              ➕ <span className="text-emerald-50">Nuevo Partido</span>
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
                    <span className="bg-emerald-100 text-[#1f7a4f] p-1.5 rounded-lg text-sm">🗓️</span>
                    Cuándo
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Fecha</label>
                      <input
                        type="date"
                        value={date}
                        onChange={e => setDate(e.target.value)}
                        required
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 outline-none focus:ring-2 focus:ring-[#1f7a4f] transition-all"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Hora (12h)</label>
                      <div className="flex items-center gap-2">
                        <select
                          value={timeHour}
                          onChange={e => setTimeHour(e.target.value)}
                          className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 outline-none focus:ring-2 focus:ring-[#1f7a4f] text-center font-medium"
                        >
                          {Array.from({ length: 12 }, (_, i) => {
                            const hr = (i + 1).toString().padStart(2, "0");
                            return <option key={hr} value={hr}>{hr}</option>;
                          })}
                        </select>
                        <span className="text-slate-400 font-bold">:</span>
                        <select
                          value={timeMinute}
                          onChange={e => setTimeMinute(e.target.value)}
                          className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 outline-none focus:ring-2 focus:ring-[#1f7a4f] text-center font-medium"
                        >
                          <option value="00">00</option>
                          <option value="15">15</option>
                          <option value="30">30</option>
                          <option value="45">45</option>
                        </select>
                        <select
                          value={timePeriod}
                          onChange={e => setTimePeriod(e.target.value)}
                          className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 outline-none focus:ring-2 focus:ring-[#1f7a4f] text-center font-bold"
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* CARD: UBICACIÓN */}
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <span className="bg-emerald-100 text-[#1f7a4f] p-1.5 rounded-lg text-sm">📍</span>
                    Dónde
                  </h3>
                  <select
                    value={locationId}
                    onChange={e => setLocationId(e.target.value)}
                    required
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 outline-none focus:ring-2 focus:ring-[#1f7a4f] transition-all mb-3"
                  >
                    <option value="">Selecciona una cancha...</option>
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                  <a
                    href="/locations/new"
                    className="inline-flex items-center gap-1.5 text-sm font-bold text-[#1f7a4f] hover:text-[#145c3a] transition-colors"
                  >
                    ➕ Añadir nueva cancha
                  </a>
                </div>

                {/* CARD: DETALLES EXTRA */}
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <span className="bg-emerald-100 text-[#1f7a4f] p-1.5 rounded-lg text-sm">⚙️</span>
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
                  </div>

                  {/* PRIVATE TOGGLE */}
                  <label className="flex items-start gap-3 cursor-pointer p-3 bg-slate-50 rounded-xl border border-slate-200 hover:bg-slate-100 transition-colors">
                    <div className="relative inline-flex items-center cursor-pointer mt-0.5">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={isPrivate}
                        onChange={e => setIsPrivate(e.target.checked)}
                      />
                      <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1f7a4f]"></div>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                        Partido Privado
                        {isPrivate ? <span className="text-xs">🔒</span> : <span className="text-xs">🌍</span>}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">
                        {isPrivate
                          ? "Oculto de la sección Explorar. Solo quienes tengan el link podrán unirse."
                          : "Público en la sección Explorar. Cualquier usuario de la app puede verlo."}
                      </p>
                    </div>
                  </label>
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
                  {submitting ? "⏳ Creando partido..." : "Crear Partido"}
                </button>
              </form>
            )}
          </div>
        </div>
      </main>
    </AuthGuard>
  );
}
