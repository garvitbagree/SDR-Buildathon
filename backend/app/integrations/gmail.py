"""Polls the burner Gmail inbox for real prospect replies and feeds them into the same
receive_reply() path simulate-reply already uses. Matching works off Reply-To: outreach.py sets
Reply-To to the exact +tag address we sent to (which IS the prospect's own id, per the "point at
burner inbox" convenience), so a reply naturally carries that address back to us."""
import email
import email.policy
import email.utils
import imaplib
import logging
import os
import threading

from sqlalchemy import func, select

from app.db import SessionLocal
from app.models.tables import CampaignProspect
from app.services import replies

log = logging.getLogger("sdr.gmail")

IMAP_HOST = "imap.gmail.com"


def gmail_address() -> str:
    return os.getenv("GMAIL_ADDRESS", "").strip()


def _looks_like_a_reply(msg: "email.message.EmailMessage") -> bool:
    """A genuine reply carries In-Reply-To/References (set by the replying mail client) or a
    "Re:" subject. Our own first-touch/follow-up messages have neither, so this is what tells
    a real inbound reply apart from our own sent mail resurfacing as unread."""
    if msg.get("In-Reply-To") or msg.get("References"):
        return True
    return msg.get("Subject", "").strip().lower().startswith("re:")


def _extract_candidate_addresses(msg: "email.message.EmailMessage") -> list[str]:
    """Every address this message was actually delivered to, across the headers that might carry
    it - a plus-tagged address survives in at least one of these depending on the mail client."""
    out = []
    for header in ("To", "Delivered-To", "X-Original-To"):
        out += [addr.lower() for _, addr in email.utils.getaddresses([msg.get(header, "")]) if addr]
    return out


def _plain_text(msg: "email.message.EmailMessage") -> str:
    part = msg.get_body(preferencelist=("plain",))
    if part is None:
        return ""
    try:
        return part.get_content().strip()
    except Exception:
        return ""


def check_once(debug: bool = False) -> dict:
    address, app_password = gmail_address(), os.getenv("GMAIL_APP_PASSWORD", "").strip()
    if not address or not app_password:
        return {"checked": 0, "matched": 0, "error": "GMAIL_ADDRESS or GMAIL_APP_PASSWORD is not configured"}

    checked = matched = 0
    details: list[dict] = []
    try:
        conn = imaplib.IMAP4_SSL(IMAP_HOST)
        conn.login(address, app_password)
        conn.select("INBOX")
        status, data = conn.search(None, "UNSEEN")
        if status != "OK":
            conn.logout()
            return {"checked": 0, "matched": 0, "error": "IMAP search failed"}
        # mark everything we're about to look at as seen right away, so a message can never be
        # matched twice even if check_once() is called again before processing finishes
        for msg_id in data[0].split():
            conn.store(msg_id, "+FLAGS", "\\Seen")

        with SessionLocal() as db:
            for msg_id in data[0].split():
                checked += 1
                status, msg_data = conn.fetch(msg_id, "(RFC822)")
                if status != "OK" or not msg_data or not msg_data[0]:
                    details.append({"skipped": "fetch failed"})
                    continue
                msg = email.message_from_bytes(msg_data[0][1], policy=email.policy.default)
                candidates = _extract_candidate_addresses(msg)
                text = _plain_text(msg)
                row = {
                    "subject": msg.get("Subject", ""),
                    "to": msg.get("To", ""),
                    "delivered_to": msg.get("Delivered-To", ""),
                    "candidate_addresses": candidates,
                    "body_length": len(text),
                }
                if not _looks_like_a_reply(msg):
                    row["skipped"] = "does not look like a reply (no Re: subject, no In-Reply-To/References)"
                    details.append(row)
                    continue
                p = None
                for addr in candidates:  # first, try an exact match on the prospect's own address
                    p = db.scalar(select(CampaignProspect).where(func.lower(CampaignProspect.email) == addr))
                    if p is not None:
                        break
                if p is None:  # then, try a +tag whose base matches our own inbox - set by _reply_to_for()
                    my_local, _, my_domain = address.lower().partition("@")
                    for addr in candidates:
                        local, _, domain = addr.partition("@")
                        base, _, tag = local.partition("+")
                        if tag and base == my_local and domain == my_domain:
                            p = db.get(CampaignProspect, tag)
                            if p is not None:
                                break
                if p is None:
                    row["skipped"] = "none of the recipient addresses match a prospect's email"
                    details.append(row)
                    continue
                if not text:
                    row["skipped"] = "no plain-text body found (message may be HTML-only)"
                    details.append(row)
                    continue
                try:
                    replies.receive_reply(db, p.id, "email", text)
                    matched += 1
                    row["matched_to"] = p.id
                    log.info("[GMAIL] matched inbound mail to prospect %s", p.id)
                except Exception as e:
                    row["skipped"] = f"receive_reply failed: {e}"
                    log.warning("[GMAIL] receive_reply failed for %s: %s", p.id, e)
                details.append(row)
        conn.logout()
    except Exception as e:
        log.exception("[GMAIL] poll failed")
        return {"checked": checked, "matched": matched, "error": f"{type(e).__name__}: {e}"}
    result = {"checked": checked, "matched": matched, "error": ""}
    if debug:
        result["details"] = details
    return result


class GmailPoller:
    def __init__(self, interval_seconds: int = 20) -> None:
        self.interval = interval_seconds
        self.stop_flag = threading.Event()

    def start(self) -> None:
        threading.Thread(target=self._loop, daemon=True).start()
        log.info("[GMAIL] poller started, interval=%ds", self.interval)

    def stop(self) -> None:
        self.stop_flag.set()

    def _loop(self) -> None:
        while not self.stop_flag.is_set():
            try:
                check_once()
            except Exception:
                log.exception("[GMAIL] poll tick failed")
            self.stop_flag.wait(self.interval)


poller = GmailPoller()