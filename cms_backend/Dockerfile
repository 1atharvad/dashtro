FROM python:3.12-slim

WORKDIR /app

# Node renders RichText wrapper components to static HTML server-side (see
# react_render/) — the Python process itself has no JS runtime.
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Full copy (not just package.json) since the build needs render.ts too;
# devDependencies are pruned after so the runtime image doesn't carry them.
COPY react_render/ react_render/
RUN cd react_render && npm install && npm run build && npm prune --omit=dev

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
