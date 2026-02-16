"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useRouter } from "next/navigation";
import { getAllUsers, deleteUser, getUserProfile } from "@/lib/users";
import AuthGuard from "@/components/AuthGuard";

export default function AdminUsersPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    getUserProfile(user.uid).then(p => {
      setProfile(p);
      if (p?.role !== "admin") {
        router.replace("/");
      }
    });
  }, [user, router]);

  useEffect(() => {
    if (!profile || profile.role !== "admin") return;

    loadUsers();
  }, [profile]);

  async function loadUsers() {
    setLoading(true);
    const allUsers = await getAllUsers();
    setUsers(allUsers);
    setLoading(false);
  }

  async function handleDelete(uid: string, name: string) {
    if (!confirm(`¿Estás seguro de eliminar a ${name}?`)) return;

    setDeleting(uid);
    try {
      await deleteUser(uid);
      await loadUsers();
    } catch (error) {
      console.error("Error eliminando usuario:", error);
      alert("Error al eliminar usuario");
    } finally {
      setDeleting(null);
    }
  }

  if (!user || !profile) {
    return <p style={{ padding: 20 }}>Cargando...</p>;
  }

  if (profile.role !== "admin") {
    return null;
  }

  return (
    <AuthGuard>
      <div style={{ maxWidth: 800, margin: "0 auto", padding: 16 }}>
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: 20,
            boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
          }}
        >
          <h1 style={{ marginBottom: 20 }}>👥 Administrar Usuarios</h1>

          {loading ? (
            <p>Cargando usuarios...</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {users.map(u => (
                <div
                  key={u.uid}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: 12,
                    padding: 16,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      {u.name}
                    </div>
                    <div style={{ fontSize: 13, color: "#666" }}>
                      {u.role === "admin" ? "👑 Admin" : "⚽ Jugador"}
                      {u.positions && u.positions.length > 0 && (
                        <span style={{ marginLeft: 8 }}>
                          · {u.positions.join(", ")}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
                      ID: {u.uid}
                    </div>
                  </div>

                  <button
                    onClick={() => handleDelete(u.uid, u.name)}
                    disabled={deleting === u.uid || u.uid === user.uid}
                    style={{
                      background: deleting === u.uid ? "#ccc" : "#ef4444",
                      color: "#fff",
                      border: "none",
                      padding: "8px 16px",
                      borderRadius: 8,
                      fontSize: 14,
                      cursor: u.uid === user.uid ? "not-allowed" : "pointer",
                      opacity: u.uid === user.uid ? 0.5 : 1,
                    }}
                  >
                    {deleting === u.uid ? "Eliminando..." : "Eliminar"}
                  </button>
                </div>
              ))}

              {users.length === 0 && (
                <p style={{ textAlign: "center", color: "#666", padding: 20 }}>
                  No hay usuarios registrados
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
