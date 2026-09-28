#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Какаториум — общий сервер для Димы и Алёны.

Сервер отдаёт сайт и хранит общую базу записей в одном JSON-файле.
Нужен только стандартный Python 3, никаких зависимостей.

    python3 tools/server.py                # http://0.0.0.0:8080, файл data/kakatorium.json
    python3 tools/server.py --port 9000
    python3 tools/server.py --token секрет # доступ только с этим ключом
    python3 tools/server.py --no-open

Дальше оба открывают один и тот же адрес (например http://192.168.1.10:8080) —
и статистика у них общая, синхронизируется сама.
"""

import argparse
import json
import os
import socket
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
}

LOCK = threading.Lock()
CONFIG = {"token": "", "data": ""}


# ---------------------------------------------------------------- база
def empty_db():
    return {"version": 3, "createdAt": now_iso(), "updatedAt": int(time.time() * 1000),
            "entries": [], "tombstones": {}, "devices": {}}


def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%S")


def read_db():
    path = CONFIG["data"]
    if not os.path.exists(path):
        return empty_db()
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        if not isinstance(data, dict) or not isinstance(data.get("entries"), list):
            return empty_db()
        data.setdefault("tombstones", {})
        data.setdefault("devices", {})
        return data
    except (ValueError, OSError):
        return empty_db()


def write_db(db):
    path = CONFIG["data"]
    folder = os.path.dirname(path)
    if folder:
        os.makedirs(folder, exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(db, fh, ensure_ascii=False)
    os.replace(tmp, path)


def merge(local, incoming):
    """Сливает присланные записи с уже сохранёнными.

    Записи объединяются по id, удаления (tombstones) имеют приоритет,
    поэтому удалённая одним человеком запись не возвращается обратно.
    """
    tombstones = dict(local.get("tombstones") or {})
    for key, value in (incoming.get("tombstones") or {}).items():
        if not isinstance(value, (int, float)):
            continue
        if tombstones.get(key, 0) < value:
            tombstones[key] = value

    index = {}
    for entry in local.get("entries") or []:
        if isinstance(entry, dict) and entry.get("id"):
            index[str(entry["id"])] = entry

    added = 0
    for entry in incoming.get("entries") or []:
        if not isinstance(entry, dict) or not entry.get("id"):
            continue
        key = str(entry["id"])
        dead = tombstones.get(key, 0)
        if dead and dead >= (entry.get("ts") or 0):
            continue
        if key not in index:
            index[key] = entry
            added += 1

    entries = [e for e in index.values()
               if not (tombstones.get(str(e["id"]), 0) >= (e.get("ts") or 0))]
    entries.sort(key=lambda e: e.get("ts") or 0, reverse=True)

    devices = dict(local.get("devices") or {})
    devices.update(incoming.get("devices") or {})

    return {
        "version": 3,
        "createdAt": local.get("createdAt") or now_iso(),
        "updatedAt": int(time.time() * 1000),
        "entries": entries,
        "tombstones": tombstones,
        "devices": devices,
        "added": added,
    }


# ---------------------------------------------------------------- http
class Handler(BaseHTTPRequestHandler):
    server_version = "Kakatorium/1.0"
    protocol_version = "HTTP/1.1"

    # ---- служебное
    def log_message(self, fmt, *args):
        sys.stdout.write("  %s %s\n" % (time.strftime("%H:%M:%S"), fmt % args))

    def send_json(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.cors()
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def cors(self):
        # Разрешаем и file://, и любой хостинг: Origin может быть null
        self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin") or "*")
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Kakatorium-Token")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS")

    def authorized(self):
        token = CONFIG["token"]
        if not token:
            return True
        given = self.headers.get("X-Kakatorium-Token") or ""
        for candidate in (given, unquote(given), unquote(given.encode("latin-1").decode("utf-8", "ignore"))):
            if candidate == token:
                return True
        return False

    def api_path(self, path):
        return path.rstrip("/").endswith("/api/data") or path.rstrip("/") == "/api/data"

    # ---- методы
    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if self.api_path(self.path.split("?")[0]):
            if not self.authorized():
                return self.send_json(401, {"error": "wrong token"})
            with LOCK:
                return self.send_json(200, read_db())
        return self.serve_static()

    def do_HEAD(self):
        return self.serve_static(head=True)

    def do_PUT(self):
        return self.save()

    def do_POST(self):
        return self.save()

    def save(self):
        if not self.api_path(self.path.split("?")[0]):
            return self.send_json(404, {"error": "not found"})
        if not self.authorized():
            return self.send_json(401, {"error": "wrong token"})

        length = int(self.headers.get("Content-Length") or 0)
        if length > 8 * 1024 * 1024:
            return self.send_json(413, {"error": "too big"})
        raw = self.rfile.read(length) if length else b"{}"
        try:
            incoming = json.loads(raw.decode("utf-8"))
        except ValueError:
            return self.send_json(400, {"error": "не JSON"})
        if not isinstance(incoming, dict) or not isinstance(incoming.get("entries"), list):
            return self.send_json(400, {"error": "нет массива entries"})

        with LOCK:
            db = merge(read_db(), incoming)
            write_db(db)
        return self.send_json(200, db)

    def serve_static(self, head=False):
        path = self.path.split("?")[0]
        if path in ("/", ""):
            path = "/index.html"
        target = os.path.normpath(os.path.join(ROOT, path.lstrip("/")))
        if not target.startswith(ROOT) or not os.path.isfile(target):
            return self.send_json(404, {"error": "not found", "path": path})

        ext = os.path.splitext(target)[1].lower()
        with open(target, "rb") as fh:
            body = fh.read()
        self.send_response(200)
        self.send_header("Content-Type", MIME.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.cors()
        self.end_headers()
        if not head:
            self.wfile.write(body)


# ---------------------------------------------------------------- запуск
def lan_addresses():
    out = []
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        out.append(sock.getsockname()[0])
        sock.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127.") and ip not in out:
                out.append(ip)
    except OSError:
        pass
    return out


def main():
    parser = argparse.ArgumentParser(description="Общий сервер Какаториума")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--token", default=os.environ.get("KAKATORIUM_TOKEN", ""),
                        help="ключ доступа; пустой — доступ без ключа")
    parser.add_argument("--data", default=os.path.join(ROOT, "data", "kakatorium.json"))
    parser.add_argument("--no-open", action="store_true", help="не открывать браузер")
    args = parser.parse_args()

    CONFIG["token"] = args.token
    CONFIG["data"] = args.data

    if not os.path.exists(args.data):
        write_db(empty_db())

    try:
        httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    except OSError as err:
        print("Не удалось запустить на порту %d: %s" % (args.port, err))
        print("Попробуйте другой порт: python3 tools/server.py --port 9000")
        return 1

    ips = lan_addresses()
    print()
    print("  💩  Какаториум · общий сервер")
    print("  " + "─" * 52)
    print("  Здесь:      http://localhost:%d" % args.port)
    for ip in ips:
        print("  Для второго: http://%s:%d" % (ip, args.port))
    print("  Файл базы:  %s" % args.data)
    if args.token:
        print("  Ключ доступа включён — укажите его в поле «ключ» на сайте.")
    else:
        print("  Ключа нет — заходить может любой в этой сети.")
    print("  " + "─" * 52)
    print("  Остановка: Ctrl+C\n")

    if not args.no_open:
        threading.Timer(0.6, lambda: webbrowser.open("http://localhost:%d" % args.port)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Остановили. Пока!")
    return 0


if __name__ == "__main__":
    sys.exit(main())
