"""Live evaluation of the structured AI analyst against a real Ollama.

usage: uv run python scripts/ai_eval.py --models qwen2.5:7b llama3.1 [--base http://localhost:11434]
Writes a Markdown table to stdout (and to --out if given). No cache: every run hits the model.
"""

from __future__ import annotations

import argparse
import asyncio
import time
from pathlib import Path
from typing import Any

from app.ai.service import AiService
from app.core.config import Settings
from app.engine.simulate import run_simulation
from app.schemas.simulation import ScenarioId
from app.seed.northwind import northwind_snapshot


class NoCache:
    s: Any = None

    async def get(self, key: str) -> None:
        return None

    async def put(self, entry: Any) -> None:
        return None


class _NoCommit:
    async def commit(self) -> None:
        return None


async def one(model: str, base: str, scenario: ScenarioId, lang: str) -> dict[str, Any]:
    settings = Settings(
        ai_provider="ollama", ai_model=model, ai_base_url=base, ai_timeout_seconds=240, ai_max_retries=1
    )
    cache = NoCache()
    cache.s = _NoCommit()
    svc = AiService(settings, cache)  # type: ignore[arg-type]
    result = run_simulation(northwind_snapshot(), "northwind", 1, scenario)
    t0 = time.perf_counter()
    done: dict[str, Any] = {}
    resets: list[str] = []
    text = ""
    async for ev in svc.explain(result, None, lang):
        if ev["type"] == "done":
            done = ev
        elif ev["type"] == "reset":
            resets.append(str(ev.get("reason", "")))
        elif ev["type"] == "delta":
            text += ev["text"]
    return {
        "model": model,
        "scenario": scenario.value,
        "lang": lang,
        "secs": time.perf_counter() - t0,
        "done": done,
        "resets": resets,
        "text": text,
    }


def fmt(r: dict[str, Any]) -> str:
    return (
        _fmt(r)
        .replace("|vuln", r"\|vuln")
        .replace("|restrict", r"\|restrict")
        .replace("|apply", r"\|apply")
        .replace("|enforce", r"\|enforce")
    )


def _fmt(r: dict[str, Any]) -> str:
    d = r["done"]
    mode = d.get("mode", "?")
    if mode != "llm":
        return (
            f"| {r['model']} | {r['scenario']} | {r['lang']} | **fallback** ({'; '.join(r['resets'])[:60]}) "
            f"| – | – | – | – | – | – | – | – | {r['secs']:.0f}s |"
        )
    cit = ", ".join(f"{c['step_id'] or '?'}@{c['cited_under']}" for c in d["citation_violations"]) or "0"
    return (
        f"| {r['model']} | {r['scenario']} | {r['lang']} | llm | {', '.join(d['numeric_violations']) or '0'} | {cit} "
        f"| {', '.join(d['unknown_placeholders']) or '0'} | {', '.join(d['order_violations']) or '0'} "
        f"| {', '.join(d['missing_sections']) or '0'}{' / unverified: ' + ', '.join(d['unverified']) if d['unverified'] else ''} "
        f"| {', '.join(d['unplaced_numbers']) or '0'} "
        f"| {', '.join(f'{v["step_id"]}: {v["claimed"]}≠{v["engine"]}' for v in d['technique_violations']) or '0'} "
        f"| {', '.join(d['duplicate_fixes']) or '0'} | {r['secs']:.0f}s |"
    )


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", nargs="+", default=["qwen2.5:7b"])
    ap.add_argument("--base", default="http://localhost:11434")
    ap.add_argument("--out")
    ap.add_argument("--samples", type=Path, help="write the rendered texts here")
    a = ap.parse_args()
    rows = []
    texts = []
    for model in a.models:
        for sc in ScenarioId:
            for lang in ("en", "tr") if sc == ScenarioId.sensitive_data_exposure else ("en",):
                r = await one(model, a.base, sc, lang)
                rows.append(fmt(r))
                texts.append(f"### {model} · {sc.value} · {lang}\n\n{r['text']}\n")
                print(rows[-1], flush=True)
    head = (
        "| model | scenario | lang | mode | stray numbers | wrong-path citations | unknown placeholders "
        "| order | missing sections / unverified ids | unplaced numbers | technique mismatch | duplicate fixes | time |"
        "\n|---|---|---|---|---|---|---|---|---|---|---|---|---|"
    )
    table = head + "\n" + "\n".join(rows)
    if a.out:
        Path(a.out).write_text(table + "\n", encoding="utf-8")
    if a.samples:
        a.samples.write_text("\n".join(texts), encoding="utf-8")


if __name__ == "__main__":
    asyncio.run(main())
