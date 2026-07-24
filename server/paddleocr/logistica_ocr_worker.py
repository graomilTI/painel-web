#!/usr/bin/env python3
"""Worker local do PaddleOCR para a pré-conferência de O.S. da Grão 1000.

Fluxo:
1. Reserva atomicamente um job no Supabase;
2. baixa o PDF/imagem para diretório temporário;
3. executa PaddleOCR localmente, página por página;
4. identifica placa, carga/romaneio/ticket, peso e NF;
5. grava resultado/progresso no Supabase.
"""

from __future__ import annotations

import json
import logging
import math
import os
import re
import signal
import socket
import statistics
import sys
import tempfile
import time
import traceback
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Iterator, Sequence

import fitz  # PyMuPDF
import requests
from paddleocr import PaddleOCR

VERSION = "1.0.0"
LOGGER = logging.getLogger("grao1000.paddleocr")
STOP_REQUESTED = False

PLATE_RE = re.compile(r"\b[A-Z]{3}[\s.\-/]?[0-9][A-Z0-9][\s.\-/]?[0-9]{2}\b", re.IGNORECASE)
NUMBER_RE = re.compile(r"(?<![A-Z0-9])([0-9][0-9.\s]*(?:,[0-9]+)?)(?![A-Z0-9])", re.IGNORECASE)

HEADER_ALIASES: dict[str, tuple[str, ...]] = {
    "placa": ("placa", "veiculo", "veículo"),
    "carga": ("carga", "ticket", "romaneio", "laudo", "ordem", "controle"),
    "peso": ("peso", "liquido", "líquido", "quantidade", "qtd", "tonelada", "tons", "kg"),
    "nota_fiscal": ("nota fiscal", "nfe", "nf-e", "nf"),
}


@dataclass(slots=True)
class OcrItem:
    text: str
    score: float
    x1: float
    y1: float
    x2: float
    y2: float

    @property
    def cx(self) -> float:
        return (self.x1 + self.x2) / 2

    @property
    def cy(self) -> float:
        return (self.y1 + self.y2) / 2

    @property
    def height(self) -> float:
        return max(1.0, self.y2 - self.y1)


@dataclass(slots=True)
class OcrRow:
    items: list[OcrItem]

    @property
    def text(self) -> str:
        return " | ".join(item.text.strip() for item in sorted(self.items, key=lambda item: item.x1) if item.text.strip())

    @property
    def cy(self) -> float:
        return statistics.fmean(item.cy for item in self.items) if self.items else 0.0


@dataclass(slots=True)
class ExtractedLoad:
    placa: str
    carga: str
    peso_kg: float | None
    nota_fiscal: str
    pagina: int
    confianca: float | None = None
    origem: str = "linha"

    def as_dict(self) -> dict[str, Any]:
        return {
            "placa": self.placa,
            "carga": self.carga,
            "peso_kg": self.peso_kg,
            "nota_fiscal": self.nota_fiscal,
            "pagina": self.pagina,
            "confianca": self.confianca,
            "origem": self.origem,
        }


class SupabaseRest:
    def __init__(self, base_url: str, service_key: str, timeout: int = 30) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update(
            {
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Content-Type": "application/json",
            }
        )

    def _check(self, response: requests.Response, operation: str) -> requests.Response:
        if response.ok:
            return response
        body = response.text[:2000]
        raise RuntimeError(f"Supabase {operation} falhou ({response.status_code}): {body}")

    def claim_job(self, worker_id: str) -> dict[str, Any] | None:
        response = self.session.post(
            f"{self.base_url}/rest/v1/rpc/claim_logistica_ocr_job",
            json={"p_worker_id": worker_id},
            timeout=self.timeout,
        )
        self._check(response, "claim")
        data = response.json()
        if isinstance(data, list) and data:
            return dict(data[0])
        if isinstance(data, dict) and data:
            return dict(data)
        return None

    def update_job(self, job_id: int, payload: dict[str, Any]) -> None:
        response = self.session.patch(
            f"{self.base_url}/rest/v1/logistica_ocr_jobs",
            params={"id": f"eq.{job_id}"},
            headers={"Prefer": "return=minimal"},
            json=payload,
            timeout=self.timeout,
        )
        self._check(response, "update job")

    def heartbeat(
        self,
        worker_id: str,
        status: str,
        current_job_id: int | None,
        details: dict[str, Any] | None = None,
    ) -> None:
        payload = {
            "worker_id": worker_id,
            "hostname": socket.gethostname(),
            "version": VERSION,
            "status": status,
            "current_job_id": current_job_id,
            "details": details or {},
            "last_seen": utc_now(),
            "updated_at": utc_now(),
        }
        response = self.session.post(
            f"{self.base_url}/rest/v1/logistica_ocr_workers",
            params={"on_conflict": "worker_id"},
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            json=payload,
            timeout=self.timeout,
        )
        self._check(response, "heartbeat")


