"""Ties intent classification, entity resolution and the tool functions together.

Two deliberate design choices worth stating explicitly:
1. Only ONE LLM call happens per turn for READ/AI_OPERATION/ACTION - the intent-classification
   call. The reply text itself is composed with plain Python templates from the tool's own
   output, never a second generative call. This is a stronger anti-hallucination guarantee than
   summarizing tool results through another LLM pass would give, at the cost of the reply
   sounding a little more templated than a fully conversational bot. KNOWLEDGE is the one
   exception - answering from retrieved docs is inherently generative, so it gets its own
   synthesis call inside tools.knowledge_lookup().
2. AI_OPERATION (re-run an agent, draft a follow-up) does NOT require confirmation; ACTION
   (pause/resume a campaign, approve/reject a prospect) always does. This matches the actual
   examples given in the spec - none of the AI-operation test cases show a confirm step, and
   every action one either does or should. Re-running an agent recomputes data; approving or
   pausing changes what the system will autonomously do next, which is the higher-stakes move.
"""
from sqlalchemy.orm import Session

from app.chatbot import context, memory, tools
from app.chatbot.prompts import INTENT_GUIDE, SYSTEM_PROMPT, IntentOut
from app.llm import generate_json, model_for
from app.schemas.chatbot import ChatIn, ChatOut
from app.services.campaign_service import ServiceError

CONFIRM_WORDS = {"yes", "yeah", "yep", "sure", "confirm", "confirmed", "do it", "go ahead", "proceed"}
CANCEL_WORDS = {"no", "nope", "cancel", "nevermind", "never mind", "stop", "don't"}

READ_TOOLS = {"get_campaign_stats", "search_prospects", "get_prospect", "explain_prospect", "get_pending_reviews"}
AI_TOOLS = {"rerun_icp", "rerun_research", "generate_followup"}
ACTION_TOOLS = {"pause_campaign", "resume_campaign", "approve_prospect", "reject_prospect"}

ACTION_DESCRIPTIONS = {
    "pause_campaign": "pause",
    "resume_campaign": "resume",
    "approve_prospect": "approve",
    "reject_prospect": "reject",
}


def _classify(db: Session, convo: dict, message: str) -> IntentOut:
    model, tier = model_for(db, "SDR Copilot intent classification")
    history_txt = "\n".join(f"{t['role']}: {t['content']}" for t in convo["history"][-6:])
    user = (
        INTENT_GUIDE
        + f"\n\nConversation so far:\n{history_txt or '(none)'}\n\nManager's message: {message}\n\n"
        'Return JSON: {"intent": str, "tool": str, "prospect_name": str, "campaign_name": str, '
        '"query": str, "needs_clarification": bool, "clarification": str}'
    )
    out, _meta = generate_json(model, tier, SYSTEM_PROMPT, user, IntentOut, temperature=0.1)
    return out


def _reply(message: str, conversation_id: str, intent: str, **kw) -> ChatOut:
    return ChatOut(message=message, conversation_id=conversation_id, intent=intent, **kw)


