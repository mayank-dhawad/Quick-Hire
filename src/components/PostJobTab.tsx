import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, MapPin } from 'lucide-react';
import { VoiceSpeakerButton } from './VoiceSpeakerButton';
import { speakText, getVoiceGuidance } from '../lib/speech';
import { getTranslation, getLocalizedSkillsByCategory } from '../lib/translations';
import { WorkerCategory } from './WorkerDiscoveryModal';

interface PostJobTabProps {
  currentLang?: string;
  employerTitle: string;
  setEmployerTitle: (val: string) => void;
  employerCategory: WorkerCategory;
  setEmployerCategory: (val: WorkerCategory) => void;
  employerCount: string;
  setEmployerCount: (val: string) => void;
  employerSkills: string;
  setEmployerSkills: (val: string) => void;
  employerWage: string;
  setEmployerWage: (val: string) => void;
  employerLocation: string;
  setEmployerLocation: (val: string) => void;
  employerDescription: string;
  setEmployerDescription: (val: string) => void;
  isPostingJob: boolean;
  onSubmit: (e: React.FormEvent) => void;
  addSkillChip: (skill: string) => void;
  commonSkillsByCategory: Record<WorkerCategory, string[]>;
}

export function PostJobTab({
  currentLang = 'English',
  employerTitle,
  setEmployerTitle,
  employerCategory,
  setEmployerCategory,
  employerCount,
  setEmployerCount,
  employerSkills,
  setEmployerSkills,
  employerWage,
  setEmployerWage,
  employerLocation,
  setEmployerLocation,
  employerDescription,
  setEmployerDescription,
  isPostingJob,
  onSubmit,
  addSkillChip,
  commonSkillsByCategory,
}: PostJobTabProps) {
  const t = (key: string): string => getTranslation(currentLang, key);

  return (
    <motion.div
      key="tab-post-job"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="max-w-3xl mx-auto space-y-8"
    >
      <div className="text-center space-y-2">
        <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">
          {t('hiringPortal')}
        </span>
        <div className="flex items-center justify-center gap-2">
          <h1 className="font-heading font-extrabold text-3xl text-slate-900">
            {t('postJobTitle')}
          </h1>
          <VoiceSpeakerButton
            text={`${t('postJobTitle')}. ${t('postJobSub')}`}
            lang={currentLang}
            label={t('listenJobForm')}
          />
        </div>
        <p className="text-sm text-slate-500 max-w-lg mx-auto">
          {t('postJobSub')}
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-10 shadow-sm space-y-6"
      >
        {/* JOB TITLE */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              {t('jobTitleLabel')} *
            </label>
            <VoiceSpeakerButton
              text={getVoiceGuidance('jobTitle', currentLang)}
              lang={currentLang}
              label="Listen to job title instructions"
            />
          </div>
          <input
            type="text"
            required
            value={employerTitle}
            onClick={() => speakText(getVoiceGuidance('jobTitle', currentLang), currentLang)}
            onFocus={() => speakText(getVoiceGuidance('jobTitle', currentLang), currentLang)}
            onChange={(e) => setEmployerTitle(e.target.value)}
            placeholder={t('jobTitlePlaceholder')}
            className="w-full px-4 py-3.5 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 outline-none focus:border-brand-500 shadow-2xs"
          />
        </div>

        {/* CATEGORY & WORKER COUNT */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                {t('categoryLabel')} *
              </label>
              <VoiceSpeakerButton
                text={getVoiceGuidance('jobCategory', currentLang)}
                lang={currentLang}
                label="Listen to job category instructions"
              />
            </div>
            <select
              value={employerCategory}
              onClick={() => speakText(getVoiceGuidance('jobCategory', currentLang), currentLang)}
              onFocus={() => speakText(getVoiceGuidance('jobCategory', currentLang), currentLang)}
              onChange={(e) => setEmployerCategory(e.target.value as WorkerCategory)}
              className="w-full px-4 py-3.5 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:border-brand-500 shadow-2xs"
            >
              <option value="Agriculture">{t('catAgri')}</option>
              <option value="Construction">{t('catConst')}</option>
              <option value="Daily work">{t('catDaily')}</option>
              <option value="Skilled self-employed">{t('catSkilled')}</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                {t('workersNeededLabel')} *
              </label>
              <VoiceSpeakerButton
                text={getVoiceGuidance('workersCount', currentLang)}
                lang={currentLang}
                label="Listen to worker count instructions"
              />
            </div>
            <input
              type="number"
              min="1"
              max="100"
              required
              value={employerCount}
              onClick={() => speakText(getVoiceGuidance('workersCount', currentLang), currentLang)}
              onFocus={() => speakText(getVoiceGuidance('workersCount', currentLang), currentLang)}
              onChange={(e) => setEmployerCount(e.target.value)}
              className="w-full px-4 py-3.5 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 outline-none focus:border-brand-500 shadow-2xs"
            />
          </div>
        </div>

        {/* REQUIRED SKILLS */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              {t('skillsLabel')}
            </label>
            <VoiceSpeakerButton
              text={getVoiceGuidance('workerSkillsRequired', currentLang)}
              lang={currentLang}
              label="Listen to skills instructions"
            />
          </div>
          <input
            type="text"
            value={employerSkills}
            onClick={() => speakText(getVoiceGuidance('workerSkillsRequired', currentLang), currentLang)}
            onFocus={() => speakText(getVoiceGuidance('workerSkillsRequired', currentLang), currentLang)}
            onChange={(e) => setEmployerSkills(e.target.value)}
            placeholder={t('skillsPlaceholder')}
            className="w-full px-4 py-3.5 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 outline-none focus:border-brand-500 shadow-2xs"
          />

          {/* QUICK CHIP SUGGESTIONS BASED ON SELECTED CATEGORY */}
          <div className="pt-2">
            <span className="text-[11px] font-bold text-slate-500 block mb-1.5">
              {t('clickToAddCommonSkills')}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {(getLocalizedSkillsByCategory(employerCategory, currentLang).length > 0
                ? getLocalizedSkillsByCategory(employerCategory, currentLang)
                : commonSkillsByCategory[employerCategory] || []
              ).map((skill) => (
                <button
                  type="button"
                  key={skill}
                  onClick={() => addSkillChip(skill)}
                  className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-brand-50 hover:text-brand-700 text-slate-700 border border-slate-200 transition-colors font-medium"
                >
                  + {skill}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* DAILY WAGE & PRESETS */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                {t('wageLabel')} *
              </label>
              <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                {t('sameDayWageBadge')}
              </span>
            </div>
            <VoiceSpeakerButton
              text={getVoiceGuidance('dailyWage', currentLang)}
              lang={currentLang}
              label="Listen to daily wage instructions"
            />
          </div>
          <input
            type="number"
            required
            min="100"
            step="50"
            value={employerWage}
            onClick={() => speakText(getVoiceGuidance('dailyWage', currentLang), currentLang)}
            onFocus={() => speakText(getVoiceGuidance('dailyWage', currentLang), currentLang)}
            onChange={(e) => setEmployerWage(e.target.value)}
            placeholder="e.g. 500"
            className="w-full px-4 py-3.5 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-brand-500 shadow-2xs"
          />

          <div className="flex items-center gap-2 pt-1 text-xs">
            <span className="text-slate-500 font-semibold">{t('quickPresetWages')}</span>
            {['400', '500', '650', '800', '1000'].map((preset) => (
              <button
                type="button"
                key={preset}
                onClick={() => setEmployerWage(preset)}
                className={`px-2.5 py-1 rounded-md font-bold text-xs border ${
                  employerWage === preset
                    ? 'bg-amber-500 text-white border-amber-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                ₹{preset}
              </button>
            ))}
          </div>
        </div>

        {/* LOCATION */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              {t('pincodeLabel')} *
            </label>
            <VoiceSpeakerButton
              text={getVoiceGuidance('jobLocation', currentLang)}
              lang={currentLang}
              label="Listen to location instructions"
            />
          </div>
          <div className="flex items-center border border-slate-300 rounded-xl px-4 focus-within:border-brand-500 shadow-2xs">
            <MapPin className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
            <input
              type="text"
              required
              value={employerLocation}
              onClick={() => speakText(getVoiceGuidance('jobLocation', currentLang), currentLang)}
              onFocus={() => speakText(getVoiceGuidance('jobLocation', currentLang), currentLang)}
              onChange={(e) => setEmployerLocation(e.target.value)}
              placeholder={t('pincodePlaceholder')}
              className="w-full py-3.5 text-sm font-medium text-slate-900 outline-none"
            />
          </div>
        </div>

        {/* WORK DETAILS / TIMINGS */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              {t('descLabel')}
            </label>
            <VoiceSpeakerButton
              text={getVoiceGuidance('jobDescription', currentLang)}
              lang={currentLang}
              label="Listen to work details instructions"
            />
          </div>
          <textarea
            rows={3}
            value={employerDescription}
            onClick={() => speakText(getVoiceGuidance('jobDescription', currentLang), currentLang)}
            onFocus={() => speakText(getVoiceGuidance('jobDescription', currentLang), currentLang)}
            onChange={(e) => setEmployerDescription(e.target.value)}
            placeholder={t('descPlaceholder')}
            className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 outline-none focus:border-brand-500 shadow-2xs resize-none"
          />
        </div>

        {/* SUBMIT BUTTON */}
        <button
          type="submit"
          disabled={isPostingJob}
          className="w-full py-4 rounded-xl text-sm sm:text-base font-bold bg-amber-500 hover:bg-amber-600 text-white transition-all shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 disabled:opacity-70"
        >
          {isPostingJob ? (
            <span>{t('postingBtn')}</span>
          ) : (
            <>
              <CheckCircle2 className="w-5 h-5" />
              <span>{t('postSubmitBtn')}</span>
            </>
          )}
        </button>
      </form>
    </motion.div>
  );
}

export default PostJobTab;