def utc_now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


def env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "sim", "on"}


def normalize(value: Any) -> str:
    import unicodedata

    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    return re.sub(r"\s+", " ", text).strip().lower()


def normalize_plate(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(value or "").upper())


def find_plates(text: str) -> list[str]:
    plates = []
    for match in PLATE_RE.findall(str(text or "").upper()):
        plate = normalize_plate(match)
        if len(plate) == 7 and plate not in plates:
            plates.append(plate)
    return plates


def parse_pt_number(value: str) -> float | None:
    text = re.sub(r"[^0-9,.-]", "", str(value or "").replace(" ", ""))
    if not text:
        return None
    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".") if text.rfind(",") > text.rfind(".") else text.replace(",", "")
    elif "," in text:
        text = text.replace(".", "").replace(",", ".")
    elif text.count(".") > 1:
        text = text.replace(".", "")
    try:
        number = float(text)
    except ValueError:
        return None
    return number if math.isfinite(number) else None


def weight_to_kg(raw: str, header: str = "", context: str = "") -> float | None:
    number = parse_pt_number(raw)
    if number is None:
        return None
    unit_text = normalize(f"{header} {context}")
    if re.search(r"\b(ton|tons|tonelada|toneladas|t)\b", unit_text) and not re.search(r"\bkg\b", unit_text):
        return round(number * 1000, 3)
    return round(number, 3)


def extract_label_value(context: str, labels: Sequence[str], pattern: str) -> str:
    label_group = "|".join(labels)
    match = re.search(rf"(?:{label_group})\s*(?:n[ºo°.]*)?\s*[:#=\-]?\s*({pattern})", context, re.IGNORECASE)
    return (match.group(1).strip(" \t:#º°.,;") if match else "").strip()


def extract_load(context: str) -> str:
    return extract_label_value(
        context,
        ("carga", "ticket", "romaneio", "laudo", "ordem", "controle"),
        r"[A-Z0-9][A-Z0-9./_\-]{0,29}",
    )


def extract_invoice(context: str) -> str:
    return extract_label_value(
        context,
        (r"nota\s*fiscal", r"nf\-?e", "nfe", "nf"),
        r"[0-9][0-9./_\-]{0,30}",
    )


def extract_weight(context: str) -> float | None:
    labeled = re.search(
        r"(?:peso(?:\s+l[ií]quido)?|l[ií]quido|peso\s*liq\.?|quantidade|qtd\.?)\s*[:#=\-]?\s*"
        r"([0-9][0-9.\s]*(?:,[0-9]+)?)\s*(kg|t|ton|tons|toneladas?)?",
        context,
        re.IGNORECASE,
    )
    if labeled:
        return weight_to_kg(labeled.group(1), labeled.group(2) or "", context)

    with_unit = list(
        re.finditer(
            r"\b([0-9]{1,3}(?:[.\s][0-9]{3})+(?:,[0-9]+)?|[0-9]+(?:,[0-9]+)?)\s*"
            r"(kg|t|ton|tons|toneladas?)\b",
            context,
            re.IGNORECASE,
        )
    )
    candidates = [weight_to_kg(match.group(1), match.group(2), context) for match in with_unit]
    plausible = [value for value in candidates if value is not None and 500 <= value <= 100_000]
    if plausible:
        return max(plausible)

    # Fallback controlado para tabelas sem unidade: pesos rodoviários em kg costumam ter 4–6 dígitos.
    numeric = []
    for match in NUMBER_RE.finditer(context):
        raw = match.group(1)
        digits = re.sub(r"\D", "", raw)
        value = parse_pt_number(raw)
        if value is not None and 1_000 <= value <= 100_000 and 4 <= len(digits) <= 6:
            numeric.append(value)
    return max(numeric) if numeric else None


