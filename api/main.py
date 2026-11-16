"""API PLACEHOLDER do AccessFlow.

Serve para provar o pipeline DevSecOps de ponta a ponta enquanto o time
termina a API real. Para trocar: mantenha /health, /metrics e o middleware de
metricas, e substitua o resto pelo codigo do time.
"""
import time
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import FastAPI, HTTPException, Request, Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest
from pydantic import BaseModel, Field

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


Trecho = Literal["calcada", "vaga", "rampa", "entrada", "recepcao", "corredor", "banheiro", "elevador"]


class OcorrenciaIn(BaseModel):
    local: str = Field(min_length=1, max_length=80)
    descricao: str = Field(min_length=1, max_length=400)
    origem: Literal["manual", "visao", "robo"] = "manual"
    endereco: str | None = Field(default=None, max_length=160)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    gravidade: Literal["baixa", "media", "alta"] = "media"
    trecho: Trecho = "entrada"


def _registrar(o: OcorrenciaIn, status: str = "pendente") -> dict:
    oid = str(uuid.uuid4())
    OCORRENCIAS[oid] = {
        "id": oid,
        **o.model_dump(),
        "status": status,
        "criada_em": datetime.now(timezone.utc).isoformat(),
    }
    return OCORRENCIAS[oid]


# Dados FICTICIOS de demonstracao: unidades e enderecos inventados, sem dado pessoal.
_DEMO = [
    ("UBS Vila Aurora", "Rua das Acacias, 120 - Sao Paulo, SP", -23.5712, -46.6405, "rampa", "alta", "robo",
     "Carrinho de limpeza parado no meio da rampa de acesso", "pendente"),
    ("UBS Vila Aurora", "Rua das Acacias, 120 - Sao Paulo, SP", -23.5712, -46.6405, "corredor", "media", "visao",
     "Cadeiras empilhadas estreitando o corredor", "pendente"),
    ("UBS Vila Aurora", "Rua das Acacias, 120 - Sao Paulo, SP", -23.5712, -46.6405, "vaga", "media", "manual",
     "Moto estacionada na vaga acessivel", "resolvida"),
    ("Clinica Horizonte", "Av. Beira Rio, 455 - Recife, PE", -8.0578, -34.8829, "elevador", "alta", "manual",
     "Elevador fora de operacao e sem sinalizacao", "pendente"),
    ("Centro de Saude Ribeira", "Rua do Porto, 88 - Manaus, AM", -3.1190, -60.0217, "calcada", "media", "visao",
     "Piso tatil interrompido por tapume de obra", "pendente"),
    ("Policlinica Lago Sul", "Quadra 12, Bloco B - Brasilia, DF", -15.7975, -47.8919, "banheiro", "baixa", "manual",
     "Porta do banheiro acessivel nao trava", "resolvida"),
]
for _l, _e, _la, _ln, _t, _g, _o, _d, _s in _DEMO:
    _registrar(OcorrenciaIn(local=_l, endereco=_e, lat=_la, lng=_ln, trecho=_t, gravidade=_g, origem=_o, descricao=_d), _s)


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
    return _registrar(o)


@app.get("/ocorrencias")
def listar():
    return list(OCORRENCIAS.values())


@app.patch("/ocorrencias/{oid}/resolver")
def resolver(oid: str):
    if oid not in OCORRENCIAS:
        raise HTTPException(404, "Ocorrencia nao encontrada")
    OCORRENCIAS[oid]["status"] = "resolvida"
    OCORRENCIAS[oid]["resolvida_em"] = datetime.now(timezone.utc).isoformat()
    return OCORRENCIAS[oid]


@app.get("/erro-teste")
def erro_teste():
    """Gera um 500 de proposito para provar o alerta de taxa de erros."""
    raise HTTPException(500, "erro de teste")
