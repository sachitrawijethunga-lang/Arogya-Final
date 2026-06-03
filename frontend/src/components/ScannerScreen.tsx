import React, { useRef, useState } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { Language, text } from '../translations';
import { validateClinic } from '../services/api';
import { Menu, UserCircle, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';

interface Props {
  language: Language;
  onScanSuccess: (clinicId: string, clinicName?: string) => void;
}

export function ScannerScreen({ language, onScanSuccess }: Props) {
  const t = text[language];
  const [manualMode, setManualMode] = useState(false);
  const [manualId, setManualId] = useState('');
  const [cameraError, setCameraError] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  // The QR scanner fires onScan on every matching frame; guard against
  // overlapping validations while one is already in flight.
  const scanning = useRef(false);

  const handleSubmit = async () => {
    const idToValidate = manualId.trim();
    if (!idToValidate) return;

    setValidationError('');
    setIsValidating(true);

    const result = await validateClinic(idToValidate);
    setIsValidating(false);

    if (!result.ok) {
      setValidationError((result as { ok: false; error: string }).error);
      return;
    }
    if (result.data.valid) {
      onScanSuccess(idToValidate, result.data.clinicName);
    } else {
      setValidationError('Invalid clinic ID. Please check and try again.');
    }
  };

  return (
    <div className="h-full bg-[#F6F9F7] flex flex-col relative">
      <div className="bg-[#F6F9F7] pt-5 pb-4 px-5 flex justify-between items-center z-10">
        <button className="text-[#122A21] -ml-2 p-2 focus:outline-none focus:bg-gray-100 rounded-full transition-colors"><Menu size={24} /></button>
        <h1 className="text-[20px] font-bold text-[#0A5C43] tracking-tight">Arogya Clinics</h1>
        <button className="text-[#122A21] -mr-2 p-2 focus:outline-none focus:bg-gray-100 rounded-full transition-colors"><UserCircle size={26} strokeWidth={2}/></button>
      </div>
      <div className="flex w-full h-[3px]">
        <div className="w-1/3 bg-[#0A5C43]"></div>
        <div className="flex-1 bg-gray-200"></div>
      </div>

      <div className="p-6 flex-1 flex flex-col overflow-y-auto hidden-scrollbar pb-8 pt-6">
        <p className="text-[11px] font-bold text-[#0066A1] uppercase tracking-[0.15em] mb-3">Registration</p>
        <h2 className="text-[24px] font-bold text-[#122A21] mb-2 leading-tight">{t.scanQR}</h2>
        <p className="text-[#4F675C] text-[14px] mb-8 leading-relaxed font-medium">
          {t.scanQRInfo}
        </p>

        <div className="space-y-6 flex-1 flex flex-col">
          <div>
             <label className="block text-[13px] font-bold text-[#122A21] mb-2">
                Verification Method <span className="text-red-500">*</span>
             </label>
             <div className="flex gap-3">
                <button 
                  onClick={() => setManualMode(false)} 
                  className={`flex-1 py-3.5 rounded-[12px] border-[1.5px] ${!manualMode ? 'bg-[#E1F0E9] border-[#0A5C43] text-[#0A5C43]' : 'bg-white border-gray-200 text-[#4F675C]'} font-semibold text-[15px] transition-all`}
                >
                  Scanner
                </button>
                <button 
                  onClick={() => setManualMode(true)} 
                  className={`flex-1 py-3.5 rounded-[12px] border-[1.5px] ${manualMode ? 'bg-[#E1F0E9] border-[#0A5C43] text-[#0A5C43]' : 'bg-white border-gray-200 text-[#4F675C]'} font-semibold text-[15px] transition-all`}
                >
                  {t.orEnterManual}
                </button>
             </div>
          </div>

          {!manualMode ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2">
               <label className="block text-[13px] font-bold text-[#122A21] mb-2">Scan QR Code</label>
               <div className="rounded-[16px] overflow-hidden bg-black aspect-square max-h-[300px] relative border-[1.5px] border-gray-200 shadow-sm mx-auto">
                  {cameraError ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-50 text-red-600 p-6 text-center font-medium"><p>{t.cameraError}</p></div>
                  ) : (
                    <Scanner
                      onScan={async (codes) => {
                        if (!codes || codes.length === 0 || scanning.current) return;
                        scanning.current = true;
                        const scanned = codes[0].rawValue;
                        const result = await validateClinic(scanned);
                        if (result.ok && result.data.valid) {
                          onScanSuccess(scanned, result.data.clinicName);
                        } else {
                          setValidationError('Invalid clinic QR. Please try manual entry.');
                          scanning.current = false;
                        }
                      }}
                      onError={() => setCameraError(true)}
                    />
                  )}
               </div>
            </motion.div>
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2">
               <label className="block text-[13px] font-bold text-[#122A21] mb-2">
                  Clinic ID <span className="text-red-500">*</span>
               </label>
               <input 
                 value={manualId} 
                 onChange={(e) => setManualId(e.target.value)}
                 placeholder={t.clinicIdPlaceholder}
                 className="w-full p-4 border-[1.5px] border-gray-200 rounded-[12px] bg-white focus:bg-white focus:outline-none focus:border-[#0A5C43] focus:ring-4 focus:ring-[#D6F2E5] text-[#122A21] placeholder-gray-400 text-lg transition-all"
                 autoFocus
               />
               {validationError && (
                 <p className="mt-3 text-[14px] text-red-600 bg-red-50 border border-red-200 rounded-[10px] p-3 font-medium">
                   {validationError}
                 </p>
               )}
            </motion.div>
          )}

          <div className="mt-auto pt-8">
             <button 
               onClick={handleSubmit} 
               disabled={(manualMode && !manualId.trim()) || isValidating}
               className="w-full py-[18px] bg-[#0A5C43] hover:bg-[#074734] text-white rounded-[12px] font-semibold text-[16px] transition-all shadow-[0_4px_12px_rgba(10,92,67,0.15)] disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2 focus:outline-none focus:ring-4 focus:ring-[#2C8567]"
             >
                {isValidating ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                    </svg>
                    Verifying...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    {t.submit}
                    <ArrowRight size={20} />
                  </span>
                )}
             </button>
          </div>
        </div>
      </div>
    </div>
  );
}
