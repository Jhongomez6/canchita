"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/lib/AuthContext";
import { enablePushNotifications } from "@/lib/push";
import { updateUserPositions, updateUserName, updatePlayerAttributes, requestReEvaluation, deleteUser, updateUserPhoto } from "@/lib/users";
import { uploadAvatarBase64 } from "@/lib/storage";
import { deleteUser as deleteAuthUser, updateProfile } from "firebase/auth";
import { useRouter } from "next/navigation";
import type { Position } from "@/lib/domain/player";
import { ALLOWED_POSITIONS, POSITION_LABELS, POSITION_ICONS } from "@/lib/domain/player";
import type { UserStats } from "@/lib/domain/user";
import type { Sex, Foot, CourtSize } from "@/lib/domain/rating";
import { handleError } from "@/lib/utils/error";
import Link from "next/link";
import { isSuperAdmin } from "@/lib/domain/user";
import AuthGuard from "@/components/AuthGuard";
import StatsCard from "@/components/StatsCard";
import ProfileSkeleton from "@/components/skeletons/ProfileSkeleton";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { X, Share, PlusSquare, ChevronRight } from "lucide-react";
import Image from "next/image";
import Cropper from "react-easy-crop";

const FOOT_LABELS: Record<string, string> = { left: "Izquierdo", right: "Derecho", ambidextrous: "Ambidiestro" };
const SEX_LABELS: Record<string, string> = { male: "M", female: "F", other: "Otro" };
const LEVEL_LABELS = ["", "Básico", "Intermedio", "Avanzado"];
const LEVEL_EMOJIS = ["", "🌱", "⚡", "🔥"];

