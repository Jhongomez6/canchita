"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { loginWithGoogle } from "@/lib/auth";
import { formatDateSpanish, formatTime12h } from "@/lib/date";
import { googleMapsEmbedUrl, googleMapsLink } from "@/lib/maps";


import {
  joinMatch,
  confirmAttendance,
  unconfirmAttendance,
} from "@/lib/matches";

export default function JoinMatchPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();

  const [match, setMatch] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [location, setLocation] = useState<any>(null);



  async function loadMatch() {
    try {
      const ref = doc(db, "matches", id);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        setError("El partido no existe");
        return;
      }

      setMatch({ id: snap.id, ...snap.data() });
    } catch (e) {
      console.error(e);
      setError("No se pudo cargar el partido");
    }
  }

  // Cargar partido cuando auth esté listo
  useEffect(() => {
    if (!loading && user) {
      loadMatch();
    }
  }, [loading, user]);

  useEffect(() => {
    if (!match?.locationId) return;

    getDoc(doc(db, "locations", match.locationId))
      .then(snap => {
        if (snap.exists()) {
          setLocation({ id: snap.id, ...snap.data() });
        }
      });
  }, [match]);


  // ⏳ Auth cargando
  if (loading) {
    return <p style={{ padding: 20 }}>Cargando sesión...</p>;
  }

  // 🔐 No logueado
  if (!user) {
    return (
      <main style={{ padding: 20 }}>
        <h2>Únete al partido</h2>
        <p>Debes iniciar sesión para continuar</p>
        <button onClick={loginWithGoogle}>
          Iniciar sesión con Google
        </button>
      </main>
    );
  }

  // ❌ Error real
  if (error) {
    return (
      <main style={{ padding: 20 }}>
        <p>{error}</p>
      </main>
    );
  }

  // ⏳ Partido cargando
  if (!match) {
    return <p style={{ padding: 20 }}>Cargando partido...</p>;
  }

  const playerName = user.displayName || user.email || "Jugador";
  const isClosed = match.status === "closed";
  const confirmedCount = match.players.filter((p: any) => p.confirmed).length;
  const isFull = confirmedCount >= (match.maxPlayers ?? Infinity);


  const existingPlayer = match.players?.find(
    (p: any) => p.uid === user.uid || p.name === playerName
  );

  const cardStyle = {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  };

  const maxPlayers = match.maxPlayers ?? 0;
  const sidePlayers =
    maxPlayers && maxPlayers % 2 === 0 ? maxPlayers / 2 : null;

  const matchLabel = sidePlayers
    ? `Partido ${sidePlayers} vs ${sidePlayers}`
    : "Partido";


  const card = {
    background: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f2f5f3",
        paddingBottom: 24,
      }}
    >
      <div style={{ maxWidth: 420, margin: "0 auto" }}>
        {/* HEADER VERDE */}
        <div
          style={{
            background: "linear-gradient(180deg, #1f7a4f, #145c3a)",
            color: "#fff",
            padding: "20px 16px",
            borderBottomLeftRadius: 20,
            borderBottomRightRadius: 20,
            marginBottom: 16,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 20 }}>⚽ La Canchita</h2>
          <p style={{ marginTop: 4, fontSize: 14, opacity: 0.9 }}>
            Detalles del partido
          </p>
        </div>

        {/* CARD PARTIDO */}
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: 16,
            margin: "0 12px 16px",
            boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
          }}
        >
          <h3 style={{ marginBottom: 4, fontWeight: 700 }}>
            {matchLabel}
          </h3>

          <p style={{ fontSize: 14, color: "#555" }}>
            📍 {match.location}
          </p>

          <p style={{ fontSize: 14, color: "#555" }}>
            🕒 {formatDateSpanish(match.date)}
          </p>

          <p style={{ fontSize: 14, color: "#555" }}>
            ⏰ {formatTime12h(match.time)}
          </p>

          <div style={{ marginTop: 8 }}>
            <span
              style={{
                display: "inline-block",
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                background: isClosed ? "#dc2626" : "#16a34a",
                color: "#fff",
              }}
            >
              {isClosed ? "Partido cerrado" : "Partido abierto"}
            </span>
          </div>
        </div>

        {location && (
          <div style={card}>
            <h3>📍 Cancha</h3>

            <p style={{ fontWeight: 600 }}>{location.name}</p>
            <p style={{ fontSize: 14, color: "#555" }}>
              {location.address}
            </p>

            {/* MAPA */}
            <iframe
              src={googleMapsEmbedUrl(location.lat, location.lng)}
              width="100%"
              height="220"
              style={{
                border: 0,
                borderRadius: 12,
                marginTop: 12,
              }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />

            {/* CTA */}
            <a
              href={googleMapsLink(location.lat, location.lng)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block",
                marginTop: 12,
                padding: "12px",
                background: "#2563eb",
                color: "#fff",
                textAlign: "center",
                borderRadius: 12,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              🗺️ Abrir en Google Maps
            </a>
          </div>
        )}


        {/* CARD ASISTENCIA */}
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: 16,
            margin: "0 12px 16px",
            boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
          }}
        >
          <h3 style={{ marginBottom: 12 }}>Tu asistencia</h3>

          {isClosed && (
            <p style={{ color: "#dc2626", fontSize: 14 }}>
              🔒 El partido ya está cerrado
            </p>
          )}
          {isFull && (
            <p style={{ color: "#dc2626", fontWeight: 600 }}>
              ❌ El partido ya está completo
            </p>
          )}


          {!isClosed && !existingPlayer && (
            <button
              disabled={submitting || isFull}
              onClick={async () => {
                setSubmitting(true);
                try {
                  await joinMatch(id, {
                    uid: user.uid,
                    name: playerName,
                  });
                  await loadMatch();
                } catch (e: any) {
                  if (e.message === "MATCH_FULL") {
                    alert("El partido se llenó justo ahora 😬");
                  }
                } finally {
                  setSubmitting(false);
                }
              }}
              style={{
                width: "100%",
                padding: "14px",
                background: submitting || isFull ? "#9ca3af" : "#1f7a4f",
                color: "#fff",
                borderRadius: 12,
                border: "none",
                fontSize: 16,
                fontWeight: 600,
                cursor: submitting || isFull ? "not-allowed" : "pointer",
              }}
            >
              {submitting ? "⏳ Confirmando..." : "✅ Confirmar asistencia"}
            </button>
          )}


          {!isClosed && existingPlayer?.confirmed && (
            <>
              <div
                style={{
                  marginTop: 8,
                  padding: 12,
                  borderRadius: 8,
                  background: "#dcfce7",
                  color: "#166534",
                  fontWeight: 600,
                }}
              >
                ✅ Estás confirmado para este partido
              </div>


              <button
                onClick={async () => {
                  await unconfirmAttendance(id, playerName);
                  await loadMatch();
                }}
                style={{
                  marginTop: 12,
                  width: "100%",
                  padding: 12,
                  background: "#dc2626",
                  color: "#fff",
                  borderRadius: 12,
                  border: "none",
                  fontSize: 14,
                }}
              >
                No puedo ir
              </button>
            </>
          )}

          {!isClosed && existingPlayer && !existingPlayer.confirmed && (
            <>
              {/* ESTADO PENDIENTE */}
              <div
                style={{
                  marginBottom: 12,
                  padding: 12,
                  borderRadius: 10,
                  background: "#fef3c7",
                  color: "#92400e",
                  fontWeight: 600,
                  textAlign: "center",
                }}
              >
                ⏳ Aún no has confirmado tu asistencia
              </div>

              {/* BOTÓN CONFIRMAR */}
              <button
                disabled={submitting || isFull}
                onClick={async () => {
                  setSubmitting(true);
                  try {
                    await confirmAttendance(id, playerName);
                    await loadMatch();
                  } catch (e: any) {
                    if (e.message === "MATCH_FULL") {
                      alert("El partido se llenó justo ahora 😬");
                    }
                  } finally {
                    setSubmitting(false);
                  }
                }}
                style={{
                  width: "100%",
                  padding: "14px",
                  background: submitting || isFull ? "#9ca3af" : "#1f7a4f",
                  color: "#fff",
                  borderRadius: 12,
                  border: "none",
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: submitting || isFull ? "not-allowed" : "pointer",
                }}
              >
                {submitting ? "⏳ Confirmando..." : "✅ Confirmar asistencia"}
              </button>
            </>
          )}
        </div>

        {/* CONFIRMADOS */}
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: 16,
            margin: "0 12px",
            boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
          }}
        >
          <h3 style={{ marginBottom: 12 }}>Jugadores confirmados</h3>

          {match.players?.filter((p: any) => p.confirmed).length === 0 && (
            <p style={{ fontSize: 14, color: "#777" }}>
              Aún no hay jugadores confirmados
            </p>
          )}

          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {match.players
              ?.filter((p: any) => p.confirmed)
              .map((p: any, i: number) => (
                <li
                  key={i}
                  style={{
                    padding: "6px 0",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span>🟢</span>
                  <span>{p.name}</span>
                </li>

              ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
