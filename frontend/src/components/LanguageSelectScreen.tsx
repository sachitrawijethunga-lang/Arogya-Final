import React from 'react';
import { Language, text } from '../translations';
import { ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import arogyaLogo from '../assets/arogya-logo.jpeg';

interface Props {
  clinicId: string | null;
  clinicName: string | null;
  onSelectLanguage: (lang: Language) => void;
}

export function LanguageSelectScreen({ clinicId, clinicName, onSelectLanguage }: Props) {
  const t = text.en;
  const centerTitle = clinicName ?? clinicId;
  const welcomeTitle = centerTitle ? `Arogya Health and Wellness Center - ${centerTitle}` : t.welcome;
  
  return (
    <div className="h-full bg-[#F6F9F7] flex flex-col p-6 items-center overflow-y-auto hidden-scrollbar">
      <div className="flex-1 flex flex-col items-center justify-center w-full mt-12 pb-12">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }} 
          animate={{ scale: 1, opacity: 1 }} 
          className="mb-8 flex justify-center"
        >
          <img
            src={arogyaLogo}
            alt="Arogya Digital"
            className="h-auto w-[190px] max-w-[72vw] mix-blend-multiply"
          />
        </motion.div>

        <h2 className="text-[20px] font-bold text-[#122A21] text-center mb-4 leading-snug px-4">
          {welcomeTitle}
        </h2>
        
        <p className="text-[#4F675C] text-center mb-10 leading-relaxed text-[15px] px-2 font-medium">
          {t.languageSelect}
        </p>

        <div className="w-full space-y-4 px-2">
          <LanguageCard code="En" title={t.english} onClick={() => onSelectLanguage('en')} />
          <LanguageCard code="සිං" title={t.sinhala} onClick={() => onSelectLanguage('si')} />
          <LanguageCard code="த" title={t.tamil} onClick={() => onSelectLanguage('ta')} />
        </div>
      </div>
      
      <div className="mt-auto pt-8 pb-4">
        <p className="text-[11px] font-bold text-[#758D81] tracking-widest uppercase">Secure Clinical Portal</p>
      </div>
    </div>
  );
}

function LanguageCard({ code, title, onClick }: { code: string; title: string; onClick: () => void }) {
  return (
    <button 
      onClick={onClick} 
      className="w-full bg-white p-[18px] rounded-[16px] flex items-center border-[1.5px] border-gray-100 hover:border-[#0A5C43] hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-[#D6F2E5]"
    >
       <div className="w-11 h-11 bg-[#F5F8F6] rounded-full flex items-center justify-center text-[#4F675C] font-semibold text-[15px] mr-5 border border-gray-100">
         {code}
       </div>
       <span className="text-[17px] font-medium text-[#122A21] flex-1 text-left">{title}</span>
       <ChevronRight size={22} className="text-[#8C9E95]" />
    </button>
  );
}
