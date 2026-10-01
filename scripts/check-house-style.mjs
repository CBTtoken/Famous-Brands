// Fails if an em dash reaches a string a person can read.
//
// Ported on 1 October 2026 from DigitalFlyer Growth
// (scripts/check-house-style.mjs), unchanged apart from the allow list, the
// Growth-only banned words and its Supabase half, which this app does not
// have. The handoff's rule is the same: no em dashes anywhere in any copy the
// system shows. The notes below are Growth's and still explain the scanner.
//
// Dewald has asked for this four separate times now, and it has crept back
// in every time. The previous version of this check only looked at email
// templates, which is why a sweep in July found em dashes in the onboarding
// wizard, the events forms, the review flow, every member page's section
// headings, and the AI prompt that drafts member page copy.
//
// The hard part is telling a string from a comment. There are roughly a
// thousand em dashes in this codebase's comments and none of them matter:
// nobody reads a comment, and a check that fails on things nobody cares
// about gets switched off within a week. A line-based filter cannot do it,
// because most comments here run over several lines and only the first one
// starts with a marker.
//
// So this walks the file character by character, tracking whether it is
// inside a string, a template literal, a line comment or a block comment,
// and only reports what survives. Skipping strings also means a URL's "//"
// is not mistaken for the start of a comment.
import { readFileSync, readdirSync, statSync } from "node:fs";

const ROOTS = ["src", "scripts"];
const EXTENSIONS = /\.(ts|tsx|js|jsx|mjs)$/;

/**
 * Every way to write a dash that a reader sees as a dash.
 *
 * The literal character is only one of them. The first version of this
 * check looked for that alone and passed, while the Standing 365 page was
 * live with `&mdash;` in its opening paragraph, rendering exactly the
 * punctuation the rule forbids. Found by reading the rendered page rather
 * than the source, which is the whole argument for checking output.
 *
 * JSX entities, numeric entities in either base, and JavaScript escapes all
 * reach the screen identically, so all of them are the same violation.
 */
const DASH = /[–—]|&mdash;|&ndash;|&#8212;|&#8211;|&#x201[34];|\\u201[34]/i;

const ALLOWED = new Set([
  // Names the character it checks for, in order to forbid it.
  "scripts/check-house-style.mjs",
]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTENSIONS.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Whether the slash at `pos` opens a regex literal rather than dividing.
 *
 * The standard heuristic: look back past whitespace at the last meaningful
 * character. If it could end an expression (a name, a number, a closing
 * bracket) then the slash is division. Anything else and it is a regex.
 *
 * The keyword list is the exception that has to be named, because those end
 * in a letter and so look like the end of an expression while actually
 * expecting one to follow.
 */
function startsRegex(src, pos) {
  let j = pos - 1;
  while (j >= 0 && /\s/.test(src[j])) j--;
  if (j < 0) return true;

  const prev = src[j];
  if (/[)\]}]/.test(prev)) return false;
  if (/[A-Za-z0-9_$]/.test(prev)) {
    let k = j;
    while (k >= 0 && /[A-Za-z0-9_$]/.test(src[k])) k--;
    const word = src.slice(k + 1, j + 1);
    return KEYWORDS_BEFORE_REGEX.has(word);
  }
  return true;
}

const KEYWORDS_BEFORE_REGEX = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete",
  "void", "case", "do", "else", "yield", "await",
]);

/**
 * Replaces every comment with spaces, leaving strings and code intact.
 *
 * Spaces rather than deletion so line and column numbers still line up with
 * the real file when something is reported.
 *
 * Rewritten 3 August 2026, after this check had been failing CI on every
 * push and every one of its reports was a false positive. Three separate
 * bugs, all the same shape: the scanner misread one character, went looking
 * for a partner that was not there, and swallowed the rest of the file. It
 * then reported em dashes sitting harmlessly in comments as reader-visible
 * text.
 *
 *   1. A quotation mark inside a comment opened a phantom string, because
 *      strings were tested before comments. This codebase writes quoted
 *      instructions inside comments constantly, so that was a landmine
 *      under most of it. One file had 52 phantom spans.
 *
 *   2. A regex literal containing a quote, /["\r]/g in seed-ratecard.mjs,
 *      did the same thing. Regex literals were not understood at all.
 *
 *   3. A template literal containing a nested template literal inside its
 *      ${ ... }. The old scanner just hunted for the next backtick, so it
 *      closed the outer template on the inner one's opening backtick. That
 *      is what was reporting lead-notification comments in actions.ts.
 *
 * The fix for all three is a mode stack instead of a flat scan, plus
 * bounding ordinary strings to a single line so that a future misread can
 * only ever spoil the line it is on rather than everything after it.
 */
