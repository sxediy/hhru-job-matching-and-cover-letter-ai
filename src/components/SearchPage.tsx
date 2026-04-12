"use client";

import areaPresetIds from "@/data/area-preset-ids.json";
import { flattenAreas, type HhAreaNode } from "@/lib/areas/flatten";
import { MultiSelectChips } from "@/components/MultiSelectChips";
import { parseSalaryAmount, SalaryCurrencyInput } from "@/components/SalaryCurrencyInput";
import { VacancyCard, type VacancyItem } from "@/components/VacancyCard";
import { countryNameRuToEn } from "@/lib/hh/countryNameEn";
import {
  buildVacancyAppUrlSearchParams,
  parseVacancyAppSearchFromUrlSearchParams,
  urlSearchParamsHasVacancyAppFilter,
  VACANCY_APP_URL_LABEL_IDS,
  type VacancyAppUrlLabelId,
} from "@/lib/hh/vacancyAppSearchUrl";
import {
  DEFAULT_VACANCY_SEARCH_FIELDS,
  effectiveVacancySearchFieldIds,
  isFullDefaultVacancySearchFields,
} from "@/lib/hh/vacancySearchDefaults";
import {
  parseFiltersRecordToUrlSearchParams,
  serializeAppUrlParamsToFiltersRecord,
} from "@/lib/hh/vacancySearchPreferences";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";

type DictItem = { id: string; name: string };
type CurrencyItem = { code: string; name: string; in_use?: boolean };
type Dictionaries = Record<string, DictItem[] | CurrencyItem[] | undefined> & {
  currency?: CurrencyItem[];
  vacancy_label?: DictItem[];
  vacancy_search_employment_form?: DictItem[];
  experience?: DictItem[];
  work_format?: DictItem[];
};

type AreasBundle = {
  roots: HhAreaNode[];
  otherRegions: HhAreaNode | null;
  russia: HhAreaNode | null;
  presetIds: typeof areaPresetIds;
};

type PresetJsonKey = keyof typeof areaPresetIds;
type PresetChipKey = PresetJsonKey | "russia" | "otherRegions";

/** Presets whose tooltip is a short comma-separated country list from /areas. */
const PRESET_COMMA_COUNTRY_TOOLTIP_KEYS = ["eu", "efta", "caucasus", "balkansNonEu"] as const;
type PresetCommaCountryTooltipKey = (typeof PRESET_COMMA_COUNTRY_TOOLTIP_KEYS)[number];

function isPresetCommaCountryTooltipKey(key: PresetChipKey): key is PresetCommaCountryTooltipKey {
  return (PRESET_COMMA_COUNTRY_TOOLTIP_KEYS as readonly string[]).includes(key);
}

const PRESET_LABELS: Record<PresetJsonKey, string> = {
  eu: "EU",
  efta: "EFTA",
  germany: "Germany",
  ireland: "Ireland",
  uk: "UK",
  balkansNonEu: "Balkans (non-EU)",
  middleEast: "Middle East",
  japanKorea: "Japan & Korea",
  anz: "Australia & NZ",
  latinAmerica: "Latin America",
  asia: "Asia",
  africa: "Africa",
  caucasus: "Caucasus",
  neighborsEast: "BY · UA · MD",
  neighborsCentralAsia: "KZ · UZ · KG",
  usa: "USA",
  canada: "Canada",
};

/** Строка 1: Россия → Кавказ → Балканы → KZ/UZ/KG → BY/UA/MD. */
const PRESET_CHIP_ORDER_ROW1: PresetChipKey[] = [
  "russia",
  "caucasus",
  "balkansNonEu",
  "neighborsCentralAsia",
  "neighborsEast",
];

/** Одна строка: EU → … → UK → USA → Canada → Japan & Korea. */
const PRESET_CHIP_ORDER_ROW_EU: PresetChipKey[] = [
  "eu",
  "efta",
  "germany",
  "ireland",
  "uk",
  "usa",
  "canada",
  "japanKorea",
];

/** Строка: Middle East → … → Africa; справа ×. */
const PRESET_CHIP_ORDER_ROW_BOTTOM: PresetChipKey[] = [
  "middleEast",
  "asia",
  "anz",
  "latinAmerica",
  "africa",
];

/** Отдельная нижняя строка: только Non-preset (HH). */
const PRESET_CHIP_ORDER_ROW_NONPRESET: PresetChipKey[] = ["otherRegions"];

/** Preset chips without hover tooltip (label is enough). */
const PRESET_CHIP_KEYS_WITHOUT_TOOLTIP = new Set<PresetChipKey>([
  "russia",
  "germany",
  "ireland",
  "uk",
  "usa",
  "canada",
  "japanKorea",
  "middleEast",
  "asia",
  "anz",
  "latinAmerica",
  "africa",
]);

/** Long static tooltips (not comma-lists from /areas). */
function presetChipStaticTooltip(key: PresetChipKey): string | undefined {
  if (key === "otherRegions")
    return "HeadHunter countries under «Other regions»";
  if (key === "neighborsEast") return "Belarus, Ukraine, Moldova";
  if (key === "neighborsCentralAsia") return "Kazakhstan, Uzbekistan, Kyrgyzstan";
  return undefined;
}

function presetChipLabel(key: PresetChipKey): string {
  if (key === "russia") return "Russia";
  if (key === "otherRegions") return "Non-preset (HH)";
  return PRESET_LABELS[key];
}

/** `area` ids in any geo preset — used to build the «Non-preset (HH)» chip id list only (country checkboxes stay full list). */
const AREA_ID_IN_ANY_GEO_PRESET = new Set<string>(
  (Object.values(areaPresetIds) as string[][]).flat(),
);

const SEARCH_FIELD_OPTIONS = [
  { id: "name", label: "Vacancy title" },
  { id: "company_name", label: "Company name" },
  { id: "description", label: "Description" },
] as const;

function vacancySearchFieldIdsFromParsed(parsedSearchFields: string[]): Set<string> {
  if (isFullDefaultVacancySearchFields(parsedSearchFields)) return new Set();
  return new Set(parsedSearchFields);
}

/** hh.ru vacancy `label` ids (subset) → English UI text */
const VACANCY_LABELS_EN: Record<VacancyAppUrlLabelId, string> = {
  not_from_agency: "Not from agencies",
  accept_handicapped: "Accessible for people with disabilities",
  with_address: "With workplace address",
  low_performance: "Under 10 responses",
  accredited_it: "Accredited IT company",
};

/** hh.ru `experience` dictionary ids → English labels */
const EXPERIENCE_LABELS_EN: Record<string, string> = {
  noExperience: "No experience",
  between1And3: "1–3 years",
  between3And6: "3–6 years",
  moreThan6: "6+ years",
};

/** hh.ru `vacancy_search_employment_form` ids → English labels */
const EMPLOYMENT_FORM_LABELS_EN: Record<string, string> = {
  FULL: "Full-time",
  PART: "Part-time",
  PROJECT: "Side jobs",
  FLY_IN_FLY_OUT: "Rotational (FIFO)",
};

/** hh.ru `work_format` ids → English labels */
const WORK_FORMAT_LABELS_EN: Record<string, string> = {
  ON_SITE: "On-site",
  REMOTE: "Remote",
  HYBRID: "Hybrid",
  FIELD_WORK: "Field-based",
};

type SearchSnapshot = {
  text: string;
  excludedText: string;
  searchFields: string[];
  selectedAreaIds: Set<string>;
  employmentForm: Set<string>;
  experience: Set<string>;
  workFormat: Set<string>;
  labels: Set<string>;
  withStatedSalary: boolean;
  salaryAmount: string;
  currencyResolved: string;
};

function FiltersBarIconImport() {
  return (
    <svg
      className="filters-actions-bar__btn-svg filters-actions-bar__btn-svg--stroke"
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3v12" />
      <path d="M7 10 12 15 17 10" />
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    </svg>
  );
}

/** Compact hh.ru-style mark (red tile + “hh”) for the “Open in HH” action — fills tuned in CSS */
function FiltersBarIconHh() {
  return (
    <svg className="filters-actions-bar__btn-svg" viewBox="0 0 32 32" width={18} height={18} aria-hidden>
      <rect className="filters-actions-bar__hh-mark-bg" width="32" height="32" rx="7" />
      <text
        className="filters-actions-bar__hh-mark-text"
        x="16"
        y="21"
        textAnchor="middle"
        fontWeight="700"
        fontSize="13"
        fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
      >
        hh
      </text>
    </svg>
  );
}

function FiltersBarIconSave() {
  return (
    <svg
      className="filters-actions-bar__btn-svg filters-actions-bar__btn-svg--stroke"
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-9H7v9" />
      <path d="M7 3v6h7" />
    </svg>
  );
}

