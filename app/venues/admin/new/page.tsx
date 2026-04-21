"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { ArrowLeft, MapPin, Phone, FileText, Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { useAuth } from "@/lib/AuthContext";
import { isSuperAdmin } from "@/lib/domain/user";
import { validateDepositPercent, MIN_DEPOSIT_PERCENT, MAX_DEPOSIT_PERCENT } from "@/lib/domain/venue";
import { createVenue } from "@/lib/venues";
import { handleError } from "@/lib/utils/error";
import AuthGuard from "@/components/AuthGuard";

declare global {
    interface Window {
        google: {
            maps: {
                places: {
                    Autocomplete: new (input: HTMLInputElement, opts?: object) => unknown;
                };
            };
        };
    }
}

interface GooglePlace {
    name: string;
    formatted_address: string;
    place_id: string;
    geometry: {
        location: {
            lat: () => number;
            lng: () => number;
        };
    };
}

function NewVenueContent() {
    const { user, profile } = useAuth();
    const router = useRouter();

    const inputRef = useRef<HTMLInputElement | null>(null);
    const autocompleteRef = useRef<unknown>(null);

    const [place, setPlace] = useState<GooglePlace | null>(null);
    const [phone, setPhone] = useState("");
    const [description, setDescription] = useState("");
    const [imageURL, setImageURL] = useState("");
    const [depositRequired, setDepositRequired] = useState(true);
    const [depositPercent, setDepositPercent] = useState(30);
    const [saving, setSaving] = useState(false);

    // Auth guard
    if (profile && !isSuperAdmin(profile)) {
        router.replace("/");
        return null;
    }

    function initAutocomplete() {
        if (!window.google || !inputRef.current || autocompleteRef.current) return;

        autocompleteRef.current = new window.google.maps.places.Autocomplete(
            inputRef.current,
            {
                types: ["establishment"],
                fields: ["name", "formatted_address", "place_id", "geometry"],
            },
        );

        (
            autocompleteRef.current as {
                addListener: (event: string, cb: () => void) => void;
            }
        ).addListener("place_changed", () => {
            const selected = (
                autocompleteRef.current as {
                    getPlace: () => GooglePlace | undefined;
                }
            )?.getPlace();
            if (!selected?.geometry) return;
            setPlace(selected);
        });
    }

    async function handleCreate() {
        if (!place || !user) return;

        if (depositRequired) {
            try {
                validateDepositPercent(depositPercent);
            } catch {
                toast.error(`El porcentaje debe estar entre ${MIN_DEPOSIT_PERCENT}% y ${MAX_DEPOSIT_PERCENT}%`);
                return;
            }
        }

        setSaving(true);
        try {
            const venueId = await createVenue({
                name: place.name,
                address: place.formatted_address,
                placeId: place.place_id,
                lat: place.geometry.location.lat(),
                lng: place.geometry.location.lng(),
                createdBy: user.uid,
                depositRequired,
                depositPercent: depositRequired ? depositPercent : 30,
                phone: phone.trim() || undefined,
                description: description.trim() || undefined,
                imageURL: imageURL.trim() || undefined,
            });

            toast.success("Sede creada correctamente");
            router.push(`/venues/admin/${venueId}`);
        } catch (err) {
            handleError(err, "Error al crear la sede");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="min-h-screen bg-slate-50 pb-24 md:pb-0">
            <div className="max-w-md mx-auto">
                {/* Header */}
                <div className="bg-gradient-to-br from-[#1f7a4f] to-[#145c3a] p-6 pb-8 rounded-b-3xl shadow-lg">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => router.back()}
                            className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center"
                        >
                            <ArrowLeft className="w-4 h-4 text-white" />
                        </button>
                        <div>
                            <h1 className="text-lg font-bold text-white">Nueva sede</h1>
                            <p className="text-xs text-white/60">Busca el lugar en Google Maps</p>
                        </div>
                    </div>
                </div>

                <div className="px-4 mt-5 space-y-5">
                    {/* Google Places search */}
                    <div>
                        <label className="text-sm font-semibold text-slate-600 mb-2 block">
                            Ubicación
                        </label>
                        <div className="relative">
                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                ref={inputRef}
                                placeholder="Busca la cancha en Google Maps..."
                                className="w-full pl-10 pr-4 py-3 text-base border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30"
                            />
                        </div>
                    </div>

                    {/* Place preview */}
                    {place && (
                        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                            <h3 className="text-base font-bold text-slate-800">{place.name}</h3>
                            <p className="text-sm text-slate-500 mt-0.5">{place.formatted_address}</p>
                        </div>
                    )}

                    {/* Optional fields */}
                    <div>
                        <label className="text-sm font-semibold text-slate-600 mb-2 block">
                            Teléfono (opcional)
                        </label>
                        <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="tel"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                placeholder="Ej: 300 123 4567"
                                className="w-full pl-10 pr-4 py-3 text-base border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-sm font-semibold text-slate-600 mb-2 block">
                            Descripción (opcional)
                        </label>
                        <div className="relative">
                            <FileText className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Breve descripción de la sede..."
                                rows={3}
                                className="w-full pl-10 pr-4 py-3 text-base border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30 resize-none"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-sm font-semibold text-slate-600 mb-2 block">
                            URL de imagen (opcional)
                        </label>
                        <input
                            type="url"
                            value={imageURL}
                            onChange={(e) => setImageURL(e.target.value)}
                            placeholder="https://..."
                            className="w-full px-4 py-3 text-base border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1f7a4f]/30"
                        />
                    </div>

                    {/* Deposit config */}
                    <div className="bg-white rounded-2xl border border-slate-100 p-5">
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <h3 className="text-sm font-semibold text-slate-700">Depósito requerido</h3>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    Cobra un porcentaje al reservar
                                </p>
                            </div>
                            <button
                                onClick={() => setDepositRequired(!depositRequired)}
                                className={`w-12 h-7 rounded-full transition-colors relative ${depositRequired ? "bg-[#1f7a4f]" : "bg-slate-300"}`}
                            >
                                <span
                                    className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${depositRequired ? "left-[22px]" : "left-0.5"}`}
                                />
                            </button>
                        </div>

                        {depositRequired && (
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm text-slate-600">Porcentaje</span>
                                    <span className="text-lg font-bold text-[#1f7a4f]">{depositPercent}%</span>
                                </div>
                                <input
                                    type="range"
                                    min={MIN_DEPOSIT_PERCENT}
                                    max={MAX_DEPOSIT_PERCENT}
                                    step={5}
                                    value={depositPercent}
                                    onChange={(e) => setDepositPercent(Number(e.target.value))}
                                    className="w-full accent-[#1f7a4f]"
                                />
                                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                                    <span>{MIN_DEPOSIT_PERCENT}%</span>
                                    <span>{MAX_DEPOSIT_PERCENT}%</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Create button */}
                    <button
                        onClick={handleCreate}
                        disabled={!place || saving}
                        className={`
                            w-full py-3.5 rounded-xl text-base font-bold transition-all flex items-center justify-center gap-2
                            ${!place || saving
                                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                                : "bg-[#1f7a4f] text-white hover:bg-[#145c3a] active:scale-[0.98]"
                            }
                        `}
                    >
                        {saving ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Creando sede...
                            </>
                        ) : (
                            "Crear sede"
                        )}
                    </button>

                    <p className="text-xs text-slate-400 text-center">
                        Después de crear la sede, configura canchas y horarios desde el panel de administración.
                    </p>
                </div>
            </div>

            {/* Google Maps Script */}
            <Script
                src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
                strategy="afterInteractive"
                onLoad={initAutocomplete}
            />
        </div>
    );
}

export default function NewVenuePage() {
    return (
        <AuthGuard>
            <NewVenueContent />
        </AuthGuard>
    );
}
