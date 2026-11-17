FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.11.13 /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONUNBUFFERED=1
ARG EXTRAS=""
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project ${EXTRAS:+--extra $EXTRAS}
COPY . .
RUN uv sync --frozen --no-dev ${EXTRAS:+--extra $EXTRAS}
ENV DATABASE_URL=sqlite+aiosqlite:////data/cybertwin.db
VOLUME ["/data"]
EXPOSE 8000
CMD ["uv", "run", "--no-sync", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
