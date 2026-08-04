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
        description="Atualiza o worker PaddleOCR da Grão 1000 pra aceitar jobs document_type='texto_livre' "
        "(leitura de texto livre, ex.: Abertura de O.S.) sem exigir achar placa (regra que só vale pra 'cargas')."
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
    if 'VERSION = "1.2.0"' in original:
        print("O worker já está na versão 1.2.0; nenhuma alteração foi feita.")
        return 0
    if 'VERSION = "1.1.0"' not in original:
        raise RuntimeError(
            "Este patch espera o worker na versão 1.1.0 (rode patch_paddleocr_worker_v1_1.py primeiro)."
        )

    text = original

    text = replace_once(
        text,
        'VERSION = "1.1.0"',
        'VERSION = "1.2.0"',
        "versão",
    )

    text = replace_once(
        text,
        '    document_url = str(job.get("document_url") or "")\n',
        '    document_url = str(job.get("document_url") or "")\n'
        '    # "cargas" (padrão, Pré-Conferência de O.S.) exige achar ao menos 1\n'
        '    # placa pra considerar sucesso. "texto_livre" (ex.: leitura do print\n'
        '    # de solicitação na Abertura de O.S.) não tem placa nenhuma pra achar\n'
        '    # — só interessa o texto reconhecido em si.\n'
        '    document_type = str(job.get("document_type") or "cargas").lower()\n',
        "leitura de document_type",
    )

    text = replace_once(
        text,
        '        if not merged:\n'
        '            raise RuntimeError("O PaddleOCR leu o documento, mas não identificou nenhuma placa válida.")\n',
        '        if document_type == "cargas" and not merged:\n'
        '            raise RuntimeError("O PaddleOCR leu o documento, mas não identificou nenhuma placa válida.")\n'
        '        if document_type == "texto_livre" and not raw_text.strip():\n'
        '            raise RuntimeError("O PaddleOCR não reconheceu nenhum texto no documento.")\n',
        "validação condicional por document_type",
    )

    backup = path.with_name(
        f"{path.name}.backup-v1.1.0-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    )
    shutil.copy2(path, backup)
    path.write_text(text, encoding="utf-8")

    print(f"Backup: {backup}")
    print(f"Atualizado: {path}")
    print("Versão aplicada: 1.2.0")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
