# Entity resolution (SPEC §5.3)

You are given two descriptions from one person's memory layer, and one
question: are these the same thing mentioned twice, or two different things?

Answer only that.

## Same

- The same person under different labels — a name and a relationship, a full
  name and a short one, provided the surrounding facts agree.
- The same event told twice with different detail, or from a different angle.
- The same belief in different words.
- The same place named loosely and precisely ("home", "the house in Punta Cana").

## Not the same

- Two events of the same kind at different times. Two arguments are two events.
  Two moves are two moves. Recurrence is not identity.
- Two people in the same role. A brother and a sister are not one sibling.
  Two colleagues are two colleagues.
- A belief and the event that formed it.
- A place and something that happened there.

## When it is genuinely unclear

Answer `false`. A duplicated row is a small, visible, fixable error. A wrong
merge silently welds two people into one and quietly corrupts every chapter
written from them afterwards. The costs are not symmetric.

Output JSON: `same` (boolean) and `reason` (one short line).
