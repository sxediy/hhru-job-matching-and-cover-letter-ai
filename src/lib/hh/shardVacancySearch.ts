import type { VacancyItem } from "@/components/VacancyCard";
import { appendVacancySearchFiltersToParams } from "./vacancyHhApiSearchParams";
import type { VacancySearchPayload } from "./vacancySearchTypes";

const SHARD_VACANCY_SEARCH_PATH = "/shards/vacancy/search";

export type HhVacancySearchListResponse = {
  items: VacancyItem[];
  found: number;
  pages: number;
  page: number;
  per_page: number;
};

type ShardCompensation = {
  noCompensation?: Record<string, never>;
  from?: number;
  to?: number;
  currencyCode?: string;
  gross?: boolean;
};

type ShardVacancySnippet = {
  req?: string | null;
  resp?: string | null;
};

type ShardVacancy = {
  vacancyId: number | string;
  name: string;
  company?: { name?: string; visibleName?: string };
  area?: { name?: string };
  compensation?: ShardCompensation | null;
  links?: { desktop?: string };
  snippet?: ShardVacancySnippet | null;
};

type ShardPaging = {
  lastPage?: { page?: number };
};

type ShardVacancySearchResult = {
  vacancies?: ShardVacancy[];
  totalResults?: number;
  paging?: ShardPaging | null;
};

export type ShardSearchJson = {
  vacancySearchResult?: ShardVacancySearchResult;
};

/** Query for GET https://hh.ru/shards/vacancy/search (web-style param names). */
export function buildShardVacancySearchParams(payload: VacancySearchPayload): URLSearchParams {
  const p = new URLSearchParams();
  const { page, perPage, ...filters } = payload;
  appendVacancySearchFiltersToParams(p, filters, { currencyParam: "currency_code" });

  p.set("page", String(Math.max(0, page ?? 0)));
  p.set("per_page", String(Math.min(100, Math.max(1, perPage ?? 50))));
  p.set("enable_snippets", "false");

  return p;
}

export function shardVacancySearchPath(params: URLSearchParams): string {
  const qs = params.toString();
  return qs ? `${SHARD_VACANCY_SEARCH_PATH}?${qs}` : SHARD_VACANCY_SEARCH_PATH;
}

function mapShardCompensation(
  compensation: ShardCompensation | null | undefined,
): VacancyItem["salary"] {
  if (!compensation || compensation.noCompensation) return null;
  const { from, to, currencyCode, gross } = compensation;
  if (from == null && to == null) return null;
  return {
    from,
    to,
    currency: currencyCode,
    gross,
  };
}

export function shardVacancyToVacancyItem(v: ShardVacancy): VacancyItem {
  const id = String(v.vacancyId);
  return {
    id,
    name: v.name,
    alternate_url: v.links?.desktop ?? `https://hh.ru/vacancy/${id}`,
    employer: v.company
      ? { name: v.company.name ?? v.company.visibleName }
      : undefined,
    area: v.area?.name ? { name: v.area.name } : undefined,
    salary: mapShardCompensation(v.compensation),
    snippet: v.snippet
      ? {
          requirement: v.snippet.req ?? undefined,
          responsibility: v.snippet.resp ?? undefined,
        }
      : undefined,
  };
}

function shardPageCount(
  totalResults: number,
  perPage: number,
  paging: ShardPaging | null | undefined,
): number {
  if (totalResults <= 0) return 0;
  const lastPage = paging?.lastPage?.page;
  if (typeof lastPage === "number" && lastPage >= 0) return lastPage + 1;
  return Math.max(1, Math.ceil(totalResults / perPage));
}

/** Map shard JSON to the list shape expected by SearchPage (Open API–compatible). */
export function adaptShardVacancySearchResponse(
  body: ShardSearchJson,
  page: number,
  perPage: number,
): HhVacancySearchListResponse {
  const result = body.vacancySearchResult;
  const vacancies = result?.vacancies ?? [];
  const found = typeof result?.totalResults === "number" ? result.totalResults : 0;
  const pages = shardPageCount(found, perPage, result?.paging);

  return {
    items: vacancies.map(shardVacancyToVacancyItem),
    found,
    pages,
    page,
    per_page: perPage,
  };
}
