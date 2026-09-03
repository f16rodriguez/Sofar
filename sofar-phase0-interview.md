# Sofar — Phase 0: The Onboarding Interview

*Goal: twenty minutes in, three chapters out. Twenty testers. Two numbers decide whether to build.*

---

## 1. What Phase 0 is

No app. The interview runs as a conversation — you asking, or a scripted model asking — recorded, transcribed, extracted, and written into three chapters within 24 hours. The tester gets a PDF. You get two numbers.

**Pass:** ≥70% read all three chapters to the end. ≥40% come back on day seven without being prompted.
**Fail:** either number misses. Then the problem is the interview or the writing, and no app fixes it.

---

## 2. Interview rules (these become the interviewer system prompt)

1. One question at a time. Never two in one breath.
2. **Specifics only.** Every question asks for a day, a place, a person, a sentence someone said, a number. Never "how do you feel about," never "what do you think of," never anything about the book, chapters, or the process.
3. Follow-ups quote the user's own words back. "You said *the money was fine*. Was it?"
4. Maximum two follow-ups per question, then move on. Depth is invited, not extracted.
5. Silence is allowed. If the user pauses, wait. If they say "skip," skip without comment.
6. Never evaluate, praise, console, or interpret. No "that must have been hard." No "great answer." The interviewer is a recorder with good questions.
7. Stance and rationale are always reached through an event. Never ask for a belief directly; ask for the moment the belief showed up.
8. Track time. Twenty minutes is the promise. Announce the last question as the last question.
9. Do not ask about anything the user has not opened. If they mention a divorce, you may ask about the divorce. If they haven't, you don't.

---

## 3. The script

Five blocks, present working backward. Block 0 is the census — fast, factual, no follow-ups. Then twelve questions, each with its two allowed follow-ups. The interviewer uses the follow-ups only when the first answer is thin or abstract.

### Block 0 — Foundations (2 min, rapid, no follow-ups)

Asked plainly, one after another. These are facts the book needs to exist — the model can't write "he" or "she" or name a city without them. The interviewer does not react to any answer here; it just moves to the next.

- What should the book call you — your name, a nickname, or nothing?
- He, she, or they?
- How old are you?
- Where were you born, and where do you live now?
- Anywhere in between? Just the list.
- What do you do for work right now, and for how long?
- Who lives with you?
- Who's still around from the family you grew up in?

Anything answered here is context, not story. Nothing from Block 0 becomes a chapter opening. If the user volunteers a story during Block 0 ("I moved to Denver after the divorce"), the interviewer notes it and returns to it in Block 2 or 4 — it does not chase it now.

### Block 1 — Now (4 min)

**Q1.** Walk me through yesterday. From the moment you woke up to the moment you fell asleep. Not a typical day — yesterday.
- *Follow-up:* What time was that? Who else was there?
- *Follow-up:* What part of yesterday did you skip just now?

**Q2.** What's the thing you keep coming back to this week — the thought that shows up when you're driving or in the shower?
- *Follow-up:* When did it first show up? What were you doing?
- *Follow-up:* Who knows about it?

**Q3.** Who did you talk to most this week, and what was the last thing you talked about?
- *Follow-up:* What did they say, as close to word for word as you can get?
- *Follow-up:* What did you not say back?

### Block 2 — The most recent turning point (5 min)

**Q4.** What's the most recent decision that changed how your days look? Not the biggest — the most recent. When exactly did you make it?
- *Follow-up:* Where were you when you decided? What did you do in the next hour?
- *Follow-up:* What was the day before like?

**Q5.** Who did you tell first? What did you leave out when you told them?
- *Follow-up:* Why them?
- *Follow-up:* What did they say?

**Q6.** What did you think would happen, and what actually happened?
- *Follow-up:* What surprised you?
- *Follow-up:* Is it done, or still happening?

### Block 3 — Certainties (5 min)

**Q7.** Tell me something you're sure about that most people around you aren't.
- *Follow-up:* Who specifically disagrees? What do they say?
- *Follow-up:* Say it the way you'd say it to them.

**Q8.** When did you first know that? Where were you, and what had just happened?
- *Follow-up:* How old were you?
- *Follow-up:* Did you say it out loud that day, or later?

**Q9.** What has believing that cost you? A job, a relationship, a conversation you didn't have.
- *Follow-up:* Would you pay it again?
- *Follow-up:* When was it wrong?

### Block 4 — The pull backward (4 min)

