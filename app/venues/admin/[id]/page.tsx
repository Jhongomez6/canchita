"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Save, Loader2, CalendarPlus, X } from "lucide-react";
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
    saveVenueCourts,
    saveVenueCombos,
    saveVenueFullSchedule,
} from "@/lib/venues";
import { handleError } from "@/lib/utils/error";
import { logVenueAdminCourtConfigured, logVenueAdminScheduleUpdated } from "@/lib/analytics";
import AuthGuard from "@/components/AuthGuard";
import CourtConfigEditor from "@/components/booking/CourtConfigEditor";
import ScheduleEditor from "@/components/booking/ScheduleEditor";
import AdminBookingCalendar from "@/components/booking/AdminBookingCalendar";
import AdminSlotPicker from "@/components/booking/AdminSlotPicker";
import BlockedSlotsEditor from "@/components/booking/BlockedSlotsEditor";
import BlockedSlotForm from "@/components/booking/BlockedSlotForm";
import CancelBookingSheet from "@/components/booking/CancelBookingSheet";
import DeleteBlockedSlotSheet from "@/components/booking/DeleteBlockedSlotSheet";
import { cancelBooking } from "@/lib/bookings";
import { logBookingCancelled, logBookingCancellationStarted } from "@/lib/analytics";
import type { Venue, Court, CourtCombo, DaySchedule, DayOfWeek, BlockedSlot } from "@/lib/domain/venue";
import type { Booking } from "@/lib/domain/booking";

type AdminTab = "courts" | "schedule" | "payments" | "blocked" | "bookings";

const TAB_LABELS: Record<AdminTab, string> = {
    courts: "Canchas",
    schedule: "Horarios",
    payments: "Pagos",
    blocked: "Bloqueos",
    bookings: "Reservas",
};

function VenueAdminContent() {
    const params = useParams();
    const router = useRouter();
    const { profile, user } = useAuth();
    const venueId = params.id as string;

    // Data state
    const [venue, setVenue] = useState<Venue | null>(null);
    const [courts, setCourts] = useState<Court[]>([]);
    const [combos, setCombos] = useState<CourtCombo[]>([]);
    const [schedules, setSchedules] = useState<DaySchedule[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Payment settings
    const [depositRequired, setDepositRequired] = useState(false);
    const [depositPercent, setDepositPercent] = useState(30);

    // Role gating
    const isSuper = profile ? isSuperAdmin(profile) : false;
    const visibleTabs: AdminTab[] = isSuper
        ? ["courts", "schedule", "payments", "blocked", "bookings"]
        : ["bookings"];

    // Active tab
    const [activeTab, setActiveTab] = useState<AdminTab>(isSuper ? "courts" : "bookings");

    // Blocked slots drawer (location admins access blocks from bookings tab)
    const [blockedDrawerOpen, setBlockedDrawerOpen] = useState(false);
    const [drawerDefaults, setDrawerDefaults] = useState<{
        date?: string;
        startTime?: string;
        endTime?: string;
        courtIds?: string[];
    }>({});

    // Bookings sub-view: monthly calendar vs hourly slot picker
    const [bookingsView, setBookingsView] = useState<"calendar" | "hourly">("calendar");

    // Cancel booking sheet (admin cancels player's booking)
    const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);

    // Delete block sheet
    const [deleteTarget, setDeleteTarget] = useState<{ slot: BlockedSlot; targetDate: string } | null>(null);

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
        try {
            const [v, c, co, sched] = await Promise.all([
                getVenue(venueId),
                getVenueCourts(venueId),
                getVenueCombos(venueId),
                getVenueFullSchedule(venueId),
            ]);

            if (!v) {
                toast.error("Sede no encontrada");
                router.replace("/venues");
                return;
            }

            setVenue(v);
            setCourts(c);
            setCombos(co);
            setSchedules(sched);
            setDepositRequired(v.depositRequired);
            setDepositPercent(v.depositPercent);
        } catch (err) {
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

            await Promise.all([
                updateVenueSettings(venueId, { depositRequired, depositPercent }),
                saveVenueCourts(venueId, courts),
                saveVenueCombos(venueId, combos),
                saveVenueFullSchedule(venueId, fullSchedules),
            ]);

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
                <div className="px-4 mt-4">
                    <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
                        {visibleTabs.map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`
                                    flex-1 py-2 text-xs font-semibold rounded-lg transition-colors
                                    ${activeTab === tab
                                        ? "bg-white text-[#1f7a4f] shadow-sm"
                                        : "text-slate-500 hover:text-slate-700"
                                    }
                                `}
                            >
                                {TAB_LABELS[tab]}
                            </button>
                        ))}
                    </div>
                </div>
                )}

                {/* Tab content */}
                <div className="px-4 mt-5">
                    {/* Courts tab */}
                    {activeTab === "courts" && (
                        <CourtConfigEditor
                            courts={courts}
                            combos={combos}
                            onCourtsChange={handleCourtsChange}
                            onCombosChange={handleCombosChange}
                        />
                    )}

                    {/* Schedule tab */}
                    {activeTab === "schedule" && (
                        <div>
                            <p className="text-xs text-slate-400 mb-4">
                                Configura los horarios disponibles por día. Los cambios solo aplican a reservas futuras.
                            </p>
                            <ScheduleEditor
                                schedules={schedules}
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
                            {!isSuper && (
                                <button
                                    onClick={() => {
                                        setDrawerDefaults({});
                                        setBlockedDrawerOpen(true);
                                    }}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#1f7a4f] rounded-xl hover:bg-[#145c3a] active:scale-[0.99] transition-all shadow-sm"
                                >
                                    <CalendarPlus className="w-4 h-4" />
                                    Reserva manual
                                </button>
                            )}

                            {/* View toggle */}
                            <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
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
                            </div>

                            {bookingsView === "calendar" ? (
                                <AdminBookingCalendar
                                    venueId={venueId}
                                    onBookingClick={(booking) => {
                                        logBookingCancellationStarted({
                                            venueId: booking.venueId,
                                            bookingId: booking.id,
                                            actorRole: "admin",
                                        });
                                        setCancelTarget(booking);
                                    }}
                                    onBlockClick={(slot, targetDate) => {
                                        setDeleteTarget({ slot, targetDate });
                                    }}
                                />
                            ) : (
                                <AdminSlotPicker
                                    venueId={venueId}
                                    courts={courts}
                                    onSlotSelected={({ date, startTime, endTime, courtIds }) => {
                                        setDrawerDefaults({ date, startTime, endTime, courtIds });
                                        setBlockedDrawerOpen(true);
                                    }}
                                />
                            )}
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
                                            defaultDate={drawerDefaults.date}
                                            defaultStartTime={drawerDefaults.startTime}
                                            defaultEndTime={drawerDefaults.endTime}
                                            defaultCourtIds={drawerDefaults.courtIds}
                                            onCreated={() => setBlockedDrawerOpen(false)}
                                            onCancel={() => setBlockedDrawerOpen(false)}
                                        />
                                    )}
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>

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
                    />
                )}

                {/* Delete blocked slot sheet */}
                {deleteTarget && (
                    <DeleteBlockedSlotSheet
                        open={!!deleteTarget}
                        onClose={() => setDeleteTarget(null)}
                        onDeleted={() => setDeleteTarget(null)}
                        venueId={venueId}
                        slot={deleteTarget.slot}
                        targetDate={deleteTarget.targetDate}
                    />
                )}

                {/* Save button — always visible on editable tabs */}
                {activeTab !== "bookings" && activeTab !== "blocked" && (
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