def box_bounds(box: Any) -> tuple[float, float, float, float] | None:
    if box is None:
        return None
    try:
        values = box.tolist() if hasattr(box, "tolist") else box
        if len(values) == 4 and all(isinstance(value, (int, float)) for value in values):
            x1, y1, x2, y2 = map(float, values)
            return x1, y1, x2, y2
        points = [point.tolist() if hasattr(point, "tolist") else point for point in values]
        xs = [float(point[0]) for point in points]
        ys = [float(point[1]) for point in points]
        return min(xs), min(ys), max(xs), max(ys)
    except (TypeError, ValueError, IndexError):
        return None


def result_payload(result: Any) -> dict[str, Any]:
    payload = getattr(result, "json", None)
    if callable(payload):
        payload = payload()
    if isinstance(payload, str):
        payload = json.loads(payload)
    if not isinstance(payload, dict):
        return {}
    nested = payload.get("res")
    return nested if isinstance(nested, dict) else payload


def extract_items(result: Any, minimum_score: float) -> list[OcrItem]:
    payload = result_payload(result)
    texts = payload.get("rec_texts")
    scores = payload.get("rec_scores")
    boxes = payload.get("rec_boxes")
    if texts is None:
        texts = []
    if scores is None:
        scores = []
    if boxes is None or (hasattr(boxes, "__len__") and len(boxes) == 0):
        boxes = payload.get("rec_polys")
    if boxes is None:
        boxes = []
    if hasattr(scores, "tolist"):
        scores = scores.tolist()
    if hasattr(boxes, "tolist"):
        boxes = boxes.tolist()

    items: list[OcrItem] = []
    for index, text in enumerate(texts):
        text = str(text or "").strip()
        if not text:
            continue
        score = float(scores[index]) if index < len(scores) else 0.0
        if score < minimum_score:
            continue
        bounds = box_bounds(boxes[index] if index < len(boxes) else None)
        if bounds is None:
            continue
        items.append(OcrItem(text=text, score=score, x1=bounds[0], y1=bounds[1], x2=bounds[2], y2=bounds[3]))
    return items


def group_rows(items: Sequence[OcrItem]) -> list[OcrRow]:
    if not items:
        return []
    heights = [item.height for item in items]
    median_height = statistics.median(heights) if heights else 20.0
    tolerance = max(8.0, median_height * 0.65)
    rows: list[OcrRow] = []
    for item in sorted(items, key=lambda current: (current.cy, current.x1)):
        target: OcrRow | None = None
        best_distance = float("inf")
        for row in rows[-8:]:
            distance = abs(row.cy - item.cy)
            if distance <= tolerance and distance < best_distance:
                target = row
                best_distance = distance
        if target is None:
            rows.append(OcrRow(items=[item]))
        else:
            target.items.append(item)
    rows.sort(key=lambda row: row.cy)
    for row in rows:
        row.items.sort(key=lambda item: item.x1)
    return rows


def header_key(text: str) -> str | None:
    normalized = normalize(text)
    for key, aliases in HEADER_ALIASES.items():
        if any(alias in normalized for alias in aliases):
            return key
    return None


def table_columns(header: OcrRow) -> dict[str, tuple[float, str]]:
    columns: dict[str, tuple[float, str]] = {}
    for item in header.items:
        key = header_key(item.text)
        if key and key not in columns:
            columns[key] = (item.cx, item.text)
    return columns


def row_cells(row: OcrRow, columns: dict[str, tuple[float, str]]) -> dict[str, str]:
    assigned: dict[str, list[str]] = {key: [] for key in columns}
    for item in row.items:
        key = min(columns, key=lambda name: abs(item.cx - columns[name][0]))
        assigned[key].append(item.text)
    return {key: " ".join(values).strip() for key, values in assigned.items()}


def confidence(items: Iterable[OcrItem]) -> float | None:
    scores = [item.score for item in items]
    return round(statistics.fmean(scores), 4) if scores else None


