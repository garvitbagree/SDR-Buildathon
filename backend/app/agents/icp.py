import json
import logging

from sqlalchemy.orm import Session

from app.agents.base import build_system, empty_meta, provider
from app.agents.schemas import IcpOut
from app.integrations.dronahq import run_icp
from app.integrations.dronahq.client import get_config
from app.llm import generate_json, model_for
from app.models.tables import Campaign, CampaignProspect

log = logging.getLogger("sdr.icp")

ROLE = (
    "ICP Fitment Agent. Decide whether the prospect fits this campaign's ideal customer profile. "
    "Do not research, write messages or choose channels."
)

# Scoring guide from the prototype, applied to whichever campaign is running.
GUIDE = (
    "Score 0 to 100 against campaign_icp (roles, industries, geography, company size, exclusions):\n"
    "- 90 to 100: perfect fit, right seniority, industry, size and geography.\n"
    "- 70 to 89: strong fit, one factor is slightly off.\n"
    "- 50 to 69: weak fit, for example a junior role or a poor industry match.\n"
    "- below 50: reject, for example a wrong function (HR, marketing) or a clear geography or size mismatch.\n"
    "qualified is true only when the score is 60 or more AND geography and role match the campaign. "
    "A wrong country or an excluded company is never qualified, whatever the score. "
    "Infer likely pain points from the role and company type, and list them in pain_points. "
    "If company size or another key field is missing, list it in missing_information and set requires_human_review=true."
)

# Title keywords that are almost never the right buyer for a B2B SDR campaign, unless the
# campaign is itself targeting that function (checked against target_roles below).
ROLE_EXCLUDE_KEYWORDS = ("recruiter", "human resources", "hr business partner", "hr manager",
                          "marketing manager", "sales director", "product designer")

# Common short forms so "USA" and "United States" (or "UK" and "United Kingdom") aren't
# treated as a mismatch. Deliberately small: an unmapped string just falls through unchanged
# and is compared as-is, so this can only ever make the check less strict, never more.
GEO_ALIASES = {
    "usa": "united states", "us": "united states", "u.s.": "united states", "u.s.a.": "united states",
    "uk": "united kingdom", "u.k.": "united kingdom",
    "uae": "united arab emirates",
}


def _norm_geo(value: str | None) -> str:
    v = (value or "").strip().lower()
    return GEO_ALIASES.get(v, v)


def nlp_precheck(c: Campaign, p: CampaignProspect) -> dict | None:
    """Deterministic, pre-LLM rejection checks that don't need a model call.

    Returns a rejection dict (same shape IcpOut.model_dump() produces) when the prospect can be
    rejected with certainty, or None when it needs the real scoring agent (DronaHQ or local LLM).
    Kept intentionally conservative: it only ever rejects, never qualifies, so a false positive
    here can only make us call the LLM more, not less.
    """
    cfg = c.pipeline_config or {}
    reasons: list[str] = []

    geo_norm, loc_norm = _norm_geo(c.geography), _norm_geo(p.location)
    if geo_norm and loc_norm and geo_norm not in loc_norm and loc_norm not in geo_norm:
        reasons.append(f"Geography exclusion: prospect is in {p.location!r}, campaign targets {c.geography!r}")

    if c.exclusions and p.company:
        excluded = [e.strip().lower() for e in c.exclusions.split(",") if e.strip()]
        if p.company.strip().lower() in excluded:
            reasons.append(f"Excluded company: {p.company!r} is on the campaign's exclusion list")

    lo, hi = cfg.get("companySizeMin"), cfg.get("companySizeMax")
    if p.company_size is not None and (
        (lo is not None and p.company_size < lo) or (hi is not None and p.company_size > hi)
    ):
        reasons.append(f"Company size {p.company_size} is outside the campaign's {lo}-{hi} range")

    if p.title:
        title_low = p.title.strip().lower()
        target_low = " ".join(c.target_roles or []).lower()
        for kw in ROLE_EXCLUDE_KEYWORDS:
            if kw in title_low and kw not in target_low:
                reasons.append(f"Role exclusion: {p.title!r} matches excluded function {kw!r}")
                break

    if not reasons:
        return None

    return IcpOut(
        qualified=False, score=0, reasons=reasons, pain_points=[],
        missing_information=[], requires_human_review=False,
    ).model_dump()


def run(db: Session, c: Campaign, p: CampaignProspect) -> tuple[IcpOut, dict]:
    cfg = c.pipeline_config or {}

    pre = nlp_precheck(c, p)
    if pre is not None:
        return IcpOut(**pre), empty_meta("nlp_precheck", note="Rejected by deterministic pre-filter, no LLM call made")

    payload = {
        "campaign_icp": {
            "roles": c.target_roles,
            "industries": cfg.get("industries") or [c.icp],
            "geography": c.geography,
            "company_size": {"min": cfg.get("companySizeMin"), "max": cfg.get("companySizeMax")},
            "pain_points": cfg.get("painPoints", []),
            "company_criteria": c.company_criteria,
            "exclusions": c.exclusions,
        },
        "prospect": {
            "name": p.name,
            "job_title": p.title,
            "company": p.company,
            "industry": p.industry,
            "location": p.location,
            "company_size": p.company_size,
        },
    }

    note = ""
    drona_url, _ = get_config("ICP")
    use_drona = provider("ICP_PROVIDER") == "dronahq" or (drona_url and provider("ICP_PROVIDER") != "local")
    if use_drona:
        try:
            out = run_icp(c, p)
            return out, empty_meta("dronahq")
        except Exception as e:  # any failure falls back, the demo must not stall
            note = f"DronaHQ failed ({type(e).__name__}), used the local agent"
            log.warning("[ICP] %s: %s", p.id, note)

    model, tier = model_for(db, "ICP fitment scoring")
    user = (
        GUIDE + "\n"
        'Return JSON: {"qualified": bool, "score": int, "reasons": [str], "pain_points": [str], '
        '"missing_information": [str], "requires_human_review": bool}\n\n'
        "INPUT:\n" + json.dumps(payload)
    )
    out, meta = generate_json(model, tier, build_system(db, c.id, "icp_fitment", ROLE), user, IcpOut, temperature=0.1)
    meta.update(source="local", note=note)
    return out, meta