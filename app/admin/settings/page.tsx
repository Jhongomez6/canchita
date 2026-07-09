"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { enablePushNotifications } from "@/lib/push";
import { isLocationAdmin } from "@/lib/domain/user";
import { handleError } from "@/lib/utils/error";
import { logPushEnabled } from "@/lib/analytics";
import AuthGuard from "@/components/AuthGuard";
import { Bell, CheckCircle2, AlertTriangle, Settings } from "lucide-react";

function SettingsContent() {
  const { user, profile } = useAuth();
  const router = useRouter();

  const [enablingPush, setEnablingPush] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | "unsupported">("default");

  // Guard: solo location admins. Si no lo es, fuera.
  useEffect(() => {
    if (profile && !isLocationAdmin(profile)) {
      router.replace("/");
    }
  }, [profile, router]);

  // Sincroniza estado local con el perfil + permiso del navegador.
  useEffect(() => {
    if (!profile) return;
    if (profile.notificationsEnabled) setPushEnabled(true);
    if (typeof window !== "undefined" && "Notification" in window) {
      setBrowserPermission(Notification.permission);
    } else {
      setBrowserPermission("unsupported");
    }
  }, [profile]);

  // Estado derivado: "active" | "blocked" | "inactive"
  const pushState = pushEnabled && browserPermission === "granted"
    ? "active"
    : pushEnabled && browserPermission === "denied"
      ? "blocked"
      : browserPermission === "denied"
        ? "blocked"
        : browserPermission === "unsupported"
          ? "unsupported"
          : "inactive";

  const handleEnable = async () => {
    if (!user) return;
    setEnablingPush(true);
    try {
      const token = await enablePushNotifications(user.uid);
      if (token) {
        setPushEnabled(true);
        setBrowserPermission("granted");
        logPushEnabled();
      } else if (typeof Notification !== "undefined" && Notification.permission === "denied") {
        setBrowserPermission("denied");
      }
    } catch (err) {
      handleError(err, "No pudimos activar las notificaciones");
    } finally {
      setEnablingPush(false);
    }
  };

  // Mientras carga el perfil, AuthGuard ya muestra el loader global; aquí no
  // renderizamos nada del contenido admin para evitar flash.
  if (!profile || !isLocationAdmin(profile)) return null;

  return (
    <div className="min-h-screen bg-slate-50 pb-24 md:pb-0">
      {/* Header de la vista */}
      <div className="bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] p-6 pb-8 rounded-b-3xl shadow-lg">
        <div className="flex items-center gap-2">
          <Settings className="w-6 h-6 text-white" />
          <h1 className="text-xl font-bold text-white">Configuración</h1>
        </div>
        <p className="text-sm text-white/70 mt-1">
          Gestiona las notificaciones de tu sede
        </p>
      </div>

      <div className="max-w-md mx-auto px-4 -mt-4">
        {/* Card de Notificaciones */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden p-5">
          <div className="flex items-center gap-3">
            <Bell className="w-6 h-6 text-[#1f7a4f] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-800">Notificaciones</p>
              {pushState === "active" && (
                <p className="text-xs text-emerald-600 font-medium">
                  Activas — recibirás alertas de reservas
                </p>
              )}
              {pushState === "blocked" && (
                <p className="text-xs text-amber-600 font-medium">
                  Permisos bloqueados en tu navegador
                </p>
              )}
              {pushState === "unsupported" && (
                <p className="text-xs text-slate-500">
                  Tu navegador no soporta notificaciones
                </p>
              )}
              {pushState === "inactive" && (
                <p className="text-xs text-slate-500">
                  Actívalas para no perderte ninguna reserva
                </p>
              )}
            </div>
            {pushState === "active" && (
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            )}
            {pushState === "blocked" && (
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            )}
            {pushState === "inactive" && (
              <button
                onClick={handleEnable}
                disabled={enablingPush}
                className="flex-shrink-0 bg-[#1f7a4f] text-white text-xs font-bold px-3 py-2 rounded-xl hover:bg-[#16603c] transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {enablingPush ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : "Activar"}
              </button>
            )}
          </div>

          {/* Guía cuando los permisos están bloqueados */}
          {pushState === "blocked" && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-500 leading-relaxed">
                Para reactivarlas, abre los ajustes de tu navegador para este
                sitio y permite las notificaciones. Luego vuelve a esta pantalla.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminSettingsPage() {
  return (
    <AuthGuard>
      <SettingsContent />
    </AuthGuard>
  );
}
