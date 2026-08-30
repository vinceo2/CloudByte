FROM python:3.12-slim

WORKDIR /app

COPY apps/indexing-worker/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/indexing-worker/src ./src

CMD ["python", "-m", "src.main"]
