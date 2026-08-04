#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
from datetime import datetime
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(
            f"Patch '{label}' esperava 1 ocorrência, mas encontrou {count}. "
            "O arquivo pode estar em outra versão."
        )
    return text.replace(old, new, 1)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Troca o modelo de DETECÇÃO do PaddleOCR de 'server' pra 'mobile' — "
        "visto ao vivo (04/08): uma imagem só levava 86-101s com o modelo server em CPU. "
        "O reconhecimento já usa mobile por padrão (latin_PP-OCRv5_mobile_rec); só a "
        "detecção ficava no server. Configurável via PADDLE_OCR_DET_MODEL, caso precise "
        "voltar pro server (mais preciso, mais lento) em algum ambiente."
    )
    parser.add_argument(
        "worker",
        nargs="?",
        default="/home/grao100/paddleocr-worker/logistica_ocr_worker.py",
        help="Caminho do logistica_ocr_worker.py",
    )
    args = parser.parse_args()

    path = Path(args.worker).resolve()
    if not path.is_file():
        raise FileNotFoundError(f"Worker não encontrado: {path}")

    original = path.read_text(encoding="utf-8")
    if 'VERSION = "1.3.0"' in original:
        print("O worker já está na versão 1.3.0; nenhuma alteração foi feita.")
        return 0
    if 'VERSION = "1.2.0"' not in original:
        raise RuntimeError(
            "Este patch espera o worker na versão 1.2.0 (rode patch_paddleocr_worker_v1_2.py primeiro)."
        )

    text = original

    text = replace_once(text, 'VERSION = "1.2.0"', 'VERSION = "1.3.0"', "versão")

    text = replace_once(
        text,
        '        self.ocr = PaddleOCR(\n'
        '            lang=os.getenv("PADDLE_OCR_LANG", "pt"),\n'
        '            ocr_version=os.getenv("PADDLE_OCR_VERSION", "PP-OCRv5"),\n',
        '        self.ocr = PaddleOCR(\n'
        '            lang=os.getenv("PADDLE_OCR_LANG", "pt"),\n'
        '            ocr_version=os.getenv("PADDLE_OCR_VERSION", "PP-OCRv5"),\n'
        '            # server_det media 86-101s por imagem em CPU (visto ao vivo 04/08);\n'
        '            # mobile_det é bem mais rápido com perda de precisão menor do que\n'
        '            # parece — o reconhecimento (rec) já era mobile por padrão.\n'
        '            text_detection_model_name=os.getenv("PADDLE_OCR_DET_MODEL", "PP-OCRv5_mobile_det"),\n',
        "modelo de detecção mobile",
    )

    backup = path.with_name(
        f"{path.name}.backup-v1.2.0-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    )
    shutil.copy2(path, backup)
    path.write_text(text, encoding="utf-8")

    print(f"Backup: {backup}")
    print(f"Atualizado: {path}")
    print("Versão aplicada: 1.3.0")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