**Q10.** What's the earliest memory that connects to what you just told me?
- *Follow-up:* What did the room look like?
- *Follow-up:* Who was there who isn't around anymore?

**Q11.** Who in your life would tell that story differently?
- *Follow-up:* How would they tell it?
- *Follow-up:* Have you ever heard them tell it?

**Q12. (announced as the last question)** What's one thing that belongs in this book that you've never said out loud? You can skip this one.
- *No follow-ups.* Whatever they say, the interviewer says "thank you" and ends.

---

## 4. Extraction schema

Run on the transcript before any chapter is written. This is the memory layer in its first form. Every entry links to the transcript span it came from.

```
foundations: book_name (or none), pronoun, age, birthplace, current_city, prior_cities,
             occupation, tenure, household, family_of_origin_present
people:      name_or_role, relationship, first_mentioned_at, what_they_said (quotes)
places:      name, when, what_happened_there
events:      what, when (as precise as stated), where, who, outcome, transcript_span
stances:     statement (user's words), rationale (user's words), origin_event, date_stated
costs:       what_the_stance_cost, stated_by_user
open_threads: thing_mentioned_without_resolution, times_mentioned
voice:       sentence_length, vocabulary_level, humor (yes/no, kind), what_they_avoid,
             phrases_they_repeat, how_they_refer_to_themselves
unsaid:      Q12 answer, verbatim, flagged private
```

Rules: nothing enters the schema that the user didn't say. Inference is marked `inferred:` and never reaches prose. Q12 is stored but never used in chapters without an explicit yes.

---

## 5. Chapter generation

Three chapters from session one. **Opus-class, no exceptions** — these three chapters are the conversion moment, and the cost is a one-time ~$0.40 per user. Third person by default for Phase 0 (it's the stronger emotional effect and the cleanest test); offer first person as a toggle in the PDF email.

**Prologue — Now.** Built from Block 1. Opens in scene — yesterday morning, a real time, a real place. Establishes the narrator's voice and the thought they keep circling. Ends on the thing they skipped.

**Chapter I — The decision.** Built from Block 2. Opens on the moment of deciding, not the backstory. Who they told, what they left out. Ends on the gap between what they expected and what happened.

**Chapter II — What he knows.** Built from Blocks 3 and 4. Opens on the certainty stated in the user's own phrasing. Goes back to the day it was learned, then to the earliest memory. Ends with the person who would tell it differently — unresolved.

**Prose rules for the model:**
- Use only what is in the schema. Every sentence traceable to a transcript span. No invented weather, no invented dialogue, no filler emotion.
- Open every chapter in a specific scene. Never open with summary.
- End every chapter on a turn or an open question, never on a moral.
- Match the voice profile: sentence length, vocabulary, humor. If the user is dry, the prose is dry.
- Quote the user directly at least twice per chapter, marked as their words.
- Where the user was vague, the prose is vague in the same place. Don't fill gaps.
- 600–900 words per chapter. Three chapters is roughly 2,500 words, ten to twelve pages.
- Never interpret, diagnose, or explain the person to themselves. Scribe, not editor.

---

## 6. Test protocol

**Recruit twenty.** Mix of ages 25–45, at least half strangers or friends-of-friends, no more than five close friends. Close friends will be kind. Strangers are the number.

**Run it.** You interview, by voice, using the script and rules exactly. Record. Twenty minutes, hard stop. Transcribe with a standard speech-to-text API. Run extraction, then chapter generation. Read the output once for factual errors against the transcript — fix nothing else.

**Deliver within 24 hours.** PDF, no explanation, one line: "Here are the first three chapters. Tell me the sentence that's wrong." That question is deliberate: it makes them read closely, it gives you the accuracy signal, and it tells you whether they read to the end.

**Measure.**
- *Read-through:* they name a sentence from Chapter II, or answer a specific question about it. Target ≥70%.
- *Day-seven return:* send nothing. Count who messages you about it, unprompted, within seven days. Target ≥40%.
- *Qualitative, ask on day eight:* "Which sentence was true in a way you hadn't said yourself?" If most people have one, the model is doing the thing. If nobody does, the prose is a summary, not a book.

**Log per tester:** minutes used, questions reached, follow-ups used, words in transcript, words in output, factual errors, read-through (y/n), day-seven return (y/n), the sentence they named.

---

## 7. What Phase 0 does not test

Retention past a week, the daily question, pricing, the marketplace. It tests one thing: whether twenty minutes of the right questions, written well, makes a person want to keep going. Everything else is downstream of that.
