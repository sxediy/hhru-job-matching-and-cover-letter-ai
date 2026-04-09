import hhCountryRuToEn from "@/data/hh-country-ru-to-en.json";
import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";
import ruLocale from "i18n-iso-countries/langs/ru.json";

countries.registerLocale(enLocale);
countries.registerLocale(ruLocale);

const HH_COUNTRY_RU_TO_EN = hhCountryRuToEn as Record<string, string>;

/** Normalize HH/API spelling variants for map lookup (e.g. apostrophe). */
function normalizeRuCountryKey(ru: string): string {
  return ru.replace(/\u2019/g, "'").replace(/\u2018/g, "'");
}

/** Map hh.ru area country name (Russian) to English for UI sorting / labels. */
export function countryNameRuToEn(nameRu: string): string {
  const trimmed = nameRu.trim();
  if (!trimmed) return trimmed;
  const fromHh =
    HH_COUNTRY_RU_TO_EN[trimmed] ?? HH_COUNTRY_RU_TO_EN[normalizeRuCountryKey(trimmed)];
  if (fromHh) return fromHh;
  const alpha2 =
    countries.getAlpha2Code(trimmed, "ru") ??
    countries.getAlpha2Code(normalizeRuCountryKey(trimmed), "ru");
  if (alpha2) {
    const en = countries.getName(alpha2, "en");
    if (en) return en;
  }
  return trimmed;
}
