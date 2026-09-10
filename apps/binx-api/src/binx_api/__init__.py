import os


def main() -> None:
    # The client opens the collaboration/messaging websocket straight at this
    # API (NEXT_PUBLIC_API_URL), and the browser attaches every cookie it holds
    # for that host to the handshake. In local dev the web app and the API share
    # `localhost` on different ports, and cookies aren't port-scoped — so the
    # `Cookie:` line can blow past the `websockets` library's default 8 KiB
    # per-line limit and the handshake is rejected with "431 Request Header
    # Fields Too Large". The WS auths purely on the `?ticket=` query param, so
    # those cookies are dead weight; give the parser plenty of room. Set before
    # importing uvicorn, which imports `websockets` (it reads this at import).
    os.environ.setdefault("WEBSOCKETS_MAX_LINE_LENGTH", "65536")

    import uvicorn

    uvicorn.run("binx_api.main:app", host="0.0.0.0", port=8000, reload=True)
