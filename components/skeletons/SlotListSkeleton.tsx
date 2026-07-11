/**
 * Skeleton local del listado de horarios. Se muestra mientras se recarga el
 * schedule al cambiar de fecha, evitando ver los slots del día anterior.
 * Ref: docs/VENUE_DETAIL_ENHANCEMENTS_SDD.md §7 RN-08.
 */
export default function SlotListSkeleton() {
    return (
        <div className="space-y-2 animate-pulse" aria-hidden>
            {/* Barra de filtro de periodo */}
            <div className="flex gap-1.5 mb-2 p-1 bg-slate-100 rounded-xl">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex-1 h-9 bg-slate-200/70 rounded-lg" />
                ))}
            </div>
            {/* Filas de slots */}
            {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 bg-slate-100 rounded-xl border border-slate-100" />
            ))}
        </div>
    );
}
