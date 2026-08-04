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
        description="Corrige regressão do patch v1.3.0: especificar text_detection_model_name "
        "faz o PaddleOCR ignorar 'lang'/'ocr_version' pra TODOS os modelos, não só a detecção "
        "(aviso visto ao vivo 04/08: \"lang and ocr_version will be ignored...\"). Isso trocou o "
        "reconhecimento de 'latin_PP-OCRv5_mobile_rec' (leve, ajustado pro português) pro "
        "'PP-OCRv5_server_rec' (pesado, genérico) sem ninguém pedir. Fixa o reconhecimento "
        "explicitamente de volta pro modelo mobile em português."
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
    if 'VERSION = "1.4.0"' in original:
        print("O worker já está na versão 1.4.0; nenhuma alteração foi feita.")
        return 0
    if 'VERSION = "1.3.0"' not in original:
        raise RuntimeError(
            "Este patch espera o worker na versão 1.3.0 (rode patch_paddleocr_worker_v1_3.py primeiro)."
        )

    text = original

    text = replace_once(text, 'VERSION = "1.3.0"', 'VERSION = "1.4.0"', "versão")

    text = replace_once(
        text,
        '            text_detection_model_name=os.getenv("PADDLE_OCR_DET_MODEL", "PP-OCRv5_mobile_det"),\n',
        '            text_detection_model_name=os.getenv("PADDLE_OCR_DET_MODEL", "PP-OCRv5_mobile_det"),\n'
        '            # Especificar QUALQUER *_model_name faz o PaddleOCR ignorar lang/\n'
        '            # ocr_version pra TODOS os modelos (aviso visto ao vivo 04/08) — sem\n'
        '            # isto aqui, o reconhecimento silenciosamente vira PP-OCRv5_server_rec\n'
        '            # (pesado e sem ajuste pro português) em vez do latin_*_mobile_rec\n'
        '            # que "lang=pt" escolheria sozinho.\n'
        '            text_recognition_model_name=os.getenv("PADDLE_OCR_REC_MODEL", "latin_PP-OCRv5_mobile_rec"),\n',
        "modelo de reconhecimento explícito",
    )

    backup = path.with_name(
        f"{path.name}.backup-v1.3.0-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    )
    shutil.copy2(path, backup)
    path.write_text(text, encoding="utf-8")

    print(f"Backup: {backup}")
    print(f"Atualizado: {path}")
    print("Versão aplicada: 1.4.0")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
