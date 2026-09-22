"""Tests the poller's address-matching logic offline. Matching is done by looking up a
CampaignProspect whose stored email exactly equals one of the message's recipient addresses -
not by decoding a +tag into an id, since the tag's format differs depending on whether
DemoSource or the manual "point at burner inbox" action generated it. Matching on the full
address sidesteps that entirely."""
import email
import email.policy
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.integrations.gmail import _extract_candidate_addresses, _plain_text


def _make(to: str, body: str = "Sure, let's talk next week.") -> "email.message.EmailMessage":
    raw = f"From: prospect@example.com\r\nTo: {to}\r\nSubject: Re: hello\r\n\r\n{body}\r\n"
    return email.message_from_string(raw, policy=email.policy.default)


def test_extracts_plus_tagged_address():
    msg = _make("buildathon.product+cp179003846259254cf@gmail.com")
    assert "buildathon.product+cp179003846259254cf@gmail.com" in _extract_candidate_addresses(msg)


def test_extracts_display_name_wrapped_address():
    msg = _make("Build-a-thon <buildathon.product+c1790078752090f6ae-0@gmail.com>")
    assert "buildathon.product+c1790078752090f6ae-0@gmail.com" in _extract_candidate_addresses(msg)


def test_falls_back_to_delivered_to_header():
    raw = (
        "From: prospect@example.com\r\n"
        "To: buildathon.product@gmail.com\r\n"
        "Delivered-To: buildathon.product+p42@gmail.com\r\n"
        "Subject: Re: hello\r\n\r\nOkay, sounds good.\r\n"
    )
    msg = email.message_from_string(raw, policy=email.policy.default)
    candidates = _extract_candidate_addresses(msg)
    assert "buildathon.product@gmail.com" in candidates
    assert "buildathon.product+p42@gmail.com" in candidates


def test_addresses_are_lowercased():
    msg = _make("Buildathon.Product+P1@Gmail.com")
    assert "buildathon.product+p1@gmail.com" in _extract_candidate_addresses(msg)


def test_extracts_plain_text_body():
    msg = _make("buildathon.product+p1@gmail.com", body="Yes I'm interested, tell me more.")
    assert _plain_text(msg) == "Yes I'm interested, tell me more."


if __name__ == "__main__":
    test_extracts_plus_tagged_address()
    test_extracts_display_name_wrapped_address()
    test_falls_back_to_delivered_to_header()
    test_addresses_are_lowercased()
    test_extracts_plain_text_body()
    print("gmail matching tests OK")