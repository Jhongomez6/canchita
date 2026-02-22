"use client";

import { useEffect, useRef, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { useAuth } from "@/lib/AuthContext";
import { createLocation } from "@/lib/locations";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { toast } from "react-hot-toast";
import { handleError } from "@/lib/utils/error";

declare global {
  interface Window {
    google: any;
  }
}

export default function NewLocationPage() {
  const { user } = useAuth();
  const router = useRouter();

  const inputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteRef = useRef<any>(null);

  const [place, setPlace] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  async function handleSave() {
    if (!place || !user) return;

    setSaving(true);
    setSaving(true);

    try {
      await createLocation({
        name: place.name,
        address: place.formatted_address,
        placeId: place.place_id,
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
        createdBy: user.uid,
      });

      router.push("/new-match");
      toast.success("Cancha guardada correctamente.");
    } catch (e: unknown) {
      handleError(e, "Error al guardar la cancha");
    } finally {
      setSaving(false);
    }
  }

  function initAutocomplete() {
    if (!window.google || !inputRef.current || autocompleteRef.current) return;

    autocompleteRef.current =
      new window.google.maps.places.Autocomplete(inputRef.current, {
        types: ["establishment"],
        fields: ["name", "formatted_address", "place_id", "geometry"],
      });

    autocompleteRef.current.addListener("place_changed", () => {
      const selected = autocompleteRef.current.getPlace();
      if (!selected?.geometry) return;
      setPlace(selected);
    });
  }

  return (
    <AuthGuard>
      <main style={{ padding: 20, maxWidth: 500, margin: "0 auto" }}>
        <h1 style={{ marginBottom: 12 }}>🏟️ Nueva cancha</h1>

        {/* INPUT */}
        <input
          ref={inputRef}
          placeholder="Busca la cancha en Google Maps"
          style={{
            width: "100%",
            padding: 14,
            borderRadius: 12,
            border: "1px solid #ccc",
          }}
        />

        {/* PREVIEW */}
        {place && (
          <div
            style={{
              marginTop: 16,
              padding: 16,
              borderRadius: 12,
              background: "#f8fafc",
              border: "1px solid #e5e7eb",
            }}
          >
            <strong>{place.name}</strong>
            <p style={{ fontSize: 14 }}>{place.formatted_address}</p>

            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                marginTop: 12,
                width: "100%",
                padding: 14,
                background: "#1f7a4f",
                color: "#fff",
                borderRadius: 12,
                border: "none",
                fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Guardando..." : "Guardar cancha"}
            </button>
          </div>
        )}
      </main>

      {/* GOOGLE MAPS SCRIPT */}
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
        strategy="afterInteractive"
        onLoad={initAutocomplete}
      />
    </AuthGuard>
  );
}
