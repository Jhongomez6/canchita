"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { loginWithGoogle } from "@/lib/auth";
import { formatDateSpanish, formatTime12h } from "@/lib/date";
import { googleMapsEmbedUrl, googleMapsLink, wazeLink } from "@/lib/maps";
import Image from "next/image";
import { getUserProfile } from "@/lib/users";


import {
  joinMatch,
  confirmAttendance,
  unconfirmAttendance,
} from "@/lib/matches";

export default function JoinMatchPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();

  const [match, setMatch] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [location, setLocation] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);



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

  // Cargar perfil del usuario
  useEffect(() => {
    if (!user) {
      setLoadingProfile(false);
      return;
    }

    getUserProfile(user.uid)
      .then(p => {
        setProfile(p || { role: "player", positions: [] });
        setLoadingProfile(false);
      })
      .catch(err => {
        console.error("Error cargando perfil:", err);
        setProfile({ role: "player", positions: [] });
        setLoadingProfile(false);
      });
  }, [user]);

  // Redirigir a /profile si el perfil está incompleto
  useEffect(() => {
    if (
      profile &&
      profile.role === "player" &&
      (!profile.positions || profile.positions.length === 0)
    ) {
      // Guardar el ID del partido para volver después
      if (typeof window !== "undefined") {
        localStorage.setItem("returnToMatch", id);
      }
      router.replace("/profile");
    }
  }, [profile, router, id]);

  // Cargar partido cuando auth y perfil estén listos
  useEffect(() => {
    if (!loading && user && profile && profile.positions?.length > 0) {
      loadMatch();
    }
  }, [loading, user, profile]);

  useEffect(() => {
    if (!match?.locationId) return;

    getDoc(doc(db, "locations", match.locationId))
      .then(snap => {
        if (snap.exists()) {
          setLocation({ id: snap.id, ...snap.data() });
        }
      });
  }, [match]);


  // ⏳ Auth o perfil cargando
  if (loading || loadingProfile) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(135deg, #1f7a4f 0%, #145c3a 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 24,
            padding: "48px 40px",
            maxWidth: 440,
            width: "100%",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            textAlign: "center",
          }}
        >
          <div style={{ marginBottom: 24 }}>
            <Image
              src="/logo/lacanchita-logo.png"
              alt="La Canchita"
              width={120}
              height={100}
              style={{ margin: "0 auto" }}
            />
          </div>
          <p style={{ fontSize: 18, color: "#666" }}>Cargando...</p>
        </div>
      </div>
    );
  }

  // 🔐 No logueado
  if (!user) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(135deg, #1f7a4f 0%, #145c3a 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 24,
            padding: "48px 40px",
            maxWidth: 440,
            width: "100%",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            textAlign: "center",
          }}
        >
          {/* LOGO */}
          <div style={{ marginBottom: 24 }}>
            <Image
              src="/logo/lacanchita-logo.png"
              alt="La Canchita"
              width={120}
              height={100}
              style={{ margin: "0 auto" }}
            />
          </div>

          {/* TÍTULO */}
          <h1
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: "#1f7a4f",
              marginBottom: 12,
            }}
          >
            Únete al partido
          </h1>

          {/* DESCRIPCIÓN */}
          <p
            style={{
              fontSize: 16,
              color: "#666",
              marginBottom: 32,
              lineHeight: 1.6,
            }}
          >
            Inicia sesión para confirmar tu asistencia al partido.
          </p>

          {/* BOTÓN GOOGLE */}
          <button
            onClick={loginWithGoogle}
            style={{
              width: "100%",
              background: "#fff",
              border: "2px solid #ddd",
              borderRadius: 12,
              padding: "14px 24px",
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              transition: "all 0.2s ease",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "#f8f9fa";
              e.currentTarget.style.borderColor = "#1f7a4f";
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "#fff";
              e.currentTarget.style.borderColor = "#ddd";
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)";
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continuar con Google
          </button>

          {/* FOOTER */}
          <p
            style={{
              fontSize: 13,
              color: "#999",
              marginTop: 24,
              lineHeight: 1.5,
            }}
          >
            Al continuar, aceptas nuestros términos de servicio y política de
            privacidad.
          </p>
        </div>
      </div>
    );
  }

  // 🚨 PERFIL INCOMPLETO → Mostrar pantalla de redirección
  if (
    profile &&
    profile.role === "player" &&
    (!profile.positions || profile.positions.length === 0)
  ) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(135deg, #1f7a4f 0%, #145c3a 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 24,
            padding: "48px 40px",
            maxWidth: 440,
            width: "100%",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            textAlign: "center",
          }}
        >
          <div style={{ marginBottom: 24 }}>
            <Image
              src="/logo/lacanchita-logo.png"
              alt="La Canchita"
              width={120}
              height={100}
              style={{ margin: "0 auto" }}
            />
          </div>
          <p style={{ fontSize: 18, color: "#666" }}>Redirigiendo a tu perfil...</p>
        </div>
      </div>
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
    margin: "0 12px 16px",
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
            📍 {location?.name || match.locationSnapshot?.name || "Cancha no disponible"}
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

        {!isClosed && location && (
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
            <div
              style={{
                display: "flex",
                gap: 12,
                marginTop: 16,
              }}
            >
              {/* GOOGLE MAPS */}
              <a
                href={googleMapsLink(location.lat, location.lng)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  padding: 14,
                  background: "#ffffff",
                  color: "#111",
                  borderRadius: 16,
                  border: "1px solid #e5e7eb",
                  textDecoration: "none",
                  fontWeight: 600,
                  boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
                  transition: "all 0.2s ease",
                }}
              >
                <img
                  src="/icons/google-maps.svg"
                  alt="Google Maps"
                  style={{ width: 22, height: 22 }}
                />
                <span>Abrir en Maps</span>
              </a>

              {/* WAZE */}
              <a
                href={wazeLink(location.lat, location.lng)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  padding: 14,
                  background: "#ffffff",
                  color: "#111",
                  borderRadius: 16,
                  border: "1px solid #e5e7eb",
                  textDecoration: "none",
                  fontWeight: 600,
                  boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
                  transition: "all 0.2s ease",
                }}
              >
                <img
                  src="/icons/waze.svg"
                  alt="Waze"
                  style={{ width: 22, height: 22 }}
                />
                <span>Abrir en Waze</span>
              </a>
            </div>
          </div>
        )}


        {/* CARD ASISTENCIA - Solo si partido abierto */}
        {!isClosed && (
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

            {isFull && (
              <p style={{ color: "#dc2626", fontWeight: 600 }}>
                ❌ El partido ya está completo
              </p>
            )}


            {!existingPlayer && (
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


            {existingPlayer?.confirmed && (
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

            {existingPlayer && !existingPlayer.confirmed && (
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
        )}

        {/* CARD RESULTADO FINAL - Solo si partido cerrado */}
        {isClosed && match.teams && (() => {
          // Determinar en qué equipo jugó el usuario
          const userInTeamA = match.teams.A?.some((p: any) => p.uid === user.uid || p.name === playerName);
          const userInTeamB = match.teams.B?.some((p: any) => p.uid === user.uid || p.name === playerName);

          const scoreA = match.score?.A ?? 0;
          const scoreB = match.score?.B ?? 0;

          let userResult: "win" | "loss" | "draw" | null = null;
          let resultMessage = "";
          let resultColor = "";
          let resultBg = "";

          if (userInTeamA) {
            if (scoreA > scoreB) {
              userResult = "win";
              resultMessage = "¡Felicidades! Partido ganado 🎉";
              resultColor = "#166534";
              resultBg = "#dcfce7";
            } else if (scoreA < scoreB) {
              userResult = "loss";
              resultMessage = "Partido perdido 😔";
              resultColor = "#991b1b";
              resultBg = "#fee2e2";
            } else {
              userResult = "draw";
              resultMessage = "Partido empatado 🤝";
              resultColor = "#92400e";
              resultBg = "#fef3c7";
            }
          } else if (userInTeamB) {
            if (scoreB > scoreA) {
              userResult = "win";
              resultMessage = "¡Felicidades! Partido ganado 🎉";
              resultColor = "#166534";
              resultBg = "#dcfce7";
            } else if (scoreB < scoreA) {
              userResult = "loss";
              resultMessage = "Partido perdido 😔";
              resultColor = "#991b1b";
              resultBg = "#fee2e2";
            } else {
              userResult = "draw";
              resultMessage = "Partido empatado 🤝";
              resultColor = "#92400e";
              resultBg = "#fef3c7";
            }
          }

          return (
            <div
              style={{
                background: "#fff",
                borderRadius: 16,
                padding: 20,
                margin: "0 12px 16px",
                boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
              }}
            >
              <h3 style={{ marginBottom: 16, textAlign: "center" }}>
                🏆 Resultado Final
              </h3>

              {/* MENSAJE DE RESULTADO PERSONAL */}
              {userResult && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: 12,
                    borderRadius: 12,
                    background: resultBg,
                    color: resultColor,
                    textAlign: "center",
                    fontWeight: 600,
                    fontSize: 15,
                  }}
                >
                  {resultMessage}
                </div>
              )}

              {/* MARCADOR */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 20,
                  marginBottom: 24,
                  padding: "20px 0",
                  background: "#f8fafc",
                  borderRadius: 12,
                }}
              >
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 14, color: "#555", marginBottom: 6 }}>
                    🔴 Equipo A
                  </div>
                  <div style={{ fontSize: 36, fontWeight: 800, color: "#1f2937" }}>
                    {match.score?.A ?? 0}
                  </div>
                </div>

                <div style={{ fontSize: 24, color: "#9ca3af" }}>—</div>

                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 14, color: "#555", marginBottom: 6 }}>
                    🔵 Equipo B
                  </div>
                  <div style={{ fontSize: 36, fontWeight: 800, color: "#1f2937" }}>
                    {match.score?.B ?? 0}
                  </div>
                </div>
              </div>

              {/* EQUIPOS */}
              <div style={{ display: "flex", gap: 12 }}>
                {/* EQUIPO A */}
                <div
                  style={{
                    flex: 1,
                    background: "#fef2f2",
                    borderRadius: 12,
                    padding: 12,
                    border: "1px solid #fecaca",
                  }}
                >
                  <h4 style={{ marginBottom: 8, fontSize: 14, color: "#991b1b" }}>
                    🔴 Equipo A
                  </h4>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {match.teams.A?.map((p: any, i: number) => (
                      <li
                        key={i}
                        style={{
                          fontSize: 13,
                          padding: "4px 0",
                          color: "#7f1d1d",
                        }}
                      >
                        • {p.name}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* EQUIPO B */}
                <div
                  style={{
                    flex: 1,
                    background: "#eff6ff",
                    borderRadius: 12,
                    padding: 12,
                    border: "1px solid #bfdbfe",
                  }}
                >
                  <h4 style={{ marginBottom: 8, fontSize: 14, color: "#1e40af" }}>
                    🔵 Equipo B
                  </h4>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {match.teams.B?.map((p: any, i: number) => (
                      <li
                        key={i}
                        style={{
                          fontSize: 13,
                          padding: "4px 0",
                          color: "#1e3a8a",
                        }}
                      >
                        • {p.name}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          );
        })()}

        {/* CONFIRMADOS - Solo si partido abierto */}
        {!isClosed && (
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
        )}
      </div>
    </main>
  );
}
