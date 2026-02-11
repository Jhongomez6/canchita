"use client";

import { useAuth } from "@/lib/AuthContext";
import { useEffect, useState } from "react";
import { getMyMatches } from "@/lib/matches";
import AuthGuard from "@/components/AuthGuard";
import { getUserProfile } from "@/lib/users";
import Link from "next/link";
import { enablePushNotifications } from "@/lib/push";
import { formatDateSpanish, formatTime12h } from "@/lib/date";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";



export default function Home() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const { justLoggedIn } = useAuth();
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [enablingPush, setEnablingPush] = useState(false);
  const [locationsMap, setLocationsMap] = useState<Record<string, any>>({});



  useEffect(() => {
    if (!user) return;
    getUserProfile(user.uid).then(setProfile);
  }, [user]);

  useEffect(() => {
    if (
      justLoggedIn &&
      profile &&
      !profile.notificationsEnabled &&
      "Notification" in window
    ) {
      setShowPushPrompt(true);
    }
  }, [justLoggedIn, profile]);


  useEffect(() => {
    if (!user) return;

    getMyMatches(user.uid).then(async matches => {
      setMatches(matches);

      const locationIds = Array.from(
        new Set(
          matches
            .map(m => m.locationId)
            .filter(Boolean)
        )
      );

      const entries = await Promise.all(
        locationIds.map(async id => {
          const snap = await getDoc(doc(db, "locations", id));
          return snap.exists() ? [id, snap.data()] : null;
        })
      );

      const map: Record<string, any> = {};
      entries.forEach(e => {
        if (e) map[e[0]] = e[1];
      });

      setLocationsMap(map);
    });
  }, [user]);

  return (
    <AuthGuard>
      <main
        style={{
          minHeight: "100vh",
          background: "#f2f5f3",
          paddingBottom: 24,
        }}
      >
        <div style={{ maxWidth: 420, margin: "0 auto" }}>
          {/* HEADER DE PANTALLA */}
          <div
            style={{
              padding: "20px 16px 12px",
            }}
          >
            {showPushPrompt && (
              <div
                style={{
                  background: "#ffffff",
                  margin: "12px 16px",
                  padding: 16,
                  borderRadius: 16,
                  boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
                }}
              >
                <h3 style={{ marginBottom: 6 }}>
                  🔔 Activa recordatorios
                </h3>

                <p style={{ fontSize: 14, color: "#555", marginBottom: 12 }}>
                  Te avisaremos antes del partido para que confirmes tu asistencia.
                </p>

                <button
                  disabled={enablingPush}
                  onClick={async () => {
                    if (!user) return;

                    setEnablingPush(true);
                    try {
                      await enablePushNotifications(user.uid);
                      setShowPushPrompt(false);
                    } finally {
                      setEnablingPush(false);
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: "12px",
                    background: enablingPush ? "#9ca3af" : "#1f7a4f",
                    color: "#fff",
                    borderRadius: 12,
                    border: "none",
                    fontWeight: 600,
                    cursor: enablingPush ? "not-allowed" : "pointer",
                  }}
                >
                  {enablingPush
                    ? "⏳ Activando..."
                    : "✅ Activar recordatorios"}
                </button>

                <button
                  onClick={() => setShowPushPrompt(false)}
                  style={{
                    marginTop: 8,
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    color: "#6b7280",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Ahora no
                </button>
              </div>
            )}

            <h1 style={{ margin: 0, fontSize: 22 }}>
              Mis partidos ⚽
            </h1>

            <p style={{ marginTop: 4, fontSize: 14, color: "#555" }}>
              Partidos en los que estás participando
            </p>
          </div>

          {/* CTA ADMIN */}
          {profile?.role === "admin" && (
            <div style={{ padding: "0 16px 12px" }}>
              <Link
                href="/new-match"
                style={{
                  display: "inline-block",
                  padding: "10px 14px",
                  background: "#1f7a4f",
                  color: "#fff",
                  borderRadius: 12,
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                + Nuevo partido
              </Link>
            </div>
          )}

          {/* LISTA DE PARTIDOS */}
          <div style={{ padding: "0 12px" }}>
            {matches.length === 0 && (
              <div
                style={{
                  background: "#fff",
                  borderRadius: 16,
                  padding: 20,
                  textAlign: "center",
                  color: "#555",
                  boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
                }}
              >
                <p style={{ marginBottom: 8 }}>
                  Aún no tienes partidos
                </p>
                <p style={{ fontSize: 14 }}>
                  Cuando te unas a uno, aparecerá aquí
                </p>
              </div>
            )}

            {matches.map(m => {
              const href =
                profile?.role === "admin"
                  ? `/match/${m.id}`
                  : `/join/${m.id}`;

              return (
                <Link
                  key={m.id}
                  href={href}
                  style={{
                    display: "block",
                    background: "#fff",
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 12,
                    boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
                    textDecoration: "none",
                    color: "#000",
                  }}
                >

                  <h3 style={{ marginBottom: 6 }}>
                    {profile?.role === "admin"
                      ? "⚽ Administrar partido"
                      : "⚽ Partido"}
                  </h3>


                  <p style={{ fontSize: 14, color: "#555" }}>
                    📍 {locationsMap[m.locationId]?.name ?? "Cargando cancha..."}
                  </p>


                  <p style={{ fontSize: 14, color: "#555" }}>
                    🕒 {formatDateSpanish(m.date)}
                  </p>

                  <p style={{ fontSize: 14, color: "#555" }}>
                    ⏰ {formatTime12h(m.time)}
                  </p>

                  <div style={{ marginTop: 8 }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "4px 10px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 600,
                        background:
                          m.status === "closed"
                            ? "#dc2626"
                            : "#16a34a",
                        color: "#fff",
                      }}
                    >
                      {m.status === "closed"
                        ? "Cerrado"
                        : "Abierto"}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </main>
    </AuthGuard>
  );
}