def handle(db: Session, body: ChatIn) -> ChatOut:
    cid, convo = memory.get_or_create(body.conversation_id)
    if body.campaign_id:
        convo["campaign_id"] = body.campaign_id
    if body.prospect_id:
        convo["prospect_id"] = body.prospect_id
    memory.add_turn(convo, "user", body.message)

    # A pending confirmation always wins over re-classifying the new message.
    if convo.get("pending_action"):
        low = body.message.strip().lower()
        pending = convo["pending_action"]
        if any(w in low for w in CONFIRM_WORDS):
            memory.set_pending(convo, None)
            try:
                fn = getattr(tools, pending["tool"])
                fn(db, pending["arg"])
                reply = f"Done - {pending['description']}."
                out = _reply(reply, cid, "ACTION", tool_calls=[pending["tool"]])
            except ServiceError as e:
                out = _reply(f"Couldn't do that: {e.message}", cid, "ACTION", tool_calls=[pending["tool"]])
            memory.add_turn(convo, "assistant", out.message)
            return out
        if any(w in low for w in CANCEL_WORDS):
            memory.set_pending(convo, None)
            out = _reply("Okay, cancelled.", cid, "ACTION")
            memory.add_turn(convo, "assistant", out.message)
            return out
        # Anything else: drop the pending action and fall through to classify the new message normally.
        memory.set_pending(convo, None)

    parsed = _classify(db, convo, body.message)

    if parsed.needs_clarification or parsed.intent == "UNKNOWN":
        msg = parsed.clarification.strip() or "Could you say a bit more about what you'd like me to do?"
        out = _reply(msg, cid, parsed.intent)
        memory.add_turn(convo, "assistant", out.message)
        return out

    camp = context.resolve_campaign(db, convo.get("campaign_id") if not parsed.campaign_name else None, parsed.campaign_name)
    if camp.obj is None and convo.get("campaign_id") and not parsed.campaign_name:
        camp = context.resolve_campaign(db, convo["campaign_id"], None)
    if camp.ambiguous:
        out = _reply(f"I found more than one campaign matching that: {', '.join(camp.ambiguous)}. Which one?", cid, parsed.intent)
        memory.add_turn(convo, "assistant", out.message)
        return out

    prospect = context.resolve_prospect(
        db, convo.get("prospect_id") if not parsed.prospect_name else None, parsed.prospect_name,
        camp.obj.id if camp.obj else None,
    )
    if prospect.obj is None and convo.get("prospect_id") and not parsed.prospect_name:
        prospect = context.resolve_prospect(db, convo["prospect_id"], None, None)
    if prospect.ambiguous:
        out = _reply(f"More than one prospect matches that: {', '.join(prospect.ambiguous)}. Which one did you mean?", cid, parsed.intent)
        memory.add_turn(convo, "assistant", out.message)
        return out

    if camp.obj:
        convo["campaign_id"] = camp.obj.id
    if prospect.obj:
        convo["prospect_id"] = prospect.obj.id

    try:
        out = _dispatch(db, parsed, camp.obj, prospect.obj, convo, cid)
    except ServiceError as e:
        out = _reply(f"Couldn't do that: {e.message}", cid, parsed.intent)
    memory.add_turn(convo, "assistant", out.message)
    return out


def _dispatch(db, parsed: IntentOut, camp, prospect, convo: dict, cid: str) -> ChatOut:
    tool = parsed.tool

    if parsed.intent == "KNOWLEDGE" or tool == "knowledge_lookup":
        result = tools.knowledge_lookup(db, camp.id if camp else None, parsed.query or "")
        return _reply(result["answer"], cid, "KNOWLEDGE", sources=result.get("sources", []),
                       tool_calls=["knowledge_lookup"], data_type="knowledge_answer", data=result)

    if tool in READ_TOOLS:
        return _handle_read(db, tool, camp, prospect, cid)

    if tool in AI_TOOLS:
        return _handle_ai_op(db, tool, camp, prospect, cid)

    if tool in ACTION_TOOLS:
        return _handle_action(tool, camp, prospect, convo, cid)

    return _reply("I'm not sure which of my tools handles that yet - try asking about prospects, "
                  "campaign stats, pending reviews, or a control action like pausing a campaign.",
                  cid, parsed.intent)


