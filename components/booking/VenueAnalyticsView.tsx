"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    DollarSign, LayoutGrid, CalendarDays, UserX,
    TrendingUp, TrendingDown, Minus, RefreshCw, BarChart3, X,
} from "lucide-react";
import {
    getVenue, getVenueCourts, getVenueCombos, getVenueFullSchedule,
    getPaymentsInRange, getBlockedSlotsForRange,
} from "@/lib/venues";
import { createCachedQueryHook } from "@/lib/hooks/createCachedQueryHook";
import { formatCOP } from "@/lib/domain/wallet";
import {
    resolvePeriod, previousPeriodOf, clampCustomRange, rangeLengthDays,
    computeRevenueSummary, expandReservationInstances,
    computeOccupancyHeatmap, computeOverallOccupancy, computeStatusRates,
    revenueByCourt, revenueByFormat, revenueByWeekday, compare,
    computeClientStats, rankClients, listNoShows, listCancellations,
    DAY_SHORT_LABELS,
    type AnalyticsPeriodPreset, type AnalyticsPeriod, type OccupancyCell, type ReservationDetail,
} from "@/lib/domain/venue-analytics";
import {
    logVenueAnalyticsViewed, logVenueAnalyticsPeriodChanged, logVenueAnalyticsHeatmapCellTapped,
} from "@/lib/analytics";
import type { Court, CourtCombo, DaySchedule, BlockedSlot, ManualReservationPayment, VenueFormat } from "@/lib/domain/venue";
import OccupancyHeatmap from "./OccupancyHeatmap";
import RevenueBreakdownList from "./RevenueBreakdownList";
import ClientRankList from "./ClientRankList";
import ReservationDetailList from "./ReservationDetailList";
import ReservationDetailSheet from "./ReservationDetailSheet";
import VenueAnalyticsSkeleton from "@/components/skeletons/VenueAnalyticsSkeleton";

interface VenueAnalyticsViewProps {
    venueId: string;
}

interface VenueConfig {
    courts: Court[];
    combos: CourtCombo[];
    schedules: DaySchedule[];
    venueFormats: VenueFormat[];
}

interface RangeData {
    payments: ManualReservationPayment[];
    slots: BlockedSlot[];
}

// Config casi estática de la sede: se cachea aparte y se refresca al volver a `visible`.
const useVenueConfig = createCachedQueryHook<string, VenueConfig>(
    async (venueId) => {
        const [venue, courts, combos, schedules] = await Promise.all([
            getVenue(venueId), getVenueCourts(venueId), getVenueCombos(venueId), getVenueFullSchedule(venueId),
        ]);
        return { courts, combos, schedules, venueFormats: venue?.formats ?? [] };
    },
    (venueId) => (venueId ? `venue_analytics_config_${venueId}` : null),
    { source: "venue_analytics_config", staleMs: 5 * 60_000 },
);

// Datos por rango (pagos + reservas). El rango combinado cubre período actual + anterior,
// así una sola lectura sirve para el comparativo. Cacheado por (venue, rango) → cambiar de
// preset al mismo rango no re-lee.
const useRangeData = createCachedQueryHook<{ venueId: string; start: string; end: string }, RangeData>(
    async ({ venueId, start, end }) => {
        const [payments, slots] = await Promise.all([
            getPaymentsInRange(venueId, start, end),
            getBlockedSlotsForRange(venueId, start, end),
        ]);
        return { payments, slots };
    },
    ({ venueId, start, end }) => (venueId ? `venue_analytics_range_${venueId}_${start}_${end}` : null),
    { source: "venue_analytics_range" },
);

const PRESETS: { key: AnalyticsPeriodPreset; label: string }[] = [
    { key: "this_week", label: "Esta semana" },
    { key: "this_month", label: "Este mes" },
    { key: "last_month", label: "Mes pasado" },
    { key: "custom", label: "Personalizado" },
];

