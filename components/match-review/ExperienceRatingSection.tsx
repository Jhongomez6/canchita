"use client";

import type { DimensionValue } from "@/lib/domain/matchReview";
import { COMMENT_MAX_LENGTH } from "@/lib/domain/matchReview";
import StarRating from "./StarRating";
import DimensionChips from "./DimensionChips";

interface Props {
    rating: number | null;
    dimensions: { organization: DimensionValue; levelBalance: DimensionValue };
    comment: string;
    onRatingChange: (v: number) => void;
    onDimensionChange: (key: "organization" | "levelBalance", val: DimensionValue) => void;
    onCommentChange: (v: string) => void;
    disabled?: boolean;
}

export default function ExperienceRatingSection({
    rating,
    dimensions,
    comment,
    onRatingChange,
    onDimensionChange,
    onCommentChange,
    disabled = false,
}: Props) {
    return (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
            <h2 className="text-sm font-bold text-slate-700 mb-4">¿Cómo estuvo el partido?</h2>

            {/* Stars */}
            <div className="mb-5">
                <StarRating value={rating} onChange={onRatingChange} disabled={disabled} />
            </div>

            {/* Dimensions */}
            <div className="mb-4">
                <DimensionChips value={dimensions} onChange={onDimensionChange} disabled={disabled} />
            </div>

            {/* Comment */}
            <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">
                    Comentario <span className="text-slate-300 font-normal">(opcional)</span>
                </label>
                <textarea
                    value={comment}
                    onChange={(e) => onCommentChange(e.target.value)}
                    disabled={disabled}
                    placeholder="¿Algo que quieras destacar del partido?"
                    rows={3}
                    maxLength={COMMENT_MAX_LENGTH}
                    className="w-full text-base bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 transition-colors resize-none disabled:opacity-60 disabled:cursor-default"
                />
                {comment.length > 0 && (
                    <p className="text-right text-xs text-slate-400 mt-1">
                        {comment.length}/{COMMENT_MAX_LENGTH}
                    </p>
                )}
            </div>
        </div>
    );
}
