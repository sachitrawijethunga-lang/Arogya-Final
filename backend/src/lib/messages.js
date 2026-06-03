const MESSAGES = {
  "high-risk": {
    en: "Some of your responses need prompt attention. Please proceed to the triage counter.",
    si: "ඔබගේ පිළිතුරු කිහිපයකට කඩිනම් අවධානය අවශ්‍ය වේ. කරුණාකර ත්‍රියාජ් කවුන්ටරයට යන්න.",
    ta: "உங்கள் சில பதில்களுக்கு உடனடி கவனம் தேவை. தயவுசெய்து திரியேஜ் கவுண்டருக்குச் செல்லவும்.",
  },
  normal: {
    en: "Registration successful. Please proceed to the main clinic lobby.",
    si: "ලියාපදිංචිය සාර්ථකයි. කරුණාකර ප්‍රධාන සායන ශාලාවට යන්න.",
    ta: "பதிவு வெற்றிகரமானது. தயவுசெய்து முதன்மை கிளினிக் மண்டபத்திற்குச் செல்லவும்.",
  },
};

export function triageMessage(triage, language) {
  const byLang = MESSAGES[triage] || MESSAGES.normal;
  return byLang[language] || byLang.en;
}
