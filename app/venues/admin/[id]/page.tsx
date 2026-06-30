"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, Save, Loader2, CalendarPlus, X, CalendarDays, Receipt, LayoutGrid, Clock, CreditCard, Ban, Store, Image as ImageIcon, Inbox, AlertTriangle, RefreshCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-hot-toast";
import { useAuth } from "@/lib/AuthContext";
import { isSuperAdmin, isLocationAdmin } from "@/lib/domain/user";
import { MIN_DEPOSIT_PERCENT, MAX_DEPOSIT_PERCENT, DAY_OF_WEEK_ORDER } from "@/lib/domain/venue";
import { formatCOP } from "@/lib/domain/wallet";
import {
    getVenue,
    getVenueCourts,
    getVenueCombos,
    getVenueFullSchedule,
    updateVenueSettings,
    updatePaymentMethods,
    saveVenueCourts,
    saveVenueCombos,
    saveVenueFullSchedule,
    subscribeDailyPayments,
} from "@/lib/venues";
import { uploadVenueImage } from "@/lib/storage";
import { handleError } from "@/lib/utils/error";
import { withTimeout } from "@/lib/utils/withTimeout";
import { logVenueAdminCourtConfigured, logVenueAdminScheduleUpdated } from "@/lib/analytics";
import AuthGuard from "@/components/AuthGuard";
import CourtConfigEditor from "@/components/booking/CourtConfigEditor";
import ScheduleEditor from "@/components/booking/ScheduleEditor";
import VenueFormatEditor from "@/components/booking/VenueFormatEditor";
import AdminBookingCalendar from "@/components/booking/AdminBookingCalendar";
import AdminSlotPicker from "@/components/booking/AdminSlotPicker";
import BlockedSlotsEditor from "@/components/booking/BlockedSlotsEditor";
import BlockedSlotForm from "@/components/booking/BlockedSlotForm";
import CancelBookingSheet from "@/components/booking/CancelBookingSheet";
import DeleteBlockedSlotSheet from "@/components/booking/DeleteBlockedSlotSheet";
import CancelManualReservationSheet from "@/components/booking/CancelManualReservationSheet";
import EditManualReservationSheet from "@/components/booking/EditManualReservationSheet";
import RegisterPaymentSheet from "@/components/booking/RegisterPaymentSheet";
import PaymentMethodEditor from "@/components/booking/PaymentMethodEditor";
import PendingBookingsAdminView from "@/components/booking/PendingBookingsAdminView";
import ConfirmAttendanceSheet from "@/components/booking/ConfirmAttendanceSheet";
import DailyBalanceView from "@/components/booking/DailyBalanceView";
import HourDetailDrawer from "@/components/booking/HourDetailDrawer";
import { updateManualReservationStatus } from "@/lib/venues";
import { cancelBooking, advanceBookingStatus, subscribeToAllBookingsForDate, SLOT_BLOCKING_BOOKING_STATUSES } from "@/lib/bookings";
import { getBlockedSlotStatus, getNextStatus } from "@/lib/domain/venue";
import {
    logBookingCancelled,
    logBookingCancellationStarted,
    logAdminHourDetailOpened,
    logAdminHourDetailCreateClicked,
    logManualReservationStatusChanged,
} from "@/lib/analytics";
import type { Venue, Court, CourtCombo, DaySchedule, DayOfWeek, BlockedSlot, ManualReservationStatus, ManualReservationPayment, VenueFormat, PaymentMethod } from "@/lib/domain/venue";
import { DEFAULT_PENDING_APPROVAL_TTL_HOURS, MIN_PENDING_APPROVAL_TTL_HOURS, MAX_PENDING_APPROVAL_TTL_HOURS } from "@/lib/domain/booking";
import type { Booking } from "@/lib/domain/booking";

type AdminTab = "info" | "courts" | "schedule" | "payments" | "blocked" | "bookings" | "pending" | "balance";

const TAB_LABELS: Record<AdminTab, string> = {
    info: "Sede",
    courts: "Canchas",
    schedule: "Horarios",
    payments: "Pagos",
    blocked: "Bloqueos",
    bookings: "Reservas",
    pending: "Pendientes",
    balance: "Balance",
};

const TAB_ICONS: Record<AdminTab, LucideIcon> = {
    info: Store,
    courts: LayoutGrid,
    schedule: Clock,
    payments: CreditCard,
    blocked: Ban,
    bookings: CalendarDays,
    pending: Inbox,
    balance: Receipt,
};

const ALL_ADMIN_TABS: AdminTab[] = ["info", "courts", "schedule", "payments", "blocked", "bookings", "pending", "balance"];

function isValidAdminTab(value: string | null | undefined): value is AdminTab {
    return !!value && (ALL_ADMIN_TABS as string[]).includes(value);
}

