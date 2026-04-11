"use client";

import areaPresetIds from "@/data/area-preset-ids.json";
import type { HhAreaNode } from "@/lib/areas/flatten";
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  otherRegions: HhAreaNode | null;
  russia: HhAreaNode | null;
  presetIds: typeof areaPresetIds;
};

type PresetJsonKey = keyof typeof areaPresetIds;
type PresetChipKey = PresetJsonKey | "russia" | "otherRegions";

const PRESET_LABELS: Record<PresetJsonKey, string> = {
  eu: "EU",
  efta: "EFTA",
  balkansNonEu: "Balkans (non-EU)",
  middleEast: "Middle East",
  japanKorea: "Japan & Korea",
  anz: "Australia & NZ",
  latinAmerica: "Latin America",
  asia: "Asia",
  africa: "Africa",
  caucasus: "Caucasus",
  usa: "USA",
  canada: "Canada",
  uk: "UK",
  ireland: "Ireland",
};

const PRESET_CHIP_ORDER: PresetChipKey[] = [
  ...(Object.keys(areaPresetIds) as PresetJsonKey[]),
  "russia",
  "otherRegions",
];

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

/** Compact hh.ru-style mark (red tile + “hh”) for the “Open in HH” action */
function FiltersBarIconHh() {
  return (
    <svg className="filters-actions-bar__btn-svg" viewBox="0 0 32 32" width={18} height={18} aria-hidden>
      <rect width="32" height="32" rx="7" fill="#d6001c" />
      <text
        x="16"
        y="21"
        textAnchor="middle"
        fill="#ffffff"
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
  const [importUrl, setImportUrl] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [copyDone, setCopyDone] = useState(false);

  const [page, setPage] = useState(0);
  const [items, setItems] = useState<VacancyItem[]>([]);
  const [found, setFound] = useState<number | null>(null);
  const [pages, setPages] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

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
  const initializedFromUrlRef = useRef(false);
  const initialUrlHadAppFiltersRef = useRef(false);
  const copyResetTimerRef = useRef<number | null>(null);

  const [urlInitialized, setUrlInitialized] = useState(false);
  const [prefsHydrated, setPrefsHydrated] = useState(false);
  const [savePrefsBusy, setSavePrefsBusy] = useState(false);
  const [savePrefsError, setSavePrefsError] = useState<string | null>(null);
  const [restorePrefsBusy, setRestorePrefsBusy] = useState(false);

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

  const countriesEn = useMemo(() => {
    if (!areasBundle?.otherRegions?.areas) return [];
    return [...areasBundle.otherRegions.areas]
      .filter((c) => c.id !== "1001")
      .map((c) => ({ id: c.id, nameEn: countryNameRuToEn(c.name) }))
      .sort((a, b) => a.nameEn.localeCompare(b.nameEn, "en"));
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
          if (next.has("1001")) next.delete("1001");
          else next.add("1001");
          return next;
        });
        return;
      }
      togglePreset(key);
    },
    [togglePreset, toggleRussiaChip],
  );

  const chipPresetActive = useCallback(
    (key: PresetChipKey) => {
      if (key === "russia") return russiaPresetActive();
      if (key === "otherRegions") return selectedAreaIds.has("1001");
      return presetActive(key);
    },
    [presetActive, russiaPresetActive, selectedAreaIds],
  );

  const chipPresetPartial = useCallback(
    (key: PresetChipKey) => {
      if (key === "russia") return russiaPresetPartial();
      if (key === "otherRegions") return false;
      return presetPartial(key);
    },
    [presetPartial, russiaPresetPartial],
  );

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

  const runSearch = useCallback(async (nextPage: number, append: boolean, overrides?: Partial<SearchSnapshot>) => {
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
        perPage: 20,
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
      setItems((prev) => (append ? [...prev, ...nextItems] : nextItems));
    } catch (e) {
      if (reqId === searchRequestIdRef.current) {
        setSearchError(e instanceof Error ? e.message : "Ошибка поиска");
      }
    } finally {
      if (reqId === searchRequestIdRef.current) {
        setSearching(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!dicts || !areasBundle) return;
    if (!urlInitialized || !prefsHydrated) return;
    if (
      !initializedFromUrlRef.current &&
      urlSearchParamsHasVacancyAppFilter(new URLSearchParams(window.location.search))
    )
      return;
    void runSearch(0, false);
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
    queueMicrotask(() => void runSearch(0, false, emptyOverride));
  }, [runSearch]);

  const savePreferences = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
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
    } catch (e) {
      setSavePrefsError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavePrefsBusy(false);
    }
  }, []);

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
      queueMicrotask(() => void runSearch(0, false, overrideSnapshot));
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
      queueMicrotask(() => void runSearch(0, false, overrideSnapshot));
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
  }, [dicts, areasBundle, russiaListOpen]);

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

  return (
    <div className="layout">
      <section className="panel filters">
        <div className="filters-panel-top-actions">
          <button type="button" className="filters-panel-mini-btn" onClick={clearFilters}>
            Clear Filters
          </button>
          {isSupabaseConfigured() ? (
            <button
              type="button"
              className="filters-panel-mini-btn"
              disabled={restorePrefsBusy}
              title="Replaces all filters with your saved search preferences (what you last saved with Save preferences)."
              onClick={() => void restorePreferences()}
            >
              {restorePrefsBusy ? "…" : "Load preferences"}
            </button>
          ) : null}
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
                  queueMicrotask(() => void runSearch(0, false, { text: v }));
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
                    queueMicrotask(() => void runSearch(0, false, { excludedText: v }));
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
                  queueMicrotask(() => void runSearch(0, false, { salaryAmount: canonical }));
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

          <fieldset className="field">
            <legend>Countries and regions</legend>
            <div className="chips">
              {PRESET_CHIP_ORDER.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`chip ${chipPresetActive(key) ? "chip--on" : ""} ${chipPresetPartial(key) ? "chip--partial" : ""}`}
                  onClick={() => togglePresetChip(key)}
                >
                  {key === "russia"
                    ? "Russia"
                    : key === "otherRegions"
                      ? "Other regions"
                      : PRESET_LABELS[key]}
                </button>
              ))}
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
              <>
                <button
                  type="button"
                  className="secondary filters-actions-bar__btn filters-actions-bar__save-col"
                  disabled={savePrefsBusy}
                  onClick={() => void savePreferences()}
                >
                  <span className="filters-actions-bar__btn-icon" aria-hidden>
                    <FiltersBarIconSave />
                  </span>
                  <span>{savePrefsBusy ? "Saving…" : "Save preferences"}</span>
                </button>
              </>
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
            aria-label="Import from HH"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Import from HH</h2>
            <label>
              <span>HH URL</span>
              <textarea
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="https://hh.ru/search/vacancy?..."
                rows={3}
                autoFocus
              />
            </label>
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

      <section className="panel results">
        {found != null ? (
          <p className="muted small">
            Найдено: {found}
            {pages != null ? ` · страниц: ${pages}` : ""}
          </p>
        ) : (
          <p className="muted small">
            {searching
              ? "Updating…"
              : "Filters run automatically. Text and exclude fields apply when the field loses focus."}
          </p>
        )}
        <ul className="vacancy-list">
          {items.map((it) => (
            <li key={it.id}>
              <VacancyCard item={it} />
            </li>
          ))}
        </ul>
        {pages != null && page + 1 < pages ? (
          <button
            type="button"
            className="secondary"
            disabled={searching}
            onClick={() => runSearch(page + 1, true)}
          >
            Загрузить ещё
          </button>
        ) : null}
      </section>
    </div>
  );
}
