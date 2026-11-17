import { Fragment, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

/** Minimal, safe Markdown (no HTML injection): ## headings, lists, **bold**, `code`, _em_. */
export function Markdown({ text, unverified = [] }: { text: string; unverified?: string[] }) {
  const { t } = useTranslation();
  const flagged = new Set(unverified);
  const inline = (s: string, key: string): ReactNode[] => {
    const out: ReactNode[] = [];
    const re = /(\*\*[^*]+\*\*|`[^`]+`|(?<![\w])_[^_]+_(?![\w]))/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = re.exec(s))) {
      if (m.index > last) out.push(...flag(s.slice(last, m.index), `${key}t${i}`));
      const tok = m[0];
      if (tok.startsWith("**")) out.push(<strong key={`${key}b${i}`}>{tok.slice(2, -2)}</strong>);
      else if (tok.startsWith("`")) {
        const v = tok.slice(1, -1);
        out.push(
          <code
            key={`${key}c${i}`}
            className={`mono rounded px-1 ${flagged.has(v) ? "bg-critical/20 text-critical-ink underline decoration-wavy" : "bg-white/[0.06] text-primary"}`}
            title={flagged.has(v) ? t("ai.unverifiedHint") : undefined}
          >
            {v}
          </code>,
        );
      } else out.push(<em key={`${key}e${i}`}>{tok.slice(1, -1)}</em>);
      last = m.index + tok.length;
      i++;
    }
    if (last < s.length) out.push(...flag(s.slice(last), `${key}t${i}`));
    return out;
  };
  const flag = (s: string, key: string): ReactNode[] => {
    if (flagged.size === 0) return [s];
    const parts = s.split(new RegExp(`(${[...flagged].map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`));
    return parts.map((p, i) =>
      flagged.has(p) ? (
        <mark key={`${key}-${i}`} className="rounded bg-critical/20 px-0.5 text-critical-ink underline decoration-wavy"
          title={t("ai.unverifiedHint")} data-testid="unverified-mark">
          {p}
        </mark>
      ) : (
        <Fragment key={`${key}-${i}`}>{p}</Fragment>
      ),
    );
  };

  const blocks: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={`ul${blocks.length}`} className="my-1.5 ml-4 list-disc space-y-1 marker:text-primary">{list}</ul>);
    list = [];
  };
  text.split("\n").forEach((raw, idx) => {
    const line = raw.trimEnd();
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const major = h[1]!.length <= 2;
      blocks.push(
        major ? (
          <h3 key={idx} className="mt-4 mb-1 text-[14.5px] font-semibold text-ink first:mt-0">
            {inline(h[2]!, `h${idx}`)}
          </h3>
        ) : (
          <h4 key={idx} className="mt-3 mb-1 text-[13.5px] font-semibold text-ink first:mt-0">
            {inline(h[2]!, `h${idx}`)}
          </h4>
        ),
      );
    } else if (/^(\s*[-*]|\s*\d+\.)\s/.test(line)) {
      list.push(<li key={idx}>{inline(line.replace(/^\s*([-*]|\d+\.)\s+/, ""), `l${idx}`)}</li>);
    } else if (line.trim()) {
      flush();
      blocks.push(<p key={idx} className="my-1.5">{inline(line, `p${idx}`)}</p>);
    } else flush();
  });
  flush();
  return <div className="text-[13.5px] leading-relaxed text-ink">{blocks}</div>;
}