def extract_from_table(rows: Sequence[OcrRow], page_number: int) -> list[ExtractedLoad]:
    found: list[ExtractedLoad] = []
    for header_index, header in enumerate(rows):
        columns = table_columns(header)
        if "placa" not in columns or len(columns) < 2:
            continue
        for row in rows[header_index + 1 :]:
            if row is not header and "placa" in table_columns(row):
                break
            cells = row_cells(row, columns)
            plates = find_plates(cells.get("placa", "") or row.text)
            if not plates:
                continue
            weight_raw = cells.get("peso", "")
            weight_header = columns.get("peso", (0.0, ""))[1]
            peso = weight_to_kg(weight_raw, weight_header, row.text) if weight_raw else extract_weight(row.text)
            carga = cells.get("carga", "") or extract_load(row.text)
            nf = cells.get("nota_fiscal", "") or extract_invoice(row.text)
            row_confidence = confidence(row.items)
            for plate in plates:
                found.append(
                    ExtractedLoad(
                        placa=plate,
                        carga=carga.strip(),
                        peso_kg=peso,
                        nota_fiscal=nf.strip(),
                        pagina=page_number,
                        confianca=row_confidence,
                        origem="tabela",
                    )
                )
    return found


def extract_from_context(rows: Sequence[OcrRow], page_number: int) -> list[ExtractedLoad]:
    found: list[ExtractedLoad] = []
    for index, row in enumerate(rows):
        plates = find_plates(row.text)
        if not plates:
            continue
        context_rows = rows[max(0, index - 2) : min(len(rows), index + 3)]
        context = " | ".join(current.text for current in context_rows)
        carga = extract_load(row.text) or extract_load(context)
        nf = extract_invoice(row.text) or extract_invoice(context)
        peso = extract_weight(row.text)
        if peso is None:
            peso = extract_weight(context)
        row_confidence = confidence(item for current in context_rows for item in current.items)
        for plate in plates:
            found.append(
                ExtractedLoad(
                    placa=plate,
                    carga=carga,
                    peso_kg=peso,
                    nota_fiscal=nf,
                    pagina=page_number,
                    confianca=row_confidence,
                    origem="linha",
                )
            )
    return found


def merge_loads(loads: Iterable[ExtractedLoad]) -> list[ExtractedLoad]:
    merged: dict[tuple[str, int], ExtractedLoad] = {}
    for load in loads:
        key = (load.placa, load.pagina)
        previous = merged.get(key)
        if previous is None:
            merged[key] = load
            continue
        if previous.origem != "tabela" and load.origem == "tabela":
            preferred, fallback = load, previous
        else:
            preferred, fallback = previous, load
        if not preferred.carga:
            preferred.carga = fallback.carga
        if preferred.peso_kg is None:
            preferred.peso_kg = fallback.peso_kg
        if not preferred.nota_fiscal:
            preferred.nota_fiscal = fallback.nota_fiscal
        if preferred.confianca is None:
            preferred.confianca = fallback.confianca
        merged[key] = preferred
    return sorted(merged.values(), key=lambda item: (item.pagina, item.placa, item.carga))


