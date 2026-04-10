"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useAuth } from "@/lib/AuthContext";
import { enablePushNotifications } from "@/lib/push";
import { updateUserPositions, updateUserName, updatePlayerAttributes, requestReEvaluation, deleteUser, updateUserPhoto } from "@/lib/users";
import { uploadAvatarBothSizes } from "@/lib/storage";
import { generateAvatarSizes, type AvatarBlobs } from "@/lib/avatarProcessing";
import { deleteUser as deleteAuthUser, updateProfile } from "firebase/auth";
import { useRouter } from "next/navigation";
import type { Position } from "@/lib/domain/player";
import { ALLOWED_POSITIONS, POSITION_LABELS, POSITION_ICONS } from "@/lib/domain/player";
import type { UserStats } from "@/lib/domain/user";
import type { Sex, Foot, CourtSize } from "@/lib/domain/rating";
import { handleError } from "@/lib/utils/error";
import Link from "next/link";
import { isSuperAdmin, isAdmin } from "@/lib/domain/user";
import { getMyApplication } from "@/lib/teamAdminApplications";
import type { TeamAdminApplication } from "@/lib/domain/teamAdminApplication";
import AuthGuard from "@/components/AuthGuard";
import StatsCard from "@/components/StatsCard";
import FifaPlayerCard from "@/components/FifaPlayerCard";
import ProfileSkeleton from "@/components/skeletons/ProfileSkeleton";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import {
  X, Share, PlusSquare, ChevronRight, FileUser, Pencil,
  Cake, User, Activity, RotateCcw, Camera, Crown,
  Shirt, Clock, Lock, XCircle, Bell, CheckCircle2,
  AlertTriangle, Smartphone, Settings,
  Zap, Flame, Sprout
} from "lucide-react";
import Image from "next/image";
import Cropper from "react-easy-crop";
import { logStatsViewed, logApplyCTAClicked, logPWAInstallClicked } from "@/lib/analytics";

