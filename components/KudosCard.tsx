import { HelpCircle, Award } from "lucide-react";
import { logTooltipOpened } from "@/lib/analytics";
import type { UserKudosSummary } from "@/lib/domain/matchReview";
import KudosBadges from "@/components/profile/KudosBadges";

interface KudosCardProps {
    kudosSummary: UserKudosSummary;
    onViewKudosHistory?: () => void;
}

export default function KudosCard({ kudosSummary, onViewKudosHistory }: KudosCardProps) {
    const hasKudos = (kudosSummary.total ?? 0) > 0;

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        <Award className="w-4 h-4 text-[#1f7a4f]" /> Reconocimientos
                    </h3>
                    <div className="group relative flex items-center" tabIndex={0} onMouseEnter={() => logTooltipOpened("kudos_legend")}>
                        <span className="cursor-pointer w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors">
                            <HelpCircle size={14} />
                        </span>
                        <div className="absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full w-60 p-3 bg-slate-800 text-white text-xs rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus:opacity-100 group-focus:visible focus-within:opacity-100 focus-within:visible transition-all pointer-events-none z-50 text-left leading-relaxed">
                            Reconocimientos que recibiste de tus compañeros al final de cada partido.
                            <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                        </div>
                    </div>
                </div>
                {hasKudos && onViewKudosHistory && (
                    <button
                        type="button"
                        onClick={onViewKudosHistory}
                        className="text-xs font-bold text-emerald-600 active:opacity-60"
                    >
                        Ver historial
                    </button>
                )}
            </div>
            <KudosBadges summary={kudosSummary} />
        </div>
    );
}
