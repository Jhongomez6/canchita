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


export default function NewMatchPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(12);

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState("");



  useEffect(() => {
    if (!user) return;

    getUserProfile(user.uid).then(profile => {
      setUserProfile(profile);
      setLoading(false);
    });
  }, [user]);

  useEffect(() => {
    getActiveLocations().then(setLocations);
  }, []);


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const selectedLocation = locations.find(l => l.id === locationId);
    if (!selectedLocation) return;

    const startsAt = Timestamp.fromDate(
      new Date(`${date}T${time}:00`)
    );

    if (!date || !time || !locationId) {
      alert("Completa todos los campos");
      return;
    }

    await createMatch({
      date,
      time,
      startsAt,
      locationId,
      locationSnapshot: {
        name: selectedLocation.name,
        address: selectedLocation.address,
        lat: selectedLocation.lat,
        lng: selectedLocation.lng,
      },
      createdBy: user.uid,
      maxPlayers, // 👈 nuevo campo
    });

    router.push("/");
  }

  if (loading) {
    return (
      <AuthGuard>
        <p style={{ padding: 20 }}>Cargando...</p>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <main style={{ padding: 20, maxWidth: 480, margin: "0 auto" }}>
        <h2 style={{ marginBottom: 16 }}>➕ Nuevo partido</h2>

        {!userProfile?.roles.includes("admin") && (
          <p style={{ color: "#dc2626" }}>
            No tienes permisos para crear partidos.
          </p>
        )}

        {userProfile?.roles.includes("admin") && (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 12 }}>
              <label>Fecha</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                required
                style={{ width: "100%", padding: 8 }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label>Hora</label>
              <input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                required
                style={{ width: "100%", padding: 8 }}
              />
            </div>

            <select
              value={locationId}
              onChange={e => setLocationId(e.target.value)}
              style={{
                width: "100%",
                padding: 14,
                borderRadius: 12,
                border: "1px solid #ccc",
                marginBottom: 8,
              }}
            >
              <option value="">Selecciona una cancha</option>

              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>

            <a
              href="/locations/new"
              style={{
                fontSize: 14,
                color: "#1f7a4f",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              + Crear nueva cancha
            </a>

            <div style={{ marginBottom: 20 }}>
              <label>Máximo de jugadores</label>
              <input
                type="number"
                min={2}
                max={30}
                value={maxPlayers}
                onChange={e => setMaxPlayers(Number(e.target.value))}
                style={{ width: "100%", padding: 8 }}
              />
              <p style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                Este valor se podrá modificar luego si es necesario.
              </p>
            </div>

            <button
              type="submit"
              style={{
                width: "100%",
                padding: "12px",
                background: "#16a34a",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 16,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Crear partido
            </button>
          </form>
        )}
      </main>
    </AuthGuard>
  );
}
