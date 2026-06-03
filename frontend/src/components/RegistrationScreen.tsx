import React, { useState } from "react";
import { Language, text } from "../translations";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type {
  RegistrationData,
  Gender,
  RelationshipKey,
  MaritalKey,
  OccupationKey,
  EducationKey,
} from "../types";
import {
  RELATIONSHIP_KEYS,
  MARITAL_KEYS,
  OCCUPATION_KEYS,
  EDUCATION_KEYS,
  GN_DIVISION_PLACEHOLDERS,
} from "../data/options";
import { validateRegistration, type RegistrationErrors } from "../lib/validation";
import { TextField } from "./fields/TextField";
import { SegmentedControl } from "./fields/SegmentedControl";
import { DateField } from "./fields/DateField";
import { SelectField } from "./fields/SelectField";
import { SearchableSelect } from "./fields/SearchableSelect";

interface Props {
  language: Language;
  clinicId: string;
  clinicName: string | null;
  initial: RegistrationData | null;
  onBack: () => void;
  onComplete: (data: RegistrationData) => void;
}

function emptyData(): RegistrationData {
  return {
    fullName: "", nic: "", phn: "", gender: null, dateOfBirth: "",
    householdAddress: "", relationshipToHead: null, gnDivision: null,
    mobile: "", maritalStatus: null, occupation: null, education: null,
  };
}

export function RegistrationScreen({
  language, clinicId, clinicName, initial, onBack, onComplete,
}: Props) {
  const t = text[language];
  const [data, setData] = useState<RegistrationData>(initial ?? emptyData());
  const [errors, setErrors] = useState<RegistrationErrors>({});

  const today = new Date().toISOString().slice(0, 10);
  const set = <K extends keyof RegistrationData>(key: K, value: RegistrationData[K]) =>
    setData((d) => ({ ...d, [key]: value }));

  const msg = (key?: string): string | undefined =>
    key ? (t.reg as Record<string, string>)[key] : undefined;

  const handleNext = () => {
    const found = validateRegistration(data);
    setErrors(found);
    if (Object.keys(found).length === 0) {
      onComplete(data);
    } else {
      document.querySelector("[data-error='true']")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const opt = <T extends string>(keys: T[], dict: Record<T, string>) =>
    keys.map((k) => ({ value: k, label: dict[k] }));

  return (
    <div className="h-full bg-[#F6F9F7] flex flex-col relative overflow-hidden">
      <div className="bg-[#F6F9F7] pt-5 pb-4 px-4 flex items-center sticky top-0 z-10 border-b border-gray-200">
        <button onClick={onBack} className="text-[#122A21] mr-3 p-2 -ml-2 rounded-full focus:bg-gray-100 transition-colors">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-[19px] font-bold text-[#0A5C43] tracking-tight">{t.reg.stepLabel}</h1>
      </div>

      <div className="flex-1 overflow-y-auto hidden-scrollbar p-5 pb-28 space-y-6">
        {/* Enrollment Information */}
        <section className="bg-white border-[1.5px] border-[#D6EFE3] rounded-[16px] p-5 space-y-3">
          <h2 className="text-[15px] font-bold text-[#0A5C43]">{t.reg.enrollmentSection}</h2>
          <Readonly label={t.reg.orgUnit} value={clinicName ?? clinicId} />
          <Readonly label={t.reg.enrollmentDate} value={today} />
          <Readonly label={t.reg.arogyaId} value={t.reg.arogyaIdPending} muted />
        </section>

        {/* Profile */}
        <section className="space-y-5">
          <h2 className="text-[15px] font-bold text-[#0A5C43] pb-2 border-b-[1.5px] border-[#D6EFE3]">
            {t.reg.profileSection}
          </h2>

          <div data-error={!!errors.fullName}>
            <TextField label={t.reg.fullName} value={data.fullName} required
              error={msg(errors.fullName)} onChange={(v) => set("fullName", v)} />
          </div>
          <div data-error={!!errors.nic || !!errors.idProof}>
            <TextField label={t.reg.nic} value={data.nic}
              error={msg(errors.nic) ?? msg(errors.idProof)} onChange={(v) => set("nic", v)} />
          </div>
          <TextField label={t.reg.phn} value={data.phn} onChange={(v) => set("phn", v)} />
          <div data-error={!!errors.gender}>
            <SegmentedControl<Gender> label={t.reg.gender} value={data.gender} required
              error={msg(errors.gender)}
              options={[{ value: "male", label: t.reg.male }, { value: "female", label: t.reg.female }]}
              onChange={(v) => set("gender", v)} />
          </div>
          <div data-error={!!errors.dateOfBirth}>
            <DateField label={t.reg.dob} value={data.dateOfBirth} required
              error={msg(errors.dateOfBirth)}
              ageLabel={t.reg.age} yearsLabel={t.reg.years} monthsLabel={t.reg.months}
              onChange={(v) => set("dateOfBirth", v)} />
          </div>
          <TextField label={t.reg.address} value={data.householdAddress}
            onChange={(v) => set("householdAddress", v)} />
          <SelectField label={t.reg.relationship} placeholder={t.reg.selectPlaceholder}
            value={data.relationshipToHead}
            options={opt<RelationshipKey>(RELATIONSHIP_KEYS, t.options.relationship)}
            onChange={(v) => set("relationshipToHead", v as RelationshipKey)} />
          <SearchableSelect label={t.reg.gnDivision} placeholder={t.reg.gnSearchPlaceholder}
            options={GN_DIVISION_PLACEHOLDERS} value={data.gnDivision}
            onChange={(v) => set("gnDivision", v)} />
          <div data-error={!!errors.mobile}>
            <TextField label={t.reg.mobile} value={data.mobile} required type="tel" inputMode="tel"
              error={msg(errors.mobile)} onChange={(v) => set("mobile", v)} />
          </div>
          <SelectField label={t.reg.marital} placeholder={t.reg.selectPlaceholder}
            value={data.maritalStatus}
            options={opt<MaritalKey>(MARITAL_KEYS, t.options.marital)}
            onChange={(v) => set("maritalStatus", v as MaritalKey)} />
          <SelectField label={t.reg.occupation} placeholder={t.reg.selectPlaceholder}
            value={data.occupation}
            options={opt<OccupationKey>(OCCUPATION_KEYS, t.options.occupation)}
            onChange={(v) => set("occupation", v as OccupationKey)} />
          <SelectField label={t.reg.education} placeholder={t.reg.selectPlaceholder}
            value={data.education}
            options={opt<EducationKey>(EDUCATION_KEYS, t.options.education)}
            onChange={(v) => set("education", v as EducationKey)} />
        </section>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-5 bg-[#F6F9F7] border-t border-gray-200">
        <button onClick={handleNext}
          className="w-full py-[18px] bg-[#0A5C43] hover:bg-[#074734] text-white rounded-[12px] font-semibold text-[16px] transition-all shadow-[0_4px_12px_rgba(10,92,67,0.15)] flex items-center justify-center gap-2 focus:outline-none focus:ring-4 focus:ring-[#2C8567]">
          {t.reg.next}
          <ArrowRight size={20} />
        </button>
      </div>
    </div>
  );
}

function Readonly({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between items-center gap-3">
      <span className="text-[13px] font-semibold text-[#4F675C]">{label}</span>
      <span className={`text-[14px] font-bold text-right ${muted ? "text-[#8C9E95] italic" : "text-[#122A21]"}`}>
        {value}
      </span>
    </div>
  );
}
