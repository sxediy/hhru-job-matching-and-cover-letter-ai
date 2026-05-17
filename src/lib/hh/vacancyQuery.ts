import { buildShardVacancySearchParams } from "./shardVacancySearch";
import type { VacancySearchPayload } from "./vacancySearchTypes";

/** Собирает query для поиска вакансий (hh.ru shard; web-style param names). */
export function buildVacancySearchParams(payload: VacancySearchPayload): URLSearchParams {
  return buildShardVacancySearchParams(payload);
}
