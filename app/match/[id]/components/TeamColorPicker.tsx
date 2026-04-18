"use client";

import { TEAM_COLOR_CONFIG, type TeamColor } from "@/lib/domain/team-colors";

interface TeamColorPickerProps {
  value: TeamColor;
  disabledColor: TeamColor;
  onChange: (color: TeamColor) => void;
}

const COLORS = Object.keys(TEAM_COLOR_CONFIG) as TeamColor[];

export default function TeamColorPicker({ value, disabledColor, onChange }: TeamColorPickerProps) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {COLORS.map((color) => {
        const isSelected = color === value;
        const isDisabled = color === disabledColor;
        const cfg = TEAM_COLOR_CONFIG[color];
        return (
          <button
            key={color}
            title={cfg.label}
            disabled={isDisabled}
            onClick={() => onChange(color)}
            style={{ backgroundColor: cfg.hex }}
            className={`w-7 h-7 rounded-full transition-all ${
              isSelected
                ? "ring-2 ring-offset-1 ring-slate-500 scale-110"
                : isDisabled
                ? "opacity-25 cursor-not-allowed"
                : "hover:scale-110 hover:ring-2 hover:ring-offset-1 hover:ring-slate-400"
            }`}
          />
        );
      })}
    </div>
  );
}
