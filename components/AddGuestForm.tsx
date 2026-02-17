/**
 * ========================
 * ADD GUEST FORM COMPONENT
 * ========================
 * 
 * Specification-Driven Development (SDD)
 * 
 * Este componente implementa la UI para agregar invitados,
 * respetando estrictamente la especificación funcional.
 * 
 * ESPECIFICACIÓN UI:
 * - Formulario simple con nombre y selección de posiciones
 * - Validación en tiempo real según reglas de dominio
 * - Feedback claro de errores
 * - Máximo 1 invitado por jugador
 * - Posiciones: 1-2 seleccionables
 */

"use client";

import { useState } from "react";
import { Position, ALLOWED_POSITIONS } from "@/lib/domain/guest";
import { addGuestToMatch, removeGuestFromMatch } from "@/lib/guests";

const POSITION_LABELS: Record<Position, string> = {
  GK: "Portero",
  DEF: "Defensa",
  MID: "Mediocampista",
  FWD: "Delantero",
};

interface AddGuestFormProps {
  matchId: string;
  playerUid: string;
  existingGuest?: {
    name: string;
    positions: Position[];
  } | null;
  onSuccess?: () => void;
}

export default function AddGuestForm({
  matchId,
  playerUid,
  existingGuest,
  onSuccess,
}: AddGuestFormProps) {
  const [name, setName] = useState("");
  const [selectedPositions, setSelectedPositions] = useState<Position[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // ========================
  // VALIDACIONES LOCALES
  // ========================

  const isNameValid = name.trim().length >= 2;
  const arePositionsValid =
    selectedPositions.length >= 1 && selectedPositions.length <= 2;
  const isFormValid = isNameValid && arePositionsValid;

  // ========================
  // HANDLERS
  // ========================

  const handlePositionToggle = (position: Position) => {
    setSelectedPositions((prev) => {
      if (prev.includes(position)) {
        // Deseleccionar
        return prev.filter((p) => p !== position);
      } else {
        // Seleccionar (máximo 2)
        if (prev.length >= 2) {
          // Reemplazar la primera seleccionada
          return [...prev.slice(1), position];
        }
        return [...prev, position];
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!isFormValid) {
      setError("Por favor completa todos los campos correctamente");
      return;
    }

    setIsSubmitting(true);

    try {
      await addGuestToMatch(matchId, playerUid, {
        name: name.trim(),
        positions: selectedPositions,
      });

      setSuccess(true);
      setName("");
      setSelectedPositions([]);

      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      if (err.name === "GuestValidationError") {
        setError(`Error de validación: ${err.message}`);
      } else if (err.name === "GuestBusinessError") {
        setError(err.message);
      } else if (err.message === "MATCH_FULL") {
        setError("El partido está lleno");
      } else {
        setError("Error al agregar invitado. Intenta de nuevo.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveGuest = async () => {
    if (!confirm("¿Eliminar a tu invitado?")) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await removeGuestFromMatch(matchId, playerUid);
      setSuccess(true);

      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      setError(err.message || "Error al eliminar invitado");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ========================
  // RENDER: INVITADO EXISTENTE
  // ========================

  if (existingGuest) {
    return (
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: 20,
          margin: "0 12px 16px",
          boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
        }}
      >
        <h3 style={{ marginBottom: 12 }}>👥 Tu invitado</h3>

        <div
          style={{
            padding: 12,
            background: "#f0fdf4",
            borderRadius: 8,
            marginBottom: 12,
          }}
        >
          <p style={{ fontWeight: 600, marginBottom: 4 }}>
            {existingGuest.name}
          </p>
          <p style={{ fontSize: 14, color: "#666" }}>
            {existingGuest.positions
              .map((pos) => POSITION_LABELS[pos])
              .join(", ")}
          </p>
        </div>

        <button
          onClick={handleRemoveGuest}
          disabled={isSubmitting}
          style={{
            width: "100%",
            padding: 12,
            background: isSubmitting ? "#9ca3af" : "#dc2626",
            color: "#fff",
            borderRadius: 12,
            border: "none",
            fontSize: 14,
            fontWeight: 600,
            cursor: isSubmitting ? "not-allowed" : "pointer",
          }}
        >
          {isSubmitting ? "Eliminando..." : "Eliminar invitado"}
        </button>

        {error && (
          <p style={{ color: "#dc2626", fontSize: 14, marginTop: 8 }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  // ========================
  // RENDER: FORMULARIO
  // ========================

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 16,
        padding: 20,
        margin: "0 12px 16px",
        boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
      }}
    >
      <h3 style={{ marginBottom: 8 }}>👥 Agregar invitado</h3>
      <p style={{ fontSize: 14, color: "#666", marginBottom: 16 }}>
        Puedes invitar a 1 persona sin cuenta
      </p>

      <form onSubmit={handleSubmit}>
        {/* NOMBRE */}
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              display: "block",
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            Nombre del invitado *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Juan Pérez"
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              fontSize: 14,
            }}
          />
          {name && !isNameValid && (
            <p style={{ color: "#dc2626", fontSize: 12, marginTop: 4 }}>
              Mínimo 2 caracteres
            </p>
          )}
        </div>

        {/* POSICIONES */}
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              display: "block",
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            Posiciones (1-2) *
          </label>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}
          >
            {ALLOWED_POSITIONS.map((pos) => {
              const isSelected = selectedPositions.includes(pos);
              return (
                <button
                  key={pos}
                  type="button"
                  onClick={() => handlePositionToggle(pos)}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    border: isSelected
                      ? "2px solid #1f7a4f"
                      : "1px solid #e5e7eb",
                    background: isSelected ? "#ecfdf5" : "#fff",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    position: "relative",
                  }}
                >
                  {isSelected && (
                    <span style={{ position: "absolute", top: 4, right: 4 }}>
                      ✓
                    </span>
                  )}
                  {POSITION_LABELS[pos]}
                </button>
              );
            })}
          </div>
          {selectedPositions.length > 0 && !arePositionsValid && (
            <p style={{ color: "#dc2626", fontSize: 12, marginTop: 4 }}>
              Selecciona entre 1 y 2 posiciones
            </p>
          )}
        </div>

        {/* SUBMIT */}
        <button
          type="submit"
          disabled={!isFormValid || isSubmitting}
          style={{
            width: "100%",
            padding: 14,
            background:
              !isFormValid || isSubmitting ? "#9ca3af" : "#1f7a4f",
            color: "#fff",
            borderRadius: 12,
            border: "none",
            fontSize: 16,
            fontWeight: 600,
            cursor: !isFormValid || isSubmitting ? "not-allowed" : "pointer",
          }}
        >
          {isSubmitting ? "Agregando..." : "Agregar invitado"}
        </button>
      </form>

      {/* MENSAJES */}
      {error && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            background: "#fee2e2",
            color: "#991b1b",
            borderRadius: 8,
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            background: "#dcfce7",
            color: "#166534",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          ✅ Invitado agregado correctamente
        </div>
      )}
    </div>
  );
}
