"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useSearchParams, useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import { subscribeToWallet, getWalletTransactions } from "@/lib/wallet";
import type { Wallet, WalletTransaction } from "@/lib/domain/wallet";
import { formatCOP, txTypeLabel } from "@/lib/domain/wallet";
import WompiWidget from "@/components/WompiWidget";
import RedeemCodeModal from "@/components/RedeemCodeModal";
import { type DocumentSnapshot } from "firebase/firestore";
import {
  Wallet as WalletIcon,
  ArrowUpCircle,
  ArrowDownCircle,
  Ticket,
  CreditCard,
  Loader2,
  RefreshCw,
} from "lucide-react";
import WalletSkeleton from "@/components/skeletons/WalletSkeleton";
import { hasWalletAccess } from "@/lib/domain/user";

function WalletPageContent() {
  const { user, profile, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [initialLoading, setInitialLoading] = useState(true);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [showRecharge, setShowRecharge] = useState(false);
  const [showRedeem, setShowRedeem] = useState(false);
  const [pendingTopup, setPendingTopup] = useState(false);
  const [topupTimeout, setTopupTimeout] = useState(false);

  // Detect ?topup=pending from Wompi redirect
  useEffect(() => {
    if (searchParams.get("topup") === "pending") {
      setPendingTopup(true);
      const timer = setTimeout(() => {
        setPendingTopup(false);
        setTopupTimeout(true);
      }, 60000);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  // Subscribe to wallet balance (real-time)
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToWallet(user.uid, (w) => {
      setWallet(w);
      if (pendingTopup && w) {
        setPendingTopup(false);
      }
    });
    return () => unsub();
  }, [user, pendingTopup]);

  // Load transactions
  const loadTransactions = useCallback(
    async (reset = false) => {
      if (!user) return;
      setLoadingMore(true);
      try {
        const result = await getWalletTransactions(
          user.uid,
          20,
          reset ? undefined : (lastDoc ?? undefined)
        );
        if (reset) {
          setTransactions(result.transactions);
        } else {
          setTransactions((prev) => [...prev, ...result.transactions]);
        }
        setLastDoc(result.lastDoc);
        setHasMore(result.transactions.length === 20);
      } catch (err) {
        console.error("[wallet] Error cargando transacciones:", err);
      } finally {
        setLoadingMore(false);
        setInitialLoading(false);
      }
    },
    [user, lastDoc]
  );

  useEffect(() => {
    if (!user) return;
    loadTransactions(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Refresh transactions when wallet changes (new topup/debit)
  useEffect(() => {
    if (!user || !wallet) return;
    loadTransactions(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet?.balanceCOP]);

  if (authLoading || initialLoading) {
    return (
      <AuthGuard>
        <WalletSkeleton />
      </AuthGuard>
    );
  }

  if (profile && !hasWalletAccess(profile)) {
    router.replace("/");
    return null;
  }

  const balance = wallet?.balanceCOP ?? 0;

  return (
    <AuthGuard>
      <main className="min-h-screen bg-slate-50 pb-24">
        <div className="max-w-md mx-auto">
          {/* HEADER VERDE */}
          <div className="bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] text-white p-6 pb-10 rounded-b-3xl shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />

            {/* Título */}
            <h2 className="text-lg font-bold relative z-10 flex items-center gap-2">
              <WalletIcon className="w-5 h-5" />
              Mi Billetera
            </h2>
            <p className="text-white/70 text-sm relative z-10 mt-0.5">
              {balance === 0 ? "Recarga y asegura tu cupo" : "Tu dinero para pisar la cancha"}
            </p>

            {/* Balance centrado */}
            <div className="mt-6 relative z-10 text-center">
              <p className="text-4xl font-extrabold tabular-nums">
                {formatCOP(balance)}
                <span className="text-lg font-semibold text-white/60 ml-2">COP</span>
              </p>
            </div>

            {/* Pending topup banner */}
            {pendingTopup && (
              <div className="mt-4 bg-white/20 rounded-xl px-3 py-2 flex items-center gap-2 relative z-10">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm font-medium">Verificando tu pago...</span>
              </div>
            )}
            {topupTimeout && (
              <div className="mt-4 bg-white/20 rounded-xl px-3 py-2 relative z-10">
                <p className="text-sm font-medium">Tu pago está siendo procesado.</p>
                <p className="text-xs text-white/70 mt-0.5">Si fue aprobado, el saldo aparecerá en unos minutos.</p>
              </div>
            )}
          </div>

          <div className="px-4 -mt-4 relative z-20 space-y-4">
            {/* ACTION BUTTONS */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowRecharge(!showRecharge)}
                className={`flex-1 py-3.5 rounded-2xl font-bold text-sm shadow-md flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                  showRecharge
                    ? "bg-white text-[#1f7a4f] border-2 border-[#1f7a4f]"
                    : "bg-[#1f7a4f] text-white hover:bg-[#16603c]"
                }`}
              >
                <CreditCard className="w-4 h-4" />
                Recargar
              </button>
              <button
                onClick={() => setShowRedeem(true)}
                className="flex-1 py-3.5 rounded-2xl font-bold text-sm bg-white text-slate-700 border border-slate-200 shadow-sm hover:bg-slate-50 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <Ticket className="w-4 h-4" />
                Canjear codigo
              </button>
            </div>

            {/* WOMPI RECHARGE WIDGET */}
            {showRecharge && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-[#1f7a4f]" />
                  Recargar saldo
                </h3>
                <WompiWidget onStarted={() => setShowRecharge(false)} />
              </div>
            )}

            {/* TRANSACTIONS */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-slate-400" />
                  Movimientos
                </h3>
              </div>

              {transactions.length === 0 && !loadingMore && (
                <div className="px-5 py-10 text-center">
                  <div className="flex justify-center mb-3">
                    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 12V22H4V12" />
                      <path d="M22 7H2v5h20V7z" />
                      <path d="M12 22V7" />
                      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
                      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-slate-500">
                    Sin movimientos aún
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Recarga tu billetera o canjea un código para empezar
                  </p>
                </div>
              )}

              <div className="divide-y divide-slate-50">
                {transactions.map((tx) => {
                  const isCredit = tx.amountCOP > 0;
                  return (
                    <div key={tx.id} className="px-5 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-1.5 rounded-lg ${
                            isCredit
                              ? "bg-emerald-50 text-emerald-500"
                              : "bg-red-50 text-red-500"
                          }`}
                        >
                          {isCredit ? (
                            <ArrowUpCircle className="w-4 h-4" />
                          ) : (
                            <ArrowDownCircle className="w-4 h-4" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-700">
                            {txTypeLabel(tx.type, tx.paymentMethod)}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {new Date(tx.createdAt).toLocaleDateString("es-CO", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-sm font-bold tabular-nums ${
                          isCredit ? "text-emerald-600" : "text-red-500"
                        }`}
                      >
                        {isCredit ? "+" : ""}
                        {formatCOP(tx.amountCOP)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Load more */}
              {hasMore && transactions.length > 0 && (
                <div className="px-5 py-3 border-t border-slate-100">
                  <button
                    disabled={loadingMore}
                    onClick={() => loadTransactions()}
                    className="w-full py-2 text-sm font-semibold text-[#1f7a4f] hover:text-[#145c3a] transition-colors flex items-center justify-center gap-1.5"
                  >
                    {loadingMore ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando...</>
                    ) : (
                      "Cargar mas"
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* REDEEM CODE MODAL */}
        <RedeemCodeModal
          isOpen={showRedeem}
          onClose={() => setShowRedeem(false)}
        />
      </main>
    </AuthGuard>
  );
}

export default function WalletPage() {
  return (
    <Suspense fallback={<AuthGuard><WalletSkeleton /></AuthGuard>}>
      <WalletPageContent />
    </Suspense>
  );
}
