"use client";

import { useState } from "react";
import { Link2, Check } from "lucide-react";
import { logCampaignLinkCopied } from "@/lib/analytics";

export default function CopyLinkButton() {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText("https://lacanchita.app/campaigns/camiseta-colombia");
        logCampaignLinkCopied("camiseta-colombia");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-sm border border-white/25 text-white font-bold text-xs rounded-lg py-2 px-3 shadow hover:bg-white/25 hover:-translate-y-0.5 active:scale-[0.98] transition-all"
        >
            {copied ? <Check className="w-3.5 h-3.5 text-[#FCD116]" /> : <Link2 className="w-3.5 h-3.5" />}
            {copied ? "¡Copiado!" : "Copiar link"}
        </button>
    );
}