export default function ProfilePage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  // Profile data
  const [displayName, setDisplayName] = useState("");
  const [positions, setPositions] = useState<string[]>([]);
  const [primaryPosition, setPrimaryPosition] = useState<string | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const [age, setAge] = useState<number | null>(null);
  const [sex, setSex] = useState<Sex | null>(null);
  const [dominantFoot, setDominantFoot] = useState<Foot | null>(null);
  const [preferredCourt, setPreferredCourt] = useState<CourtSize | null>(null);
  const [stats, setStats] = useState<UserStats>({ played: 0, won: 0, lost: 0, draw: 0 });
  const [onboardingCompletedAt, setOnboardingCompletedAt] = useState<string | null>(null);
  const [nameLastChanged, setNameLastChanged] = useState<string | null>(null);

  // UI state
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [requestingReeval, setRequestingReeval] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");

  // PWA Install
  const { isInstallable, isStandalone, isIOS, isAndroid, promptToInstall } = usePWAInstall();
  const [showInstallModal, setShowInstallModal] = useState(false);
  const canInstall = !isStandalone && (isInstallable || isIOS || isAndroid);

  // Edit buffers
  const [editName, setEditName] = useState("");
  const [editPositions, setEditPositions] = useState<string[]>([]);
  const [editPrimaryPosition, setEditPrimaryPosition] = useState<string | null>(null);
  const [editFoot, setEditFoot] = useState<Foot | null>(null);
  const [editCourt, setEditCourt] = useState<CourtSize | null>(null);
  const [editPhotoB64, setEditPhotoB64] = useState<string | null>(null);

  // Cropper states
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<{ width: number, height: number, x: number, y: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Push notifications
  const [enablingPush, setEnablingPush] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [returnToMatch, setReturnToMatch] = useState<string | null>(null);

  // Derived
  const isOnboarding = positions.length === 0;
  const isPushOnDevice = typeof window !== "undefined" && localStorage.getItem("push-enabled") === "true";

  useEffect(() => {
    if (!profile) return;

    // Sincronizar estado local con el perfil global
    if (profile.positions) setPositions(profile.positions);
    if (profile.primaryPosition) setPrimaryPosition(profile.primaryPosition);
    if (profile.notificationsEnabled) setPushEnabled(true);
    setDisplayName(profile.name || user?.displayName || "");
    if (profile.nameLastChanged) setNameLastChanged(profile.nameLastChanged);
    if (profile.stats) {
      setStats({
        played: Math.max(0, profile.stats.played ?? 0),
        won: Math.max(0, profile.stats.won ?? 0),
        lost: Math.max(0, profile.stats.lost ?? 0),
        draw: Math.max(0, profile.stats.draw ?? 0),
        lateArrivals: profile.stats.lateArrivals ?? 0,
        noShows: profile.stats.noShows ?? 0,
      });
    }
    if (profile.level != null) setLevel(profile.level);
    if (profile.onboardingCompletedAt) setOnboardingCompletedAt(profile.onboardingCompletedAt);
    if (profile.age != null) setAge(profile.age);
    if (profile.sex) setSex(profile.sex as Sex);
    if (profile.dominantFoot) setDominantFoot(profile.dominantFoot);
    if (profile.preferredCourt) setPreferredCourt(profile.preferredCourt);
    setLoading(false);

  }, [profile, user]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const matchId = localStorage.getItem("returnToMatch");
      if (matchId) setReturnToMatch(matchId);
    }
  }, []);

  // Name cooldown
  const COOLDOWN_DAYS = 30;
  let nameDaysLeft = 0;
  let nameUnlockDate = "";
  if (nameLastChanged) {
    const diff = Math.floor((Date.now() - new Date(nameLastChanged).getTime()) / 86400000);
    nameDaysLeft = Math.max(0, COOLDOWN_DAYS - diff);
    if (nameDaysLeft > 0) {
      const d = new Date(nameLastChanged);
      d.setDate(d.getDate() + COOLDOWN_DAYS);
      nameUnlockDate = d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
    }
  }
  const canEditName = nameDaysLeft === 0;

  // Re-eval cooldown
  const REEVAL_DAYS = 90;
  let reevalDaysLeft = 0;
  let reevalUnlockDate = "";
  if (onboardingCompletedAt) {
    const diff = Math.floor((Date.now() - new Date(onboardingCompletedAt).getTime()) / 86400000);
    reevalDaysLeft = Math.max(0, REEVAL_DAYS - diff);
    if (reevalDaysLeft > 0) {
      const d = new Date(onboardingCompletedAt);
      d.setDate(d.getDate() + REEVAL_DAYS);
      reevalUnlockDate = d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
    }
  }

  function startEditing() {
    setEditName(displayName);
    setEditPositions([...positions]);
    setEditPrimaryPosition(primaryPosition);
    setEditFoot(dominantFoot);
    setEditCourt(preferredCourt);
    setEditPhotoB64(null);
    setImageSrc(null);
    setEditing(true);
  }

  function cancelEditing() {
    setImageSrc(null);
    setEditing(false);
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("La imagen es demasiado grande. Máximo 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setImageSrc(event.target?.result as string);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    };
    reader.readAsDataURL(file);

    // Clear the input so same file can be selected again
    e.target.value = '';
  };

  const onCropComplete = (croppedArea: { width: number, height: number, x: number, y: number }, croppedAreaPixels: { width: number, height: number, x: number, y: number }) => {
    // Avoid using croppedArea directly to prevent unused var warning, we only need pixels for canvas
    if (croppedArea) {
      setCroppedAreaPixels(croppedAreaPixels);
    }
  };

  const applyCrop = async () => {
    if (!imageSrc || !croppedAreaPixels) return;

    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      // Output 256x256
      const MAX_SIZE = 256;
      canvas.width = MAX_SIZE;
      canvas.height = MAX_SIZE;
      const ctx = canvas.getContext("2d");

      if (ctx) {
        ctx.drawImage(
          img,
          croppedAreaPixels.x,
          croppedAreaPixels.y,
          croppedAreaPixels.width,
          croppedAreaPixels.height,
          0,
          0,
          MAX_SIZE,
          MAX_SIZE
        );
        const compressedBase64 = canvas.toDataURL("image/webp", 0.7);
        setEditPhotoB64(compressedBase64);
        setImageSrc(null);
      }
    };
    img.src = imageSrc;
  };

  async function saveAll() {
    if (!user) return;
    setSaving(true);
    try {
      const trimmedName = editName.trim();
      const words = trimmedName.split(/\s+/);
      const hasValidFullName = words.length >= 2 && words.every(word => word.length >= 2);

      if (canEditName && !hasValidFullName) {
        setSaving(false);
        return;
      }

      if (canEditName && hasValidFullName && trimmedName !== displayName) {
        await updateUserName(user.uid, trimmedName, user.displayName);
        setDisplayName(trimmedName);
        setNameLastChanged(new Date().toISOString());
      }
      if (JSON.stringify(editPositions) !== JSON.stringify(positions) || editPrimaryPosition !== primaryPosition) {
        await updateUserPositions(user.uid, editPositions, editPrimaryPosition ?? undefined);
        setPositions(editPositions);
        setPrimaryPosition(editPrimaryPosition);
      }
      const attrUpdate: { dominantFoot?: string; preferredCourt?: string } = {};
      if (editFoot && editFoot !== dominantFoot) attrUpdate.dominantFoot = editFoot;
      if (editCourt && editCourt !== preferredCourt) attrUpdate.preferredCourt = editCourt;

      if (Object.keys(attrUpdate).length > 0) {
        await updatePlayerAttributes(user.uid, attrUpdate);
        if (editFoot) setDominantFoot(editFoot);
        if (editCourt) setPreferredCourt(editCourt);
      }

      if (editPhotoB64) {
        // Enlazar la subida a Storage en lugar de tirarlo directo a la BD (Ahorra un montón de ancho de banda a largo plazo)
        const publicUrl = await uploadAvatarBase64(user.uid, editPhotoB64);

        // Guardamos solo el URL público súper corto en Firestore y Auth
        await updateUserPhoto(user.uid, publicUrl);
        await updateProfile(user, { photoURL: publicUrl });

        // Reforzamos local el cambio visual inmediato de la foto de base64 ya que ya no vivirá ahí sino por red
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setEditing(false);
    } catch (err: unknown) {
      handleError(err, "Error al guardar los cambios del perfil");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAccount() {
    if (!user) return;
    setDeletingAccount(true);
    try {
      // 1. Borrar datos de Firestore (Habeas Data)
      await deleteUser(user.uid);
      // 2. Borrar el usuario de Firebase Auth
      await deleteAuthUser(user);
      // Redirige automáticamente porque el AuthContext detecta onAuthStateChanged
    } catch (err: unknown) {
      if (err instanceof Error && "code" in err && err.code === "auth/requires-recent-login") {
        try {
          // Attempt inline re-authentication
          const { GoogleAuthProvider, reauthenticateWithPopup } = await import("firebase/auth");
          const provider = new GoogleAuthProvider();
          await reauthenticateWithPopup(user, provider);

          // Retry deletion after successful re-auth
          await deleteUser(user.uid);
          await deleteAuthUser(user);
        } catch (reauthErr: unknown) {
          handleError(reauthErr, "No se pudo re-autenticar para eliminar la cuenta. Por favor intente más tarde.");
          setDeletingAccount(false);
          setShowDeleteConfirm(false);
        }
      } else {
        handleError(err, "Error al eliminar la cuenta");
        setDeletingAccount(false);
        setShowDeleteConfirm(false);
      }
    }
  }

  // ======== RENDER ========



  const Chip = ({ active, isPrimary, children }: { active: boolean, isPrimary?: boolean, children: React.ReactNode }) => (
    <span className={`relative inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${active
      ? isPrimary
        ? "bg-[#1f7a4f] text-white border-[#16603c] shadow-sm ring-1 ring-[#1f7a4f]"
        : "bg-emerald-100/50 text-emerald-700 border-emerald-200"
      : "bg-slate-100 text-slate-500 border-slate-200"
      }`}>
      {isPrimary && (
        <span className="absolute -top-1 -right-1 bg-white text-amber-500 rounded-full w-3.5 h-3.5 flex items-center justify-center shadow-sm border border-amber-300 text-[8px] z-10" title="Posición Principal">
          👑
        </span>
      )}
      {children}
    </span>
  );

  const InfoRow = ({ label, value }: { label: string, value: React.ReactNode }) => (
    <div className="flex justify-between items-center py-3 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500 font-medium">{label}</span>
      <div className="text-sm font-bold text-slate-700">{value}</div>
    </div>
  );

  // Si la sesión ya cargó y definitivamente no hay usuario, renderizamos AuthGuard 
  // para que gestione la redirección a la Landing Page.
  if (!authLoading && !user) {
    return <AuthGuard><div /></AuthGuard>;
  }

  if (authLoading || !profile || loading) {
    return <ProfileSkeleton />;
  }

  return (
    <AuthGuard>
      <main className="min-h-screen bg-slate-50 pb-24 md:pb-8">
        {/* CROPPER MODAL REDISEÑADO AL ESTILO NATIVO DE TIKTOK/INSTAGRAM */}
        {imageSrc && (
          <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-between pb-10 pt-safe font-sans animate-in fade-in duration-200">
            {/* Header / Actions - Fondo semi-transparente para leer bien */}
            <div className="w-full flex justify-between items-center p-4 z-10 bg-gradient-to-b from-black/60 to-transparent">
              <button
                onClick={() => setImageSrc(null)}
                className="text-white font-semibold text-lg hover:opacity-80 transition py-2 px-2"
              >
                Cancelar
              </button>
              <h2 className="text-white font-bold text-sm">Ajustar foto</h2>
              <button
                onClick={applyCrop}
                className="bg-white text-black font-bold text-sm px-5 py-2 rounded-full hover:bg-slate-200 shadow-xl transition-all active:scale-95"
              >
                Hecho
              </button>
            </div>

            {/* CROP AREA MAIN */}
            <div className="relative w-full flex-1 touch-none">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
                style={{ containerStyle: { background: 'black' }, cropAreaStyle: { border: '2px solid rgba(255,255,255,0.7)', padding: 0 } }}
              />
            </div>

            {/* SLIDER TIPO INSTAGRAM PARA ZOOM FINO */}
            <div className="w-full px-8 pb-6 bg-gradient-to-t from-black/80 to-transparent z-10 pt-10 flex flex-col items-center">
              <p className="text-white/60 text-xs mb-4 font-medium uppercase tracking-widest">Arrastra para mover</p>
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full max-w-[250px] accent-white bg-white/20 h-1.5 rounded-full appearance-none outline-none cursor-pointer"
              />
              <p className="text-white/40 text-[10px] mt-3">ZOOM</p>
            </div>
          </div>
        )}

        <div className="max-w-md mx-auto p-4">

          {/* Onboarding banner */}
          {isOnboarding && (
            <div className="bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] text-white p-5 rounded-2xl shadow-lg mb-6">
              <h2 className="font-bold text-lg mb-1">👋 Completa tu perfil</h2>
              <p className="text-sm text-emerald-100 opacity-90">Selecciona tus posiciones para unirte a partidos.</p>
            </div>
          )}

          {/* ========================= */}
          {/*    FICHA TÉCNICA        */}
          {/* ========================= */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">

            {/* Header */}
            <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <span className="text-xl">🏅</span> Ficha Técnica
              </h2>
              {!isOnboarding && !editing && (
                <button
                  onClick={startEditing}
                  className="text-sm font-semibold text-[#1f7a4f] hover:text-[#16603c] transition-colors"
                >
                  ✏️ Editar
                </button>
              )}
            </div>

            <div className="p-5">
              {saved && (
                <div className="mb-4 bg-emerald-50 text-[#1f7a4f] text-sm font-semibold px-3 py-2 rounded-lg text-center border border-emerald-100 animate-fade-in">
                  ✅ Cambios guardados
                </div>
              )}

              {/* =================== */}
              {/*     VIEW MODE       */}
              {/* =================== */}
              {!editing ? (
                <div className="space-y-1">
                  <div className="flex justify-center flex-col items-center mb-6 mt-2">
                    <div className="relative w-32 h-32 rounded-full border-4 border-slate-100 shadow-sm overflow-hidden bg-slate-50 mb-3">
                      <Image
                        src={profile?.photoURL || "https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png"}
                        alt={displayName || "Foto de perfil"}
                        fill
                        className="object-cover"
                        sizes="128px"
                        priority
                      />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800">{displayName}</h3>
                    <p className="text-[10px] text-slate-400 mt-2 bg-slate-100 px-3 py-1 rounded-full font-medium">
                      📸 Tu foto ayuda a que tu equipo te reconozca fácil en la canchita
                    </p>
                  </div>

                  {/* Ya no requerimos mostrar el row de nombre dado que lo pusimos grande abajo de la foto */}
                  {/* <InfoRow label="Nombre" value={displayName || "—"} /> */}
                  {age != null && <InfoRow label="Edad" value={`${age} años`} />}
                  {sex && <InfoRow label="Sexo" value={SEX_LABELS[sex] || sex} />}

                  <InfoRow label="Posiciones" value={
                    positions.length > 0 ? (
                      <div className="flex gap-2 flex-wrap justify-end">
                        {positions.map(p => {
                          const isPri = primaryPosition ? primaryPosition === p : positions[0] === p; // Fallback legacy a index 0
                          return (
                            <Chip key={p} active={true} isPrimary={isPri}>
                              {POSITION_ICONS[p as Position]} {POSITION_LABELS[p as Position]}
                            </Chip>
                          )
                        })}
                      </div>
                    ) : (
                      <span className="text-slate-400 italic text-xs">Sin seleccionar</span>
                    )
                  } />

                  {dominantFoot && <InfoRow label="Pie dominante" value={FOOT_LABELS[dominantFoot] || dominantFoot} />}
                  {preferredCourt && <InfoRow label="Cancha preferida" value={preferredCourt} />}

                  {/* Level Classification Card */}
                  {level != null && (
                    <div className="mt-6 bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] rounded-2xl p-5 text-white shadow-lg relative overflow-hidden group">
                      <div className="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all"></div>

                      <div className="flex items-center gap-4 relative z-10">
                        <span className="text-5xl drop-shadow-md">{LEVEL_EMOJIS[level]}</span>
                        <div>
                          <div className="text-xs font-bold text-emerald-200 uppercase tracking-widest mb-1">Nivel Calculado</div>
                          <div className="text-2xl font-black leading-none">Nivel {level}</div>
                          <div className="text-lg font-bold opacity-90">{LEVEL_LABELS[level]}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Re-evaluation Link */}
                  {level != null && (
                    <div className="mt-4 text-center">
                      {reevalDaysLeft === 0 ? (
                        <button
                          disabled={requestingReeval}
                          onClick={async () => {
                            if (!user) return;
                            setRequestingReeval(true);
                            try {
                              await requestReEvaluation(user.uid);
                              router.push("/onboarding");
                            } catch (err: unknown) {
                              handleError(err, "Error solicitando re-evaluación");
                              setRequestingReeval(false);
                            }
                          }}
                          className="text-xs font-bold text-amber-600 hover:text-amber-700 underline"
                        >
                          {requestingReeval ? "Redirigiendo..." : "Solicitar nueva evaluación"}
                        </button>
                      ) : (
                        <p className="text-[10px] text-slate-400">
                          🔒 Nueva autoevaluación disponible el {reevalUnlockDate}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* =================== */
                /*     EDIT MODE       */
                /* =================== */
                <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {/* Photo Edit */}
                  <div className="flex flex-col items-center mb-2 mt-2">
                    <div
                      className="relative w-32 h-32 rounded-full border-4 border-slate-100 shadow-sm overflow-hidden bg-slate-50 mb-3 group cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Image
                        src={editPhotoB64 || profile?.photoURL || "https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png"}
                        alt="Editar foto de perfil"
                        fill
                        className="object-cover transition-opacity group-hover:opacity-50"
                        sizes="128px"
                      />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <span className="bg-black/60 text-white text-xs font-bold px-3 py-1.5 rounded-full backdrop-blur-sm">Editar Foto</span>
                      </div>
                    </div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="image/jpeg, image/png, image/webp"
                      onChange={handleImageChange}
                    />
                    <p className="text-[10px] text-slate-400 font-medium tracking-tight">Toca la imagen para cambiarla</p>
                  </div>

                  {/* Name */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Nombre</label>
                    {canEditName ? (
                      <div>
                        <input
                          type="text"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          placeholder="Nombre y Apellido (ej. Carlos Gomez)"
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#1f7a4f] transition-all"
                        />
                        {editName.trim().length > 0 &&
                          (editName.trim().split(/\s+/).length < 2 || editName.trim().split(/\s+/).some(word => word.length < 2)) && (
                            <p className="text-red-500 text-xs mt-1 font-medium">Ingresa al menos tu primer nombre y apellido</p>
                          )}
                      </div>
                    ) : (
                      <div className="px-4 py-3 bg-slate-100 rounded-xl text-slate-400 font-medium text-sm border border-slate-200">
                        {displayName} <span className="text-xs ml-2 opacity-70">🔒 cambio el {nameUnlockDate}</span>
                      </div>
                    )}
                  </div>

                  {/* Age & Sex (Locked in Edit Mode) */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="group relative" tabIndex={0}>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        Edad <span className="text-[10px] opacity-40">🔒</span>
                      </label>
                      <div className="px-4 py-3 bg-slate-100 rounded-xl text-slate-400 font-medium text-sm border border-slate-200 cursor-help focus:outline-none">
                        {age || "—"}
                      </div>
                      {/* Tooltip */}
                      <div className="absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full w-48 p-2 bg-slate-800 text-white text-[10px] rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus:opacity-100 group-focus:visible transition-all pointer-events-none z-50 text-center leading-tight">
                        Para rectificar este campo, contacta a un administrador.
                        <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                      </div>
                    </div>
                    <div className="group relative" tabIndex={0}>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        Sexo <span className="text-[10px] opacity-40">🔒</span>
                      </label>
                      <div className="px-4 py-3 bg-slate-100 rounded-xl text-slate-400 font-medium text-sm border border-slate-200 cursor-help focus:outline-none">
                        {sex ? SEX_LABELS[sex] : "—"}
                      </div>
                      {/* Tooltip */}
                      <div className="absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full w-48 p-2 bg-slate-800 text-white text-[10px] rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus:opacity-100 group-focus:visible transition-all pointer-events-none z-50 text-center leading-tight">
                        Para rectificar este campo, contacta a un administrador.
                        <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                      </div>
                    </div>
                  </div>

                  {/* Positions */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex flex-col">
                      Posiciones
                      <span className="text-[10px] font-normal normal-case opacity-70 mt-1">Elige máx. 3. Toca de nuevo una seleccionada para hacerla principal (👑)</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {ALLOWED_POSITIONS.map((pos: Position) => {
                        const sel = editPositions.includes(pos);
                        const isPrimary = editPrimaryPosition === pos;

                        return (
                          <button
                            key={pos}
                            onClick={() => {
                              if (sel) {
                                if (isPrimary) {
                                  // Remover completa
                                  const newPos = editPositions.filter(p => p !== pos);
                                  setEditPositions(newPos);
                                  setEditPrimaryPosition(newPos.length > 0 ? newPos[0] : null);
                                } else {
                                  // Hacer primaria
                                  setEditPrimaryPosition(pos);
                                }
                              } else {
                                const newPos = [...editPositions];
                                if (newPos.length >= 3) {
                                  const idxToRemove = newPos.findIndex(p => p !== editPrimaryPosition);
                                  if (idxToRemove !== -1) {
                                    newPos.splice(idxToRemove, 1);
                                  } else {
                                    newPos.shift();
                                  }
                                }
                                newPos.push(pos);
                                setEditPositions(newPos);
                                if (newPos.length === 1 || !editPrimaryPosition) {
                                  setEditPrimaryPosition(pos);
                                }
                              }
                            }}
                            className={`
                                       relative flex items-center justify-center gap-2 py-3 px-2 rounded-xl text-sm font-bold transition-all border
                                       ${sel
                                ? isPrimary
                                  ? "bg-[#1f7a4f] border-[#16603c] text-white shadow-md ring-2 ring-[#1f7a4f]"
                                  : "bg-emerald-100/50 border-emerald-800 text-emerald-800"
                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300"
                              }
                                    `}
                          >
                            {isPrimary && (
                              <div className="absolute -top-1.5 -right-1.5 bg-white text-amber-500 rounded-full w-4 h-4 flex items-center justify-center shadow border border-amber-300 text-[8px] z-10 animate-in zoom-in-50 duration-200" title="Posición Principal">👑</div>
                            )}
                            <span className="text-lg">{POSITION_ICONS[pos]}</span>
                            <span>{POSITION_LABELS[pos]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Foot */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Pie Dominante</label>
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                      {(["left", "right", "ambidextrous"] as Foot[]).map(f => {
                        const active = editFoot === f;
                        return (
                          <button
                            key={f}
                            onClick={() => setEditFoot(f)}
                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${active ? "bg-white text-[#1f7a4f] shadow-sm" : "text-slate-500 hover:text-slate-700"
                              }`}
                          >
                            {FOOT_LABELS[f]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Court */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Cancha Preferida</label>
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                      {(["6v6", "9v9", "11v11"] as CourtSize[]).map(c => {
                        const active = editCourt === c;
                        return (
                          <button
                            key={c}
                            onClick={() => setEditCourt(c)}
                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${active ? "bg-white text-[#1f7a4f] shadow-sm" : "text-slate-500 hover:text-slate-700"
                              }`}
                          >
                            {c}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={cancelEditing}
                      className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      disabled={saving || (canEditName && editName.trim().length > 0 && (editName.trim().split(/\s+/).length < 2 || editName.trim().split(/\s+/).some(word => word.length < 2)))}
                      onClick={saveAll}
                      className="flex-[2] py-3 bg-[#1f7a4f] text-white font-bold rounded-xl hover:bg-[#16603c] transition-all shadow-md active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {saving ? "Guardando..." : "Guardar Cambios"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ========================= */}
          {/*    NIVEL DE COMPROMISO  */}
          {/* ========================= */}
          {!isOnboarding && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <span className="text-xl">🤝</span> Compromiso
                </h2>
                <div className="group relative flex items-center" tabIndex={0}>
                  <span className="cursor-pointer w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors">
                    ?
                  </span>
                  <div className="absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full w-56 p-3 bg-slate-800 text-white text-xs rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus:opacity-100 group-focus:visible focus-within:opacity-100 focus-within:visible transition-all pointer-events-none z-50 text-center">
                    Inicias con 100 de puntuación.
                    <br />• <span className="text-amber-300 font-bold">-5 pts</span> por Llegada Tarde
                    <br />• <span className="text-red-400 font-bold">-20 pts</span> por No Asistir
                    <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                  </div>
                </div>
              </div>

              {(() => {
                const { lateArrivals = 0, noShows = 0 } = stats;
                const penalty = (noShows * 20) + (lateArrivals * 5);
                const score = Math.max(0, 100 - penalty);

                let level = { label: "Siempre en la cancha antes que el balón", color: "text-emerald-600", bg: "bg-emerald-100", icon: "🌟" };
                if (score < 50) level = { label: "Con la roja por falta de compromiso", color: "text-red-600", bg: "bg-red-100", icon: "🚩" };
                else if (score < 80) level = { label: "Llegando justo para el pitazo inicial", color: "text-amber-600", bg: "bg-amber-100", icon: "⚠️" };
                else if (score < 100) level = { label: "Listo para el 11 titular", color: "text-lime-600", bg: "bg-lime-100", icon: "🛡️" };

                return (
                  <div className="flex items-center justify-between">
                    <div className="relative w-24 h-24 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle
                          cx="48"
                          cy="48"
                          r="40"
                          stroke="currentColor"
                          strokeWidth="8"
                          fill="transparent"
                          className="text-slate-100"
                        />
                        <circle
                          cx="48"
                          cy="48"
                          r="40"
                          stroke="currentColor"
                          strokeWidth="8"
                          fill="transparent"
                          strokeDasharray={251.2}
                          strokeDashoffset={251.2 - (251.2 * score) / 100}
                          className={`${level.color} transition-all duration-1000 ease-out`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className={`text-2xl font-black ${level.color}`}>{score}</span>
                      </div>
                    </div>

                    <div className="flex-1 pl-6">
                      <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-1 ${level.bg} ${level.color}`}>
                        {level.icon} {level.label}
                      </div>
                      <div className="text-xs text-slate-500 leading-tight">
                        Tu nivel de cumplimiento en partidos.
                        {/* No mostramos No Shows explícitamente para no avergonzar, pero impactan el score */}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ========================= */}
          {/*      ESTADÍSTICAS       */}
          {/* ========================= */}
          {!isOnboarding && <StatsCard stats={stats} />}

          {/* ========================= */}
          {/*     CTA + NOTIFICATIONS   */}
          {/* ========================= */}
          {!isOnboarding && positions.length > 0 && (
            <div className="space-y-4">
              <button
                onClick={() => {
                  if (returnToMatch) {
                    localStorage.removeItem("returnToMatch");
                    router.push(`/join/${returnToMatch}`);
                  } else {
                    router.push("/");
                  }
                }}
                className="w-full py-4 bg-[#1f7a4f] text-white rounded-2xl font-bold text-lg hover:bg-[#16603c] transition-all shadow-lg active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {returnToMatch ? "Volver al partido" : "Ver mis partidos"}
              </button>

              {/* Notifications */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6 p-5">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
                  <span className="text-xl">🔔</span> Notificaciones
                </h2>
                {isPushOnDevice ? (
                  <div className="flex items-center gap-3 text-emerald-700 bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                    <span className="text-2xl">✅</span>
                    <div>
                      <h3 className="font-bold text-sm">Notificaciones activas</h3>
                      <p className="text-xs opacity-90">Recibirás alertas de cupos y recordatorios.</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm text-slate-600">
                      Activa las notificaciones para no perderte ningún partido.
                    </p>
                    <button
                      onClick={async () => {
                        if (!user) return;
                        setEnablingPush(true);
                        try {
                          const token = await enablePushNotifications(user.uid);
                          if (token) {
                            localStorage.setItem("push-enabled", "true");
                            setPushEnabled(true);
                          }
                        } catch (err) {
                          handleError(err, "No pudimos activar las notificaciones");
                        } finally {
                          setEnablingPush(false);
                        }
                      }}
                      disabled={enablingPush}
                      className="bg-[#1f7a4f] text-white font-bold py-3 px-4 rounded-xl hover:bg-[#16603c] transition-colors disabled:opacity-50 flex justify-center items-center"
                    >
                      {enablingPush ? (
                        <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      ) : (
                        "Activar notificaciones"
                      )}
                    </button>
                    {pushEnabled && !isPushOnDevice && (
                      <p className="mt-2 text-[10px] text-amber-600 text-center font-medium">
                        Activas en otro dispositivo. Actívalas aquí también.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* ========================= */}
              {/*     APP INSTALLATION      */}
              {/* ========================= */}
              {canInstall && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6 p-5">
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
                    <span className="text-xl">📱</span> Instalar App
                  </h2>
                  <div className="flex flex-col gap-3">
                    <p className="text-sm text-slate-600">
                      Instala La Canchita en tu pantalla de inicio para un acceso más rápido y experiencia a pantalla completa.
                    </p>
                    <button
                      onClick={async () => {
                        if (isIOS) {
                          setShowInstallModal(true);
                        } else {
                          const result = await promptToInstall();
                          if (!result.success && isAndroid) {
                            setShowInstallModal(true);
                          }
                        }
                      }}
                      className="bg-slate-900 border border-slate-800 text-white font-bold py-3 px-4 rounded-xl hover:bg-slate-800 transition-colors flex justify-center items-center shadow-lg"
                    >
                      Instalar en Pantalla de Inicio
                    </button>
                  </div>

                  {/* Manual Instructions Modal (iOS & Android Fallback) */}
                  {showInstallModal && (isIOS || isAndroid) && (
                    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                      <div className="bg-white text-slate-900 rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-6 relative animate-in slide-in-from-bottom-10 sm:slide-in-from-bottom-0 shadow-2xl text-left">
                        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 sm:hidden"></div>

                        <button
                          onClick={() => setShowInstallModal(false)}
                          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-full transition"
                        >
                          <X size={20} />
                        </button>

                        <h3 className="text-xl font-bold mb-2">Instalar en {isIOS ? "iOS" : "Android"}</h3>
                        <p className="text-slate-500 mb-6 text-sm">Sigue estos rápidos pasos para añadir Canchita a tu pantalla de inicio:</p>

                        <div className="space-y-3">
                          {isIOS ? (
                            <>
                              <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <div className="bg-white p-2.5 rounded-xl shadow-sm border border-slate-100 text-blue-500 flex-shrink-0">
                                  <Share size={24} />
                                </div>
                                <div>
                                  <div className="font-semibold text-sm">Paso 1</div>
                                  <div className="text-slate-600 text-xs">Toca el botón <strong>Compartir</strong> en la barra inferior de Safari.</div>
                                </div>
                              </div>
                              <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <div className="bg-white p-2.5 rounded-xl shadow-sm border border-slate-100 text-slate-700 flex-shrink-0">
                                  <PlusSquare size={24} />
                                </div>
                                <div>
                                  <div className="font-semibold text-sm">Paso 2</div>
                                  <div className="text-slate-600 text-xs">Desliza hacia abajo y selecciona <strong>Agregar a Inicio</strong>.</div>
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <div className="bg-white p-2.5 rounded-xl shadow-sm border border-slate-100 text-slate-700 flex-shrink-0">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" /></svg>
                                </div>
                                <div>
                                  <div className="font-semibold text-sm">Paso 1</div>
                                  <div className="text-slate-600 text-xs">Toca el botón de <strong>Menú (3 puntos)</strong> arriba a la derecha en Chrome.</div>
                                </div>
                              </div>
                              <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <div className="bg-white p-2.5 rounded-xl shadow-sm border border-slate-100 text-slate-700 flex-shrink-0">
                                  <PlusSquare size={24} />
                                </div>
                                <div>
                                  <div className="font-semibold text-sm">Paso 2</div>
                                  <div className="text-slate-600 text-xs">Selecciona <strong>Agregar a la pantalla principal</strong>.</div>
                                </div>
                              </div>
                            </>
                          )}
                        </div>

                        <button
                          onClick={() => setShowInstallModal(false)}
                          className="w-full mt-6 bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 rounded-xl transition shadow-lg"
                        >
                          Entendido
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="h-4"></div> {/* Bottom spacer */}
            </div>
          )}

          {/* ========================= */}
          {/*   HERRAMIENTAS ADMIN      */}
          {/* ========================= */}
          {!isOnboarding && profile && isSuperAdmin(profile) && (
            <div className="mt-8 p-4 bg-slate-100 rounded-2xl border border-slate-200">
              <h3 className="text-sm font-bold text-slate-600 mb-3 flex items-center gap-1.5">
                <span>🛠</span> Herramientas Admin
              </h3>
              <Link
                href="/admin/push-test"
                className="flex items-center justify-between px-4 py-3 bg-white rounded-xl shadow-sm border border-slate-100 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <span>🧪 Push & Badge Diagnostics</span>
                <ChevronRight size={16} className="text-slate-400" />
              </Link>
            </div>
          )}

          {/* ========================= */}
          {/*     ZONA DE PELIGRO       */}
          {/* ========================= */}
          {!isOnboarding && (
            <div className="mt-8 mb-4 border-t border-red-100 pt-8 text-center">
              <button
                onClick={() => {
                  setShowDeleteConfirm(true);
                  setDeleteConfirmationText("");
                }}
                className="text-xs font-bold text-red-500 hover:text-red-700 underline underline-offset-2 transition-colors"
              >
                Eliminar mi cuenta y todos mis datos
              </button>
            </div>
          )}

          {/* Delete Account Modal */}
          {showDeleteConfirm && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
              <div className="bg-white text-slate-900 rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl relative animate-in zoom-in-95 duration-200">
                <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl shadow-sm">
                  ⚠️
                </div>
                <h3 className="text-xl font-black mb-2 text-slate-800">¿Eliminar cuenta?</h3>
                <p className="text-sm text-slate-500 mb-6 font-medium">
                  Esta acción es permanente. Tu historial de partidos, estadísticas y nivel serán borrados de nuestros servidores (Ley Habeas Data).
                </p>
                <div className="mb-6 text-left">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                    Escriba &quot;ELIMINAR&quot; para confirmar:
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmationText}
                    onChange={(e) => setDeleteConfirmationText(e.target.value.toUpperCase())}
                    placeholder="ELIMINAR"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all"
                  />
                </div>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deletingAccount || deleteConfirmationText !== "ELIMINAR"}
                    className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3.5 rounded-xl shadow-md transition-all disabled:opacity-50 flex justify-center items-center"
                  >
                    {deletingAccount ? (
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    ) : (
                      "Sí, eliminar todo"
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setDeleteConfirmationText("");
                    }}
                    disabled={deletingAccount}
                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 rounded-xl transition-colors disabled:opacity-50"
                  >
                    Mantener mi cuenta
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </AuthGuard>
  );
}