export default function VenueAnalyticsView({ venueId }: VenueAnalyticsViewProps) {
    const [now] = useState(() => new Date());
    const [preset, setPreset] = useState<AnalyticsPeriodPreset>("this_month");
    const [customStart, setCustomStart] = useState<string>("");
    const [customEnd, setCustomEnd] = useState<string>("");
    const [detailCell, setDetailCell] = useState<OccupancyCell | null>(null);
    const [detailSheet, setDetailSheet] = useState<{ title: string; items: ReservationDetail[] } | null>(null);

    const period: AnalyticsPeriod = useMemo(
        () => resolvePeriod(preset, now, preset === "custom" && customStart && customEnd
            ? clampCustomRange(customStart, customEnd)
            : undefined),
        [preset, now, customStart, customEnd],
    );
    const prevPeriod = useMemo(() => previousPeriodOf(period), [period]);
    // Rango combinado: desde el inicio del período anterior hasta el fin del actual.
    const combined = useMemo(
        () => ({ venueId, start: prevPeriod.start, end: period.end }),
        [venueId, prevPeriod.start, period.end],
    );

    const config = useVenueConfig(venueId);
    const range = useRangeData(combined);

    const metrics = useMemo(() => {
        if (!config.data || !range.data) return null;
        const { courts, combos, schedules, venueFormats } = config.data;
        const { payments, slots } = range.data;

        const inPeriod = (d: string) => d >= period.start && d <= period.end;
        const inPrev = (d: string) => d >= prevPeriod.start && d <= prevPeriod.end;

        const curPayments = payments.filter((p) => inPeriod(p.date));
        const prvPayments = payments.filter((p) => inPrev(p.date));
        const curInstances = expandReservationInstances(slots, period);
        const prvInstances = expandReservationInstances(slots, prevPeriod);

        const revenue = computeRevenueSummary(curPayments);
        const prevRevenue = computeRevenueSummary(prvPayments);

        const cells = computeOccupancyHeatmap(curInstances, schedules, courts, period);
        const prevCells = computeOccupancyHeatmap(prvInstances, schedules, courts, prevPeriod);
        const occupancy = computeOverallOccupancy(cells);
        const prevOccupancy = computeOverallOccupancy(prevCells);

        const rates = computeStatusRates(curInstances);
        const prevRates = computeStatusRates(prvInstances);

        const byCourt = revenueByCourt(curPayments, courts);
        const byFormat = revenueByFormat(curPayments, courts, combos, venueFormats);
        const byWeekday = revenueByWeekday(curPayments);

        // Métricas de clientes (agrupadas por nombre).
        const clientStats = computeClientStats(curInstances, curPayments);
        const topByRevenue = rankClients(clientStats, "revenue", 5);
        const topByReservations = rankClients(clientStats, "reservations", 5);
        const topCancellations = rankClients(clientStats, "cancellations", 5);
        const topNoShows = rankClients(clientStats, "noShows", 5);
        const noShowDetails = listNoShows(curInstances);
        const cancellationDetails = listCancellations(curInstances, slots);

        return {
            courts,
            revenue, prevRevenue, cells, occupancy, prevOccupancy,
            rates, prevRates, byCourt, byFormat, byWeekday,
            topByRevenue, topByReservations, topCancellations, topNoShows,
            noShowDetails, cancellationDetails,
            revenueCmp: compare(revenue.totalCOP, prevRevenue.totalCOP),
            reservationsCmp: compare(rates.scheduled, prevRates.scheduled),
            hasData: curPayments.length > 0 || curInstances.length > 0,
        };
    }, [config.data, range.data, period, prevPeriod]);

    // Analytics: viewed (al cargar datos / cambiar período).
    useEffect(() => {
        if (!metrics) return;
        logVenueAnalyticsViewed({
            venueId,
            periodPreset: preset,
            rangeDays: rangeLengthDays(period.start, period.end),
            totalRevenueCOP: metrics.revenue.totalCOP,
            occupancyPct: metrics.occupancy,
            reservationsCount: metrics.rates.scheduled,
            noShowRate: metrics.rates.noShowRate,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [venueId, period.start, period.end, metrics !== null]);

    const changePreset = (next: AnalyticsPeriodPreset) => {
        if (next === preset) return;
        logVenueAnalyticsPeriodChanged({
            venueId, previousPreset: preset, newPreset: next,
            rangeDays: rangeLengthDays(period.start, period.end),
        });
        setPreset(next);
    };

    const handleCellTap = (cell: OccupancyCell) => {
        setDetailCell(cell);
        logVenueAnalyticsHeatmapCellTapped({
            venueId, dayOfWeek: cell.dayOfWeek, hour: cell.hour, occupancyPct: cell.rate,
        });
    };

    // Estados de carga / error.
    const loading = (config.loading || range.loading) && !metrics;
    if (loading) {
        return (
            <div className="space-y-4">
                <PeriodSelector preset={preset} onChange={changePreset}
                    customStart={customStart} customEnd={customEnd}
                    onCustomStart={setCustomStart} onCustomEnd={setCustomEnd} />
                <VenueAnalyticsSkeleton />
            </div>
        );
    }

    const error = config.error || range.error;
    if (error && !metrics) {
        return (
            <div className="space-y-4">
                <PeriodSelector preset={preset} onChange={changePreset}
                    customStart={customStart} customEnd={customEnd}
                    onCustomStart={setCustomStart} onCustomEnd={setCustomEnd} />
                <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
                    <BarChart3 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-600 mb-3">No pudimos cargar la analítica</p>
                    <button
                        onClick={() => { config.retry(); range.retry(); }}
                        className="inline-flex items-center gap-2 py-2 px-4 bg-[#1f7a4f] text-white rounded-xl text-sm font-bold active:scale-[0.98] transition-transform"
                    >
                        <RefreshCw className="w-4 h-4" /> Reintentar
                    </button>
                </div>
            </div>
        );
    }

    if (!metrics) return null;

    return (
        <div className="space-y-4">
            <PeriodSelector preset={preset} onChange={changePreset}
                customStart={customStart} customEnd={customEnd}
                onCustomStart={setCustomStart} onCustomEnd={setCustomEnd} />

            <AnimatePresence mode="wait">
                <motion.div
                    key={`${period.start}_${period.end}`}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-4"
                >
                    {!metrics.hasData ? (
                        <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center">
                            <BarChart3 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                            <p className="text-sm font-medium text-slate-600 mb-1">Sin datos en este período</p>
                            <p className="text-xs text-slate-400">Prueba con un rango más amplio.</p>
                        </div>
                    ) : (
                        <>
                            {/* Ingresos cobrados — card protagonista: total + comparativo +
                                desglose por método + tendencia, todo lo de plata en un solo lugar. */}
                            <div className="bg-white border border-slate-100 rounded-2xl p-4 space-y-3">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-500">
                                            <span className="w-6 h-6 rounded-lg grid place-items-center bg-emerald-50 text-emerald-600">
                                                <DollarSign className="w-3.5 h-3.5" />
                                            </span>
                                            Ingresos cobrados
                                        </div>
                                        <div className="text-2xl font-bold text-slate-900 tabular-nums tracking-tight mt-1.5">
                                            {formatCOP(metrics.revenue.totalCOP)}
                                        </div>
                                    </div>
                                    <DeltaBadge delta={pctDelta(metrics.revenueCmp.deltaPct, true)} />
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <MethodStat label="Efectivo" tone="emerald"
                                        amount={metrics.revenue.cashCOP} total={metrics.revenue.totalCOP} />
                                    <MethodStat label="Transferencia" tone="blue"
                                        amount={metrics.revenue.transferCOP} total={metrics.revenue.totalCOP} />
                                </div>

                                <div className="pt-1">
                                    <span className="text-[11.5px] font-semibold text-slate-400">
                                        Ingreso por día de la semana
                                    </span>
                                </div>
                                <RevenueBreakdownList items={metrics.byWeekday} tone="green" />
                            </div>

                            {/* Otras métricas */}
                            <div className="grid grid-cols-3 gap-2.5">
                                <KpiCard
                                    icon={<LayoutGrid className="w-4 h-4" />} tone="occ"
                                    label="Ocupación" value={`${Math.round(metrics.occupancy * 100)}%`}
                                    delta={ppDelta(metrics.occupancy, metrics.prevOccupancy, true)}
                                />
                                <KpiCard
                                    icon={<CalendarDays className="w-4 h-4" />} tone="res"
                                    label="Reservas" value={String(metrics.rates.scheduled)}
                                    delta={pctDelta(metrics.reservationsCmp.deltaPct, true)}
                                />
                                <KpiCard
                                    icon={<UserX className="w-4 h-4" />} tone="ns"
                                    label="Inasistencias" value={`${Math.round(metrics.rates.noShowRate * 100)}%`}
                                    delta={ppDelta(metrics.rates.noShowRate, metrics.prevRates.noShowRate, false)}
                                />
                            </div>

                            {/* Heatmap */}
                            <Card title="Ocupación por franja" sub="día × hora">
                                <OccupancyHeatmap cells={metrics.cells} onCellTap={handleCellTap} />
                            </Card>

                            {/* Breakdowns */}
                            <Card title="Ingreso por cancha">
                                <RevenueBreakdownList items={metrics.byCourt} tone="green" />
                            </Card>

                            <Card title="Ingreso por formato">
                                <RevenueBreakdownList items={metrics.byFormat} tone="blue" />
                                <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 mt-3 inline-block">
                                    No incluye mensualidades — se cobran aparte.
                                </p>
                            </Card>

                            {/* ===== Clientes ===== */}
                            <SectionLabel>Clientes</SectionLabel>

                            <Card title="Top clientes por ingresos">
                                <ClientRankList items={metrics.topByRevenue} metric="revenue" />
                            </Card>

                            <Card title="Top clientes por reservas">
                                <ClientRankList items={metrics.topByReservations} metric="reservations" />
                            </Card>

                            <Card title="Más cancelaciones">
                                <ClientRankList items={metrics.topCancellations} metric="cancellations" tone="rose"
                                    emptyLabel="Ningún cliente canceló en el período." />
                            </Card>

                            <Card title="Más inasistencias">
                                <ClientRankList items={metrics.topNoShows} metric="noShows" tone="rose"
                                    emptyLabel="Ningún cliente faltó en el período." />
                            </Card>

                            {/* ===== Detalles ===== */}
                            <SectionLabel>Detalle</SectionLabel>

                            <Card title="Inasistencias" sub={`${metrics.noShowDetails.length} total`}>
                                <ReservationDetailList items={metrics.noShowDetails} courts={metrics.courts} maxRows={6}
                                    emptyLabel="Sin inasistencias en el período."
                                    onSeeAll={() => setDetailSheet({ title: "Inasistencias", items: metrics.noShowDetails })} />
                            </Card>

                            <Card title="Reservas canceladas" sub={`${metrics.cancellationDetails.length} total`}>
                                <ReservationDetailList items={metrics.cancellationDetails} courts={metrics.courts} maxRows={6}
                                    emptyLabel="Sin cancelaciones en el período."
                                    onSeeAll={() => setDetailSheet({ title: "Reservas canceladas", items: metrics.cancellationDetails })} />
                            </Card>
                        </>
                    )}
                </motion.div>
            </AnimatePresence>

            {/* Detalle de celda del heatmap */}
            <AnimatePresence>
                {detailCell && (
                    <CellDetail cell={detailCell} onClose={() => setDetailCell(null)} />
                )}
            </AnimatePresence>

            {/* Historial completo de inasistencias / cancelaciones */}
            <AnimatePresence>
                {detailSheet && metrics && (
                    <ReservationDetailSheet
                        title={detailSheet.title}
                        items={detailSheet.items}
                        courts={metrics.courts}
                        onClose={() => setDetailSheet(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

// ========================
// Sub-componentes
// ========================

// La flecha refleja la DIRECCIÓN real del número (subió/bajó); el color refleja si
// ese cambio es BUENO (verde) o MALO (rojo). Se desacoplan a propósito: para métricas
// de semáforo invertido (Inasistencias), bajar es bueno → flecha ↓ + verde.
interface DeltaInfo { text: string; good: boolean; flat: boolean; direction: "up" | "down" | "flat"; }

function pctDelta(deltaPct: number | null, positiveIsGood: boolean): DeltaInfo {
    if (deltaPct === null) return { text: "—", good: true, flat: true, direction: "flat" };
    const rounded = Math.round(deltaPct);
    if (rounded === 0) return { text: "0%", good: true, flat: true, direction: "flat" };
    const up = rounded > 0;
    return { text: `${up ? "+" : "-"}${Math.abs(rounded)}%`, good: up === positiveIsGood, flat: false, direction: up ? "up" : "down" };
}

function ppDelta(cur: number, prev: number, positiveIsGood: boolean): DeltaInfo {
    const points = Math.round((cur - prev) * 100);
    if (points === 0) return { text: "0pp", good: true, flat: true, direction: "flat" };
    const up = points > 0;
    return { text: `${up ? "+" : "-"}${Math.abs(points)}pp`, good: up === positiveIsGood, flat: false, direction: up ? "up" : "down" };
}

const TONES: Record<string, string> = {
    rev: "bg-emerald-50 text-emerald-600",
    occ: "bg-blue-50 text-blue-600",
    res: "bg-slate-100 text-slate-500",
    ns: "bg-rose-50 text-rose-500",
};

function DeltaBadge({ delta }: { delta: DeltaInfo }) {
    const Arrow = delta.direction === "flat" ? Minus : delta.direction === "up" ? TrendingUp : TrendingDown;
    const color = delta.flat ? "text-slate-400" : delta.good ? "text-emerald-600" : "text-rose-500";
    return (
        <span className={`text-[11px] font-bold inline-flex items-center gap-0.5 shrink-0 ${color}`}>
            <Arrow className="w-3 h-3" /> {delta.text}
        </span>
    );
}

function KpiCard({ icon, tone, label, value, delta }: {
    icon: React.ReactNode; tone: keyof typeof TONES; label: string; value: string; delta: DeltaInfo;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
            className="bg-white border border-slate-100 rounded-2xl p-3 flex flex-col gap-1.5"
        >
            <div className="flex items-center justify-between">
                <span className={`w-7 h-7 rounded-lg grid place-items-center ${TONES[tone]}`}>{icon}</span>
                <DeltaBadge delta={delta} />
            </div>
            <span className="text-[11.5px] font-semibold text-slate-500 leading-tight">{label}</span>
            <span className="text-lg font-bold text-slate-900 tabular-nums tracking-tight">{value}</span>
        </motion.div>
    );
}

function MethodStat({ label, tone, amount, total }: {
    label: string; tone: "emerald" | "blue"; amount: number; total: number;
}) {
    const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
    const styles = tone === "emerald"
        ? "bg-emerald-50 text-emerald-700 border-emerald-100"
        : "bg-blue-50 text-blue-700 border-blue-100";
    return (
        <div className={`rounded-xl border p-2.5 ${styles}`}>
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide opacity-80">
                <span>{label}</span>
                <span className="tabular-nums">{pct}%</span>
            </div>
            <div className="text-base font-bold tabular-nums mt-0.5">{formatCOP(amount)}</div>
        </div>
    );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2 pt-2 pb-0.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{children}</span>
            <span className="flex-1 h-px bg-slate-100" />
        </div>
    );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
    return (
        <div className="bg-white border border-slate-100 rounded-2xl p-4 space-y-3">
            <div className="flex items-baseline justify-between">
                <h4 className="text-sm font-bold text-slate-800 tracking-tight">{title}</h4>
                {sub && <span className="text-[11.5px] text-slate-400">{sub}</span>}
            </div>
            {children}
        </div>
    );
}

function CellDetail({ cell, onClose }: { cell: OccupancyCell; onClose: () => void }) {
    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/30 p-4 pb-[calc(env(safe-area-inset-bottom,0px)+96px)] md:pb-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}
                transition={{ type: "spring", damping: 28, stiffness: 320 }}
                className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-3">
                    <h5 className="text-base font-bold text-slate-900">
                        {DAY_SHORT_LABELS[cell.dayOfWeek]} · {cell.hour}:00–{cell.hour + 1}:00
                    </h5>
                    <button onClick={onClose} className="text-slate-400 p-1"><X className="w-5 h-5" /></button>
                </div>
                <div className="space-y-2 text-sm">
                    <Row label="Ocupación" value={`${Math.round(cell.rate * 100)}%`} />
                    <Row label="Canchas·hora reservadas" value={String(cell.reservedHours)} />
                    <Row label="Canchas·hora disponibles" value={String(cell.availableHours)} />
                    {!cell.open && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">Franja fuera del horario configurado.</p>}
                </div>
            </motion.div>
        </motion.div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-slate-500">{label}</span>
            <span className="font-semibold text-slate-900 tabular-nums">{value}</span>
        </div>
    );
}

function PeriodSelector({ preset, onChange, customStart, customEnd, onCustomStart, onCustomEnd }: {
    preset: AnalyticsPeriodPreset; onChange: (p: AnalyticsPeriodPreset) => void;
    customStart: string; customEnd: string;
    onCustomStart: (v: string) => void; onCustomEnd: (v: string) => void;
}) {
    return (
        <div className="space-y-2.5">
            <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pb-0.5">
                {PRESETS.map((p) => (
                    <button
                        key={p.key}
                        onClick={() => onChange(p.key)}
                        className={`shrink-0 text-[12.5px] font-semibold px-3.5 py-1.5 rounded-full border transition-colors ${
                            preset === p.key
                                ? "bg-[#1f7a4f] border-[#1f7a4f] text-white"
                                : "bg-white border-slate-200 text-slate-500"
                        }`}
                    >
                        {p.label}
                    </button>
                ))}
            </div>
            {preset === "custom" && (
                <div className="flex items-center gap-2">
                    <input type="date" value={customStart} max={customEnd || undefined}
                        onChange={(e) => onCustomStart(e.target.value)}
                        className="flex-1 min-w-0 px-3 py-2 text-base border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30" />
                    <span className="text-slate-400 text-sm">a</span>
                    <input type="date" value={customEnd} min={customStart || undefined}
                        onChange={(e) => onCustomEnd(e.target.value)}
                        className="flex-1 min-w-0 px-3 py-2 text-base border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30" />
                </div>
            )}
        </div>
    );
}
