"use client";

import areaPresetIds from "@/data/area-preset-ids.json";
import type { HhAreaNode } from "@/lib/areas/flatten";
import { MultiSelectChips } from "@/components/MultiSelectChips";
import { parseSalaryAmount, SalaryCurrencyInput } from "@/components/SalaryCurrencyInput";
import { VacancyCard, type VacancyItem } from "@/components/VacancyCard";
import { countryNameRuToEn } from "@/lib/hh/countryNameEn";
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
type PresetChipKey = PresetJsonKey | "russia";

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
];

const VACANCY_LABEL_IDS = [
  "not_from_agency",
  "accept_handicapped",
  "with_address",
  "low_performance",
  "accredited_it",
] as const;

/** hh.ru vacancy `label` ids (subset) → English UI text */
const VACANCY_LABELS_EN: Record<(typeof VACANCY_LABEL_IDS)[number], string> = {
  not_from_agency: "Not from agencies",
  accept_handicapped: "Accessible for people with disabilities",
  with_address: "With workplace address",
  low_performance: "Under 10 responses",
  accredited_it: "Accredited IT company",
};

const DEFAULT_SEARCH_FIELDS = ["name", "company_name", "description"] as const;

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

/** Country-root area ids (e.g. Caucasus preset) often missing from flat «other regions» list */
const PRESET_ROOT_AREA_LABEL_EN: Record<string, string> = {
  "9": "Azerbaijan",
  "28": "Georgia",
  "13": "Armenia",
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

type ParsedFilters = {
  text: string;
  excludedText: string;
  searchFields: string[];
  areaIds: Set<string>;
  employmentForm: Set<string>;
  experience: Set<string>;
  workFormat: Set<string>;
  labels: Set<string>;
  withStatedSalary: boolean;
  salaryAmount: string;
  currency_code: string;
};

function toSortedUnique(values: Iterable<string>): string[] {
  return [...new Set([...values].filter(Boolean))].sort((a, b) => a.localeCompare(b, "en"));
}

function parseFiltersFromParams(
  params: URLSearchParams,
  allowedEmploymentForm: Set<string>,
  allowedWorkFormat: Set<string>,
  allowedExperience: Set<string>,
): ParsedFilters {
  const allSearchFields = toSortedUnique(params.getAll("search_field"));
  const searchFields =
    allSearchFields.length === 0
      ? [...DEFAULT_SEARCH_FIELDS]
      : allSearchFields.filter((f) => DEFAULT_SEARCH_FIELDS.includes(f as (typeof DEFAULT_SEARCH_FIELDS)[number]));
  const effectiveSearchFields = searchFields.length > 0 ? searchFields : [...DEFAULT_SEARCH_FIELDS];

  const labelValues = params.getAll("label");
  const withStatedSalary = labelValues.includes("with_salary");
  const labels = new Set(
    labelValues.filter((id) => (VACANCY_LABEL_IDS as readonly string[]).includes(id)),
  );

  const normalizedExperience = new Set(
    toSortedUnique(params.getAll("experience")).filter((id) => allowedExperience.has(id)),
  );

  const salaryRaw = params.get("salary")?.trim() ?? "";
  const salaryNum = Number(salaryRaw);
  const salaryAmount =
    salaryRaw !== "" && Number.isFinite(salaryNum) && salaryNum > 0 ? String(Math.trunc(salaryNum)) : "";

  return {
    text: params.get("text")?.trim() ?? "",
    excludedText: params.get("excluded_text")?.trim() ?? "",
    searchFields: effectiveSearchFields,
    areaIds: new Set(toSortedUnique(params.getAll("area"))),
    employmentForm: new Set(
      toSortedUnique(params.getAll("employment_form")).filter((id) => allowedEmploymentForm.has(id)),
    ),
    experience: normalizedExperience,
    workFormat: new Set(
      toSortedUnique(params.getAll("work_format")).filter((id) => allowedWorkFormat.has(id)),
    ),
    labels,
    withStatedSalary,
    salaryAmount,
    currency_code: params.get("currency_code")?.trim().toUpperCase() ?? "",
  };
}

function buildParamsFromSnapshot(snapshot: SearchSnapshot): URLSearchParams {
  const params = new URLSearchParams();
  if (snapshot.text.trim()) params.set("text", snapshot.text.trim());
  if (snapshot.excludedText.trim()) params.set("excluded_text", snapshot.excludedText.trim());

  const allDefault =
    snapshot.searchFields.length === 3 &&
    DEFAULT_SEARCH_FIELDS.every((f) => snapshot.searchFields.includes(f));
  if (!allDefault) {
    for (const field of toSortedUnique(snapshot.searchFields)) {
      params.append("search_field", field);
    }
  }

  for (const areaId of toSortedUnique(snapshot.selectedAreaIds)) params.append("area", areaId);
  for (const id of toSortedUnique(snapshot.employmentForm)) params.append("employment_form", id);
  for (const id of toSortedUnique(snapshot.experience)) params.append("experience", id);
  for (const id of toSortedUnique(snapshot.workFormat)) params.append("work_format", id);
  for (const id of toSortedUnique(snapshot.labels)) params.append("label", id);
  if (snapshot.withStatedSalary) params.append("label", "with_salary");

  if (snapshot.salaryAmount && snapshot.currencyResolved) {
    params.set("salary", snapshot.salaryAmount);
    params.set("currency_code", snapshot.currencyResolved);
  }
  return params;
}

export function SearchPage() {
  const [dicts, setDicts] = useState<Dictionaries | null>(null);
  const [areasBundle, setAreasBundle] = useState<AreasBundle | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [excludedText, setExcludedText] = useState("");
  const [sfName, setSfName] = useState(true);
  const [sfCompany, setSfCompany] = useState(true);
  const [sfDesc, setSfDesc] = useState(true);

  const [selectedAreaIds, setSelectedAreaIds] = useState<Set<string>>(new Set());
  const [russiaAll, setRussiaAll] = useState(false);
  const [russiaChipOn, setRussiaChipOn] = useState(false);
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
    searchFields: [...DEFAULT_SEARCH_FIELDS],
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
  const copyResetTimerRef = useRef<number | null>(null);

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
      .map((c) => ({ id: c.id, nameEn: countryNameRuToEn(c.name) }))
      .sort((a, b) => a.nameEn.localeCompare(b.nameEn, "en"));
  }, [areasBundle]);

  const ruSubjects = useMemo(() => {
    if (!areasBundle?.russia?.areas) return [];
    return [...areasBundle.russia.areas].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [areasBundle]);

  const ruSubjectIds = useMemo(() => new Set(ruSubjects.map((r) => r.id)), [ruSubjects]);

  const areaIdToLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of countriesEn) m.set(c.id, c.nameEn);
    for (const r of ruSubjects) m.set(r.id, r.name);
    m.set("113", "All Russia");
    for (const [id, label] of Object.entries(PRESET_ROOT_AREA_LABEL_EN)) {
      m.set(id, label);
    }
    return m;
  }, [countriesEn, ruSubjects]);

  const selectedRegionsSummary = useMemo(() => {
    const labels = [...selectedAreaIds].map((id) => areaIdToLabel.get(id) ?? id);
    return { count: labels.length, labels };
  }, [selectedAreaIds, areaIdToLabel]);

  const searchFields = useMemo(() => {
    const next: string[] = [];
    if (sfName) next.push("name");
    if (sfCompany) next.push("company_name");
    if (sfDesc) next.push("description");
    if (next.length === 0) return [...DEFAULT_SEARCH_FIELDS];
    return next;
  }, [sfName, sfCompany, sfDesc]);

  useEffect(() => {
    if (sfName || sfCompany || sfDesc) return;
    setSfName(true);
    setSfCompany(true);
    setSfDesc(true);
  }, [sfName, sfCompany, sfDesc]);

  const togglePreset = useCallback((key: keyof typeof areaPresetIds) => {
    const ids = areaPresetIds[key];
    let dropAllRussia = false;
    setSelectedAreaIds((prev) => {
      const next = new Set(prev);
      const allOn = ids.every((id) => next.has(id));
      if (allOn) for (const id of ids) next.delete(id);
      else {
        for (const id of ids) next.add(id);
        if (prev.has("113")) {
          next.delete("113");
          dropAllRussia = true;
        }
      }
      return next;
    });
    if (dropAllRussia) setRussiaAll(false);
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

  const toggleRussiaChip = useCallback(() => {
    setRussiaChipOn((wasOn) => {
      if (wasOn) {
        setSelectedAreaIds((prev) => {
          const next = new Set(prev);
          next.delete("113");
          for (const r of ruSubjects) next.delete(r.id);
          return next;
        });
        setRussiaAll(false);
      } else {
        setRussiaAll(true);
      }
      return !wasOn;
    });
  }, [ruSubjects]);

  const togglePresetChip = useCallback(
    (key: PresetChipKey) => {
      if (key === "russia") {
        toggleRussiaChip();
        return;
      }
      togglePreset(key);
    },
    [togglePreset, toggleRussiaChip],
  );

  const chipPresetActive = useCallback(
    (key: PresetChipKey) => {
      if (key === "russia") return russiaChipOn;
      return presetActive(key);
    },
    [presetActive, russiaChipOn],
  );

  const chipPresetPartial = useCallback(
    (key: PresetChipKey) => {
      if (key === "russia") return false;
      return presetPartial(key);
    },
    [presetPartial],
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
        if (id !== "113") {
          if (prev.has("113")) {
            next.delete("113");
            clearRussiaAll = true;
          } else if (ruSubjectIds.has(id)) {
            clearRussiaAll = true;
          }
        }
        return next;
      });
      if (clearRussiaAll) setRussiaAll(false);
    },
    [ruSubjectIds],
  );

  /** Apply 113 + drop RU subjects. Used from the checkbox so re-check works even when `setRussiaAll(true)` bails out (russiaAll already true). */
  const applyAllRussiaSelection = useCallback(() => {
    setSelectedAreaIds((prev) => {
      const next = new Set(prev);
      for (const r of ruSubjects) next.delete(r.id);
      next.add("113");
      return next;
    });
    setRussiaAll(true);
  }, [ruSubjects]);

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
          s.searchFields.length === 3 &&
          DEFAULT_SEARCH_FIELDS.every((f) => s.searchFields.includes(f))
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
    if (!initializedFromUrlRef.current && window.location.search) return;
    void runSearch(0, false);
  }, [
    dicts,
    areasBundle,
    sfName,
    sfCompany,
    sfDesc,
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
    const hadInitialQuery = initialParams.toString().length > 0;
    const parsed = parseFiltersFromParams(
      initialParams,
      allowedEmploymentForm,
      allowedWorkFormat,
      allowedExperience,
    );
    initializedFromUrlRef.current = true;
    setText(parsed.text);
    setExcludedText(parsed.excludedText);
    setSfName(parsed.searchFields.includes("name"));
    setSfCompany(parsed.searchFields.includes("company_name"));
    setSfDesc(parsed.searchFields.includes("description"));
    setSelectedAreaIds(parsed.areaIds);
    const hasRussiaScope =
      parsed.areaIds.has("113") || [...parsed.areaIds].some((id) => ruSubjectIds.has(id));
    setRussiaChipOn(hasRussiaScope);
    setRussiaAll(parsed.areaIds.has("113"));
    setEmploymentForm(parsed.employmentForm);
    setExperience(parsed.experience);
    setWorkFormat(parsed.workFormat);
    setLabels(parsed.labels);
    setWithStatedSalary(parsed.withStatedSalary);
    setSalaryAmount(parsed.salaryAmount);
    setCurrency(parsed.currency_code);
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
    if (hadInitialQuery) {
      queueMicrotask(() => void runSearch(0, false, overrideSnapshot));
    }
  }, [
    allowedEmploymentForm,
    allowedExperience,
    allowedWorkFormat,
    areasBundle,
    dicts,
    ruSubjectIds,
    runSearch,
  ]);

  useEffect(() => {
    if (!initializedFromUrlRef.current) return;
    const params = buildParamsFromSnapshot(snapshotRef.current);
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
    sfName,
    sfCompany,
    sfDesc,
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
    const params = buildParamsFromSnapshot(snapshotRef.current);
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

  const applyImportedUrl = useCallback(() => {
    const raw = importUrl.trim();
    if (!raw) {
      setImportError("Paste a HeadHunter URL");
      return;
    }
    try {
      const parsedUrl = new URL(raw);
      const parsed = parseFiltersFromParams(
        parsedUrl.searchParams,
        allowedEmploymentForm,
        allowedWorkFormat,
        allowedExperience,
      );
      setText(parsed.text);
      setExcludedText(parsed.excludedText);
      setSfName(parsed.searchFields.includes("name"));
      setSfCompany(parsed.searchFields.includes("company_name"));
      setSfDesc(parsed.searchFields.includes("description"));
      setSelectedAreaIds(parsed.areaIds);
      const hasRussiaScope =
        parsed.areaIds.has("113") || [...parsed.areaIds].some((id) => ruSubjectIds.has(id));
      setRussiaChipOn(hasRussiaScope);
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
    if (ruEl && russiaChipOn) cleanups.push(redirectWheelUnlessFieldsetFocused(ruEl));

    return () => {
      for (const c of cleanups) c();
    };
  }, [dicts, areasBundle, russiaChipOn]);

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
        <div className="filters-stack">
          <div className="field field--text-search-block">
            <label>
              <span>Text</span>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={(e) => {
                  const v = e.currentTarget.value;
                  queueMicrotask(() => void runSearch(0, false, { text: v }));
                }}
                placeholder="Keywords"
              />
            </label>
            <div className="search-fields-inline">
              <label>
                <input type="checkbox" checked={sfName} onChange={(e) => setSfName(e.target.checked)} /> name
              </label>
              <label>
                <input type="checkbox" checked={sfCompany} onChange={(e) => setSfCompany(e.target.checked)} /> company
              </label>
              <label>
                <input type="checkbox" checked={sfDesc} onChange={(e) => setSfDesc(e.target.checked)} /> description
              </label>
            </div>
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
                placeholder="Optional"
              />
            </div>
            <label className="check-row salary-stated-row">
              <input
                type="checkbox"
                checked={withStatedSalary}
                onChange={(e) => setWithStatedSalary(e.target.checked)}
              />{" "}
              Salary specified
            </label>
          </div>

          <fieldset className="field">
            <legend>Presets</legend>
            <div className="chips">
              {PRESET_CHIP_ORDER.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`chip ${chipPresetActive(key) ? "chip--on" : ""} ${chipPresetPartial(key) ? "chip--partial" : ""}`}
                  onClick={() => togglePresetChip(key)}
                >
                  {key === "russia" ? "Russia" : PRESET_LABELS[key]}
                </button>
              ))}
            </div>
          </fieldset>

          <div className={`regions-split${russiaChipOn ? " regions-split--with-russia" : ""}`}>
          <div className="regions-countries">
            <fieldset className="field">
              <legend>All country</legend>
              <input
                value={areaQuery}
                onChange={(e) => setAreaQuery(e.target.value)}
                placeholder="Search country…"
              />
              <div className="country-scroll" ref={countryScrollRef}>
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
            </fieldset>
          </div>
          {russiaChipOn ? (
            <div className="regions-russia">
              <fieldset className="field">
                <legend>Россия</legend>
                <label>
                  <input
                    type="checkbox"
                    checked={selectedAreaIds.has("113")}
                    onChange={(e) => {
                      if (e.target.checked) applyAllRussiaSelection();
                      else setRussiaAll(false);
                    }}
                  />{" "}
                  Вся Россия (113)
                </label>
                <div className="ru-scroll" ref={ruScrollRef}>
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
              </fieldset>
            </div>
          ) : null}
          </div>

          <p className="small muted filters-stack__presets-summary">
            {selectedRegionsSummary.count === 0 ? (
              <>Selected regions: All</>
            ) : (
              <>
                Selected regions: {selectedRegionsSummary.count}
                {selectedRegionsSummary.count <= 12
                  ? ` (${selectedRegionsSummary.labels.join(", ")})`
                  : ""}
              </>
            )}
          </p>

          <div className="filters-stack__job-fields">
            <MultiSelectChips
              label="Experience"
              options={experienceSelectOptions}
              selected={experience}
              onChange={setExperience}
              placeholder="Any experience"
              clearable
            />
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

          <div className="field">
          {VACANCY_LABEL_IDS.map((id) => (
            <label key={id} className="check-row">
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
              />{" "}
              {VACANCY_LABELS_EN[id]}
            </label>
          ))}
          </div>

          <div className="filters-actions-bar">
            <button type="button" className="secondary filters-actions-bar__btn" onClick={() => setIsImportOpen(true)}>
              Import from HeadHunter
            </button>
            <button type="button" className="secondary filters-actions-bar__btn" onClick={openInHeadHunter}>
              Open in HeadHunter
            </button>
            <button
              type="button"
              className="secondary filters-actions-bar__copy"
              aria-label="Copy search link"
              title={copyDone ? "Copied" : "Copy search link"}
              onClick={() => void copySearchLink()}
            >
              {copyDone ? "✓" : "🔗"}
            </button>
          </div>
        </div>

        <div className="filters-after">
          {searchError ? <p className="error">{searchError}</p> : null}
        </div>
      </section>
      {isImportOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsImportOpen(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Import from HeadHunter"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Import from HeadHunter</h2>
            <label>
              <span>HeadHunter URL</span>
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
