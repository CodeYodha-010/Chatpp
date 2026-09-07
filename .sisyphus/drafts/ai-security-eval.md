# Draft: AI Security / Jailbreak-Resistance Evaluation

## Requirements (confirmed)
- User built custom chatbot (own AI model, ChatGPT-like)
- Core risk: model adds misinfo / hallucinates content in documents that does not exist (unethical misinfo)
- User wants to understand post-jailbreak answer behavior ("how they give ans after jailbreak")
- Clarified boundary: NO working jailbreak prompts will be provided; evaluation will use safe descriptions + public benchmarks

## Important Boundary (policy + safety)
- WILL NOT provide a working universal jailbreak prompt or highly effective jailbreak payload that bypasses any model. That is disallowed even for self-testing.
- CAN help with: defensive evaluation plan, red-team harness design, test categories at high level, public safety benchmarks, guardrail hardening, logging/monitoring.

## Technical Decisions
- Model type: custom generative chatbot, NO RAG (pure generative) = high hallucination risk
- Risk flows: BOTH (1) upload-then-QA and (2) generate/edit docs
- Failure of concern: adds non-existent / false info into documents (misinfo), unethical output
- User declined automated harness ("no") -> default to lightweight manual checklist + guardrail hardening plan unless they say otherwise

## Research Findings
- None yet. Will NOT research working jailbreak strings. May research defensive eval frameworks only if user agrees.

## Open Questions
- User chose explain-only on 2026-09-06, no plan file yet. If they later say "make it into work plan", generate defensive misinfo-eval plan.

## Scope Boundaries
- INCLUDE: eval plan, test harness structure, failure definitions, guardrail recommendations, evidence logging
- EXCLUDE: any working universal jailbreak prompt, step-by-step bypass instructions, obfuscation payloads, DAN-style prompts