const FOOT_LABELS: Record<string, string> = { left: "Izquierdo", right: "Derecho", ambidextrous: "Ambidiestro" };
const SEX_LABELS: Record<string, string> = { male: "M", female: "F", other: "Otro" };
const LEVEL_LABELS = ["", "Básico", "Intermedio", "Avanzado"];
const LEVEL_ICONS = [null, Sprout, Zap, Flame];

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
  const [editPhotoBlobs, setEditPhotoBlobs] = useState<AvatarBlobs | null>(null);

  // Cropper states
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [processingCrop, setProcessingCrop] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<{ width: number, height: number, x: number, y: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Team admin application
  const [myApplication, setMyApplication] = useState<TeamAdminApplication | null>(null);

  // Push notifications
  const [enablingPush, setEnablingPush] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | "unsupported">("default");

  // Derived
  const isOnboarding = positions.length === 0;
  // Push state: "active" | "blocked" | "inactive"
  const pushState = pushEnabled && browserPermission === "granted"
    ? "active"
    : pushEnabled && browserPermission === "denied"
      ? "blocked"
      : "inactive";

  useEffect(() => {
    if (!profile) return;

    // Sincronizar estado local con el perfil global
    if (profile.positions) setPositions(profile.positions);
    if (profile.primaryPosition) setPrimaryPosition(profile.primaryPosition);
    if (profile.notificationsEnabled) setPushEnabled(true);
    // Sync browser permission state
    if (typeof window !== "undefined" && "Notification" in window) {
      setBrowserPermission(Notification.permission);
    } else {
      setBrowserPermission("unsupported");
    }
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
      logStatsViewed();
    }
    if (profile.level != null) setLevel(profile.level);
    if (profile.onboardingCompletedAt) setOnboardingCompletedAt(profile.onboardingCompletedAt);
    if (profile.age != null) setAge(profile.age);
    if (profile.sex) setSex(profile.sex as Sex);
    if (profile.dominantFoot) setDominantFoot(profile.dominantFoot);
    if (profile.preferredCourt) setPreferredCourt(profile.preferredCourt);
    setLoading(false);

    // Cargar solicitud de team admin (solo si no es admin)
    if (user && !isAdmin(profile)) {
      getMyApplication(user.uid)
        .then((app) => setMyApplication(app))
        .catch(() => {/* silencioso */ });
    }

  }, [profile, user]);


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

  // Live preview profile for FIFA card during editing
  const previewProfile = useMemo(() => {
    if (!editing || !profile) return profile;
    return {
      ...profile,
      name: editName || profile.name,
      positions: editPositions as Position[],
      primaryPosition: (editPrimaryPosition as Position) || profile.primaryPosition,
      dominantFoot: editFoot ?? profile.dominantFoot,
      preferredCourt: editCourt ?? profile.preferredCourt,
      photoURL: editPhotoBlobs?.large || profile.photoURL,
    };
  }, [editing, profile, editName, editPositions, editPrimaryPosition, editFoot, editCourt, editPhotoBlobs]);

  function startEditing() {
    setEditName(displayName);
    setEditPositions([...positions]);
    setEditPrimaryPosition(primaryPosition);
    setEditFoot(dominantFoot);
    setEditCourt(preferredCourt);
    setEditPhotoBlobs(null);
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

    setOriginalFile(file);

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
    if (!originalFile || !croppedAreaPixels) return;
    setProcessingCrop(true);
    try {
      const blobs = await generateAvatarSizes(originalFile, croppedAreaPixels);
      setEditPhotoBlobs(blobs);
      setImageSrc(null);
      setOriginalFile(null);
    } finally {
      setProcessingCrop(false);
    }
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

      if (editPhotoBlobs) {
        const { largeURL, thumbURL } = await uploadAvatarBothSizes(user.uid, editPhotoBlobs);
        await updateUserPhoto(user.uid, largeURL, thumbURL);
        await updateProfile(user, { photoURL: largeURL });
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
      // 3. Redirigir a landing explícitamente (evita que AuthGuard redirija a onboarding)
      router.replace("/");
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
          router.replace("/");
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
      <main className="min-h-screen bg-slate-50 pb-24 md:pb-8 animate-in fade-in duration-150">
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
                disabled={processingCrop}
                className="bg-white text-black font-bold text-sm px-5 py-2 rounded-full hover:bg-slate-200 shadow-xl transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {processingCrop ? "Procesando..." : "Hecho"}
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
                <FileUser className="w-5 h-5 text-slate-600" /> Ficha Técnica
              </h2>
              {!isOnboarding && !editing && (
                <button
                  onClick={startEditing}
                  className="flex items-center gap-1 text-sm font-semibold text-[#1f7a4f] hover:text-[#16603c] transition-colors whitespace-nowrap"
                >
                  <Pencil className="w-3.5 h-3.5" /> Editar
                </button>
              )}
            </div>

            <div className="px-5 pt-2 pb-5">
              {saved && (
                <div className="mb-3 bg-emerald-50 text-[#1f7a4f] text-sm font-semibold px-3 py-2 rounded-lg text-center border border-emerald-100 animate-fade-in">
                  ✅ Cambios guardados
                </div>
              )}

              {/* FIFA Player Card — always visible */}
              {profile && (
                <div className="flex justify-center mb-4 mt-0">
                  <FifaPlayerCard profile={editing ? previewProfile! : profile} animated={false} />
                </div>
              )}

              {/* =================== */}
              {/*     VIEW MODE       */}
              {/* =================== */}
              {!editing ? (
                <div className="space-y-1">
                  {(age != null || sex || preferredCourt || level != null) && (
                    <div className="flex flex-wrap justify-center gap-2 mb-2 mt-1">
                      {age != null && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-white border border-slate-200 shadow-sm">
                          <Cake className="w-3.5 h-3.5 text-pink-500" />
                          <span className="text-slate-400 font-medium">Edad</span>
                          <span className="font-bold text-slate-700">{age} años</span>
                        </span>
                      )}
                      {sex && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-white border border-slate-200 shadow-sm">
                          <User className="w-3.5 h-3.5 text-blue-500" />
                          <span className="text-slate-400 font-medium">Sexo</span>
                          <span className="font-bold text-slate-700">{SEX_LABELS[sex] || sex}</span>
                        </span>
                      )}
                      {preferredCourt && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-white border border-slate-200 shadow-sm">
                          <Activity className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-slate-400 font-medium">Cancha</span>
                          <span className="font-bold text-slate-700">{preferredCourt}</span>
                        </span>
                      )}
                      {level != null && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-emerald-50 border border-emerald-200 shadow-sm">
                          {(() => {
                            const Icon = LEVEL_ICONS[level];
                            return Icon ? <Icon className="w-3.5 h-3.5 text-amber-500" /> : null;
                          })()}
                          <span className="text-emerald-600 font-medium">Nivel</span>
                          <span className="font-bold text-emerald-800">{level} — {LEVEL_LABELS[level]}</span>
                        </span>
                      )}
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
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-700 text-xs font-bold hover:bg-amber-100 transition-colors disabled:opacity-50"
                        >
                          {requestingReeval ? (
                            <span className="w-3.5 h-3.5 border-2 border-amber-400/40 border-t-amber-600 rounded-full animate-spin" />
                          ) : (
                            <RotateCcw className="w-3.5 h-3.5" />
                          )}
                          {requestingReeval ? "Redirigiendo..." : "Nueva autoevaluación"}
                        </button>
                      ) : (
                        <p className="text-[10px] text-slate-400 flex items-center justify-center gap-1.5">
                          <Lock className="w-3 h-3" /> Nueva autoevaluación disponible el {reevalUnlockDate}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* =================== */
                /*     EDIT MODE       */
                /* =================== */
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {/* Photo + Name row */}
                  <div className="flex items-center gap-3">
                    <div
                      className="relative w-16 h-16 rounded-full border-2 border-slate-100 shadow-sm overflow-hidden bg-slate-50 flex-shrink-0 group cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Image
                        src={editPhotoBlobs?.thumb || profile?.photoURLThumb || profile?.photoURL || "https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png"}
                        alt="Editar foto"
                        fill
                        className="object-cover transition-opacity group-hover:opacity-50"
                        sizes="96px"
                        unoptimized
                      />
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center pointer-events-none">
                        <Camera className="w-5 h-5 text-white/80 drop-shadow-sm" />
                      </div>
                    </div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="image/jpeg, image/png, image/webp"
                      onChange={handleImageChange}
                    />
                    <div className="flex-1 min-w-0">
                      {canEditName ? (
                        <div>
                          <input
                            type="text"
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            placeholder="Nombre y Apellido"
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#1f7a4f] transition-all"
                          />
                          {editName.trim().length > 0 &&
                            (editName.trim().split(/\s+/).length < 2 || editName.trim().split(/\s+/).some(word => word.length < 2)) && (
                              <p className="text-red-500 text-[10px] mt-1 font-medium">Nombre y apellido requeridos</p>
                            )}
                        </div>
                      ) : (
                        <div className="flex items-center justify-between px-3 py-2 bg-slate-100 rounded-xl border border-slate-200">
                          <span className="text-sm font-medium text-slate-400 truncate">🔒 {displayName}</span>
                          <span className="text-[10px] text-slate-400/70 flex-shrink-0 ml-2">Cambio disponible el {nameUnlockDate}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Positions */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">
                      Posiciones <span className="font-normal normal-case opacity-70">· máx. 3 · toca para hacer principal 👑</span>
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {ALLOWED_POSITIONS.map((pos: Position) => {
                        const sel = editPositions.includes(pos);
                        const isPrimary = editPrimaryPosition === pos;

                        return (
                          <button
                            key={pos}
                            onClick={() => {
                              if (sel) {
                                if (isPrimary) {
                                  const newPos = editPositions.filter(p => p !== pos);
                                  setEditPositions(newPos);
                                  setEditPrimaryPosition(newPos.length > 0 ? newPos[0] : null);
                                } else {
                                  setEditPrimaryPosition(pos);
                                }
                              } else {
                                const newPos = [...editPositions];
                                if (newPos.length >= 3) {
                                  const idxToRemove = newPos.findIndex(p => p !== editPrimaryPosition);
                                  if (idxToRemove !== -1) newPos.splice(idxToRemove, 1);
                                  else newPos.shift();
                                }
                                newPos.push(pos);
                                setEditPositions(newPos);
                                if (newPos.length === 1 || !editPrimaryPosition) setEditPrimaryPosition(pos);
                              }
                            }}
                            className={`relative flex flex-col items-center gap-0.5 py-2 rounded-xl text-xs font-bold transition-all border ${sel
                              ? isPrimary
                                ? "bg-[#1f7a4f] border-[#16603c] text-white shadow-md ring-2 ring-[#1f7a4f]"
                                : "bg-emerald-100/50 border-emerald-800 text-emerald-800"
                              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                              }`}
                          >
                            {isPrimary && (
                              <div className="absolute -top-1.5 -right-1.5 bg-white text-amber-500 rounded-full w-5 h-5 flex items-center justify-center shadow border border-amber-300 z-10 animate-in zoom-in-50 duration-200">
                                <Crown className="w-3 h-3" />
                              </div>
                            )}
                            <span className="text-base">{POSITION_ICONS[pos]}</span>
                            <span className="text-[10px]">{POSITION_LABELS[pos]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Foot + Court side by side */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Pie</label>
                      <div className="flex bg-slate-100 p-0.5 rounded-lg">
                        {(["left", "right", "ambidextrous"] as Foot[]).map(f => {
                          const active = editFoot === f;
                          return (
                            <button
                              key={f}
                              onClick={() => setEditFoot(f)}
                              className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all ${active ? "bg-white text-[#1f7a4f] shadow-sm" : "text-slate-500"}`}
                            >
                              {FOOT_LABELS[f]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Cancha</label>
                      <div className="flex bg-slate-100 p-0.5 rounded-lg">
                        {(["6v6", "9v9", "11v11"] as CourtSize[]).map(c => {
                          const active = editCourt === c;
                          return (
                            <button
                              key={c}
                              onClick={() => setEditCourt(c)}
                              className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all ${active ? "bg-white text-[#1f7a4f] shadow-sm" : "text-slate-500"}`}
                            >
                              {c}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-1">
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
          {/*      ESTADÍSTICAS       */}
          {/* ========================= */}
          {!isOnboarding && <StatsCard stats={stats} mvpAwards={profile.mvpAwards} />}

          {/* ========================= */}
          {/*   TEAM ADMIN APPLICATION  */}
          {/* ========================= */}
          {!isOnboarding && !isAdmin(profile) && (
            <div className="mb-4">
              {!myApplication && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Shirt className="w-6 h-6 text-emerald-500" />
                    <div>
                      <p className="text-sm font-bold text-slate-800">¿Organizas partidos?</p>
                      <p className="text-xs text-slate-500">Aplica para ser Team Admin y gestiona tu grupo desde la app</p>
                    </div>
                  </div>
                  <Link
                    href="/apply"
                    onClick={() => logApplyCTAClicked()}
                    className="flex items-center gap-1 text-emerald-600 hover:text-emerald-500 font-semibold text-sm transition-colors flex-shrink-0"
                  >
                    Ver más <ChevronRight size={16} />
                  </Link>
                </div>
              )}
              {myApplication?.status === "pending" && (
                <div className="bg-white rounded-2xl shadow-sm border border-yellow-200 p-5 flex items-center gap-3">
                  <Clock className="w-6 h-6 text-amber-500" />
                  <div>
                    <p className="text-sm font-bold text-slate-800">Solicitud enviada</p>
                    <p className="text-xs text-yellow-600 font-medium">En revisión — te avisamos pronto</p>
                  </div>
                </div>
              )}
              {myApplication?.status === "rejected" && (
                <div className="bg-white rounded-2xl shadow-sm border border-red-200 p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <XCircle className="w-6 h-6 text-red-500" />
                    <div>
                      <p className="text-sm font-bold text-slate-800">Solicitud no aprobada</p>
                      {myApplication.rejectionReason && (
                        <p className="text-xs text-red-500">{myApplication.rejectionReason}</p>
                      )}
                    </div>
                  </div>
                  <Link
                    href="/apply"
                    onClick={() => logApplyCTAClicked()}
                    className="block w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl text-center transition-colors"
                  >
                    Volver a aplicar
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* ========================= */}
          {/*     CTA + NOTIFICATIONS   */}
          {/* ========================= */}
          {!isOnboarding && positions.length > 0 && (
            <div className="space-y-0">
              {/* Notifications + Install — merged card */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6 p-5 space-y-4">

                {/* — Notifications row — */}
                <div className="flex items-center gap-3">
                  <Bell className="w-6 h-6 text-[#1f7a4f]" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800">Notificaciones</p>
                    {pushState === "active" && (
                      <p className="text-xs text-emerald-600 font-medium">Activas — recibirás alertas de cupos</p>
                    )}
                    {pushState === "blocked" && (
                      <p className="text-xs text-amber-600 font-medium">Permisos bloqueados en tu navegador</p>
                    )}
                    {pushState === "inactive" && (
                      <p className="text-xs text-slate-500">Actívalas para no perderte ningún partido</p>
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
                      onClick={async () => {
                        if (!user) return;
                        setEnablingPush(true);
                        try {
                          const token = await enablePushNotifications(user.uid);
                          if (token) {
                            setPushEnabled(true);
                            setBrowserPermission("granted");
                          } else if (typeof Notification !== "undefined" && Notification.permission === "denied") {
                            setBrowserPermission("denied");
                          }
                        } catch (err) {
                          handleError(err, "No pudimos activar las notificaciones");
                        } finally {
                          setEnablingPush(false);
                        }
                      }}
                      disabled={enablingPush}
                      className="flex-shrink-0 bg-[#1f7a4f] text-white text-xs font-bold px-3 py-2 rounded-xl hover:bg-[#16603c] transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {enablingPush ? (
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : "Activar"}
                    </button>
                  )}
                </div>

                {/* — Divider — */}
                {canInstall && <div className="border-t border-slate-100" />}

                {/* — Install row — */}
                {canInstall && (
                  <div className="flex items-center gap-3">
                    <Smartphone className="w-6 h-6 text-slate-600" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800">Instalar App</p>
                      <p className="text-xs text-slate-500">Acceso rápido desde la pantalla de inicio</p>
                    </div>
                    <button
                      onClick={async () => {
                        logPWAInstallClicked();
                        if (isIOS) {
                          setShowInstallModal(true);
                        } else {
                          const result = await promptToInstall();
                          if (!result.success && isAndroid) {
                            setShowInstallModal(true);
                          }
                        }
                      }}
                      className="flex-shrink-0 bg-slate-900 text-white text-xs font-bold px-3 py-2 rounded-xl hover:bg-slate-800 transition-colors"
                    >
                      Instalar
                    </button>
                  </div>
                )}
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

              <div className="h-4"></div>
            </div>
          )}

          {/* ========================= */}
          {/*   HERRAMIENTAS ADMIN      */}
          {/* ========================= */}
          {!isOnboarding && profile && isSuperAdmin(profile) && (
            <div className="mt-8 p-4 bg-slate-100 rounded-2xl border border-slate-200">
              <h3 className="text-sm font-bold text-slate-600 mb-3 flex items-center gap-1.5">
                <Settings className="w-4 h-4" /> Herramientas Admin
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
                  <AlertTriangle className="w-8 h-8" />
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
