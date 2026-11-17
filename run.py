#!/usr/bin/env python3
"""
启动入口。

    python3 run.py                # 默认 127.0.0.1:8000
    APP_PORT=9000 python3 run.py  # 换端口

零依赖：只用 Python 标准库，不需要 pip install 任何东西。
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import audit, db, http, security          # noqa: E402
from app.api import router                          # noqa: E402
from app.config import config                       # noqa: E402


def banner() -> None:
    lines = [
        "",
        "  校园智能预问诊 · 后端服务",
        "  " + "-" * 46,
        f"  地址      http://{config.HOST}:{config.PORT}",
        f"  环境      {config.ENV}",
        f"  数据库    {config.DB_PATH}",
        f"  模型      {config.LLM_PROVIDER}"
        + (f" / {config.LLM_MODEL}" if config.LLM_PROVIDER != "mock" else "（本地 mock，不联网）"),
        f"  加密      {security.crypto_backend()}",
        "  " + "-" * 46,
        "  健康检查  GET /api/v1/health",
        "  规则清单  GET /api/v1/admin/risk-rules",
        "",
    ]
    print("\n".join(lines))


def main() -> None:
    db.init_schema()
    security.warn_if_weak()
    banner()
    http.serve(router, config.HOST, config.PORT)


if __name__ == "__main__":
    main()