class PaddleProcessor:
    def __init__(self) -> None:
        self.minimum_score = float(os.getenv("PADDLE_OCR_MIN_SCORE", "0.35"))
        self.render_dpi = int(os.getenv("OCR_RENDER_DPI", "180"))
        self.max_pages = int(os.getenv("OCR_MAX_PAGES", "200"))
        self.ocr = PaddleOCR(
            lang=os.getenv("PADDLE_OCR_LANG", "pt"),
            ocr_version=os.getenv("PADDLE_OCR_VERSION", "PP-OCRv5"),
            use_doc_orientation_classify=env_bool("PADDLE_OCR_DOC_ORIENTATION", False),
            use_doc_unwarping=env_bool("PADDLE_OCR_UNWARP", False),
            use_textline_orientation=env_bool("PADDLE_OCR_TEXTLINE_ORIENTATION", False),
            device=os.getenv("PADDLE_OCR_DEVICE", "cpu"),
        )

    def page_images(self, source: Path, file_type: str, work_dir: Path) -> tuple[int, Iterator[tuple[int, Path]]]:
        if file_type != "pdf":
            return 1, iter([(1, source)])

        document = fitz.open(source)
        total = len(document)
        if total > self.max_pages:
            document.close()
            raise RuntimeError(f"PDF possui {total} páginas; limite configurado é {self.max_pages}.")

        def iterator() -> Iterator[tuple[int, Path]]:
            try:
                zoom = self.render_dpi / 72.0
                matrix = fitz.Matrix(zoom, zoom)
                for page_index in range(total):
                    page = document.load_page(page_index)
                    pixmap = page.get_pixmap(matrix=matrix, alpha=False)
                    image_path = work_dir / f"pagina-{page_index + 1:04d}.png"
                    pixmap.save(image_path)
                    yield page_index + 1, image_path
            finally:
                document.close()

        return total, iterator()

    def process_page(self, image_path: Path, page_number: int) -> tuple[list[ExtractedLoad], dict[str, Any]]:
        results = self.ocr.predict(str(image_path))
        all_items: list[OcrItem] = []
        for result in results:
            all_items.extend(extract_items(result, self.minimum_score))
        rows = group_rows(all_items)
        loads = merge_loads([
            *extract_from_table(rows, page_number),
            *extract_from_context(rows, page_number),
        ])
        raw_page = {
            "pagina": page_number,
            "texto": "\n".join(row.text for row in rows),
            "linhas": [
                {
                    "texto": row.text,
                    "y": round(row.cy, 2),
                    "confianca": confidence(row.items),
                }
                for row in rows
            ],
        }
        return loads, raw_page


def download_document(url: str, file_type: str, destination: Path, max_bytes: int) -> Path:
    suffix = ".jpg" if file_type == "jpeg" else f".{file_type}"
    target = destination / f"documento{suffix}"
    with requests.get(url, stream=True, timeout=(20, 180), allow_redirects=True) as response:
        response.raise_for_status()
        declared = int(response.headers.get("content-length") or 0)
        if declared and declared > max_bytes:
            raise RuntimeError(f"Arquivo possui {declared / 1024 / 1024:.1f} MB; limite local é {max_bytes / 1024 / 1024:.0f} MB.")
        downloaded = 0
        with target.open("wb") as output:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if not chunk:
                    continue
                downloaded += len(chunk)
                if downloaded > max_bytes:
                    raise RuntimeError(f"Arquivo excedeu o limite local de {max_bytes / 1024 / 1024:.0f} MB.")
                output.write(chunk)
    return target


def handle_job(db: SupabaseRest, processor: PaddleProcessor, worker_id: str, job: dict[str, Any]) -> None:
    job_id = int(job["id"])
    file_type = str(job.get("file_type") or "").lower()
    document_url = str(job.get("document_url") or "")
    max_bytes = int(os.getenv("OCR_MAX_FILE_MB", "100")) * 1024 * 1024
    started_monotonic = time.monotonic()

    LOGGER.info("Job %s iniciado: %s", job_id, document_url)
    db.heartbeat(worker_id, "PROCESSANDO", job_id, {"numero_os": job.get("numero_os")})
    db.update_job(job_id, {"progress": 2, "locked_at": utc_now(), "updated_at": utc_now()})

    with tempfile.TemporaryDirectory(prefix=f"grao-ocr-{job_id}-") as temp_name:
        work_dir = Path(temp_name)
        source = download_document(document_url, file_type, work_dir, max_bytes)
        db.update_job(job_id, {"progress": 8, "locked_at": utc_now(), "updated_at": utc_now()})

        page_total, pages = processor.page_images(source, file_type, work_dir)
        db.update_job(job_id, {"page_total": page_total, "page_current": 0, "progress": 10, "locked_at": utc_now(), "updated_at": utc_now()})

        all_loads: list[ExtractedLoad] = []
        raw_pages: list[dict[str, Any]] = []
        for page_number, image_path in pages:
            if STOP_REQUESTED:
                raise RuntimeError("Worker interrompido durante o processamento.")
            page_loads, raw_page = processor.process_page(image_path, page_number)
            all_loads.extend(page_loads)
            raw_pages.append(raw_page)
            progress = min(95, 10 + round(page_number / max(1, page_total) * 85))
            db.update_job(
                job_id,
                {
                    "page_current": page_number,
                    "page_total": page_total,
                    "progress": progress,
                    "locked_at": utc_now(),
                    "updated_at": utc_now(),
                },
            )
            db.heartbeat(worker_id, "PROCESSANDO", job_id, {"pagina": page_number, "paginas": page_total})

        merged = merge_loads(all_loads)
        result = {"cargas": [load.as_dict() for load in merged]}
        raw_text = "\n\n".join(f"--- Página {page['pagina']} ---\n{page['texto']}" for page in raw_pages)
        elapsed_ms = round((time.monotonic() - started_monotonic) * 1000)

        if not merged:
            raise RuntimeError("O PaddleOCR leu o documento, mas não identificou nenhuma placa válida.")

        db.update_job(
            job_id,
            {
                "status": "CONCLUIDO",
                "progress": 100,
                "page_current": page_total,
                "page_total": page_total,
                "result": result,
                "raw_text": raw_text,
                "raw_ocr": {"paginas": raw_pages, "tempo_ms": elapsed_ms, "versao_worker": VERSION},
                "error": None,
                "locked_at": None,
                "completed_at": utc_now(),
                "updated_at": utc_now(),
            },
        )
        LOGGER.info("Job %s concluído: %s carga(s), %s página(s), %sms", job_id, len(merged), page_total, elapsed_ms)


