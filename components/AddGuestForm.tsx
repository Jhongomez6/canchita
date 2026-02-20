"use client";

import { useState } from "react";
import { Position, ALLOWED_POSITIONS } from "@/lib/domain/guest";
import { addGuestToMatch, removeGuestFromMatch } from "@/lib/guests";
import { POSITION_LABELS } from "@/lib/domain/player";

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
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [selectedPositions, setSelectedPositions] = useState<Position[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ========================
  // VALIDACIONES
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
        return prev.filter((p) => p !== position);
      } else {
        if (prev.length >= 2) {
          return [...prev.slice(1), position];
        }
        return [...prev, position];
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

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

      setName("");
      setSelectedPositions([]);
      setIsOpen(false); // Close after success

      if (onSuccess) onSuccess();
    } catch (err: any) {
      if (err.name === "GuestValidationError") {
        setError(`Error de validación: ${err.message}`);
      } else if (err.message === "MATCH_FULL") {
        setError("El partido está lleno");
      } else {
        setError(err.message || "Error al agregar invitado");
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
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err.message || "Error al eliminar invitado");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ========================
  // RENDER: GUEST EXISTENTE
  // ========================
  if (existingGuest) {
    return (
      <div className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100 mb-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-16 h-16 bg-purple-50 rounded-bl-full -mr-8 -mt-8" />

        <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2 relative z-10">
          👤 Tu invitado
        </h3>

        <div className="p-3 bg-purple-50 rounded-xl mb-4 border border-purple-100 relative z-10">
          <p className="font-bold text-slate-800 mb-1">{existingGuest.name}</p>
          <p className="text-sm text-purple-700">
            {existingGuest.positions
              .map((pos) => POSITION_LABELS[pos])
              .join(", ")}
          </p>
        </div>

        <button
          onClick={handleRemoveGuest}
          disabled={isSubmitting}
          className="w-full py-3 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 transition-colors text-sm"
        >
          {isSubmitting ? "Eliminando..." : "Eliminar invitado"}
        </button>

        {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
      </div>
    );
  }

  // ========================
  // RENDER: BOTÓN TOGGLE
  // ========================
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-full py-3 bg-white border border-dashed border-slate-300 rounded-xl text-slate-500 font-bold hover:bg-slate-50 hover:border-slate-400 transition-all mb-6 flex items-center justify-center gap-2"
      >
        <span className="text-xl">➕</span>
        <span>Agregar un invitado</span>
      </button>
    );
  }

  // ========================
  // RENDER: FORMULARIO
  // ========================
  return (
    <div className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100 mb-6 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-slate-800">👤 Agregar invitado</h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-slate-400 hover:text-slate-600"
        >
          ✕
        </button>
      </div>

      <p className="text-sm text-slate-500 mb-4">
        Puedes invitar a 1 persona sin cuenta.
      </p>

      <form onSubmit={handleSubmit}>
        {/* NOMBRE */}
        <div className="mb-4">
          <label className="block text-sm font-bold text-slate-700 mb-2">
            Nombre del invitado *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Juan Pérez"
            className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
            autoFocus
          />
          {name && !isNameValid && (
            <p className="text-red-500 text-xs mt-1">Mínimo 2 caracteres</p>
          )}
        </div>

        {/* POSICIONES */}
        <div className="mb-6">
          <label className="block text-sm font-bold text-slate-700 mb-2">
            Posiciones (1-2) *
          </label>
          <div className="grid grid-cols-2 gap-2">
            {ALLOWED_POSITIONS.map((pos) => {
              const isSelected = selectedPositions.includes(pos);
              return (
                <button
                  key={pos}
                  type="button"
                  onClick={() => handlePositionToggle(pos)}
                  className={`
                    p-3 rounded-xl border text-sm font-bold transition-all relative
                    ${isSelected
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}
                  `}
                >
                  {POSITION_LABELS[pos]}
                  {isSelected && (
                    <span className="absolute top-1 right-1 text-emerald-600 text-xs">✓</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="submit"
          disabled={!isFormValid || isSubmitting}
          className={`
            w-full py-3 rounded-xl font-bold text-white transition-all shadow-md
            ${!isFormValid || isSubmitting
              ? "bg-slate-300 cursor-not-allowed"
              : "bg-emerald-600 hover:bg-emerald-700 hover:scale-[1.02] active:scale-[0.98]"}
          `}
        >
          {isSubmitting ? "Agregando..." : "Confirmar invitado"}
        </button>

        {error && (
          <p className="text-red-500 text-sm mt-3 text-center font-medium bg-red-50 p-2 rounded-lg">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