function blankComments(src) {
  const out = src.split("");
  const n = src.length;
  let i = 0;

  // "code" is ordinary source. "template" is inside backticks. Entering a
  // ${ ... } interpolation pushes back to code, and its matching } pops.
  const stack = [{ mode: "code", depth: 0 }];
  const top = () => stack[stack.length - 1];

  const blank = (from, to) => {
    for (let k = from; k < to; k++) {
      if (src[k] !== "\n") out[k] = " ";
    }
  };

  while (i < n) {
    const c = src[i];
    const next = src[i + 1];

    if (top().mode === "template") {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === "$" && next === "{") {
        stack.push({ mode: "code", depth: 0 });
        i += 2;
        continue;
      }
      if (c === "`") {
        stack.pop();
        i++;
        continue;
      }
      i++;
      continue;
    }

    // Comments before strings. A string containing "//" still opens with its
    // quote, and that quote is still reached first, so nothing is lost.
    if (c === "/" && next === "/") {
      const from = i;
      while (i < n && src[i] !== "\n") i++;
      blank(from, i);
      continue;
    }

    if (c === "/" && next === "*") {
      const from = i;
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i = Math.min(n, i + 2);
      blank(from, i);
      continue;
    }

    if (c === "/" && startsRegex(src, i)) {
      i++;
      let inClass = false;
      while (i < n) {
        const r = src[i];
        if (r === "\\") {
          i += 2;
          continue;
        }
        if (r === "[") inClass = true;
        else if (r === "]") inClass = false;
        else if (r === "/" && !inClass) {
          i++;
          break;
        } else if (r === "\n") break;
        i++;
      }
      continue;
    }

    if (c === "`") {
      stack.push({ mode: "template" });
      i++;
      continue;
    }

    if (c === '"' || c === "'") {
      const quote = c;
      i++;
      while (i < n) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          i++;
          break;
        }
        // A quoted string cannot span a line in JavaScript. Stopping here is
        // what keeps a misread quote local instead of contagious.
        if (src[i] === "\n") break;
        i++;
      }
      continue;
    }

    // Brace depth, so the } that closes an interpolation is told apart from
    // any } inside it.
    if (c === "{") {
      top().depth++;
      i++;
      continue;
    }
    if (c === "}") {
      if (top().depth === 0 && stack.length > 1) {
        stack.pop();
        i++;
        continue;
      }
      if (top().depth > 0) top().depth--;
      i++;
      continue;
    }

    i++;
  }

  return out.join("");
}

function diagnosticLines(src) {
  const exempt = new Set();
  const pattern = /(console\.(log|error|warn|info|debug)|Sentry\.capture\w*)\s*\(/g;
  let m;

  while ((m = pattern.exec(src)) !== null) {
    let depth = 0;
    let i = m.index + m[0].length - 1;
    const start = i;

    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '"' || c === "'" || c === "`") {
        const quote = c;
        i++;
        while (i < src.length && src[i] !== quote) {
          if (src[i] === "\\") i++;
          i++;
        }
        continue;
      }
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) break;
      }
    }

    const firstLine = src.slice(0, start).split("\n").length;
    const lastLine = src.slice(0, i).split("\n").length;
    for (let l = firstLine; l <= lastLine; l++) exempt.add(l);
  }

  return exempt;
}

