"use client";

import { useState } from "react";
import { Guest, Position, ALLOWED_POSITIONS } from "@/lib/domain/guest";
import { addGuestToMatch, removeGuestFromMatch } from "@/lib/guests";
import { POSITION_LABELS } from "@/lib/domain/player";
import { toast } from "react-hot-toast";
import { handleError } from "@/lib/utils/error";

interface AddGuestFormProps {
  matchId: string;
  playerUid: string;
  existingGuests?: Guest[];
  onSuccess?: () => void;
}

export default function AddGuestForm({
  matchId,
  playerUid,
  existingGuests = [],
  onSuccess,
}: AddGuestFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [selectedPositions, setSelectedPositions] = useState<Position[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

    if (!isFormValid) {
      toast.error("Por favor completa todos los campos correctamente");
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

      toast.success("Invitado agregado correctamente");
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "GuestValidationError") {
        handleError(`Error de validación: ${err.message}`);
      } else {
        handleError(err, "Error al agregar invitado");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveGuest = async (guestName: string) => {
    if (!confirm(`¿Eliminar al invitado ${guestName}?`)) return;

    setIsSubmitting(true);

    try {
      await removeGuestFromMatch(matchId, playerUid, guestName);
      toast.success("Invitado eliminado");
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      handleError(err, "Error al eliminar invitado");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ========================
  // RENDER: GUEST EXISTENTE
  // ========================
  const hasGuests = existingGuests && existingGuests.length > 0;
  const reachedLimit = existingGuests && existingGuests.length >= 2;

  // ========================
  // RENDER: BOTÓN TOGGLE
  // ========================
  if (!isOpen) {
    return (
      <div className="mb-6">
        {hasGuests && (
          <div className="space-y-4 mb-4">
            {existingGuests.map((guest, idx) => (
              <div key={`${guest.name}-${idx}`} className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-purple-50 rounded-bl-full -mr-8 -mt-8" />

                <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2 relative z-10">
                  👤 Tu invitado {existingGuests.length > 1 ? `#${idx + 1}` : ""}
                </h3>

                <div className="p-3 bg-purple-50 rounded-xl mb-4 border border-purple-100 relative z-10">
                  <p className="font-bold text-slate-800 mb-1">{guest.name}</p>
                  <p className="text-sm text-purple-700">
                    {guest.positions
                      .map((pos) => POSITION_LABELS[pos])
                      .join(", ")}
                  </p>
                </div>

                <button
                  onClick={() => handleRemoveGuest(guest.name)}
                  disabled={isSubmitting}
                  className="w-full py-3 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 transition-colors text-sm"
                >
                  {isSubmitting ? "Eliminando..." : "Eliminar invitado"}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Solo mostrar el botón de agregar si no ha alcanzado 2 invitados */}
        {!reachedLimit && (
          <button
            onClick={() => setIsOpen(true)}
            className="w-full py-3 bg-white border border-dashed border-slate-300 rounded-xl text-slate-500 font-bold hover:bg-slate-50 hover:border-slate-400 transition-all flex items-center justify-center gap-2"
          >
            <span className="text-xl">➕</span>
            <span>Agregar un invitado {hasGuests && "(1 cupo restante)"}</span>
          </button>
        )}
      </div>
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
        Puedes invitar hasta 2 personas sin cuenta por partido.
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
      </form>
    </div>
  );
}
