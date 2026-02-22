"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useRouter } from "next/navigation";
import { getAllUsers, deleteUser, getUserProfile, updateUserRoles } from "@/lib/users";
import AuthGuard from "@/components/AuthGuard";
import type { UserProfile, UserRole } from "@/lib/domain/user";
import { toast } from "react-hot-toast";
import { handleError } from "@/lib/utils/error";

export default function AdminUsersPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    getUserProfile(user.uid).then(p => {
      setProfile(p);
      if (!p?.roles.includes("admin")) {
        router.replace("/");
      }
    });
  }, [user, router]);

  useEffect(() => {
    if (!profile || !profile.roles.includes("admin")) return;

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
      toast.success("Usuario eliminado");
    } catch (error: unknown) {
      handleError(error, "Error al eliminar usuario");
    } finally {
      setDeleting(null);
    }
  }

  async function handleToggleRole(targetUser: UserProfile, role: UserRole) {
    const hasRole = targetUser.roles.includes(role);
    // Safety: can't remove your own admin role
    if (role === "admin" && hasRole && targetUser.uid === user?.uid) return;
    const newRoles = hasRole
      ? targetUser.roles.filter(r => r !== role)
      : [...targetUser.roles, role];
    // Must have at least one role
    if (newRoles.length === 0) return;
    try {
      await updateUserRoles(targetUser.uid, newRoles);
      setUsers(prev => prev.map(u => u.uid === targetUser.uid ? { ...u, roles: newRoles as UserRole[] } : u));
      toast.success("Roles actualizados");
    } catch (err: unknown) {
      handleError(err, "Error actualizando roles");
    }
  }

  if (!user || !profile) {
    return <p style={{ padding: 20 }}>Cargando...</p>;
  }

  if (!profile.roles.includes("admin")) {
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
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>{u.name}</div>
                      <div style={{ fontSize: 12, color: "#999" }}>ID: {u.uid.slice(0, 12)}…</div>
                    </div>
                    <button
                      onClick={() => handleDelete(u.uid, u.name)}
                      disabled={deleting === u.uid || u.uid === user.uid}
                      style={{
                        background: deleting === u.uid ? "#ccc" : "#ef4444",
                        color: "#fff",
                        border: "none",
                        padding: "6px 12px",
                        borderRadius: 8,
                        fontSize: 13,
                        cursor: u.uid === user.uid ? "not-allowed" : "pointer",
                        opacity: u.uid === user.uid ? 0.5 : 1,
                      }}
                    >
                      {deleting === u.uid ? "..." : "Eliminar"}
                    </button>
                  </div>

                  {/* Role chips */}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    {(["admin", "player"] as UserRole[]).map(role => {
                      const active = u.roles.includes(role);
                      const isSelfAdmin = role === "admin" && active && u.uid === user.uid;
                      return (
                        <button
                          key={role}
                          onClick={() => handleToggleRole(u, role)}
                          disabled={isSelfAdmin}
                          style={{
                            padding: "6px 14px",
                            borderRadius: 20,
                            border: active ? "2px solid #1f7a4f" : "1px solid #ddd",
                            background: active ? "#e6f6ed" : "#f9fafb",
                            color: active ? "#1f7a4f" : "#9ca3af",
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: isSelfAdmin ? "not-allowed" : "pointer",
                            transition: "all 0.2s",
                            opacity: isSelfAdmin ? 0.7 : 1,
                          }}
                        >
                          {role === "admin" ? "👑 Admin" : "⚽ Jugador"}
                        </button>
                      );
                    })}
                  </div>

                  {u.positions && u.positions.length > 0 && (
                    <div style={{ fontSize: 12, color: "#888", marginTop: 6 }}>
                      Posiciones: {u.positions.join(", ")}
                    </div>
                  )}
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
