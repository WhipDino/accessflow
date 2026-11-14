"""API PLACEHOLDER do AccessFlow.

Serve para provar o pipeline DevSecOps de ponta a ponta enquanto o time
termina a API real. Para trocar: mantenha /health, /metrics e o middleware de
metricas, e substitua o resto pelo codigo do time.
"""
import time
import uuid
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Request, Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest
from pydantic import BaseModel

app = FastAPI(title="AccessFlow API", version="0.1.0")

# 4 metricas de ouro: latencia, trafego, erros e saturacao
REQUESTS = Counter("http_requests_total", "Total de requisicoes", ["method", "path", "status"])
LATENCY = Histogram(
    "http_request_duration_seconds",
    "Latencia das requisicoes",
    ["method", "path"],
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5),
)
IN_PROGRESS = Gauge("http_requests_in_progress", "Requisicoes em andamento (saturacao)")

# Armazenamento em memoria: placeholder. O time troca por banco real.
OCORRENCIAS: dict[str, dict] = {}


class OcorrenciaIn(BaseModel):
    local: str
    descricao: str
    origem: str = "manual"  # manual | visao | robo


@app.middleware("http")
async def metricas(request: Request, call_next):
    IN_PROGRESS.inc()
    inicio = time.perf_counter()
    status = 500
    try:
        resp = await call_next(request)
        status = resp.status_code
        return resp
    finally:
        # o template da rota (ex.: /ocorrencias/{oid}/resolver) so existe depois do roteamento;
        # usar a URL crua criaria um label por UUID (cardinalidade explosiva)
        route = request.scope.get("route")
        path = route.path if route else "nao_roteado"
        IN_PROGRESS.dec()
        LATENCY.labels(request.method, path).observe(time.perf_counter() - inicio)
        REQUESTS.labels(request.method, path, str(status)).inc()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/metrics")
def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.post("/ocorrencias", status_code=201)
def criar(o: OcorrenciaIn):
    oid = str(uuid.uuid4())
    OCORRENCIAS[oid] = {
        "id": oid,
        **o.model_dump(),
        "status": "pendente",
        "criada_em": datetime.now(timezone.utc).isoformat(),
    }
    return OCORRENCIAS[oid]


@app.get("/ocorrencias")
def listar():
    return list(OCORRENCIAS.values())


@app.patch("/ocorrencias/{oid}/resolver")
def resolver(oid: str):
    if oid not in OCORRENCIAS:
        raise HTTPException(404, "Ocorrencia nao encontrada")
    OCORRENCIAS[oid]["status"] = "resolvida"
    return OCORRENCIAS[oid]


@app.get("/erro-teste")
def erro_teste():
    """Gera um 500 de proposito para provar o alerta de taxa de erros."""
    raise HTTPException(500, "erro de teste")