function FiltersBarIconLink() {
  return (
    <svg
      className="filters-actions-bar__btn-svg filters-actions-bar__btn-svg--stroke"
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function FiltersBarIconCheck() {
  return (
    <svg
      className="filters-actions-bar__btn-svg filters-actions-bar__btn-svg--stroke"
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/** Restore saved search preferences from the server (preset list cue) */
function FiltersBarIconLoad() {
  return (
    <svg
      className="filters-actions-bar__btn-svg filters-actions-bar__btn-svg--stroke"
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 5v14" />
      <path d="M9 7h11" />
      <path d="M9 12h11" />
      <path d="M9 17h8" />
    </svg>
  );
}

function FiltersPanelIconClear() {
  return (
    <svg
      className="filters-panel-clear-btn__svg"
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function IconChevronResults({ dir }: { dir: "left" | "right" }) {
  const d = dir === "left" ? "M15 6 9 12l6 6" : "M9 6l6 6-6 6";
  return (
    <svg
      className="results-pagination__chevron-svg"
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

type ResultsPaginationBarProps = {
  searching: boolean;
  page: number;
  pages: number;
  onPrev: () => void;
  onNext: () => void;
};

type ResultsPaginationNumericProps = {
  searching: boolean;
  page: number;
  pages: number;
  onGoToPage: (pageZeroBased: number) => void;
};

/** 1-based page labels for the bar; «…» when many pages. */
function buildResultsPaginationPages(pageZero: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 11) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const curr = pageZero + 1;
  const last = totalPages;
  const out: Array<number | "ellipsis"> = [];
  const pushEllipsis = () => {
    if (out.length && out[out.length - 1] === "ellipsis") return;
    out.push("ellipsis");
  };
  if (curr <= 5) {
    for (let p = 1; p <= 5; p++) out.push(p);
    pushEllipsis();
    out.push(last);
  } else if (curr >= last - 4) {
    out.push(1);
    pushEllipsis();
    for (let p = last - 4; p <= last; p++) out.push(p);
  } else {
    out.push(1);
    pushEllipsis();
    for (let p = curr - 1; p <= curr + 1; p++) out.push(p);
    pushEllipsis();
    out.push(last);
  }
  return out;
}

function ResultsPaginationCompact({ searching, page, pages, onPrev, onNext }: ResultsPaginationBarProps) {
  return (
    <nav
      className="results-pagination results-pagination--compact"
      aria-label={`Страницы результатов, страница ${page + 1} из ${pages}`}
    >
      <button
        type="button"
        className="results-pagination__arrow"
        disabled={searching || page <= 0}
        onClick={onPrev}
        aria-label="Предыдущая страница"
      >
        <IconChevronResults dir="left" />
      </button>
      <span className="results-pagination__compact-page muted small" aria-hidden>
        {page + 1}/{pages}
      </span>
      <button
        type="button"
        className="results-pagination__arrow"
        disabled={searching || page + 1 >= pages}
        onClick={onNext}
        aria-label="Следующая страница"
      >
        <IconChevronResults dir="right" />
      </button>
    </nav>
  );
}

function ResultsPaginationNumeric({ searching, page, pages, onGoToPage }: ResultsPaginationNumericProps) {
  const pageItems = buildResultsPaginationPages(page, pages);
  return (
    <nav
      className="results-pagination results-pagination--numbered"
      aria-label={`Страницы результатов, страница ${page + 1} из ${pages}`}
    >
      <button
        type="button"
        className="results-pagination__arrow"
        disabled={searching || page <= 0}
        onClick={() => onGoToPage(page - 1)}
        aria-label="Предыдущая страница"
      >
        <IconChevronResults dir="left" />
      </button>
      <ul className="results-pagination__pages">
        {pageItems.map((item, i) =>
          item === "ellipsis" ? (
            <li key={`ellipsis-${i}`} className="results-pagination__ellipsis" aria-hidden>
              …
            </li>
          ) : (
            <li key={item}>
              <button
                type="button"
                className={`results-pagination__page${page + 1 === item ? " results-pagination__page--current" : ""}`}
                disabled={searching || page + 1 === item}
                onClick={() => onGoToPage(item - 1)}
                aria-label={`Страница ${item}`}
                aria-current={page + 1 === item ? "page" : undefined}
              >
                {item}
              </button>
            </li>
          ),
        )}
      </ul>
      <button
        type="button"
        className="results-pagination__arrow"
        disabled={searching || page + 1 >= pages}
        onClick={() => onGoToPage(page + 1)}
        aria-label="Следующая страница"
      >
        <IconChevronResults dir="right" />
      </button>
    </nav>
  );
}

function clearPresetChipTooltipNudges(root: HTMLElement) {
  root.querySelectorAll("button.chip[data-tooltip]").forEach((el) => {
    (el as HTMLElement).style.removeProperty("--chip-tooltip-nudge");
  });
}

/** Keep centered ::after tooltip inside the viewport (nudge right near left edge, left near right edge). */
function updatePresetChipTooltipNudge(chip: HTMLElement) {
  const rect = chip.getBoundingClientRect();
  const margin = 10;
  const vw = window.innerWidth;
  const approxHalfWidth = Math.min(176, (vw - 2 * margin) * 0.42);
  const center = rect.left + rect.width / 2;
  const lo = margin - center + approxHalfWidth;
  const hi = vw - margin - center - approxHalfWidth;
  let shift = 0;
  if (lo > 0) shift = lo;
  else if (hi < 0) shift = hi;
  chip.style.setProperty("--chip-tooltip-nudge", `${Math.round(shift)}px`);
}

/** Range input 0–100: unlock primary action at or above this value. */
const VAULT_SLIDER_THRESHOLD = 94;

/** Do not offer full-detail cache when HH reports more matches than this (narrow filters first). */
const MAX_FOUND_FOR_VACANCY_DETAILS_CACHE = 400;

const CACHE_LOAD_DETAILS_TOOLTIP_OK =
  "Stores full vacancy payloads from hh.ru for the listings on this page.";
const CACHE_LOAD_DETAILS_TOOLTIP_BLOCKED =
  "Too many results for this action. Need no more than 400.";

export function SearchPage() {
  const [dicts, setDicts] = useState<Dictionaries | null>(null);
  const [areasBundle, setAreasBundle] = useState<AreasBundle | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [excludedText, setExcludedText] = useState("");
  /** Empty = default (all three hh.ru search fields); non-empty = restrict to selected ids. */
  const [searchFieldIds, setSearchFieldIds] = useState<Set<string>>(() => new Set());

  const [selectedAreaIds, setSelectedAreaIds] = useState<Set<string>>(new Set());
  const [russiaAll, setRussiaAll] = useState(false);
  const [countryListOpen, setCountryListOpen] = useState(false);
  const [russiaListOpen, setRussiaListOpen] = useState(false);
  const [areaQuery, setAreaQuery] = useState("");

  const [employmentForm, setEmploymentForm] = useState<Set<string>>(new Set());
  const [experience, setExperience] = useState<Set<string>>(new Set());
  const [workFormat, setWorkFormat] = useState<Set<string>>(new Set());
  const [labels, setLabels] = useState<Set<string>>(new Set());
  const [salaryAmount, setSalaryAmount] = useState("");
  const [currency, setCurrency] = useState("");
  const [withStatedSalary, setWithStatedSalary] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isSavePrefsConfirmOpen, setIsSavePrefsConfirmOpen] = useState(false);
  /** 0–100: «сейф» открыт только у правого края (случайное нажатие не сохранит). */
  const [savePrefsUnlockSlider, setSavePrefsUnlockSlider] = useState(0);
  const [importUrl, setImportUrl] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [copyDone, setCopyDone] = useState(false);

  const [page, setPage] = useState(0);
  /** Пока идёт запрос вакансий — подсветка пагинации следует сюда, не ждёт setPage из ответа. */
  const [pendingResultsPage, setPendingResultsPage] = useState<number | null>(null);
  const resultsPageForUi = pendingResultsPage ?? page;
  const [items, setItems] = useState<VacancyItem[]>([]);
  const [found, setFound] = useState<number | null>(null);
  const [pages, setPages] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const tooManyResultsForCache =
    found != null && found > MAX_FOUND_FOR_VACANCY_DETAILS_CACHE;

  const snapshotRef = useRef<SearchSnapshot>({
    text: "",
    excludedText: "",
    searchFields: [...DEFAULT_VACANCY_SEARCH_FIELDS],
    selectedAreaIds: new Set(),
    employmentForm: new Set(),
    experience: new Set(),
    workFormat: new Set(),
    labels: new Set(),
    withStatedSalary: false,
    salaryAmount: "",
    currencyResolved: "",
  });
  const searchRequestIdRef = useRef(0);
  const countryScrollRef = useRef<HTMLDivElement>(null);
  const ruScrollRef = useRef<HTMLDivElement>(null);
  const presetChipsStackRef = useRef<HTMLDivElement>(null);
  const resultsSectionRef = useRef<HTMLElement>(null);
  const initializedFromUrlRef = useRef(false);
  const initialUrlHadAppFiltersRef = useRef(false);
  const copyResetTimerRef = useRef<number | null>(null);
  const cacheNoticeTimerRef = useRef<number | null>(null);

  const [urlInitialized, setUrlInitialized] = useState(false);
  const [prefsHydrated, setPrefsHydrated] = useState(false);
  const [savePrefsBusy, setSavePrefsBusy] = useState(false);
  const [savePrefsError, setSavePrefsError] = useState<string | null>(null);
  const [restorePrefsBusy, setRestorePrefsBusy] = useState(false);

  const [isCacheDetailsConfirmOpen, setIsCacheDetailsConfirmOpen] = useState(false);
  const [cacheDetailsUnlockSlider, setCacheDetailsUnlockSlider] = useState(0);
  const [cacheDetailsBusy, setCacheDetailsBusy] = useState(false);
  const [cacheDetailsError, setCacheDetailsError] = useState<string | null>(null);
  const [cacheDetailsNotice, setCacheDetailsNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [dRes, aRes] = await Promise.all([
          fetch("/api/hh/dictionaries"),
          fetch("/api/hh/areas"),
        ]);
        if (!dRes.ok) throw new Error(`Справочники: ${dRes.status}`);
        if (!aRes.ok) throw new Error(`Регионы: ${aRes.status}`);
        const dJson = (await dRes.json()) as Dictionaries;
        const aJson = (await aRes.json()) as AreasBundle;
        if (!cancelled) {
          setDicts(dJson);
          setAreasBundle(aJson);
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Ошибка загрузки");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** All HH «Other regions» (1001) countries — full list for checkboxes (same as before preset-chip work). */
  const countriesEn = useMemo(() => {
    if (!areasBundle?.otherRegions?.areas) return [];
    return [...areasBundle.otherRegions.areas]
      .filter((c) => c.id !== "1001")
      .map((c) => ({ id: c.id, nameEn: countryNameRuToEn(c.name) }))
      .sort((a, b) => a.nameEn.localeCompare(b.nameEn, "en"));
  }, [areasBundle]);

  /** EU / EFTA / Caucasus / Balkans: short English country list from HH /areas (comma-separated). */
  const presetCommaCountryTooltips = useMemo(() => {
    if (!areasBundle?.roots?.length) return null;
    const flat = flattenAreas(areasBundle.roots);
    function listFor(presetKey: PresetCommaCountryTooltipKey): string {
      const ids = areaPresetIds[presetKey];
      const names = ids
        .map((id) => flat.get(id)?.name)
        .filter((n): n is string => Boolean(n))
        .map((n) => countryNameRuToEn(n));
      return [...new Set(names)].sort((a, b) => a.localeCompare(b, "en")).join(", ");
    }
    return {
      eu: listFor("eu"),
      efta: listFor("efta"),
      caucasus: listFor("caucasus"),
      balkansNonEu: listFor("balkansNonEu"),
    } satisfies Record<PresetCommaCountryTooltipKey, string>;
  }, [areasBundle]);

  const resolvePresetChipTooltip = useCallback(
    (key: PresetChipKey): string | undefined => {
      if (PRESET_CHIP_KEYS_WITHOUT_TOOLTIP.has(key)) return undefined;
      if (isPresetCommaCountryTooltipKey(key))
        return presetCommaCountryTooltips?.[key] || undefined;
      return presetChipStaticTooltip(key);
    },
    [presetCommaCountryTooltips],
  );

  const handlePresetChipsStackPointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const stack = presetChipsStackRef.current;
    if (!stack) return;
    const raw = e.target as HTMLElement | null;
    const chip = raw?.closest?.("button.chip[data-tooltip]") as HTMLElement | null;
    if (!chip || !stack.contains(chip)) {
      clearPresetChipTooltipNudges(stack);
      return;
    }
    stack.querySelectorAll("button.chip[data-tooltip]").forEach((el) => {
      if (el !== chip) (el as HTMLElement).style.removeProperty("--chip-tooltip-nudge");
    });
    updatePresetChipTooltipNudge(chip);
  }, []);

  const handlePresetChipsStackPointerLeave = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const stack = presetChipsStackRef.current;
    if (!stack) return;
    const rel = e.relatedTarget as Node | null;
    if (rel && stack.contains(rel)) return;
    clearPresetChipTooltipNudges(stack);
  }, []);

  useEffect(() => {
    if (!dicts || !areasBundle) return;
    const el = presetChipsStackRef.current;
    if (!el) return;
    const presetChipsRoot: HTMLElement = el;

    function onFocusIn(e: FocusEvent) {
      const chip = (e.target as HTMLElement | null)?.closest?.("button.chip[data-tooltip]") as
        | HTMLElement
        | null;
      if (!chip || !presetChipsRoot.contains(chip)) return;
      clearPresetChipTooltipNudges(presetChipsRoot);
      updatePresetChipTooltipNudge(chip);
    }

    function onFocusOut(e: FocusEvent) {
      const rel = e.relatedTarget as Node | null;
      if (rel && presetChipsRoot.contains(rel)) return;
      clearPresetChipTooltipNudges(presetChipsRoot);
    }

    presetChipsRoot.addEventListener("focusin", onFocusIn);
    presetChipsRoot.addEventListener("focusout", onFocusOut);
    return () => {
      presetChipsRoot.removeEventListener("focusin", onFocusIn);
      presetChipsRoot.removeEventListener("focusout", onFocusOut);
    };
  }, [dicts, areasBundle]);

  /** 1001 direct children not covered by any geo preset chip — only for «Non-preset (HH)» toggle. */
  const orphan1001AreaIds = useMemo(() => {
    if (!areasBundle?.otherRegions?.areas) return [];
    return areasBundle.otherRegions.areas
      .map((c) => c.id)
      .filter((id) => id !== "1001" && !AREA_ID_IN_ANY_GEO_PRESET.has(id));
  }, [areasBundle]);

  const ruSubjects = useMemo(() => {
    if (!areasBundle?.russia?.areas) return [];
    return [...areasBundle.russia.areas].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [areasBundle]);

  const ruSubjectIds = useMemo(() => new Set(ruSubjects.map((r) => r.id)), [ruSubjects]);

  const searchFields = useMemo(() => effectiveVacancySearchFieldIds(searchFieldIds), [searchFieldIds]);

  const searchFieldsKey = useMemo(() => searchFields.join(","), [searchFields]);

  const togglePreset = useCallback((key: keyof typeof areaPresetIds) => {
    const ids = areaPresetIds[key];
    setSelectedAreaIds((prev) => {
      const next = new Set(prev);
      const allOn = ids.every((id) => next.has(id));
      if (allOn) for (const id of ids) next.delete(id);
      else for (const id of ids) next.add(id);
      return next;
    });
  }, []);

  const presetActive = useCallback(
    (key: keyof typeof areaPresetIds) => {
      const ids = areaPresetIds[key];
      return ids.length > 0 && ids.every((id) => selectedAreaIds.has(id));
    },
    [selectedAreaIds],
  );

  const presetPartial = useCallback(
    (key: keyof typeof areaPresetIds) => {
      const ids = areaPresetIds[key];
      const any = ids.some((id) => selectedAreaIds.has(id));
      return any && !presetActive(key);
    },
    [selectedAreaIds, presetActive],
  );

  const russiaPresetActive = useCallback(() => {
    if (selectedAreaIds.has("113")) return true;
    if (ruSubjects.length === 0) return false;
    return ruSubjects.every((r) => selectedAreaIds.has(r.id));
  }, [selectedAreaIds, ruSubjects]);

  const russiaPresetPartial = useCallback(() => {
    if (russiaPresetActive()) return false;
    return ruSubjects.some((r) => selectedAreaIds.has(r.id));
  }, [selectedAreaIds, ruSubjects, russiaPresetActive]);

  /** Чекбокс «Вся Россия»: 113 + снять субъекты. Зарубежные area не трогаем. */
  const applyAllRussiaSelection = useCallback(() => {
    setSelectedAreaIds((prev) => {
      const next = new Set(prev);
      for (const r of ruSubjects) next.delete(r.id);
      next.add("113");
      return next;
    });
    setRussiaAll(true);
  }, [ruSubjects]);

  /** Чип Russia: как у пресетов — полное включение / полное выключение (113 и все субъекты РФ). */
  const toggleRussiaChip = useCallback(() => {
    const prev = snapshotRef.current.selectedAreaIds;
    const active =
      prev.has("113") ||
      (ruSubjects.length > 0 && ruSubjects.every((r) => prev.has(r.id)));
    if (active) {
      setSelectedAreaIds((p) => {
        const next = new Set(p);
        next.delete("113");
        for (const r of ruSubjects) next.delete(r.id);
        return next;
      });
      setRussiaAll(false);
    } else {
      applyAllRussiaSelection();
    }
  }, [ruSubjects, applyAllRussiaSelection]);

  const togglePresetChip = useCallback(
    (key: PresetChipKey) => {
      if (key === "russia") {
        toggleRussiaChip();
        return;
      }
      if (key === "otherRegions") {
        setSelectedAreaIds((prev) => {
          const next = new Set(prev);
          const ids = orphan1001AreaIds;
          const allOn =
            prev.has("1001") || (ids.length > 0 && ids.every((id) => prev.has(id)));
          if (allOn) {
            next.delete("1001");
            for (const id of ids) next.delete(id);
          } else {
            next.delete("1001");
            for (const id of ids) next.add(id);
          }
          return next;
        });
        return;
      }
      togglePreset(key);
    },
    [orphan1001AreaIds, togglePreset, toggleRussiaChip],
  );

  const chipPresetActive = useCallback(
    (key: PresetChipKey) => {
      if (key === "russia") return russiaPresetActive();
      if (key === "otherRegions") {
        if (selectedAreaIds.has("1001")) return true;
        return (
          orphan1001AreaIds.length > 0 &&
          orphan1001AreaIds.every((id) => selectedAreaIds.has(id))
        );
      }
      return presetActive(key);
    },
    [orphan1001AreaIds, presetActive, russiaPresetActive, selectedAreaIds],
  );

  const chipPresetPartial = useCallback(
    (key: PresetChipKey) => {
      if (key === "russia") return russiaPresetPartial();
      if (key === "otherRegions") {
        if (selectedAreaIds.has("1001")) return false;
        const any = orphan1001AreaIds.some((id) => selectedAreaIds.has(id));
        const all = orphan1001AreaIds.length > 0 && orphan1001AreaIds.every((id) => selectedAreaIds.has(id));
        return any && !all;
      }
      return presetPartial(key);
    },
    [orphan1001AreaIds, presetPartial, russiaPresetPartial, selectedAreaIds],
  );

  /** Сброс всех выбранных регионов (чипы пресетов, Россия, галочки в списках стран/субъектов). */
  const clearRegionSelection = useCallback(() => {
    setSelectedAreaIds(new Set());
    setRussiaAll(false);
  }, []);

  /** Включить все чипы пресетов регионов (объединение id; Россия — 113; Non-preset — orphan 1001). */
  const selectAllPresetRegions = useCallback(() => {
    setRussiaAll(true);
    setSelectedAreaIds((prev) => {
      const next = new Set(prev);
      for (const key of Object.keys(areaPresetIds) as (keyof typeof areaPresetIds)[]) {
        for (const id of areaPresetIds[key]) next.add(id);
      }
      next.delete("1001");
      for (const id of orphan1001AreaIds) next.add(id);
      for (const r of ruSubjects) next.delete(r.id);
      next.add("113");
      return next;
    });
  }, [orphan1001AreaIds, ruSubjects]);

  const hasRegionSelection = selectedAreaIds.size > 0;

  const toggleAreaId = useCallback(
    (id: string) => {
      let clearRussiaAll = false;
      setSelectedAreaIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
          return next;
        }
        next.add(id);
        if (ruSubjectIds.has(id)) {
          if (prev.has("113")) next.delete("113");
          clearRussiaAll = true;
        }
        return next;
      });
      if (clearRussiaAll) setRussiaAll(false);
    },
    [ruSubjectIds],
  );

  useEffect(() => {
    if (russiaAll) {
      setSelectedAreaIds((prev) => {
        const next = new Set(prev);
        for (const r of ruSubjects) next.delete(r.id);
        next.add("113");
        return next;
      });
    } else {
      setSelectedAreaIds((prev) => {
        const next = new Set(prev);
        next.delete("113");
        return next;
      });
    }
  }, [russiaAll, ruSubjects]);

  const filteredCountries = useMemo(() => {
    const q = areaQuery.trim().toLowerCase();
    if (!q) return countriesEn;
    return countriesEn.filter((c) => c.nameEn.toLowerCase().includes(q));
  }, [countriesEn, areaQuery]);

  const allowedEmploymentForm = useMemo(
    () => new Set((dicts?.vacancy_search_employment_form ?? []).map((v) => v.id)),
    [dicts?.vacancy_search_employment_form],
  );
  const allowedWorkFormat = useMemo(
    () => new Set((dicts?.work_format ?? []).map((v) => v.id)),
    [dicts?.work_format],
  );
  const allowedExperience = useMemo(
    () => new Set((dicts?.experience ?? []).map((v) => v.id)),
    [dicts?.experience],
  );

  const employmentSelectOptions = useMemo(() => {
    const list = dicts?.vacancy_search_employment_form ?? [];
    return list.map((o) => ({
      id: o.id,
      label: EMPLOYMENT_FORM_LABELS_EN[o.id] ?? o.name,
    }));
  }, [dicts?.vacancy_search_employment_form]);

  const workFormatSelectOptions = useMemo(() => {
    const list = dicts?.work_format ?? [];
    return list.map((o) => ({
      id: o.id,
      label: WORK_FORMAT_LABELS_EN[o.id] ?? o.name,
    }));
  }, [dicts?.work_format]);
  const experienceSelectOptions = useMemo(() => {
    const list = dicts?.experience ?? [];
    return list.map((o) => ({
      id: o.id,
      label: EXPERIENCE_LABELS_EN[o.id] ?? o.name,
    }));
  }, [dicts?.experience]);

  const currencies = useMemo(() => {
    const list = (dicts?.currency ?? []).filter((c) => c.in_use !== false);
    return [...list].sort((a, b) => a.code.localeCompare(b.code, "en"));
  }, [dicts?.currency]);

  const currencyResolved = useMemo(() => {
    if (currencies.length === 0) return "";
    if (currency && currencies.some((c) => c.code === currency)) return currency;
    const rur = currencies.find((c) => c.code === "RUR");
    return rur?.code ?? currencies[0].code;
  }, [currencies, currency]);

  const selectedAreaIdsKey = useMemo(() => [...selectedAreaIds].sort().join(","), [selectedAreaIds]);
  const employmentFormKey = useMemo(() => [...employmentForm].sort().join(","), [employmentForm]);
  const experienceKey = useMemo(() => [...experience].sort().join(","), [experience]);
  const workFormatKey = useMemo(() => [...workFormat].sort().join(","), [workFormat]);
  const labelsKey = useMemo(() => [...labels].sort().join(","), [labels]);

  snapshotRef.current = {
    text,
    excludedText,
    searchFields,
    selectedAreaIds,
    employmentForm,
    experience,
    workFormat,
    labels,
    withStatedSalary,
    salaryAmount,
    currencyResolved,
  };

  const runSearch = useCallback(async (nextPage: number, overrides?: Partial<SearchSnapshot>) => {
    const s = { ...snapshotRef.current, ...overrides };
    const salaryNum = s.salaryAmount === "" ? null : Number(s.salaryAmount);
    const salaryValid =
      s.salaryAmount === "" || (!Number.isNaN(salaryNum) && salaryNum != null && salaryNum > 0);
    if (salaryValid === false) {
      setSearchError("Некорректная сумма зарплаты");
      return;
    }
    const hasSalary = salaryNum != null && s.salaryAmount !== "" && !Number.isNaN(salaryNum);
    if (hasSalary && !s.currencyResolved.trim()) {
      setSearchError("Выберите валюту для фильтра по зарплате");
      return;
    }
    const reqId = ++searchRequestIdRef.current;
    setSearchError(null);
    setPendingResultsPage(nextPage);
    setSearching(true);
    try {
      const areaIds = [...s.selectedAreaIds];
      const excluded = s.excludedText.trim();
      const body = {
        text: s.text,
        excludedText: excluded || undefined,
        searchFields:
          s.searchFields.length === 0 ||
          (s.searchFields.length === 3 &&
            DEFAULT_VACANCY_SEARCH_FIELDS.every((f) => s.searchFields.includes(f)))
            ? undefined
            : s.searchFields,
        areaIds,
        employmentForm: [...s.employmentForm],
        experience: s.experience.size ? [...s.experience] : undefined,
        workFormat: [...s.workFormat],
        labels: [...s.labels],
        withStatedSalary: s.withStatedSalary || undefined,
        salary: hasSalary ? salaryNum : undefined,
        currency_code: hasSalary ? s.currencyResolved : undefined,
        page: nextPage,
        perPage: 50,
      };
      const res = await fetch("/api/hh/vacancies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const raw = await res.json();
      if (reqId !== searchRequestIdRef.current) return;
      if (!res.ok) {
        const msg =
          typeof raw?.description === "string"
            ? raw.description
            : typeof raw?.error === "string"
              ? raw.error
              : `Ошибка ${res.status}`;
        throw new Error(msg);
      }
      const nextItems = (raw.items ?? []) as VacancyItem[];
      setFound(typeof raw.found === "number" ? raw.found : null);
      setPages(typeof raw.pages === "number" ? raw.pages : null);
      setPage(nextPage);
      setItems(nextItems);
    } catch (e) {
      if (reqId === searchRequestIdRef.current) {
        setSearchError(e instanceof Error ? e.message : "Ошибка поиска");
      }
    } finally {
      if (reqId === searchRequestIdRef.current) {
        setSearching(false);
        setPendingResultsPage(null);
      }
    }
  }, []);

  const scrollResultsIntoView = useCallback(() => {
    requestAnimationFrame(() => {
      resultsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const goToResultsPage = useCallback(
    (nextPage: number) => {
      void runSearch(nextPage).then(() => {
        scrollResultsIntoView();
      });
    },
    [runSearch, scrollResultsIntoView],
  );

  useEffect(() => {
    if (!dicts || !areasBundle) return;
    if (!urlInitialized || !prefsHydrated) return;
    if (
      !initializedFromUrlRef.current &&
      urlSearchParamsHasVacancyAppFilter(new URLSearchParams(window.location.search))
    )
      return;
    void runSearch(0);
  }, [
    dicts,
    areasBundle,
    urlInitialized,
    prefsHydrated,
    searchFieldsKey,
    selectedAreaIdsKey,
    employmentFormKey,
    experienceKey,
    workFormatKey,
    labelsKey,
    withStatedSalary,
    currencyResolved,
    runSearch,
  ]);

  useEffect(() => {
    if (!dicts || !areasBundle || initializedFromUrlRef.current) return;
    const initialParams = new URLSearchParams(window.location.search);
    const hadInitialAppFilters = urlSearchParamsHasVacancyAppFilter(initialParams);
    initialUrlHadAppFiltersRef.current = hadInitialAppFilters;
    const parsed = parseVacancyAppSearchFromUrlSearchParams(initialParams, {
      employmentForm: allowedEmploymentForm,
      workFormat: allowedWorkFormat,
      experience: allowedExperience,
    });
    initializedFromUrlRef.current = true;
    setText(parsed.text);
    setExcludedText(parsed.excludedText);
    setSearchFieldIds(vacancySearchFieldIdsFromParsed(parsed.searchFields));
    setSelectedAreaIds(parsed.areaIds);
    setRussiaAll(parsed.areaIds.has("113"));
    setEmploymentForm(parsed.employmentForm);
    setExperience(parsed.experience);
    setWorkFormat(parsed.workFormat);
    setLabels(parsed.labels);
    setWithStatedSalary(parsed.withStatedSalary);
    setSalaryAmount(parsed.salaryAmount);
    setCurrency(parsed.currency_code);
    setUrlInitialized(true);
  }, [allowedEmploymentForm, allowedExperience, allowedWorkFormat, areasBundle, dicts, ruSubjectIds]);

  useEffect(() => {
    if (!dicts || !areasBundle || !urlInitialized) return;

    if (initialUrlHadAppFiltersRef.current) {
      setPrefsHydrated(true);
      return;
    }

    if (!isSupabaseConfigured()) {
      setPrefsHydrated(true);
      return;
    }

    const ac = new AbortController();

    void (async () => {
      try {
        const res = await fetch("/api/me/search-preferences", { signal: ac.signal });
        if (!res.ok || ac.signal.aborted) return;
        const json = (await res.json()) as { filters?: unknown };
        if (ac.signal.aborted) return;
        const filters = json?.filters;
        if (
          filters != null &&
          typeof filters === "object" &&
          !Array.isArray(filters) &&
          Object.keys(filters).length > 0
        ) {
          const params = parseFiltersRecordToUrlSearchParams(filters);
          if (params && !ac.signal.aborted) {
            const loaded = parseVacancyAppSearchFromUrlSearchParams(params, {
              employmentForm: allowedEmploymentForm,
              workFormat: allowedWorkFormat,
              experience: allowedExperience,
            });
            setText(loaded.text);
            setExcludedText(loaded.excludedText);
            setSearchFieldIds(vacancySearchFieldIdsFromParsed(loaded.searchFields));
            setSelectedAreaIds(loaded.areaIds);
            setRussiaAll(loaded.areaIds.has("113"));
            setEmploymentForm(loaded.employmentForm);
            setExperience(loaded.experience);
            setWorkFormat(loaded.workFormat);
            setLabels(loaded.labels);
            setWithStatedSalary(loaded.withStatedSalary);
            setSalaryAmount(loaded.salaryAmount);
            setCurrency(loaded.currency_code);
          }
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        console.error("Failed to load search preferences:", e);
      } finally {
        if (!ac.signal.aborted) {
          setPrefsHydrated(true);
        }
      }
    })();

    return () => ac.abort();
  }, [
    allowedEmploymentForm,
    allowedExperience,
    allowedWorkFormat,
    areasBundle,
    dicts,
    runSearch,
    urlInitialized,
  ]);

  useEffect(() => {
    if (!initializedFromUrlRef.current) return;
    const params = buildVacancyAppUrlSearchParams(snapshotRef.current);
    const next = params.toString();
    const current = window.location.search.startsWith("?")
      ? window.location.search.slice(1)
      : window.location.search;
    if (next !== current) {
      const hash = window.location.hash || "";
      const url = next ? `${window.location.pathname}?${next}${hash}` : `${window.location.pathname}${hash}`;
      window.history.replaceState(null, "", url);
    }
  }, [
    text,
    excludedText,
    searchFieldsKey,
    selectedAreaIdsKey,
    employmentFormKey,
    experienceKey,
    workFormatKey,
    labelsKey,
    withStatedSalary,
    salaryAmount,
    currencyResolved,
  ]);

  useEffect(
    () => () => {
      if (copyResetTimerRef.current != null) window.clearTimeout(copyResetTimerRef.current);
      if (cacheNoticeTimerRef.current != null) window.clearTimeout(cacheNoticeTimerRef.current);
    },
    [],
  );

  const openInHeadHunter = useCallback(() => {
    const params = buildVacancyAppUrlSearchParams(snapshotRef.current);
    params.delete("page");
    params.delete("per_page");
    const url = `https://hh.ru/search/vacancy?${params.toString()}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const copySearchLink = useCallback(async () => {
    const href = window.location.href;
    const markCopied = () => {
      setCopyDone(true);
      if (copyResetTimerRef.current != null) window.clearTimeout(copyResetTimerRef.current);
      copyResetTimerRef.current = window.setTimeout(() => setCopyDone(false), 1800);
    };
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(href);
        markCopied();
        return;
      }
      throw new Error("Clipboard API unavailable");
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = href;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.top = "-9999px";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const copied = document.execCommand("copy");
        document.body.removeChild(textarea);
        if (!copied) throw new Error("execCommand copy failed");
        markCopied();
      } catch {
        setSearchError("Unable to copy link");
      }
    }
  }, []);

  const clearFilters = useCallback(() => {
    setSavePrefsError(null);
    setText("");
    setExcludedText("");
    setSearchFieldIds(new Set());
    setSelectedAreaIds(new Set());
    setRussiaAll(false);
    setEmploymentForm(new Set());
    setExperience(new Set());
    setWorkFormat(new Set());
    setLabels(new Set());
    setWithStatedSalary(false);
    setSalaryAmount("");
    setCurrency("");
    const emptyOverride: Partial<SearchSnapshot> = {
      text: "",
      excludedText: "",
      searchFields: [...DEFAULT_VACANCY_SEARCH_FIELDS],
      selectedAreaIds: new Set(),
      employmentForm: new Set(),
      experience: new Set(),
      workFormat: new Set(),
      labels: new Set(),
      withStatedSalary: false,
      salaryAmount: "",
      currencyResolved: "",
    };
    queueMicrotask(() => void runSearch(0, emptyOverride));
  }, [runSearch]);

  const savePreferences = useCallback(async (): Promise<boolean> => {
    if (!isSupabaseConfigured()) return false;
    setSavePrefsError(null);
    setSavePrefsBusy(true);
    try {
      const params = buildVacancyAppUrlSearchParams(snapshotRef.current);
      const filters = serializeAppUrlParamsToFiltersRecord(params);
      const res = await fetch("/api/me/search-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters }),
      });
      const raw = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof raw?.error === "string" ? raw.error : `Save failed (${res.status})`;
        throw new Error(msg);
      }
      return true;
    } catch (e) {
      setSavePrefsError(e instanceof Error ? e.message : "Save failed");
      return false;
    } finally {
      setSavePrefsBusy(false);
    }
  }, []);

  const confirmSavePreferences = useCallback(async () => {
    const ok = await savePreferences();
    if (ok) {
      setIsSavePrefsConfirmOpen(false);
      setSavePrefsUnlockSlider(0);
    }
  }, [savePreferences]);

  const CACHE_DETAILS_NOTICE_MS = 12_000;

  const showCacheDetailsNotice = useCallback((message: string) => {
    setCacheDetailsError(null);
    setCacheDetailsNotice(message);
    if (cacheNoticeTimerRef.current != null) window.clearTimeout(cacheNoticeTimerRef.current);
    cacheNoticeTimerRef.current = window.setTimeout(() => {
      setCacheDetailsNotice(null);
      cacheNoticeTimerRef.current = null;
    }, CACHE_DETAILS_NOTICE_MS);
  }, []);

  const confirmCacheVacancyDetails = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    const vacancyIds = items.map((it) => it.id).filter((id) => /^\d+$/.test(id));
    if (vacancyIds.length === 0) {
      setCacheDetailsError("No vacancies on this page to save.");
      return;
    }
    setCacheDetailsError(null);
    setIsCacheDetailsConfirmOpen(false);
    setCacheDetailsUnlockSlider(0);
    setCacheDetailsBusy(true);
    try {
      const res = await fetch("/api/me/vacancy-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vacancyIds,
          searchFound: found ?? undefined,
        }),
      });
      const raw = (await res.json().catch(() => ({}))) as {
        error?: string;
        saved?: number;
        requested?: number;
        failed?: { id: string; status: number; detail?: string }[];
      };
      if (!res.ok) {
        const msg = typeof raw?.error === "string" ? raw.error : `Request failed (${res.status})`;
        throw new Error(msg);
      }
      const saved = typeof raw.saved === "number" ? raw.saved : 0;
      const requested = typeof raw.requested === "number" ? raw.requested : vacancyIds.length;
      const failed = Array.isArray(raw.failed) ? raw.failed : [];
      if (failed.length === 0) {
        showCacheDetailsNotice(
          saved === requested
            ? `Saved full descriptions for ${saved} listing${saved === 1 ? "" : "s"}.`
            : `Saved ${saved} of ${requested} listings.`,
        );
      } else {
        const failHint =
          failed.length <= 3
            ? ` Some failed: ${failed.map((f) => f.id).join(", ")}.`
            : ` ${failed.length} listings could not be fetched.`;
        showCacheDetailsNotice(
          `Saved ${saved} of ${requested}.${failHint}`,
        );
      }
    } catch (e) {
      if (cacheNoticeTimerRef.current != null) {
        window.clearTimeout(cacheNoticeTimerRef.current);
        cacheNoticeTimerRef.current = null;
      }
      setCacheDetailsNotice(null);
      setCacheDetailsError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setCacheDetailsBusy(false);
    }
  }, [items, found, showCacheDetailsNotice]);

  const restorePreferences = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    setSavePrefsError(null);
    setRestorePrefsBusy(true);
    try {
      const res = await fetch("/api/me/search-preferences");
      const raw = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof raw?.error === "string" ? raw.error : `Load failed (${res.status})`;
        throw new Error(msg);
      }
      const filters = raw?.filters;
      if (
        filters == null ||
        typeof filters !== "object" ||
        Array.isArray(filters) ||
        Object.keys(filters as object).length === 0
      ) {
        throw new Error("No saved preferences");
      }
      const params = parseFiltersRecordToUrlSearchParams(filters);
      if (!params) throw new Error("Invalid saved preferences");
      const loaded = parseVacancyAppSearchFromUrlSearchParams(params, {
        employmentForm: allowedEmploymentForm,
        workFormat: allowedWorkFormat,
        experience: allowedExperience,
      });
      setText(loaded.text);
      setExcludedText(loaded.excludedText);
      setSearchFieldIds(vacancySearchFieldIdsFromParsed(loaded.searchFields));
      setSelectedAreaIds(loaded.areaIds);
      setRussiaAll(loaded.areaIds.has("113"));
      setEmploymentForm(loaded.employmentForm);
      setExperience(loaded.experience);
      setWorkFormat(loaded.workFormat);
      setLabels(loaded.labels);
      setWithStatedSalary(loaded.withStatedSalary);
      setSalaryAmount(loaded.salaryAmount);
      setCurrency(loaded.currency_code);
      const overrideSnapshot: Partial<SearchSnapshot> = {
        text: loaded.text,
        excludedText: loaded.excludedText,
        searchFields: loaded.searchFields,
        selectedAreaIds: loaded.areaIds,
        employmentForm: loaded.employmentForm,
        experience: loaded.experience,
        workFormat: loaded.workFormat,
        labels: loaded.labels,
        withStatedSalary: loaded.withStatedSalary,
        salaryAmount: loaded.salaryAmount,
        currencyResolved: loaded.currency_code,
      };
      queueMicrotask(() => void runSearch(0, overrideSnapshot));
    } catch (e) {
      setSavePrefsError(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setRestorePrefsBusy(false);
    }
  }, [allowedEmploymentForm, allowedExperience, allowedWorkFormat, runSearch]);

  const applyImportedUrl = useCallback(() => {
    const raw = importUrl.trim();
    if (!raw) {
      setImportError("Paste an HH URL");
      return;
    }
    try {
      const parsedUrl = new URL(raw);
      const parsed = parseVacancyAppSearchFromUrlSearchParams(parsedUrl.searchParams, {
        employmentForm: allowedEmploymentForm,
        workFormat: allowedWorkFormat,
        experience: allowedExperience,
      });
      setText(parsed.text);
      setExcludedText(parsed.excludedText);
      setSearchFieldIds(vacancySearchFieldIdsFromParsed(parsed.searchFields));
      setSelectedAreaIds(parsed.areaIds);
      setRussiaAll(parsed.areaIds.has("113"));
      setEmploymentForm(parsed.employmentForm);
      setExperience(parsed.experience);
      setWorkFormat(parsed.workFormat);
      setLabels(parsed.labels);
      setWithStatedSalary(parsed.withStatedSalary);
      setSalaryAmount(parsed.salaryAmount);
      setCurrency(parsed.currency_code);
      setImportError(null);
      setIsImportOpen(false);
      const overrideSnapshot: Partial<SearchSnapshot> = {
        text: parsed.text,
        excludedText: parsed.excludedText,
        searchFields: parsed.searchFields,
        selectedAreaIds: parsed.areaIds,
        employmentForm: parsed.employmentForm,
        experience: parsed.experience,
        workFormat: parsed.workFormat,
        labels: parsed.labels,
        withStatedSalary: parsed.withStatedSalary,
        salaryAmount: parsed.salaryAmount,
        currencyResolved: parsed.currency_code,
      };
      queueMicrotask(() => void runSearch(0, overrideSnapshot));
    } catch {
      setImportError("Invalid URL");
    }
  }, [
    allowedEmploymentForm,
    allowedExperience,
    allowedWorkFormat,
    importUrl,
    ruSubjectIds,
    runSearch,
  ]);

  useEffect(() => {
    if (!dicts || !areasBundle) return;

    function redirectWheelUnlessFieldsetFocused(el: HTMLElement) {
      const onWheel = (e: WheelEvent) => {
        const fs = el.closest("fieldset");
        if (!fs || !(fs as HTMLElement).matches(":focus-within")) {
          e.preventDefault();
          window.scrollBy({ top: e.deltaY, left: e.deltaX, behavior: "auto" });
        }
      };
      el.addEventListener("wheel", onWheel, { passive: false });
      return () => el.removeEventListener("wheel", onWheel);
    }

    const cleanups: (() => void)[] = [];
    const countryEl = countryScrollRef.current;
    if (countryEl) cleanups.push(redirectWheelUnlessFieldsetFocused(countryEl));
    const ruEl = ruScrollRef.current;
    if (ruEl && russiaListOpen) cleanups.push(redirectWheelUnlessFieldsetFocused(ruEl));

    return () => {
      for (const c of cleanups) c();
    };
  }, [dicts, areasBundle, russiaListOpen, countryListOpen]);

  if (loadError) {
    return (
      <div className="panel error">
        <p>{loadError}</p>
        <p className="muted">
          Проверьте файл <code>.env.local</code>: переменная{" "}
          <code>HH_USER_AGENT</code> обязательна (формат:{" "}
          <code>MyApp/1.0 (you@gmail.com)</code>).
        </p>
      </div>
    );
  }

  if (!dicts || !areasBundle) {
    return <p className="muted">Loading dictionaries…</p>;
  }

  const showResultsPagination =
    found != null && found > 0 && pages != null && pages > 1;

  return (
    <div className="layout">
      <section className="panel filters">
        <div className="filters-panel-top-actions">
          <button
            type="button"
            className="filters-panel-clear-btn"
            onClick={clearFilters}
            aria-label="Clear all filters"
            title="Clear all filters"
          >
            <FiltersPanelIconClear />
          </button>
        </div>
        <div className="filters-stack">
          <div className="field field--text-search-block">
            <label>
              <span>Keywords</span>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={(e) => {
                  const v = e.currentTarget.value;
                  queueMicrotask(() => void runSearch(0, { text: v }));
                }}
                placeholder="e.g. React, Developer"
              />
            </label>
            <div className="text-search-block__exclude">
              <label>
                <span>Exclude words</span>
                <input
                  value={excludedText}
                  onChange={(e) => setExcludedText(e.target.value)}
                  onBlur={(e) => {
                    const v = e.currentTarget.value;
                    queueMicrotask(() => void runSearch(0, { excludedText: v }));
                  }}
                  placeholder="e.g. intern, trainee, junior"
                  autoComplete="off"
                />
              </label>
            </div>
            <div className="filters-stack__job-fields-row filters-stack__job-fields-row--experience">
              <MultiSelectChips
                label="Search in"
                options={[...SEARCH_FIELD_OPTIONS]}
                selected={searchFieldIds}
                onChange={setSearchFieldIds}
                placeholder="Any search field"
                clearable
              />
            </div>
          </div>

          <div className="filters-stack__salary-group">
            <div className="filters-stack__salary-group-input">
              <SalaryCurrencyInput
                amount={salaryAmount}
                onAmountChange={setSalaryAmount}
                onAmountBlur={(e) => {
                  const canonical = parseSalaryAmount(e.currentTarget.value);
                  queueMicrotask(() => void runSearch(0, { salaryAmount: canonical }));
                }}
                currency={currencyResolved}
                onCurrencyChange={setCurrency}
                currencies={currencies}
                label="Salary"
                placeholder="per month"
              />
            </div>
            <label className="check-row check-row--compact salary-stated-row">
              <input
                type="checkbox"
                checked={withStatedSalary}
                onChange={(e) => setWithStatedSalary(e.target.checked)}
              />
              <span>Salary specified</span>
            </label>
          </div>

          <fieldset className="field field--countries-regions">
            <legend className="countries-regions-legend">
              <span className="countries-regions-legend__title">Countries and regions</span>
              <button
                type="button"
                className="countries-regions-legend__action"
                onClick={() =>
                  hasRegionSelection ? clearRegionSelection() : selectAllPresetRegions()
                }
                aria-label={
                  hasRegionSelection
                    ? "Clear all countries and regions"
                    : "Select all preset regions"
                }
              >
                {hasRegionSelection ? "Clear all" : "Select all"}
              </button>
            </legend>
            <div
              ref={presetChipsStackRef}
              className="preset-chips-stack"
              onPointerMove={handlePresetChipsStackPointerMove}
              onPointerLeave={handlePresetChipsStackPointerLeave}
            >
              <div className="chips chips--preset-row-1">
                {PRESET_CHIP_ORDER_ROW1.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`chip ${key === "neighborsCentralAsia" || key === "neighborsEast" ? "chip--geo-codes " : ""}${chipPresetActive(key) ? "chip--on" : ""} ${chipPresetPartial(key) ? "chip--partial" : ""}`}
                    onClick={() => togglePresetChip(key)}
                    data-tooltip={resolvePresetChipTooltip(key)}
                    aria-label={
                      key === "neighborsCentralAsia" || key === "neighborsEast"
                        ? resolvePresetChipTooltip(key)
                        : undefined
                    }
                  >
                    {presetChipLabel(key)}
                  </button>
                ))}
              </div>
              <div className="chips chips--preset-row-eu">
                {PRESET_CHIP_ORDER_ROW_EU.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`chip ${chipPresetActive(key) ? "chip--on" : ""} ${chipPresetPartial(key) ? "chip--partial" : ""}`}
                    onClick={() => togglePresetChip(key)}
                    data-tooltip={resolvePresetChipTooltip(key)}
                  >
                    {presetChipLabel(key)}
                  </button>
                ))}
              </div>
              <div className="chips chips--preset-row-bottom">
                {PRESET_CHIP_ORDER_ROW_BOTTOM.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`chip ${chipPresetActive(key) ? "chip--on" : ""} ${chipPresetPartial(key) ? "chip--partial" : ""}`}
                    onClick={() => togglePresetChip(key)}
                    data-tooltip={resolvePresetChipTooltip(key)}
                  >
                    {presetChipLabel(key)}
                  </button>
                ))}
              </div>
              <div className="chips chips--preset-row-nonpreset">
                {PRESET_CHIP_ORDER_ROW_NONPRESET.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`chip ${chipPresetActive(key) ? "chip--on" : ""} ${chipPresetPartial(key) ? "chip--partial" : ""}`}
                    onClick={() => togglePresetChip(key)}
                    data-tooltip={resolvePresetChipTooltip(key)}
                  >
                    {presetChipLabel(key)}
                  </button>
                ))}
              </div>
            </div>
          </fieldset>

          <div className="regions-split regions-split--with-russia">
          <div className="regions-countries">
            <fieldset className="field">
              <button
                type="button"
                className="collapse-toggle"
                onClick={() => {
                  setCountryListOpen((wasOpen) => {
                    if (wasOpen) return false;
                    setRussiaListOpen(false);
                    return true;
                  });
                }}
                aria-expanded={countryListOpen}
                aria-controls="country-scroll"
              >
                All countries{" "}
                <span className="collapse-toggle__caret" aria-hidden>
                  {countryListOpen ? "▾" : "▸"}
                </span>
              </button>
              {countryListOpen ? (
                <>
                  <div className="country-search-wrap">
                    <input
                      className="country-search-wrap__input"
                      value={areaQuery}
                      onChange={(e) => setAreaQuery(e.target.value)}
                      placeholder="Search country…"
                      aria-label="Search country"
                    />
                    {areaQuery.trim() ? (
                      <button
                        type="button"
                        className="country-search-wrap__clear"
                        aria-label="Clear country search"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setAreaQuery("")}
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                  <div id="country-scroll" className="country-scroll" ref={countryScrollRef}>
                    {filteredCountries.map((c) => (
                      <label key={c.id} className="check-row">
                        <input
                          type="checkbox"
                          checked={selectedAreaIds.has(c.id)}
                          onChange={() => toggleAreaId(c.id)}
                        />{" "}
                        {c.nameEn}
                      </label>
                    ))}
                  </div>
                </>
              ) : null}
            </fieldset>
          </div>
          <div className="regions-russia">
            <fieldset className="field">
              <button
                type="button"
                className="collapse-toggle"
                onClick={() => {
                  setRussiaListOpen((wasOpen) => {
                    if (wasOpen) return false;
                    setCountryListOpen(false);
                    return true;
                  });
                }}
                aria-expanded={russiaListOpen}
                aria-controls="ru-russia-collapse"
              >
                Russia regions{" "}
                <span className="collapse-toggle__caret" aria-hidden>
                  {russiaListOpen ? "▾" : "▸"}
                </span>
              </button>
              {russiaListOpen ? (
                <div id="ru-russia-collapse">
                  <label className="regions-russia__all-russia">
                    <input
                      type="checkbox"
                      checked={selectedAreaIds.has("113")}
                      onChange={(e) => {
                        if (e.target.checked) applyAllRussiaSelection();
                        else setRussiaAll(false);
                      }}
                    />
                    <span>Вся Россия (113)</span>
                  </label>
                  <div id="ru-scroll" className="ru-scroll" ref={ruScrollRef}>
                    {ruSubjects.map((r) => (
                      <label key={r.id} className="check-row">
                        <input
                          type="checkbox"
                          checked={selectedAreaIds.has(r.id)}
                          onChange={() => toggleAreaId(r.id)}
                        />{" "}
                        {r.name}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </fieldset>
          </div>
          </div>

          <div className="filters-stack__job-fields">
            <div className="filters-stack__job-fields-row filters-stack__job-fields-row--experience">
              <MultiSelectChips
                label="Experience"
                options={experienceSelectOptions}
                selected={experience}
                onChange={setExperience}
                placeholder="Any experience"
                clearable
              />
            </div>
            <div className="filters-stack__job-fields-row">
              <MultiSelectChips
                label="Employment type"
                options={employmentSelectOptions}
                selected={employmentForm}
                onChange={setEmploymentForm}
                placeholder="Any employment type"
                clearable
              />
              <MultiSelectChips
                label="Work format"
                options={workFormatSelectOptions}
                selected={workFormat}
                onChange={setWorkFormat}
                placeholder="Any work format"
                clearable
              />
            </div>
          </div>

          <div className="filters-actions-bar">
            <button type="button" className="secondary filters-actions-bar__btn" onClick={() => setIsImportOpen(true)}>
              <span className="filters-actions-bar__btn-icon" aria-hidden>
                <FiltersBarIconImport />
              </span>
              <span>Import from HH</span>
            </button>
            <button type="button" className="secondary filters-actions-bar__btn" onClick={openInHeadHunter}>
              <span className="filters-actions-bar__btn-icon" aria-hidden>
                <FiltersBarIconHh />
              </span>
              <span>Open in HH</span>
            </button>
            <button
              type="button"
              className="secondary filters-actions-bar__copy"
              aria-label="Copy search link"
              title={copyDone ? "Copied" : "Copy search link"}
              onClick={() => void copySearchLink()}
            >
              <span className="filters-actions-bar__btn-icon" aria-hidden>
                {copyDone ? <FiltersBarIconCheck /> : <FiltersBarIconLink />}
              </span>
            </button>
            {isSupabaseConfigured() ? (
              <div className="filters-actions-bar__prefs-row">
                <button
                  type="button"
                  className="secondary filters-actions-bar__btn filters-actions-bar__prefs-btn"
                  disabled={restorePrefsBusy}
                  title="Replaces all filters with your saved search preferences (what you last saved with Save preferences)."
                  onClick={() => void restorePreferences()}
                >
                  <span className="filters-actions-bar__btn-icon" aria-hidden>
                    <FiltersBarIconLoad />
                  </span>
                  <span>{restorePrefsBusy ? "Loading…" : "Load preferences"}</span>
                </button>
                <button
                  type="button"
                  className="secondary filters-actions-bar__btn filters-actions-bar__prefs-btn"
                  disabled={savePrefsBusy}
                  title="Confirm in the dialog — slide the dial to unlock save."
                  onClick={() => {
                    setSavePrefsError(null);
                    setSavePrefsUnlockSlider(0);
                    setIsSavePrefsConfirmOpen(true);
                  }}
                >
                  <span className="filters-actions-bar__btn-icon" aria-hidden>
                    <FiltersBarIconSave />
                  </span>
                  <span>Save preferences</span>
                </button>
              </div>
            ) : null}
          </div>

          <div className="field filters-stack__vacancy-labels">
          {VACANCY_APP_URL_LABEL_IDS.map((id) => (
            <label key={id} className="check-row check-row--compact">
              <input
                type="checkbox"
                checked={labels.has(id)}
                onChange={() =>
                  setLabels((prev) => {
                    const n = new Set(prev);
                    if (n.has(id)) n.delete(id);
                    else n.add(id);
                    return n;
                  })
                }
              />
              <span>{VACANCY_LABELS_EN[id]}</span>
            </label>
          ))}
          </div>
        </div>

        <div className="filters-after">
          {searchError ? <p className="error">{searchError}</p> : null}
          {savePrefsError ? <p className="error small">{savePrefsError}</p> : null}
        </div>
      </section>
      {isImportOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsImportOpen(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-hh-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="import-hh-dialog-title">Import from HH</h2>
            <textarea
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="https://hh.ru/search/vacancy?..."
              rows={3}
              autoFocus
              aria-label="Paste hh.ru search URL"
            />
            {importError ? <p className="error small">{importError}</p> : null}
            <div className="modal__actions">
              <button type="button" className="secondary" onClick={() => setIsImportOpen(false)}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={applyImportedUrl}>
                Apply
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isSavePrefsConfirmOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => {
            if (!savePrefsBusy) {
              setIsSavePrefsConfirmOpen(false);
              setSavePrefsUnlockSlider(0);
            }
          }}
        >
          <div
            className="modal modal--save-prefs"
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-prefs-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="save-prefs-dialog-title">Lock in your save</h2>
            <p className="muted small modal__lede">
              Your saved filters on the server will be replaced with what you see in the form now.
              Drag the dial all the way to the right — like opening a small safe — then tap save.
            </p>
            <div className="save-prefs-vault" aria-hidden>
              <div
                className="save-prefs-vault__dial"
                style={{ transform: `rotate(${savePrefsUnlockSlider * 2.5 - 125}deg)` }}
              />
            </div>
            <div className="save-prefs-unlock-wrap">
              <label className="save-prefs-unlock__label" htmlFor="save-prefs-unlock-slider">
                Slide to unlock save
              </label>
              <input
                id="save-prefs-unlock-slider"
                className="save-prefs-unlock"
                type="range"
                min={0}
                max={100}
                step={1}
                value={savePrefsUnlockSlider}
                disabled={savePrefsBusy}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={savePrefsUnlockSlider}
                aria-valuetext={
                  savePrefsUnlockSlider >= VAULT_SLIDER_THRESHOLD
                    ? "Unlocked, ready to save"
                    : `${savePrefsUnlockSlider} percent, keep sliding right to unlock`
                }
                onChange={(e) => setSavePrefsUnlockSlider(Number(e.target.value))}
              />
              <p className="save-prefs-unlock__hint muted small" aria-live="polite">
                {savePrefsUnlockSlider >= VAULT_SLIDER_THRESHOLD
                  ? "Unlocked — you can overwrite on the server."
                  : "Not yet — slide further right."}
              </p>
            </div>
            <div className="modal__actions">
              <button
                type="button"
                className="secondary"
                disabled={savePrefsBusy}
                onClick={() => {
                  setIsSavePrefsConfirmOpen(false);
                  setSavePrefsUnlockSlider(0);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={
                  savePrefsBusy || savePrefsUnlockSlider < VAULT_SLIDER_THRESHOLD
                }
                onClick={() => void confirmSavePreferences()}
              >
                {savePrefsBusy ? "Saving…" : "Overwrite on server"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCacheDetailsConfirmOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => {
            setIsCacheDetailsConfirmOpen(false);
            setCacheDetailsUnlockSlider(0);
            setCacheDetailsError(null);
          }}
        >
          <div
            className="modal modal--save-prefs"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cache-details-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="cache-details-dialog-title">
              Save full vacancy descriptions to your account for further analysis
            </h2>
            <p className="muted small modal__lede">
              We will fetch each vacancy on this page from HeadHunter (one API call per listing) and
              store the full JSON on your account. Drag the dial all the way to the right, then
              confirm.
            </p>
            <div className="save-prefs-vault" aria-hidden>
              <div
                className="save-prefs-vault__dial"
                style={{ transform: `rotate(${cacheDetailsUnlockSlider * 2.5 - 125}deg)` }}
              />
            </div>
            <div className="save-prefs-unlock-wrap">
              <label className="save-prefs-unlock__label" htmlFor="cache-details-unlock-slider">
                Slide to unlock save
              </label>
              <input
                id="cache-details-unlock-slider"
                className="save-prefs-unlock"
                type="range"
                min={0}
                max={100}
                step={1}
                value={cacheDetailsUnlockSlider}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={cacheDetailsUnlockSlider}
                aria-valuetext={
                  cacheDetailsUnlockSlider >= VAULT_SLIDER_THRESHOLD
                    ? "Unlocked, ready to save"
                    : `${cacheDetailsUnlockSlider} percent, keep sliding right to unlock`
                }
                onChange={(e) => setCacheDetailsUnlockSlider(Number(e.target.value))}
              />
              <p className="save-prefs-unlock__hint muted small" aria-live="polite">
                {cacheDetailsUnlockSlider >= VAULT_SLIDER_THRESHOLD
                  ? "Unlocked — you can fetch and save."
                  : "Not yet — slide further right."}
              </p>
            </div>
            {cacheDetailsError ? <p className="error small">{cacheDetailsError}</p> : null}
            <div className="modal__actions">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setIsCacheDetailsConfirmOpen(false);
                  setCacheDetailsUnlockSlider(0);
                  setCacheDetailsError(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={cacheDetailsUnlockSlider < VAULT_SLIDER_THRESHOLD}
                onClick={() => void confirmCacheVacancyDetails()}
              >
                {`Fetch and save details for ${items.length} position${items.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section ref={resultsSectionRef} className="panel results">
        {found != null ? (
          <div className="results-toolbar">
            <p className="muted small results-toolbar__count">Найдено: {found}</p>
            <div className="results-toolbar__actions">
              {isSupabaseConfigured() && items.length > 0 ? (
                <div
                  className={`results-toolbar__cache-tooltip-anchor${tooManyResultsForCache ? " results-toolbar__cache-tooltip-anchor--blocked" : ""}`}
                  data-tooltip={
                    tooManyResultsForCache
                      ? CACHE_LOAD_DETAILS_TOOLTIP_BLOCKED
                      : CACHE_LOAD_DETAILS_TOOLTIP_OK
                  }
                >
                  <button
                    type="button"
                    className="secondary results-toolbar__cache-btn"
                    disabled={cacheDetailsBusy || searching || tooManyResultsForCache}
                    aria-busy={cacheDetailsBusy}
                    aria-label={
                      cacheDetailsBusy ? "Saving vacancy details to your account" : undefined
                    }
                    onClick={() => {
                      if (tooManyResultsForCache) return;
                      setCacheDetailsError(null);
                      setCacheDetailsUnlockSlider(0);
                      setIsCacheDetailsConfirmOpen(true);
                    }}
                  >
                    {cacheDetailsBusy ? (
                      <>
                        <span className="results-toolbar__cache-btn-spinner" aria-hidden />
                        <span>Saving…</span>
                      </>
                    ) : (
                      "Load full details"
                    )}
                  </button>
                </div>
              ) : null}
              {showResultsPagination ? (
                <ResultsPaginationCompact
                  searching={searching}
                  page={resultsPageForUi}
                  pages={pages}
                  onPrev={() => goToResultsPage(resultsPageForUi - 1)}
                  onNext={() => goToResultsPage(resultsPageForUi + 1)}
                />
              ) : null}
            </div>
          </div>
        ) : (
          <p className="muted small">
            {searching
              ? "Updating…"
              : "Filters run automatically. Text and exclude fields apply when the field loses focus."}
          </p>
        )}
        {(() => {
          const errOpen = Boolean(cacheDetailsError && !isCacheDetailsConfirmOpen);
          const msg = cacheDetailsNotice;
          if (!errOpen && !msg) return null;
          const text = errOpen ? (cacheDetailsError as string) : msg;
          const isError = errOpen;
          const isWarning =
            !isError &&
            Boolean(
              msg &&
                (msg.includes("could not be fetched") ||
                  msg.includes("Some failed:") ||
                  msg.includes("listings could not")),
            );
          const bannerClass = isError
            ? "results-cache-banner results-cache-banner--error"
            : isWarning
              ? "results-cache-banner results-cache-banner--warning"
              : "results-cache-banner results-cache-banner--success";
          return (
            <div role={isError ? "alert" : "status"} aria-live={isError ? "assertive" : "polite"} className={bannerClass}>
              {text}
            </div>
          );
        })()}
        <ul className="vacancy-list">
          {items.map((it) => (
            <li key={it.id}>
              <VacancyCard item={it} />
            </li>
          ))}
        </ul>
        {showResultsPagination ? (
          <ResultsPaginationNumeric
            searching={searching}
            page={resultsPageForUi}
            pages={pages}
            onGoToPage={(p) => goToResultsPage(p)}
          />
        ) : null}
      </section>
    </div>
  );
}
