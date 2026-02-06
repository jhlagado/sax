# SASS Design Stress Test

Note (Feb 2026): this document predates the current naming. “SASS” here refers to an earlier name for what is now the CPU-agnostic **SAX** category; the Z80-specific instance is **ZAX**.

Nice — this is already a **very sharp synthesis**, and it’s a genuinely usable project anchor. I’ll treat it not as something to praise, but as something to **stress-test** the way you asked: where are the tensions, hidden assumptions, and interesting forks in the road? I’ll also try to surface ideas you might not yet have fully articulated.

I’ll go section by section, but quite tight.

---

## The big picture: what I think is doing real work here

Before critiquing details, here are **three strong, coherent commitments** that actually define SASS — everything else orbits these:

1. **Registers are the language, not memory.**
   That’s the heart of this design. You are not building “C for Z80”; you are building a *register language with structure*. That’s good — but it is also the most constraining choice you’ve made.

2. **Structure is semantic, not textual.**
   By banning macros and insisting on an abstract syntax tree, you’re committing to a *compiler*, not a preprocessor. That’s a real bet, but a meaningful one.

3. **Stack frames are first-class, not incidental.**
   The IX-based frame with self-description is a deep design move, not a cosmetic one. If you keep this, it will shape everything else.

If you ever feel lost, those three principles are your compass.

---

## Where I think your model has real tension

### 1) “Flat language” vs “stack frames”

You say you want:

* little nesting
* simple control flow
* assembly-like feel

…but you are also leaning toward:

* real stack frames
* arguments, locals, prologue/epilogue
* possibly variadics

Those are **two very different cultures** of Z80 programming.

Right now, SASS feels like it’s trying to be:

> “A simple, flat assembler language… **that secretly behaves like C under the hood.**”

That’s not wrong — but you should decide consciously whether the frame is:

* a *necessary evil for procedures*, or
* the **core organizing idea** of the language.

If it’s the second, then SASS stops being “assembler with sugar” and becomes “a tiny systems language that happens to target Z80.”

That’s fine — but you should own it.

---

### 2) 16-bit everywhere — does it actually work?

Your instinct that “16-bit is the default” is good, but there are three cracks here:

1. **The Z80 is not naturally 16-bit.**
   HL is convenient, but most real work still falls back to A + 8-bit registers very quickly. You may find that SASS looks elegant on paper and awkward in practice.

2. **Pointers vs data is still ambiguous.**
   Even if “100 means a word,” you will still constantly need to say:

   * treat this as an address
   * treat this as a number
   * treat this as a pointer to bytes

   The language will need richer types than you currently admit.

3. **You’re implicitly drifting toward a type system.**
   As soon as you care about “low byte of X” and “high byte of X” as first-class, you’re halfway to a structured type model whether you like it or not.

A useful thought experiment:
Could SASS eventually have:

* WORD
* BYTE
* ADDRESS
* POINTER

even if they’re mostly compile-time annotations?

---

### 3) Procedures “look like opcodes” — is that really what you want?

You wrote:

```asm
myproc HL, DE
```

This is elegant, but there’s a trap:

Real Z80 opcodes are **not regular**. They have wildly different arities, side effects, and conventions.

If user-defined procedures look exactly like opcodes, you may blur a line that is actually helpful:

* opcodes = primitive machine operations
* procedures = structured abstractions

You might later regret making them *syntactically indistinguishable*.

An alternative you might consider (not saying you should adopt it):

```asm
call myproc(HL, DE)
```

Still clean — but keeps a conceptual boundary.

---

### 4) Your stack-frame idea is clever… but risky

The “self-describing frame” idea is genuinely interesting:

* push argument count
* push return address
* push local count

That could enable some neat generic machinery.

But two problems you’ll hit:

1. **Performance cost on tiny machines.**
   Z80 code is extremely sensitive to overhead. Your prologue may become heavier than your actual logic.

2. **It biases the language toward “function-heavy” code.**
   Many classic Z80 programs avoid deep stacks entirely. You’re making that style second-class.

Not a flaw — just a strategic choice you should be aware of.

---

## Where I think you haven’t decided yet (but need to)

Here are the real open questions I think you’re circling:

### A. Is SASS a *systems language* or a *nice assembler*?

Two possible futures:

**Path 1 — Nice assembler**

* Minimal runtime
* Thin stack frames
* Mostly hand-optimizable output
* Feels like “better assembly”

**Path 2 — Tiny systems language**

* Real frame discipline
* Clear calling convention
* Possibly even local scope rules
* Feels like “C-lite for Z80”

Right now, you are straddling both.

You’ll need to pick.

---

### B. How much typing do you actually want?

Even if you don’t want “types,” SASS is already drifting toward them:

* word vs byte
* address vs value
* register vs memory

You could:

* fight this (purely syntactic language), or
* embrace it (a very small, pragmatic type system).

My guess? You’ll end up embracing it.

---

### C. What is Debug80 for, really?

Two very different possibilities:

1. **SASS is just a front end that emits binaries.**
   Debug80 remains the real power tool.

2. **SASS + Debug80 become a single environment.**
   In this world, SASS might:

   * embed debug metadata
   * preserve variable names
   * support symbolic stepping

That second path is far more interesting.

---

## Ideas you might like (not prescriptions, just sparks)

A few concrete possibilities you could play with:

### 1) “Register-first” procedures

Instead of thinking in terms of stack arguments, you might allow two styles:

* register-passing for hot paths
* stack-passing only when necessary

Z80 would thank you.

---

### 2) Two levels of procedure

You could have:

* FAST procedures (register-based, minimal prologue)
* FRAMED procedures (IX-based, with locals)

Same language, two flavors.

---

### 3) Make byte/word choice explicit but lightweight

For example:

```asm
word [100]   ; fetch 16-bit
byte [100]   ; fetch 8-bit
low(X)
high(X)
```

Still assembler-y, but clearer.

---

### 4) Think about “structured labels”

Instead of raw labels, you might end up with named blocks tied to structure:

```asm
WHILE cond
  ...
END
```

with the compiler inventing hidden labels. That’s very much in your spirit.

---

## If I had to poke one sharp question at you

Here’s the most important challenge to your design:

> Are you really building “structured assembly”…
> or are you slowly inventing a tiny compiled language that happens to run on a Z80?

Neither answer is wrong — but the answer changes everything.

If you want, next step I can:

* challenge this summary by **designing one concrete example program** in SASS and seeing where it creaks, or
* take your stack-frame idea and propose a **precise memory layout**, so we can test whether it’s actually usable.
