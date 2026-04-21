"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { MapPin } from "lucide-react";
import type { Venue } from "@/lib/domain/venue";

interface VenueCardProps {
    venue: Venue;
    onClick: () => void;
}

export default function VenueCard({ venue, onClick }: VenueCardProps) {
    return (
        <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={onClick}
            className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden text-left hover:shadow-md transition-shadow"
        >
            {/* Image */}
            {venue.imageURL ? (
                <div className="relative h-36 bg-slate-100 overflow-hidden">
                    <Image
                        unoptimized
                        src={venue.imageURL}
                        alt={venue.name}
                        fill
                        className="object-cover"
                    />
                </div>
            ) : (
                <div className="h-36 bg-gradient-to-br from-emerald-100 to-emerald-50 flex items-center justify-center">
                    <span className="text-4xl">&#9917;</span>
                </div>
            )}

            {/* Content */}
            <div className="p-4">
                <h3 className="text-base font-bold text-slate-800 mb-1">{venue.name}</h3>
                <div className="flex items-center gap-1.5 text-slate-400">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="text-xs truncate">{venue.address}</span>
                </div>
                {venue.depositRequired && (
                    <span className="inline-block mt-2 text-[10px] font-semibold text-[#1f7a4f] bg-emerald-50 px-2 py-0.5 rounded-full">
                        Reserva con depósito
                    </span>
                )}
            </div>
        </motion.button>
    );
}
