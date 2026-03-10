"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useRouter } from "next/navigation";
import { getAllUsers, deleteUser, updateUserRoles, updateAdminType, assignLocationsToAdmin } from "@/lib/users";
import { getActiveLocations } from "@/lib/locations";
import AuthGuard from "@/components/AuthGuard";
import UserListSkeleton from "@/components/skeletons/UserListSkeleton";
import type { UserProfile, UserRole, AdminType } from "@/lib/domain/user";
import type { Location } from "@/lib/domain/location";
import { isSuperAdmin } from "@/lib/domain/user";
import { toast } from "react-hot-toast";
import { handleError } from "@/lib/utils/error";

export default function AdminUsersPage() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const allUsers = await getAllUsers();
    setUsers(allUsers);
    setLoading(false);
  }, []);

  useEffect(() => {
    getActiveLocations().then(setLocations);
  }, []);

  useEffect(() => {
    if (profile && !isSuperAdmin(profile)) {
      router.replace("/");
    }
  }, [profile, router]);

  useEffect(() => {
    if (!user || !profile || !isSuperAdmin(profile)) return;
    loadUsers();
  }, [user, profile, loadUsers]);

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

  async function handleUpdateAdminType(uid: string, adminType: AdminType) {
    try {
      if (!adminType) return;
      await updateAdminType(uid, adminType);
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, adminType } : u));
      toast.success("Tier de admin actualizado");
    } catch (e: unknown) {
      handleError(e, "Error al actualizar tier");
    }
  }

  async function handleToggleLocation(targetUser: UserProfile, locationId: string, add: boolean) {
    try {
      const currentLocs = targetUser.assignedLocationIds || [];
      const newLocs = add
        ? [...currentLocs, locationId]
        : currentLocs.filter(id => id !== locationId);

      await assignLocationsToAdmin(targetUser.uid, newLocs);
      setUsers(prev => prev.map(u => u.uid === targetUser.uid ? { ...u, assignedLocationIds: newLocs } : u));
      toast.success("Locations actualizadas");
    } catch (e: unknown) {
      handleError(e, "Error al actualizar locations");
    }
  }

  if (!user || !profile || !isSuperAdmin(profile)) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-[#1f7a4f] rounded-full animate-spin"></div>
        </div>
      </AuthGuard>
    );
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
          <h1 style={{ marginBottom: 20 }}>👑 Administrar Usuarios (Super Admin)</h1>

          {loading ? (
            <UserListSkeleton />
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
                          {role === "admin" ? "🛡️ Rol Admin" : "⚽ Rol Jugador"}
                        </button>
                      );
                    })}
                  </div>

                  {/* Admin Tier Configurations */}
                  {u.roles.includes("admin") && (
                    <div style={{ marginTop: 16, borderTop: "1px dashed #eee", paddingTop: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: "bold", color: "#666", marginBottom: 8 }}>
                        ⚙️ Tier de Administrador
                      </div>
                      <select
                        value={u.adminType || ""}
                        onChange={(e) => handleUpdateAdminType(u.uid, e.target.value as AdminType)}
                        style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ddd", fontSize: 14, outline: 'none' }}
                      >
                        <option value="">Seleccionar Tier...</option>
                        <option value="super_admin">🏆 Super Admin (Acceso Total)</option>
                        <option value="location_admin">🏟️ Location Admin (Partidos Públicos & Privados)</option>
                        <option value="team_admin">👥 Team Admin (Solo Partidos Privados)</option>
                      </select>

                      {/* Locations configurator (only for scoped admins) */}
                      {(u.adminType === "location_admin" || u.adminType === "team_admin") && (
                        <div style={{ marginTop: 16 }}>
                          <div style={{ fontSize: 13, fontWeight: "bold", color: "#666", marginBottom: 8 }}>
                            📍 Canchas Asignadas ({u.assignedLocationIds?.length || 0})
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "#f8fafc", padding: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}>
                            {locations.map(loc => {
                              const isAssigned = u.assignedLocationIds?.includes(loc.id);
                              return (
                                <label key={loc.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, cursor: "pointer" }}>
                                  <input
                                    type="checkbox"
                                    checked={!!isAssigned}
                                    onChange={(e) => handleToggleLocation(u, loc.id, e.target.checked)}
                                    style={{ width: 16, height: 16, accentColor: "#1f7a4f" }}
                                  />
                                  <span style={{ fontWeight: isAssigned ? 600 : 400, color: isAssigned ? "#0f172a" : "#475569" }}>
                                    {loc.name}
                                  </span>
                                </label>
                              )
                            })}
                            {locations.length === 0 && (
                              <span style={{ fontSize: 13, color: "#94a3b8" }}>No hay canchas registradas en el sistema.</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {u.positions && u.positions.length > 0 && (
                    <div style={{ fontSize: 12, color: "#888", marginTop: 12 }}>
                      Posiciones jugables: {u.positions.join(", ")}
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