def _handle_read(db, tool, camp, prospect, cid) -> ChatOut:
    if tool == "get_campaign_stats":
        if camp is None:
            return _reply("Which campaign do you mean?", cid, "READ")
        data = tools.get_campaign_stats(db, camp)
        msg = (f"{camp.name}: {data['discovered']} discovered, {data['qualified']} qualified, "
               f"{data['sent']} contacted, {data['awaitingReview']} awaiting review, {data['failed']} failed. "
               f"Model cost so far: ${data['cost']['usd']:.4f}.")
        return _reply(msg, cid, "READ", tool_calls=[tool], data_type="campaign_stats", data=data)

    if tool == "search_prospects":
        rows = tools.search_prospects(db, camp.id if camp else None)
        if not rows:
            return _reply("No prospects match that.", cid, "READ", tool_calls=[tool], data_type="prospect_list", data=[])
        names = ", ".join(f"{p['name']} ({p['state'].replace('_', ' ').lower()})" for p in rows[:8])
        more = f", and {len(rows) - 8} more" if len(rows) > 8 else ""
        return _reply(f"{len(rows)} prospect(s): {names}{more}.", cid, "READ", tool_calls=[tool],
                       data_type="prospect_list", data=rows)

    if tool in ("get_prospect", "explain_prospect"):
        if prospect is None:
            return _reply("I couldn't find a prospect by that name - could you check the spelling, "
                          "or is this in a different campaign?", cid, "READ")
        msg = tools.explain_prospect(prospect)
        data = tools.get_prospect(db, prospect)
        return _reply(msg, cid, "READ", tool_calls=[tool], data_type="prospect", data=data)

    if tool == "get_pending_reviews":
        rows = tools.get_pending_reviews(db, camp.id if camp else None)
        if not rows:
            return _reply("Nothing is waiting for review right now.", cid, "READ", tool_calls=[tool],
                          data_type="review_list", data=[])
        names = ", ".join(r["prospectName"] or "unknown" for r in rows[:8])
        return _reply(f"{len(rows)} item(s) waiting: {names}.", cid, "READ", tool_calls=[tool],
                       data_type="review_list", data=rows)

    return _reply("I don't have that lookup yet.", cid, "READ")


def _handle_ai_op(db, tool, camp, prospect, cid) -> ChatOut:
    if prospect is None:
        return _reply("Which prospect should I run that for?", cid, "AI_OPERATION")
    if camp is None:
        return _reply("I couldn't work out which campaign this prospect belongs to.", cid, "AI_OPERATION")

    if tool == "rerun_icp":
        r = tools.rerun_icp(db, camp, prospect)
        verdict = "qualifies" if r["qualified"] else "doesn't qualify"
        return _reply(f"Re-ran ICP fitment for {prospect.name}: {verdict} now, score {r['score']}.",
                       cid, "AI_OPERATION", tool_calls=[tool], data_type="icp_result", data=r)

    if tool == "rerun_research":
        r = tools.rerun_research(db, camp, prospect)
        return _reply(f"Re-ran research for {prospect.name}. {r['companySummary']}".strip(),
                       cid, "AI_OPERATION", tool_calls=[tool], data_type="research_result", data=r)

    if tool == "generate_followup":
        r = tools.generate_followup(db, camp, prospect)
        if not r["drafted"]:
            return _reply(f"I didn't draft one: {r['reason']}.", cid, "AI_OPERATION", tool_calls=[tool])
        return _reply(f"Drafted a follow-up for {prospect.name}, waiting for your approval:\n\n{r['body']}",
                       cid, "AI_OPERATION", tool_calls=[tool], data_type="followup_draft", data=r)

    return _reply("I don't have that operation yet.", cid, "AI_OPERATION")


def _handle_action(tool, camp, prospect, convo, cid) -> ChatOut:
    if tool in ("pause_campaign", "resume_campaign"):
        if camp is None:
            return _reply("Which campaign do you mean?", cid, "ACTION")
        arg, target = camp.id, camp.name
    else:
        if prospect is None:
            return _reply("Which prospect do you mean?", cid, "ACTION")
        arg, target = prospect.id, prospect.name

    verb = ACTION_DESCRIPTIONS[tool]
    description = f"{verb} {target}"
    memory.set_pending(convo, {"tool": tool, "arg": arg, "description": description})
    status_note = f" It's currently {camp.status}." if tool in ("pause_campaign", "resume_campaign") and camp else ""
    return _reply(f"I'll {verb} {target}.{status_note} Confirm?", cid, "ACTION", requires_confirmation=True,
                  action={"tool": tool, "target": target})