"""Server-side link unfurling for canvas "link" cards (Milanote shows a title,
blurb and thumbnail for every pasted URL).

The fetch is made from binx-api, so it is guarded against SSRF: only
http(s), every hop's host must resolve exclusively to public addresses
(redirects are followed manually and re-checked), a short timeout, and a hard
cap on how much of the body is read. Anything that goes wrong degrades to a
bare preview (the hostname as title) — a link card never fails to create
because the remote site is slow, blocks bots, or isn't HTML.
"""

from __future__ import annotations

import asyncio
import ipaddress
import re
import socket
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

import httpx
from fastapi import HTTPException, status

_TIMEOUT = httpx.Timeout(4.0, connect=3.0)
_MAX_BYTES = 512 * 1024
_MAX_REDIRECTS = 3
_USER_AGENT = "BinxPortal-LinkPreview/1.0"
_MAX_URL = 2048
# A leading "scheme:" that isn't a port ("localhost:3000") — javascript:, mailto:...
_SCHEME_PREFIX = re.compile(r"^[a-z][a-z0-9+.-]*:(?!\d)", re.IGNORECASE)


def normalize_url(raw: str) -> str:
    """Trim, default the scheme to https, and reject anything that isn't a
    plain http(s) URL with a host. Raises 400 for junk."""
    url = (raw or "").strip()
    if not url:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enter a link")
    if "://" not in url:
        if _SCHEME_PREFIX.match(url):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "That doesn't look like a web link")
        url = f"https://{url}"
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname or len(url) > _MAX_URL:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That doesn't look like a web link")
    return url


def bare_preview(url: str) -> dict:
    host = urlparse(url).hostname or url
    host = host.removeprefix("www.")
    return {"url": url, "title": host, "description": None, "image": None, "site_name": host}


def _is_public(address: str) -> bool:
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return False
    return ip.is_global and not ip.is_multicast


async def _host_is_public(host: str) -> bool:
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except OSError:
        return False
    addresses = {info[4][0] for info in infos}
    return bool(addresses) and all(_is_public(a) for a in addresses)


class _MetaParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.meta: dict[str, str] = {}
        self.title: str | None = None
        self._in_title = False
        self._title_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "meta":
            a = {k.lower(): (v or "") for k, v in attrs}
            key = (a.get("property") or a.get("name") or "").lower()
            if key and "content" in a and key not in self.meta:
                self.meta[key] = a["content"].strip()
        elif tag == "title" and self.title is None:
            self._in_title = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "title" and self._in_title:
            self._in_title = False
            self.title = " ".join("".join(self._title_parts).split()) or None

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self._title_parts.append(data)


def parse_preview(url: str, html: str) -> dict:
    """Pull title/description/image/site name out of a page's head —
    Open Graph first, then Twitter cards, then plain <title>/description."""
    parser = _MetaParser()
    try:
        parser.feed(html)
    except Exception:  # noqa: BLE001 — malformed HTML is the remote's problem
        pass
    meta = parser.meta
    fallback = bare_preview(url)

    def pick(*keys: str) -> str | None:
        for key in keys:
            value = meta.get(key)
            if value:
                return value
        return None

    image = pick("og:image", "og:image:url", "twitter:image")
    if image:
        image = urljoin(url, image)
        if urlparse(image).scheme not in ("http", "https") or len(image) > _MAX_URL:
            image = None

    title = pick("og:title", "twitter:title") or parser.title or fallback["title"]
    description = pick("og:description", "twitter:description", "description")
    return {
        "url": url,
        "title": title[:300],
        "description": description[:500] if description else None,
        "image": image,
        "site_name": (pick("og:site_name") or fallback["site_name"])[:120],
    }


async def fetch_preview(url: str) -> dict:
    """Unfurl ``url`` (already normalised). Never raises — see module doc."""
    try:
        current = url
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=False) as client:
            for _hop in range(_MAX_REDIRECTS + 1):
                host = urlparse(current).hostname
                if not host or not await _host_is_public(host):
                    return bare_preview(url)
                async with client.stream(
                    "GET", current, headers={"User-Agent": _USER_AGENT, "Accept": "text/html"}
                ) as response:
                    if response.is_redirect and "location" in response.headers:
                        current = urljoin(current, response.headers["location"])
                        if urlparse(current).scheme not in ("http", "https"):
                            return bare_preview(url)
                        continue
                    if response.status_code >= 400 or "html" not in response.headers.get("content-type", ""):
                        return bare_preview(url)
                    body = bytearray()
                    async for chunk in response.aiter_bytes():
                        body.extend(chunk)
                        if len(body) >= _MAX_BYTES:
                            break
                    text = body.decode(response.encoding or "utf-8", errors="replace")
                    return parse_preview(url, text)
    except Exception:  # noqa: BLE001 — degrade, never fail the card
        return bare_preview(url)
    return bare_preview(url)
