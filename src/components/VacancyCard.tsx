function stripHighlight(html: string | null | undefined): string {
  if (!html) return "";
  return html.replace(/<highlighttext>/gi, "").replace(/<\/highlighttext>/gi, "");
}

function oneLine(text: string, maxLen = 220): string {
  const t = stripHighlight(text).replace(/\s+/g, " ").trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

export type VacancyItem = {
  id: string;
  name: string;
  alternate_url: string;
  area?: { name?: string };
  employer?: { name?: string };
  salary?: { from?: number; to?: number; currency?: string; gross?: boolean } | null;
  snippet?: { requirement?: string; responsibility?: string };
};

type VacancyCardProps = {
  item: VacancyItem;
  /** Move to the Hidden section and persist vacancy id when Supabase is configured. */
  onHide?: () => void;
  /** Restore from the hidden section to the main list. */
  onUnhide?: () => void;
  sessionHidden?: boolean;
};

export function VacancyCard({ item, onHide, onUnhide, sessionHidden }: VacancyCardProps) {
  const salary = item.salary;
  let salaryLine = "";
  if (salary && (salary.from != null || salary.to != null)) {
    const from = salary.from != null ? salary.from : "";
    const to = salary.to != null ? salary.to : "";
    const cur = salary.currency ?? "";
    salaryLine = `${from}${from !== "" && to !== "" ? " — " : ""}${to} ${cur}`.trim();
  }

  const req = item.snippet?.requirement ?? "";
  const resp = item.snippet?.responsibility ?? "";
  const preview = oneLine([req, resp].filter(Boolean).join(" · "));

  return (
    <article className={`vacancy-card${sessionHidden ? " vacancy-card--session-hidden" : ""}`}>
      <header className="vacancy-card__header">
        <h2 className="vacancy-card__title">{item.name}</h2>
        {onHide ? (
          <button
            type="button"
            className="vacancy-card__session-toggle"
            aria-label={`Hide “${item.name}”`}
            title="Hide"
            onClick={onHide}
          >
            ×
          </button>
        ) : null}
        {onUnhide ? (
          <button
            type="button"
            className="vacancy-card__session-toggle vacancy-card__session-toggle--restore"
            aria-label={`Restore “${item.name}” to list`}
            title="Restore to main list"
            onClick={onUnhide}
          >
            Restore
          </button>
        ) : null}
      </header>
      <div className="vacancy-card__meta">
        {item.employer?.name ? <span>{item.employer.name}</span> : null}
        {item.area?.name ? <span>{item.area.name}</span> : null}
        {salaryLine ? <span>{salaryLine}</span> : null}
      </div>
      {preview ? <p className="vacancy-card__preview">{preview}</p> : null}
      <p className="vacancy-card__actions">
        <a
          className="vacancy-card__open"
          href={item.alternate_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Открыть на hh.ru
        </a>
      </p>
    </article>
  );
}
