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

export function VacancyCard({ item }: { item: VacancyItem }) {
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
    <article className="vacancy-card">
      <h2 className="vacancy-card__title">{item.name}</h2>
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