def configure_logging() -> None:
    level = getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO)
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s %(name)s - %(message)s",
    )


def signal_handler(signum: int, _frame: Any) -> None:
    global STOP_REQUESTED
    STOP_REQUESTED = True
    LOGGER.warning("Sinal %s recebido; encerrando após a etapa atual.", signum)


def require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Variável obrigatória ausente: {name}")
    return value


def main() -> int:
    configure_logging()
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    supabase_url = require_env("SUPABASE_URL")
    service_key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    worker_id = os.getenv("OCR_WORKER_ID", f"{socket.gethostname()}-paddleocr").strip()
    poll_seconds = max(1.0, float(os.getenv("OCR_POLL_SECONDS", "3")))

    db = SupabaseRest(supabase_url, service_key)
    LOGGER.info("Carregando modelos PaddleOCR…")
    processor = PaddleProcessor()
    LOGGER.info("Worker %s iniciado (versão %s).", worker_id, VERSION)

    last_heartbeat = 0.0
    while not STOP_REQUESTED:
        try:
            now = time.monotonic()
            if now - last_heartbeat >= 30:
                db.heartbeat(worker_id, "ONLINE", None, {"poll_seconds": poll_seconds})
                last_heartbeat = now

            job = db.claim_job(worker_id)
            if not job:
                time.sleep(poll_seconds)
                continue

            job_id = int(job["id"])
            try:
                handle_job(db, processor, worker_id, job)
                db.heartbeat(worker_id, "ONLINE", None, {"ultimo_job": job_id})
            except Exception as error:  # noqa: BLE001 - precisa registrar qualquer falha do job
                detail = f"{type(error).__name__}: {error}"
                trace = traceback.format_exc(limit=20)
                LOGGER.error("Job %s falhou: %s\n%s", job_id, detail, trace)
                db.update_job(
                    job_id,
                    {
                        "status": "ERRO",
                        "error": f"{detail}\n{trace}"[:8000],
                        "locked_at": None,
                        "completed_at": utc_now(),
                        "updated_at": utc_now(),
                    },
                )
                db.heartbeat(worker_id, "ERRO", None, {"ultimo_job": job_id, "erro": detail})
        except requests.RequestException as error:
            LOGGER.error("Falha de rede: %s", error)
            time.sleep(min(30, poll_seconds * 3))
        except Exception as error:  # noqa: BLE001
            LOGGER.exception("Erro no loop principal: %s", error)
            try:
                db.heartbeat(worker_id, "ERRO", None, {"erro": str(error)})
            except Exception:
                pass
            time.sleep(min(30, poll_seconds * 3))

    try:
        db.heartbeat(worker_id, "PARADO", None, {"motivo": "shutdown"})
    except Exception:
        pass
    LOGGER.info("Worker encerrado.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
