import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getTranslation } from '../lib/translations';

interface RateWorkerModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  jobTitle: string;
  workerId: string;
  workerName: string;
  currentUserId: string;
  currentLang?: string;
  existingReview?: {
    id: string;
    rating: number;
    comment: string | null;
  } | null;
  onReviewSubmitted: (updatedReview: { id: string; rating: number; comment: string | null }) => void;
}

export const RateWorkerModal: React.FC<RateWorkerModalProps> = ({
  isOpen,
  onClose,
  jobId,
  jobTitle,
  workerId,
  workerName,
  currentUserId,
  currentLang = 'English',
  existingReview = null,
  onReviewSubmitted,
}) => {
  const [rating, setRating] = useState<number>(existingReview?.rating || 5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [comment, setComment] = useState<string>(existingReview?.comment || '');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const t = (key: string): string => getTranslation(currentLang, key);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserId) {
      setErrorMsg('You must be logged in as an employer to rate workers.');
      return;
    }
    if (!rating || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      setErrorMsg('Please select a valid star rating between 1 and 5.');
      return;
    }

    const validatedRating: number = rating;

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const cleanComment = comment.trim();

      if (existingReview?.id) {
        // Update existing review
        const { data, error } = await supabase
          .from('reviews')
          .update({
            rating: validatedRating,
            comment: cleanComment || null,
          })
          .eq('id', existingReview.id)
          .eq('reviewer_profile_id', currentUserId)
          .select('id, rating, comment')
          .single();

        if (error) throw error;
        onReviewSubmitted({
          id: data?.id || existingReview.id,
          rating: typeof data?.rating === 'number' ? data.rating : validatedRating,
          comment: data ? data.comment : (cleanComment || null),
        });
      } else {
        // Insert new review
        const { data, error } = await supabase
          .from('reviews')
          .insert([
            {
              job_id: jobId,
              reviewer_profile_id: currentUserId,
              reviewed_profile_id: workerId,
              rating: validatedRating,
              comment: cleanComment || null,
            },
          ])
          .select('id, rating, comment')
          .single();

        if (error) throw error;
        onReviewSubmitted({
          id: data?.id || 'temp-id',
          rating: typeof data?.rating === 'number' ? data.rating : validatedRating,
          comment: data ? data.comment : (cleanComment || null),
        });
      }

      onClose();
    } catch (err: any) {
      console.error('Error submitting review:', err);
      setErrorMsg(err.message || 'Unable to save rating. Ensure this job is completed and you hired this worker.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeStarCount = hoverRating !== null ? hoverRating : rating;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-5 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                  Completed Job Review
                </span>
              </div>
              <h3 className="font-heading font-extrabold text-lg text-slate-900 mt-1">
                {existingReview ? 'Update Worker Rating' : 'Rate Worker Performance'}
              </h3>
              <p className="text-xs text-slate-500">
                Worker: <span className="font-bold text-slate-800">{workerName}</span> for{' '}
                <span className="font-medium text-slate-700">&quot;{jobTitle}&quot;</span>
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Star Picker */}
            <div className="space-y-1.5 text-center py-2">
              <label className="text-xs font-bold text-slate-700 block">
                Select Star Rating (1–5 Stars)
              </label>
              <div className="flex items-center justify-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(null)}
                    onClick={() => setRating(star)}
                    className="p-1.5 rounded-lg hover:scale-110 transition-transform cursor-pointer focus:outline-none"
                    aria-label={`${star} star`}
                  >
                    <Star
                      className={`w-8 h-8 ${
                        star <= activeStarCount
                          ? 'fill-amber-400 text-amber-500'
                          : 'text-slate-300'
                      }`}
                    />
                  </button>
                ))}
              </div>
              <span className="text-xs font-extrabold text-amber-700">
                {rating === 5
                  ? '5.0 - Excellent Work'
                  : rating === 4
                  ? '4.0 - Good Work'
                  : rating === 3
                  ? '3.0 - Satisfactory'
                  : rating === 2
                  ? '2.0 - Below Expectations'
                  : '1.0 - Unsatisfactory'}
              </span>
            </div>

            {/* Written Review */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Feedback & Comments (Optional)
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Share your experience (e.g. punctuality, skill proficiency, work etiquette)..."
                rows={3}
                maxLength={500}
                className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-slate-800 transition-colors resize-none"
              />
              <span className="text-[10px] text-slate-400 block text-right">
                {comment.length}/500
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{existingReview ? 'Update Review' : 'Save Review'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
