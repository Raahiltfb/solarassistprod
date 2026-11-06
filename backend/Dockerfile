FROM python:3.9-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

# Set work directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application code
COPY . /app/

# Expose port
EXPOSE 8000

# Container healthcheck for orchestrators (targets liveness probe to avoid restarting on external OEM hiccups)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/api/health/live || exit 1

# Start command with graceful shutdown timeout (30s)
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-graceful-shutdown", "30"]