/**
 * The scanner's own tests, run every time before it scans anything.
 *
 * This check spent days failing CI on nothing but false positives, caused by
 * three separate scanner bugs that all looked identical from the outside: a
 * dash sitting in an ordinary comment, reported as reader-visible text. Each
 * one was a character the scanner misread, sending it hunting for a partner
 * that did not exist and swallowing the rest of the file behind it.
 *
 * A check nobody trusts is worse than no check, because a red build that is
 * always wrong teaches everyone to ignore red builds. So the three cases that
 * broke it are pinned here, along with the ordinary ones, and the scanner
 * refuses to run at all if it gets any of them wrong.
 *
 * No test framework, matching check-layout.mjs: plain assertions in plain
 * Node do this perfectly well and add nothing to install.
 */
function selfTest() {
  const DASH_CHAR = String.fromCharCode(8212);
  const BT = String.fromCharCode(96);
  const cases = [
    {
      name: "a dash in a line comment is exempt",
      src: `// note ${DASH_CHAR} here\nconst a = 1;\n`,
      expectFlagged: false,
    },
    {
      name: "a dash in a block comment is exempt",
      src: `/* note ${DASH_CHAR} here */\nconst a = 1;\n`,
      expectFlagged: false,
    },
    {
      name: "a dash in a string is caught",
      src: `const a = "note ${DASH_CHAR} here";\n`,
      expectFlagged: true,
    },
    {
      name: "a dash in a template literal is caught",
      src: `const a = ${BT}note ${DASH_CHAR} here${BT};\n`,
      expectFlagged: true,
    },
    {
      // Bug one: quotes inside comments opened phantom strings, because
      // strings were tested before comments.
      name: "a quote inside a comment does not leak into later comments",
      src: `// he said "hello"\n// and then ${DASH_CHAR} this\nconst a = 1;\n`,
      expectFlagged: false,
    },
    {
      // Bug two: a regex literal containing a quote, seen live as /["\r]/g.
      name: "a quote inside a regex does not leak",
      src: `const a = x.replace(/["\\r]/g, "");\n// then ${DASH_CHAR} this\n`,
      expectFlagged: false,
    },
    {
      // Bug three: a template literal holding another template literal
      // inside its interpolation, seen live in a lead notification email.
      name: "a nested template literal does not leak",
      src: `const a = ${BT}outer ${"${"}x ? ${BT}inner${BT} : ""} end${BT};\n// then ${DASH_CHAR} this\n`,
      expectFlagged: false,
    },
    {
      name: "an apostrophe in a comment does not leak",
      src: `// it doesn't matter\n// and then ${DASH_CHAR} this\nconst a = 1;\n`,
      expectFlagged: false,
    },
  ];

  const broken = [];
  for (const c of cases) {
    const stripped = blankComments(c.src);
    const exempt = diagnosticLines(stripped);
    const flagged = stripped.split("\n").some((line, idx) => {
      DASH.lastIndex = 0;
      return DASH.test(line) && !exempt.has(idx + 1);
    });
    if (flagged !== c.expectFlagged) {
      broken.push(`${c.name}: expected ${c.expectFlagged ? "a report" : "no report"}, got the opposite`);
    }
  }

  if (broken.length > 0) {
    console.error("The em dash scanner is broken, so nothing was checked.\n");
    broken.forEach((b) => console.error("  " + b));
    console.error("\nFix scripts/check-house-style.mjs before trusting this check.");
    process.exit(2);
  }
}

selfTest();

const failures = [];

for (const root of ROOTS) {
  let files;
  try {
    files = walk(root);
  } catch {
    continue;
  }

  for (const file of files) {
    const rel = file.replace(/\\/g, "/");
    if (ALLOWED.has(rel)) continue;

    const src = readFileSync(file, "utf8");
    if (!DASH.test(src)) continue;

    const stripped = blankComments(src);
    const exempt = diagnosticLines(stripped);

    stripped.split("\n").forEach((line, idx) => {
      if (exempt.has(idx + 1)) return;
      DASH.lastIndex = 0;
      if (DASH.test(line)) failures.push(`${rel}:${idx + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
}

if (failures.length > 0) {
  console.error("Em dashes found in text a person can read.\n");
  console.error("House rule: never in any copy the system shows.");
  console.error("Use a full stop, a comma, or rewrite the sentence.");
  console.error("Comments are exempt and are not reported here.\n");
  failures.forEach((f) => console.error("  " + f));
  console.error(`\n${failures.length} to fix.`);
  process.exit(1);
}

console.log("No em dashes in readable text.");
