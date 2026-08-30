FROM python:3.12-slim

WORKDIR /app

COPY apps/mcp-server/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/mcp-server/src ./src

CMD ["python", "-m", "src.server"]