function VenueAdminContent() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { profile, user } = useAuth();
    const venueId = params.id as string;

    // Data state
    const [venue, setVenue] = useState<Venue | null>(null);
    const [courts, setCourts] = useState<Court[]>([]);
    const [combos, setCombos] = useState<CourtCombo[]>([]);
    const [schedules, setSchedules] = useState<DaySchedule[]>([]);
    const [venueFormats, setVenueFormats] = useState<VenueFormat[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [saving, setSaving] = useState(false);

    // Payment settings
    const [depositRequired, setDepositRequired] = useState(false);
    const [depositPercent, setDepositPercent] = useState(30);
    const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
    const [paymentMethodsDirty, setPaymentMethodsDirty] = useState(false);
    const [pendingTTLHours, setPendingTTLHours] = useState<number>(DEFAULT_PENDING_APPROVAL_TTL_HOURS);
    const [whatsappNumber, setWhatsappNumber] = useState<string>("");

    // Venue info (tab "info", super admin only)
    const [venueName, setVenueName] = useState("");
    const [venueAddress, setVenueAddress] = useState("");
    const [venuePhone, setVenuePhone] = useState("");
    const [venueDescription, setVenueDescription] = useState("");
    const [venueImageURL, setVenueImageURL] = useState("");
    const [venueIcon, setVenueIcon] = useState("");
    const [venueActive, setVenueActive] = useState(true);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [uploadingImage, setUploadingImage] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Role gating
    const isSuper = profile ? isSuperAdmin(profile) : false;
    const visibleTabs: AdminTab[] = isSuper
        ? ["info", "courts", "schedule", "payments", "blocked", "bookings", "pending", "balance"]
        : ["bookings", "pending", "balance"];

    // Active tab. Si la URL trae ?tab=pending (deep-link desde notificación push),
    // arrancamos en ese tab. Si no, default según rol.
    const queryTab = searchParams?.get("tab");
    const initialTab: AdminTab = isValidAdminTab(queryTab) && visibleTabs.includes(queryTab)
        ? queryTab
        : (isSuper ? "info" : "bookings");
    const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);

    // Re-sincroniza el tab si el query param cambia mientras la página ya está
    // montada (caso: notificación llega con app abierta en /venues/admin/[id]).
    useEffect(() => {
        if (isValidAdminTab(queryTab) && visibleTabs.includes(queryTab) && queryTab !== activeTab) {
            setActiveTab(queryTab);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queryTab]);

    // Blocked slots drawer (location admins access blocks from bookings tab)
    const [blockedDrawerOpen, setBlockedDrawerOpen] = useState(false);
    const [drawerDefaults, setDrawerDefaults] = useState<{
        date?: string;
        startTime?: string;
        endTime?: string;
        courtIds?: string[];
        format?: string;
        occupiedCourtIds?: string[];
    }>({});

    // Hour detail drawer (vista por hora → tap en una hora)
    const [hourDetail, setHourDetail] = useState<{
        date: string;
        startTime: string;
        endTime: string;
        format: string;
        courtIds: string[];
        bookings: Booking[];
        blocks: BlockedSlot[];
        relevantCourtIds: string[];
        unavailableRelevantCourtIds: string[];
    } | null>(null);

    // Bookings sub-view: monthly calendar vs hourly slot picker
    const [bookingsView, setBookingsView] = useState<"calendar" | "hourly">("hourly");

    // Cancel booking sheet (admin cancels player's booking)
    const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);

    // Confirm attendance sheet (deposit_confirmed → confirmed)
    const [confirmAttendanceTarget, setConfirmAttendanceTarget] = useState<Booking | null>(null);

    // Register payment sheet for player bookings (played → paid).
    // Cuando es booking, generamos un slot sintético para reusar RegisterPaymentSheet.
    const [bookingPaymentTarget, setBookingPaymentTarget] = useState<{ booking: Booking; existingPayment: ManualReservationPayment | null } | null>(null);

    // Delete block sheet (super admin hard delete)
    const [deleteTarget, setDeleteTarget] = useState<{ slot: BlockedSlot; targetDate: string } | null>(null);

    // Cancel manual reservation sheet
    const [cancelManualTarget, setCancelManualTarget] = useState<{ slot: BlockedSlot; targetDate: string } | null>(null);

    // Edit manual reservation sheet
    const [editManualTarget, setEditManualTarget] = useState<BlockedSlot | null>(null);

    // Payments del día actualmente abierto en HourDetailDrawer (subscripción reactiva).
    const [drawerPayments, setDrawerPayments] = useState<ManualReservationPayment[]>([]);

    // Register payment sheet (registrar / editar pago)
    const [paymentTarget, setPaymentTarget] = useState<{
        slot: BlockedSlot;
        targetDate: string;
        existingPayment: ManualReservationPayment | null;
    } | null>(null);

    // Suscripción a pagos del día abierto en el drawer. Solo activo cuando hay drawer.
    useEffect(() => {
        if (!hourDetail) {
            setDrawerPayments([]);
            return;
        }
        const unsub = subscribeDailyPayments(venueId, hourDetail.date, setDrawerPayments);
        return () => unsub();
    }, [venueId, hourDetail]);

    // Suscripción a bookings del día mientras el drawer está abierto: mantiene
    // hourDetail.bookings sincronizado en tiempo real (evita stale state que
    // permite re-clicks sobre acciones ya ejecutadas — ej. "Confirmar asistencia"
    // dos veces porque la primera no refrescó el estado del booking).
    const hourDate = hourDetail?.date;
    const hourStart = hourDetail?.startTime;
    const hourEnd = hourDetail?.endTime;
    useEffect(() => {
        if (!hourDate || !hourStart || !hourEnd) return;
        // Usamos `subscribeToAllBookingsForDate` (sin filtro de status) para que el
        // drawer muestre histórico completo del día (no_show, paid, cancelled, etc.).
        const unsub = subscribeToAllBookingsForDate(venueId, hourDate, (all) => {
            const overlapping = all.filter(
                (b) => b.startTime < hourEnd && b.endTime > hourStart,
            );
            setHourDetail((prev) =>
                prev && prev.date === hourDate && prev.startTime === hourStart && prev.endTime === hourEnd
                    ? { ...prev, bookings: overlapping }
                    : prev,
            );
        });
        return () => unsub();
    }, [venueId, hourDate, hourStart, hourEnd]);

    const handleRegisterPayment = useCallback(
        (slot: BlockedSlot, targetDate: string, existingPayment: ManualReservationPayment | null) => {
            setPaymentTarget({ slot, targetDate, existingPayment });
        },
        [],
    );

    // Optimistic update del status en hourDetail (snapshot, no escucha realtime).
    // instanceDate: si se pasa, actualiza el override de esa instancia (recurrentes).
    const patchHourDetailBlockStatus = useCallback((slotId: string, newStatus: ManualReservationStatus, instanceDate?: string) => {
        setHourDetail((prev) => {
            if (!prev) return prev;
            const next = prev.blocks.map((b) => {
                if (b.id !== slotId) return b;
                if (instanceDate) {
                    return { ...b, statusOverrides: { ...(b.statusOverrides ?? {}), [instanceDate]: newStatus } };
                }
                return { ...b, status: newStatus };
            });
            return { ...prev, blocks: next };
        });
    }, []);

    const handleAdvanceBlockStatus = useCallback(async (slot: BlockedSlot, targetDate: string) => {
        const instanceDate = slot.recurrence ? targetDate : undefined;
        const current = getBlockedSlotStatus(slot, instanceDate);
        const next = getNextStatus(current);
        if (!next) return;
        // Optimistic: actualizar UI inmediatamente
        patchHourDetailBlockStatus(slot.id, next, instanceDate);
        try {
            await updateManualReservationStatus(venueId, slot.id, next, instanceDate);
            logManualReservationStatusChanged({
                venueId,
                slotId: slot.id,
                fromStatus: current,
                toStatus: next,
                via: "quick",
            });
        } catch (err) {
            // Revertir en caso de error
            patchHourDetailBlockStatus(slot.id, current, instanceDate);
            handleError(err, "No pudimos actualizar el estado");
        }
    }, [venueId, patchHourDetailBlockStatus]);

    const handlePickBlockStatus = useCallback(async (slot: BlockedSlot, newStatus: ManualReservationStatus, targetDate: string) => {
        const instanceDate = slot.recurrence ? targetDate : undefined;
        const current = getBlockedSlotStatus(slot, instanceDate);
        if (current === newStatus) return;
        // Optimistic
        patchHourDetailBlockStatus(slot.id, newStatus, instanceDate);
        try {
            await updateManualReservationStatus(venueId, slot.id, newStatus, instanceDate);
            logManualReservationStatusChanged({
                venueId,
                slotId: slot.id,
                fromStatus: current,
                toStatus: newStatus,
                via: "popover",
            });
        } catch (err) {
            patchHourDetailBlockStatus(slot.id, current, instanceDate);
            handleError(err, "No pudimos actualizar el estado");
        }
    }, [venueId, patchHourDetailBlockStatus]);

    const handleCancelBlock = useCallback((slot: BlockedSlot, targetDate: string) => {
        setCancelManualTarget({ slot, targetDate });
    }, []);

    const handleEditBlock = useCallback((slot: BlockedSlot) => {
        setEditManualTarget(slot);
    }, []);

    const handleAdminCancelBooking = useCallback(async (reason: string) => {
        if (!cancelTarget) return;
        try {
            const result = await cancelBooking(cancelTarget.id, reason);
            const slotMs = new Date(`${cancelTarget.date}T${cancelTarget.startTime}:00`).getTime();
            const hoursBeforeStart = Math.max(0, Math.round((slotMs - Date.now()) / (1000 * 60 * 60)));
            logBookingCancelled({
                venueId: cancelTarget.venueId,
                bookingId: cancelTarget.id,
                refunded: result.refunded,
                hoursBeforeStart,
                actorRole: "admin",
                reasonLength: reason.length,
            });
            toast.success(result.refunded
                ? `Reserva cancelada · Reembolso de ${formatCOP(result.refundAmount)} al cliente`
                : "Reserva cancelada");
            setCancelTarget(null);
        } catch (err) {
            handleError(err, "Error al cancelar la reserva");
            throw err;
        }
    }, [cancelTarget]);

    // Dirty tracking
    const [dirty, setDirty] = useState(false);

    // Load venue data
    const loadData = useCallback(async () => {
        if (!venueId) return;
        setLoading(true);
        setLoadError(false);
        try {
            // withTimeout: si alguno de los getDocs se cuelga (iOS suspende Firestore),
            // no dejamos el skeleton colgado para siempre — cae al estado de error.
            const [v, c, co, sched] = await withTimeout(Promise.all([
                getVenue(venueId),
                getVenueCourts(venueId),
                getVenueCombos(venueId),
                getVenueFullSchedule(venueId),
            ]));

            if (!v) {
                toast.error("Sede no encontrada");
                router.replace("/venues");
                return;
            }

            setVenue(v);
            setCourts(c);
            setCombos(co);
            setSchedules(sched);
            setVenueFormats(v.formats ?? []);
            setDepositRequired(v.depositRequired);
            setDepositPercent(v.depositPercent);
            setPaymentMethods(v.paymentMethods ?? []);
            setPaymentMethodsDirty(false);
            setPendingTTLHours(
                typeof v.pendingApprovalTTLHours === "number"
                    ? v.pendingApprovalTTLHours
                    : DEFAULT_PENDING_APPROVAL_TTL_HOURS,
            );
            setWhatsappNumber(v.whatsappNotificationNumber ?? "");
            setVenueName(v.name ?? "");
            setVenueAddress(v.address ?? "");
            setVenuePhone(v.phone ?? "");
            setVenueDescription(v.description ?? "");
            setVenueImageURL(v.imageURL ?? "");
            setVenueIcon(v.icon ?? "");
            setVenueActive(v.active);
            setImagePreview(null);
        } catch (err) {
            setLoadError(true);
            handleError(err, "Error al cargar datos de la sede");
        } finally {
            setLoading(false);
        }
    }, [venueId, router]);

    useEffect(() => {
        if (!profile) return;
        const isAssignedLocationAdmin =
            isLocationAdmin(profile) && (profile.assignedLocationIds ?? []).includes(venueId);
        if (!isSuperAdmin(profile) && !isAssignedLocationAdmin) {
            router.replace("/");
            return;
        }
        loadData();
    }, [profile, loadData, router, venueId]);

    const handleVenueImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            toast.error("El archivo debe ser una imagen");
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            toast.error("La imagen no puede superar 5 MB");
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            setImagePreview(ev.target?.result as string);
            markDirty();
        };
        reader.readAsDataURL(file);
    };

    // Save all changes
    const handleSave = async () => {
        if (!venue) return;
        setSaving(true);
        try {
            // Fill missing days with disabled schedules
            const fullSchedules = DAY_OF_WEEK_ORDER.map((day) => {
                const existing = schedules.find((s) => s.dayOfWeek === day);
                return existing || { dayOfWeek: day, enabled: false, slots: [] };
            });

            let finalImageURL = venueImageURL;
            if (imagePreview) {
                setUploadingImage(true);
                finalImageURL = await uploadVenueImage(venueId, imagePreview);
                setVenueImageURL(finalImageURL);
                setImagePreview(null);
                setUploadingImage(false);
            }

            const settingsPayload: Parameters<typeof updateVenueSettings>[1] = {
                depositRequired,
                depositPercent,
                name: venueName,
                address: venueAddress,
                phone: venuePhone || undefined,
                description: venueDescription || undefined,
                imageURL: finalImageURL || undefined,
                icon: venueIcon || undefined,
                active: venueActive,
                formats: venueFormats.length > 0 ? venueFormats : undefined,
                pendingApprovalTTLHours: pendingTTLHours,
                whatsappNotificationNumber: whatsappNumber.trim() || undefined,
            };

            await Promise.all([
                updateVenueSettings(venueId, settingsPayload),
                saveVenueCourts(venueId, courts),
                saveVenueCombos(venueId, combos),
                saveVenueFullSchedule(venueId, fullSchedules),
                // paymentMethods se actualizan separadamente porque las Firestore Rules
                // hacen field-level check (solo Super Admin puede tocar este campo).
                // Si el usuario actual no es super admin, este path no se ejecuta — el
                // editor está deshabilitado en la UI y paymentMethodsDirty queda en false.
                paymentMethodsDirty
                    ? updatePaymentMethods(venueId, paymentMethods)
                    : Promise.resolve(),
            ]);
            setPaymentMethodsDirty(false);

            setDirty(false);
            toast.success("Cambios guardados");

            // Analytics
            logVenueAdminCourtConfigured(venueId, courts.length, combos.length);
            for (const sched of fullSchedules) {
                if (sched.enabled) {
                    logVenueAdminScheduleUpdated(venueId, sched.dayOfWeek, sched.slots.length);
                }
            }
        } catch (err) {
            setUploadingImage(false);
            handleError(err, "Error al guardar");
        } finally {
            setSaving(false);
        }
    };

    const markDirty = () => setDirty(true);

    const handleCourtsChange = (newCourts: Court[]) => {
        setCourts(newCourts);
        markDirty();
    };

    const handleCombosChange = (newCombos: CourtCombo[]) => {
        setCombos(newCombos);
        markDirty();
    };

    const handleScheduleChange = (day: DayOfWeek, schedule: DaySchedule) => {
        setSchedules((prev) => {
            const filtered = prev.filter((s) => s.dayOfWeek !== day);
            return [...filtered, schedule];
        });
        markDirty();
    };

    // Error de carga sin datos: estado con reintentar (antes el `!venue` dejaba el
    // skeleton colgado para siempre incluso tras un error ya atrapado).
    if (loadError && !venue) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
                <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 text-center max-w-sm w-full">
                    <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                        <AlertTriangle size={22} className="text-amber-500" />
                    </div>
                    <p className="font-bold text-slate-800">No pudimos cargar la sede</p>
                    <p className="text-sm text-slate-500 mt-1 mb-5">Revisá tu conexión e intentá de nuevo.</p>
                    <button
                        onClick={loadData}
                        className="inline-flex items-center justify-center gap-2 w-full py-3 bg-[#1f7a4f] text-white rounded-xl font-bold active:scale-[0.98] transition-transform"
                    >
                        <RefreshCw size={16} />
                        Reintentar
                    </button>
                </div>
            </div>
        );
    }

    // Skeleton
    if (loading || !venue) {
        return (
            <div className="min-h-screen bg-slate-50 pb-24 animate-pulse">
                <div className="max-w-md mx-auto">
                    <div className="bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] p-6 pb-8 rounded-b-3xl">
                        <div className="h-5 bg-white/20 rounded w-40 mb-2" />
                        <div className="h-3 bg-white/15 rounded w-56" />
                    </div>
                    <div className="px-4 mt-5 space-y-4">
                        <div className="flex gap-2">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="h-9 w-20 bg-slate-200 rounded-lg" />
                            ))}
                        </div>
                        <div className="space-y-3">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="h-16 bg-slate-200 rounded-xl" />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Example price for deposit preview
    const examplePrice = 15000000; // 150,000 COP in centavos
    const exampleDeposit = Math.round(examplePrice * depositPercent / 100);

    return (
        <div className="min-h-screen bg-slate-50 pb-24 md:pb-0">
            <div className="max-w-md mx-auto">
                {/* Header */}
                <div className="bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] p-6 pb-8 rounded-b-3xl shadow-lg">
                    <div className="flex items-center gap-3 mb-2">
                        <button
                            onClick={() => router.back()}
                            className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center"
                        >
                            <ArrowLeft className="w-4 h-4 text-white" />
                        </button>
                        <div className="flex-1">
                            <h1 className="text-lg font-bold text-white">{venue.name}</h1>
                            <p className="text-xs text-white/60">Administración de sede</p>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                {visibleTabs.length > 1 && (
                    isSuper ? (
                        /* Super admin: scroll horizontal sin iconos */
                        <div className="mt-4 flex gap-1.5 overflow-x-auto scrollbar-hide px-4 pb-1">
                            {visibleTabs.map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`flex-shrink-0 px-3.5 py-2 text-xs font-semibold rounded-xl transition-colors ${
                                        activeTab === tab
                                            ? "bg-[#1f7a4f] text-white shadow-sm"
                                            : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                                    }`}
                                >
                                    {TAB_LABELS[tab]}
                                </button>
                            ))}
                        </div>
                    ) : (
                        /* Location admin: segmented control con iconos */
                        <div className="px-4 mt-4">
                            <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
                                {visibleTabs.map((tab) => {
                                    const Icon = TAB_ICONS[tab];
                                    return (
                                        <button
                                            key={tab}
                                            onClick={() => setActiveTab(tab)}
                                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
                                                activeTab === tab
                                                    ? "bg-white text-[#1f7a4f] shadow-sm"
                                                    : "text-slate-500 hover:text-slate-700"
                                            }`}
                                        >
                                            <Icon className="w-3.5 h-3.5" />
                                            {TAB_LABELS[tab]}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )
                )}

                {/* Tab content */}
                <div className="px-4 mt-5">
                    {/* Info tab */}
                    {activeTab === "info" && (
                        <div className="space-y-5">
                            {/* Foto de portada */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                                    Foto de portada
                                </label>
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="relative aspect-video rounded-2xl overflow-hidden bg-slate-100 border-2 border-dashed border-slate-200 cursor-pointer hover:border-[#1f7a4f]/40 transition-colors"
                                >
                                    {(imagePreview || venueImageURL) ? (
                                        <Image
                                            src={imagePreview || venueImageURL!}
                                            alt="portada"
                                            fill
                                            className="object-cover"
                                            sizes="(max-width: 768px) 100vw, 50vw"
                                            unoptimized
                                        />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full gap-2">
                                            <ImageIcon className="w-8 h-8 text-slate-300" />
                                            <span className="text-xs text-slate-400">Toca para subir foto</span>
                                        </div>
                                    )}
                                    {uploadingImage && (
                                        <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                                            <Loader2 className="w-6 h-6 animate-spin text-[#1f7a4f]" />
                                        </div>
                                    )}
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleVenueImageChange}
                                />
                                {imagePreview && (
                                    <p className="text-[11px] text-amber-600 mt-1">Se subirá al guardar cambios</p>
                                )}
                            </div>

                            {/* Nombre */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                                    Nombre
                                </label>
                                <input
                                    type="text"
                                    value={venueName}
                                    onChange={(e) => { setVenueName(e.target.value); markDirty(); }}
                                    className="w-full px-3 py-2.5 text-base border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30 focus:border-[#1f7a4f]"
                                    placeholder="Nombre de la sede"
                                />
                            </div>

                            {/* Dirección */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                                    Dirección
                                </label>
                                <input
                                    type="text"
                                    value={venueAddress}
                                    onChange={(e) => { setVenueAddress(e.target.value); markDirty(); }}
                                    className="w-full px-3 py-2.5 text-base border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30 focus:border-[#1f7a4f]"
                                    placeholder="Dirección de la sede"
                                />
                            </div>

                            {/* Teléfono */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                                    Teléfono
                                </label>
                                <input
                                    type="tel"
                                    inputMode="tel"
                                    value={venuePhone}
                                    onChange={(e) => { setVenuePhone(e.target.value); markDirty(); }}
                                    className="w-full px-3 py-2.5 text-base border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30 focus:border-[#1f7a4f]"
                                    placeholder="+57 300 000 0000"
                                />
                            </div>

                            {/* Descripción */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                                    Descripción
                                </label>
                                <textarea
                                    rows={3}
                                    value={venueDescription}
                                    onChange={(e) => { setVenueDescription(e.target.value); markDirty(); }}
                                    className="w-full px-3 py-2.5 text-base border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30 focus:border-[#1f7a4f] resize-none"
                                    placeholder="Descripción breve de la sede"
                                />
                            </div>

                            {/* Emoji icono */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                                    Ícono de sede
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {["⚽","🏟️","🏃","🎯","🏆","🥅","🎽","🏋️","🤸","🏊","🎾","🏸","🏐","🏀","🎱","🥊","⛳","🎳","🏓","📍"].map((emoji) => (
                                        <button
                                            key={emoji}
                                            type="button"
                                            onClick={() => { setVenueIcon(venueIcon === emoji ? "" : emoji); markDirty(); }}
                                            className={`w-10 h-10 text-xl flex items-center justify-center rounded-xl border-2 transition-colors ${
                                                venueIcon === emoji
                                                    ? "border-[#1f7a4f] bg-[#1f7a4f]/10"
                                                    : "border-slate-200 bg-white hover:border-slate-300"
                                            }`}
                                        >
                                            {emoji}
                                        </button>
                                    ))}
                                </div>
                                {venueIcon && (
                                    <p className="text-[11px] text-slate-400 mt-1.5">
                                        Seleccionado: {venueIcon} · Toca de nuevo para quitar
                                    </p>
                                )}
                            </div>

                            {/* Sede activa toggle */}
                            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                                <div>
                                    <p className="text-sm font-semibold text-slate-700">Sede activa</p>
                                    <p className="text-xs text-slate-400">Los jugadores pueden ver y reservar esta sede</p>
                                </div>
                                <button
                                    onClick={() => { setVenueActive(!venueActive); markDirty(); }}
                                    className={`w-12 h-7 rounded-full transition-colors relative ${venueActive ? "bg-[#1f7a4f]" : "bg-slate-300"}`}
                                >
                                    <span
                                        className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${venueActive ? "left-[22px]" : "left-0.5"}`}
                                    />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Courts tab */}
                    {activeTab === "courts" && (
                        <div className="space-y-6">
                            <VenueFormatEditor
                                formats={venueFormats}
                                courts={courts}
                                combos={combos}
                                schedules={schedules}
                                onFormatsChange={(f) => { setVenueFormats(f); markDirty(); }}
                            />
                            <div className="border-t border-slate-100 pt-6">
                                <CourtConfigEditor
                                    courts={courts}
                                    combos={combos}
                                    venueFormats={venueFormats}
                                    onCourtsChange={handleCourtsChange}
                                    onCombosChange={handleCombosChange}
                                />
                            </div>
                        </div>
                    )}

                    {/* Schedule tab */}
                    {activeTab === "schedule" && (
                        <div>
                            <p className="text-xs text-slate-400 mb-4">
                                Configura los horarios disponibles por día. Los cambios solo aplican a reservas futuras.
                            </p>
                            <ScheduleEditor
                                schedules={schedules}
                                venueFormats={venueFormats}
                                onScheduleChange={handleScheduleChange}
                            />
                        </div>
                    )}

                    {/* Payments tab */}
                    {activeTab === "payments" && (
                        <div className="space-y-6">
                            {/* Deposit toggle */}
                            <div className="bg-white rounded-2xl border border-slate-100 p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h3 className="text-sm font-semibold text-slate-700">Depósito requerido</h3>
                                        <p className="text-xs text-slate-400 mt-0.5">
                                            Cobra un porcentaje al momento de reservar
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setDepositRequired(!depositRequired);
                                            markDirty();
                                        }}
                                        className={`w-12 h-7 rounded-full transition-colors relative ${depositRequired ? "bg-[#1f7a4f]" : "bg-slate-300"}`}
                                    >
                                        <span
                                            className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${depositRequired ? "left-[22px]" : "left-0.5"}`}
                                        />
                                    </button>
                                </div>

                                {depositRequired && (
                                    <div className="space-y-4">
                                        {/* Percent slider */}
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-sm text-slate-600">Porcentaje de depósito</span>
                                                <span className="text-lg font-bold text-[#1f7a4f]">{depositPercent}%</span>
                                            </div>
                                            <input
                                                type="range"
                                                min={MIN_DEPOSIT_PERCENT}
                                                max={MAX_DEPOSIT_PERCENT}
                                                step={5}
                                                value={depositPercent}
                                                onChange={(e) => {
                                                    setDepositPercent(Number(e.target.value));
                                                    markDirty();
                                                }}
                                                className="w-full accent-[#1f7a4f]"
                                            />
                                            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                                                <span>{MIN_DEPOSIT_PERCENT}%</span>
                                                <span>{MAX_DEPOSIT_PERCENT}%</span>
                                            </div>
                                        </div>

                                        {/* Preview */}
                                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                                            <p className="text-xs font-semibold text-slate-500 mb-2">Ejemplo: Cancha de {formatCOP(examplePrice)}</p>
                                            <div className="space-y-1.5">
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-slate-500">Depósito online ({depositPercent}%)</span>
                                                    <span className="font-bold text-[#1f7a4f]">{formatCOP(exampleDeposit)}</span>
                                                </div>
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-slate-500">Resto en sede</span>
                                                    <span className="font-medium text-slate-700">{formatCOP(examplePrice - exampleDeposit)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Payment info */}
                            {!depositRequired && (
                                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                                    <p className="text-sm text-blue-700">
                                        Sin depósito, el pago se realiza 100% en sede. Las reservas se confirman al instante.
                                    </p>
                                </div>
                            )}

                            {/* Métodos de pago externos — solo aplica con depósito requerido */}
                            {depositRequired && (
                                <div className="bg-white rounded-2xl border border-slate-100 p-5">
                                    <h3 className="text-sm font-semibold text-slate-700 mb-1">
                                        Métodos de pago aceptados
                                    </h3>
                                    <p className="text-xs text-slate-400 mb-4">
                                        Datos que el jugador verá para pagar el abono externamente
                                        (Nequi, Bancolombia, Llave Transfiya, etc.).
                                    </p>
                                    <PaymentMethodEditor
                                        venueId={venueId}
                                        methods={paymentMethods}
                                        canEdit={isSuper}
                                        onChange={(next) => {
                                            setPaymentMethods(next);
                                            setPaymentMethodsDirty(true);
                                            markDirty();
                                        }}
                                    />
                                </div>
                            )}

                            {/* TTL configurable para reservas pendientes */}
                            {depositRequired && (
                                <div className="bg-white rounded-2xl border border-slate-100 p-5">
                                    <h3 className="text-sm font-semibold text-slate-700 mb-1">
                                        Ventana de tiempo para pago
                                    </h3>
                                    <p className="text-xs text-slate-400 mb-4">
                                        Horas que el jugador tiene para enviar el comprobante antes
                                        de que la reserva se cancele automáticamente.
                                    </p>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="number"
                                            min={MIN_PENDING_APPROVAL_TTL_HOURS}
                                            max={MAX_PENDING_APPROVAL_TTL_HOURS}
                                            step={1}
                                            value={pendingTTLHours}
                                            onChange={(e) => {
                                                const raw = parseInt(e.target.value, 10);
                                                if (Number.isNaN(raw)) return;
                                                const clamped = Math.max(
                                                    MIN_PENDING_APPROVAL_TTL_HOURS,
                                                    Math.min(MAX_PENDING_APPROVAL_TTL_HOURS, raw),
                                                );
                                                setPendingTTLHours(clamped);
                                                markDirty();
                                            }}
                                            className="w-24 px-3 py-2.5 text-base border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30 focus:border-[#1f7a4f]/50"
                                        />
                                        <span className="text-sm text-slate-600">horas</span>
                                    </div>
                                    <p className="text-[11px] text-slate-400 mt-2">
                                        Mínimo {MIN_PENDING_APPROVAL_TTL_HOURS}h, máximo {MAX_PENDING_APPROVAL_TTL_HOURS}h.
                                    </p>
                                </div>
                            )}

                            {/* WhatsApp opcional para botón "Avisar al admin" */}
                            <div className="bg-white rounded-2xl border border-slate-100 p-5">
                                <h3 className="text-sm font-semibold text-slate-700 mb-1">
                                    WhatsApp para avisos (opcional)
                                </h3>
                                <p className="text-xs text-slate-400 mb-3">
                                    Si lo configurás, el jugador verá un botón &quot;Avisar por WhatsApp&quot;
                                    después de pagar. Déjalo vacío para ocultarlo.
                                </p>
                                <input
                                    type="tel"
                                    placeholder="+57 311 234 5678"
                                    value={whatsappNumber}
                                    onChange={(e) => {
                                        setWhatsappNumber(e.target.value);
                                        markDirty();
                                    }}
                                    className="w-full px-3 py-2.5 text-base border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30 focus:border-[#1f7a4f]/50"
                                />
                            </div>
                        </div>
                    )}

                    {/* Blocked slots tab */}
                    {activeTab === "blocked" && user && (
                        <BlockedSlotsEditor
                            venueId={venueId}
                            courts={courts}
                        />
                    )}

                    {/* Bookings tab */}
                    {activeTab === "bookings" && (
                        <div className="space-y-4">
                            {/* View toggle + CTA en una sola fila */}
                            <div className="flex items-center gap-2">
                                <div className="flex-1 flex gap-1 bg-slate-100 rounded-xl p-1">
                                    <button
                                        onClick={() => setBookingsView("hourly")}
                                        className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${
                                            bookingsView === "hourly"
                                                ? "bg-white text-[#1f7a4f] shadow-sm"
                                                : "text-slate-500 hover:text-slate-700"
                                        }`}
                                    >
                                        Por hora
                                    </button>
                                    <button
                                        onClick={() => setBookingsView("calendar")}
                                        className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${
                                            bookingsView === "calendar"
                                                ? "bg-white text-[#1f7a4f] shadow-sm"
                                                : "text-slate-500 hover:text-slate-700"
                                        }`}
                                    >
                                        Calendario
                                    </button>
                                </div>
                                {!isSuper && (
                                    <button
                                        onClick={() => {
                                            setDrawerDefaults({});
                                            setBlockedDrawerOpen(true);
                                        }}
                                        className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[#1f7a4f] rounded-xl hover:bg-[#145c3a] active:scale-[0.99] transition-all shadow-sm shrink-0"
                                    >
                                        <CalendarPlus className="w-3.5 h-3.5" />
                                        Nueva
                                    </button>
                                )}
                            </div>

                            {bookingsView === "calendar" ? (
                                <AdminBookingCalendar
                                    venueId={venueId}
                                    venueFormats={venueFormats}
                                    onBookingCancel={(booking) => {
                                        logBookingCancellationStarted({
                                            venueId: booking.venueId,
                                            bookingId: booking.id,
                                            actorRole: "admin",
                                        });
                                        setCancelTarget(booking);
                                    }}
                                    onConfirmAttendance={(b) => setConfirmAttendanceTarget(b)}
                                    onRegisterBookingPayment={(b, existingPayment) => setBookingPaymentTarget({ booking: b, existingPayment })}
                                    onBlockClick={(slot, targetDate) => {
                                        setDeleteTarget({ slot, targetDate });
                                    }}
                                    onAdvanceBlockStatus={handleAdvanceBlockStatus}
                                    onPickBlockStatus={handlePickBlockStatus}
                                    onEditBlock={handleEditBlock}
                                    onCancelBlock={handleCancelBlock}
                                    onRegisterPayment={handleRegisterPayment}
                                    onCreateManual={(date) => {
                                        setDrawerDefaults({ date });
                                        setBlockedDrawerOpen(true);
                                    }}
                                />
                            ) : (
                                <AdminSlotPicker
                                    venueId={venueId}
                                    courts={courts}
                                    venueFormats={venueFormats}
                                    onHourTapped={({ date, startTime, endTime, courtIds, format, bookings, blocks, relevantCourtIds, unavailableRelevantCourtIds }) => {
                                        setHourDetail({ date, startTime, endTime, courtIds, format, bookings, blocks, relevantCourtIds, unavailableRelevantCourtIds });
                                        logAdminHourDetailOpened({
                                            venueId,
                                            date,
                                            startTime,
                                            endTime,
                                            bookingsCount: bookings.length,
                                            blocksCount: blocks.length,
                                        });
                                    }}
                                />
                            )}
                        </div>
                    )}

                    {/* Pending bookings tab */}
                    {activeTab === "pending" && (
                        <div className="space-y-4">
                            <p className="text-xs text-slate-500">
                                Reservas de jugadores con pago externo. Aprobá el abono cuando recibas la transferencia, o rechazá si el comprobante no corresponde.
                            </p>
                            <PendingBookingsAdminView
                                venueId={venueId}
                                venueFormats={venueFormats}
                                onCancelBooking={(b) => setCancelTarget(b)}
                            />
                        </div>
                    )}

                    {/* Balance tab */}
                    {activeTab === "balance" && (
                        <div className="space-y-4">
                            <p className="text-xs text-slate-500">
                                Total de ingresos del día por método de pago. Tap en una fila para editar.
                            </p>
                            <DailyBalanceView venueId={venueId} />
                        </div>
                    )}
                </div>

                {/* Blocked slots drawer (location admin) */}
                <AnimatePresence>
                    {blockedDrawerOpen && (
                        <>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setBlockedDrawerOpen(false)}
                                className="fixed inset-0 bg-black/40 z-40"
                            />
                            <motion.div
                                initial={{ y: "100%" }}
                                animate={{ y: 0 }}
                                exit={{ y: "100%" }}
                                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                                className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-xl max-w-md mx-auto max-h-[90vh] flex flex-col"
                            >
                                <div className="p-5 pb-3 border-b border-slate-100 flex items-center justify-between">
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-800">Reserva manual</h3>
                                        <p className="text-xs text-slate-500 mt-0.5">Para clientes que no están en la app o eventos privados</p>
                                    </div>
                                    <button
                                        onClick={() => setBlockedDrawerOpen(false)}
                                        className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
                                        aria-label="Cerrar"
                                    >
                                        <X className="w-4 h-4 text-slate-500" />
                                    </button>
                                </div>
                                <div className="overflow-y-auto p-5 pb-[calc(env(safe-area-inset-bottom,0px)+96px)] md:pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
                                    {user && (
                                        <BlockedSlotForm
                                            key={`${drawerDefaults.date ?? ""}-${drawerDefaults.startTime ?? ""}-${drawerDefaults.endTime ?? ""}-${(drawerDefaults.courtIds ?? []).join(",")}`}
                                            venueId={venueId}
                                            courts={courts}
                                            combos={combos}
                                            venueFormats={venueFormats}
                                            defaultDate={drawerDefaults.date}
                                            defaultStartTime={drawerDefaults.startTime}
                                            defaultEndTime={drawerDefaults.endTime}
                                            defaultCourtIds={drawerDefaults.courtIds}
                                            defaultFormat={drawerDefaults.format}
                                            occupiedCourtIds={drawerDefaults.occupiedCourtIds}
                                            onCreated={() => setBlockedDrawerOpen(false)}
                                            onCancel={() => setBlockedDrawerOpen(false)}
                                        />
                                    )}
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>

                {/* Hour detail drawer (vista por hora). Va ANTES que los sheets para que
                    cuando un sheet se abra desde dentro, quede por encima en el orden DOM. */}
                <HourDetailDrawer
                    open={!!hourDetail}
                    onClose={() => setHourDetail(null)}
                    date={hourDetail?.date ?? ""}
                    startTime={hourDetail?.startTime ?? ""}
                    endTime={hourDetail?.endTime ?? ""}
                    bookings={hourDetail?.bookings ?? []}
                    blocks={hourDetail?.blocks ?? []}
                    courts={courts}
                    venueFormats={venueFormats}
                    relevantCourtIds={hourDetail?.relevantCourtIds ?? []}
                    unavailableRelevantCourtIds={hourDetail?.unavailableRelevantCourtIds ?? []}
                    onBookingCancel={(booking) => {
                        logBookingCancellationStarted({
                            venueId,
                            bookingId: booking.id,
                            actorRole: "admin",
                        });
                        setCancelTarget(booking);
                    }}
                    onConfirmAttendance={(b) => setConfirmAttendanceTarget(b)}
                    onRegisterBookingPayment={(b, existingPayment) => setBookingPaymentTarget({ booking: b, existingPayment })}
                    onBlockClick={(slot, targetDate) => {
                        setDeleteTarget({ slot, targetDate });
                    }}
                    onAdvanceBlockStatus={handleAdvanceBlockStatus}
                    onPickBlockStatus={handlePickBlockStatus}
                    onEditBlock={handleEditBlock}
                    onCancelBlock={handleCancelBlock}
                    payments={drawerPayments}
                    onRegisterPayment={handleRegisterPayment}
                    onCreateManual={() => {
                        if (!hourDetail) return;
                        logAdminHourDetailCreateClicked({
                            venueId,
                            date: hourDetail.date,
                            startTime: hourDetail.startTime,
                            endTime: hourDetail.endTime,
                            hadOverlaps: hourDetail.bookings.length > 0 || hourDetail.blocks.length > 0,
                        });
                        // Solo cuentan como "occupied" las reservas online en estados que
                        // bloquean slot (excluye cancelled, no_show, paid, expired). Mismo
                        // criterio que AdminSlotPicker y HourDetailDrawer.
                        const occupiedCourtIds = [
                            ...hourDetail.bookings
                                .filter((b) => (SLOT_BLOCKING_BOOKING_STATUSES as readonly string[]).includes(b.status))
                                .flatMap((b) => b.courtIds),
                            ...hourDetail.blocks.filter((b) => b.status !== "cancelled").flatMap((b) => b.courtIds),
                        ];
                        setDrawerDefaults({
                            date: hourDetail.date,
                            startTime: hourDetail.startTime,
                            endTime: hourDetail.endTime,
                            courtIds: hourDetail.courtIds,
                            format: hourDetail.format,
                            occupiedCourtIds,
                        });
                        setHourDetail(null);
                        setBlockedDrawerOpen(true);
                    }}
                />

                {/* Cancel booking sheet (admin) */}
                {cancelTarget && (
                    <CancelBookingSheet
                        open={!!cancelTarget}
                        onClose={() => setCancelTarget(null)}
                        onConfirm={handleAdminCancelBooking}
                        mode="admin"
                        booking={{
                            venueName: cancelTarget.venueName,
                            date: cancelTarget.date,
                            startTime: cancelTarget.startTime,
                            endTime: cancelTarget.endTime,
                            bookedByName: cancelTarget.bookedByName,
                            depositCOP: cancelTarget.depositCOP,
                        }}
                        willRefund={cancelTarget.depositCOP > 0 && cancelTarget.paymentMethod === "wallet_deposit"}
                        attendanceConfirmed={cancelTarget.status === "confirmed"}
                    />
                )}

                {/* Cancel manual reservation sheet */}
                {cancelManualTarget && (
                    <CancelManualReservationSheet
                        open={!!cancelManualTarget}
                        onClose={() => setCancelManualTarget(null)}
                        onCancelled={() => {
                            patchHourDetailBlockStatus(cancelManualTarget.slot.id, "cancelled");
                            setCancelManualTarget(null);
                        }}
                        venueId={venueId}
                        slot={cancelManualTarget.slot}
                        targetDate={cancelManualTarget.targetDate}
                    />
                )}

                {/* Edit manual reservation sheet */}
                {editManualTarget && (
                    <EditManualReservationSheet
                        open={!!editManualTarget}
                        onClose={() => {
                            setEditManualTarget(null);
                            setHourDetail(null);
                        }}
                        venueId={venueId}
                        slot={editManualTarget}
                    />
                )}

                {/* Register/edit payment sheet — manual reservation */}
                {paymentTarget && user && (
                    <RegisterPaymentSheet
                        open={!!paymentTarget}
                        onClose={() => setPaymentTarget(null)}
                        venueId={venueId}
                        slot={paymentTarget.slot}
                        targetDate={paymentTarget.targetDate}
                        existingPayment={paymentTarget.existingPayment}
                        registeredBy={user.uid}
                        onSaved={() => {
                            const instanceDate = paymentTarget.slot.recurrence ? paymentTarget.targetDate : undefined;
                            patchHourDetailBlockStatus(paymentTarget.slot.id, "paid", instanceDate);
                            setPaymentTarget(null);
                        }}
                        onDeleted={() => {
                            const instanceDate = paymentTarget.slot.recurrence ? paymentTarget.targetDate : undefined;
                            patchHourDetailBlockStatus(paymentTarget.slot.id, "played", instanceDate);
                            setPaymentTarget(null);
                        }}
                    />
                )}

                {/* Confirm attendance sheet (deposit_confirmed → confirmed) */}
                <ConfirmAttendanceSheet
                    open={!!confirmAttendanceTarget}
                    onClose={() => setConfirmAttendanceTarget(null)}
                    booking={confirmAttendanceTarget}
                />

                {/* Register payment sheet — player booking (played → paid).
                    Construye un slot sintético desde el booking para reusar el sheet.
                    Tras registrar, marca played → paid en el server vía advanceBookingStatus. */}
                {bookingPaymentTarget && user && (
                    <RegisterPaymentSheet
                        open={!!bookingPaymentTarget}
                        onClose={() => setBookingPaymentTarget(null)}
                        venueId={venueId}
                        slot={{
                            id: bookingPaymentTarget.booking.id,
                            date: bookingPaymentTarget.booking.date,
                            startTime: bookingPaymentTarget.booking.startTime,
                            endTime: bookingPaymentTarget.booking.endTime,
                            courtIds: bookingPaymentTarget.booking.courtIds,
                            clientName: bookingPaymentTarget.booking.bookedByName,
                            priceCOP: bookingPaymentTarget.booking.totalPriceCOP,
                            createdBy: bookingPaymentTarget.booking.bookedBy,
                            createdAt: bookingPaymentTarget.booking.createdAt,
                        } as BlockedSlot}
                        targetDate={bookingPaymentTarget.booking.date}
                        existingPayment={bookingPaymentTarget.existingPayment}
                        registeredBy={user.uid}
                        depositCOP={bookingPaymentTarget.booking.depositCOP}
                        paymentProofURL={bookingPaymentTarget.booking.paymentProofURL ?? undefined}
                        paymentVerifiedAt={bookingPaymentTarget.booking.approvedAt ?? undefined}
                        skipSlotUpdate
                        onSaved={async () => {
                            const target = bookingPaymentTarget;
                            // Solo avanzar a "paid" si se está creando un pago nuevo (no editando).
                            if (!target.existingPayment) {
                                try {
                                    await advanceBookingStatus(target.booking.id, "paid");
                                } catch (err) {
                                    handleError(err, "El pago se registró pero no pudimos actualizar el estado de la reserva");
                                }
                            }
                            setBookingPaymentTarget(null);
                        }}
                    />
                )}

                {/* Delete blocked slot sheet (super admin hard delete) */}
                {deleteTarget && (
                    <DeleteBlockedSlotSheet
                        open={!!deleteTarget}
                        onClose={() => setDeleteTarget(null)}
                        onDeleted={() => {
                            setDeleteTarget(null);
                            setHourDetail(null);
                        }}
                        venueId={venueId}
                        slot={deleteTarget.slot}
                        targetDate={deleteTarget.targetDate}
                    />
                )}

                {/* Save button — always visible on editable tabs */}
                {activeTab !== "bookings" && activeTab !== "blocked" && activeTab !== "balance" && (
                    <div className="px-4 mt-6 mb-28">
                        <button
                            onClick={handleSave}
                            disabled={saving || !dirty}
                            className={`w-full py-3.5 rounded-xl text-base font-bold transition-all shadow-lg flex items-center justify-center gap-2 ${
                                dirty && !saving
                                    ? "bg-[#1f7a4f] text-white hover:bg-[#145c3a] active:scale-[0.98]"
                                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                            }`}
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Guardando...
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4" />
                                    Guardar cambios
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function VenueAdminPage() {
    return (
        <AuthGuard>
            <VenueAdminContent />
        </AuthGuard>
    );
}
