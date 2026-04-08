import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";
import ruLocale from "i18n-iso-countries/langs/ru.json";

countries.registerLocale(enLocale);
countries.registerLocale(ruLocale);

/** Map hh.ru area country name (Russian) to English for UI sorting / labels. */
export function countryNameRuToEn(nameRu: string): string {
  const trimmed = nameRu.trim();
  if (!trimmed) return trimmed;
  const alpha2 = countries.getAlpha2Code(trimmed, "ru");
  if (alpha2) {
    const en = countries.getName(alpha2, "en");
    if (en) return en;
  }
  return trimmed;
}
