/** Engine output text: the backend emits {code, params}; the UI translates it with the "engine" namespace. */
export type MsgParam = string | number | Message | (string | Message)[];
export interface Message {
  code: string;
  params: Record<string, MsgParam>;
}

export function isMessage(x: unknown): x is Message {
  return typeof x === "object" && x !== null && typeof (x as Message).code === "string" && "params" in x;
}

type Translate = (key: string, options: Record<string, unknown>) => string;

/** Pure renderer (unit-tested): params that are messages or lists are rendered recursively first. */
export function renderMessage(m: Message | null | undefined, translate: Translate): string {
  if (!m) return "";
  const params: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(m.params ?? {})) {
    params[k] = Array.isArray(v)
      ? v.map((x) => (isMessage(x) ? renderMessage(x, translate) : String(x))).join(", ")
      : isMessage(v)
        ? renderMessage(v, translate)
        : typeof v === "number"
          ? v // keep numbers numeric: i18next only selects plural forms (_one/_other) for a numeric `count`
          : String(v);
  }
  return translate(m.code, { ...params, defaultValue: m.code });
}
