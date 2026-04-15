"use client";

import { Wallet } from "lucide-react";
import { formatCOP } from "@/lib/domain/wallet";

interface WalletBalanceProps {
  balanceCOP: number;
  size?: "sm" | "md";
}

export default function WalletBalance({ balanceCOP, size = "sm" }: WalletBalanceProps) {
  return (
    <div className={`inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 font-bold rounded-full border border-emerald-200 ${
      size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm"
    }`}>
      <Wallet className={size === "sm" ? "w-3 h-3" : "w-4 h-4"} />
      {formatCOP(balanceCOP)}
    </div>
  );
}
