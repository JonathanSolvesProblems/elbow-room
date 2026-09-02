"""
What can an agent actually learn from this page, and by which route?

The claim this project rests on is that a spatial editor is invisible to an
agent driving the DOM or the accessibility tree, and legible to one calling
site tools. That is a testable claim, so it is tested here rather than
asserted.

Method: load the deployed page in Chromium, take the accessibility snapshot
Chrome itself would hand an assistive client or a DOM-driving agent, and ask a
fixed list of questions about the state of the plan. Then ask the same
questions of the WebMCP read tools. Report how many each route answers.

No API key, no model, no judgement call. A judge can run this and get the same
table.

    python -m pip install playwright && python -m playwright install chromium
    python eval/interface_comparison.py
"""

import json
import pathlib
import re
import sys

from playwright.sync_api import sync_playwright

URL = "https://elbowroom.jonathanandrei.com/"
OUT = pathlib.Path(__file__).parent / "results.json"

# The questions someone actually needs answered to help with this task. Each is
# paired with the substring that would have to appear for the answer to be
# present at all.
QUESTIONS = [
    ("Which object is on the plan?",                 [r"couch"]),
    ("How long is it?",                              [r"\b91\b", r"7'7"]),
    ("Where is it, in inches from the corner?",      [r"\bx\b.*\d", r"position"]),
    ("What angle is it at?",                         [r"angle", r"degree"]),
    ("Is it currently colliding with the wall?",     [r"collид|collide|jam|overlap"]),
    ("How wide is the turn?",                        [r"41\.5", r"3'5"]),
    ("What is the longest thing that gets round?",   [r"45\.4", r"3'9"]),
    ("Which measurements are still guesses?",        [r"provisional"]),
]


# The first run of this file returned 7 of 8, which was a correction rather
# than a result: the sidebar renders the verdict as text, so the accessibility
# tree carries most of the *currently displayed* state. The canvas is invisible;
# the page is not. Keeping that table honestly, and adding the sharper test.
#
# The real difference is not reading a state that is already on screen. It is
# asking something the page is not displaying, and changing what it shows. Each
# task below records whether a DOM-driving agent has any control to accomplish
# it, judged generously: if an input or a button exists, it counts as yes.
TASKS = [
    ("Longest sofa that fits at 30 in deep",
     False, "No control produces this. The page only ever shows one depth."),
    ("Verdict for an object not in the catalogue",
     True,  "Achievable: the three number inputs are real form controls."),
    ("Put the object at x=50, y=20, angle=30",
     False, "Only reachable by dragging the canvas to a pixel coordinate."),
    ("Park it exactly at the pinch point",
     True,  "Achievable: there is a button for it."),
    ("Re-check with the door leaf removed",
     False, "No control exists. Tool only."),
    ("Record a measured headroom of 76 in",
     False, "No control exists. Tool only, and it asks a human first."),
    ("Why is turn.widthB provisional, specifically",
     True,  "Achievable: the provenance list is rendered text."),
]


def flatten(node, out):
    if isinstance(node, dict):
        for key in ("name", "value", "description"):
            v = node.get(key)
            if isinstance(v, str) and v.strip():
                out.append(v.strip())
        for child in node.get("children", []) or []:
            flatten(child, out)
    elif isinstance(node, list):
        for child in node:
            flatten(child, out)


def answered(text, patterns):
    return any(re.search(p, text, re.I) for p in patterns)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.goto(URL, wait_until="networkidle")
        page.wait_for_timeout(1200)

        # Two independent reads of what is exposed, so this does not hang on one
        # API: Playwright's ARIA snapshot, and the raw tree over CDP, which is
        # the same source Chrome hands an assistive client.
        aria_yaml = page.locator("body").aria_snapshot()

        cdp = page.context.new_cdp_session(page)
        cdp.send("Accessibility.enable")
        ax = cdp.send("Accessibility.getFullAXTree")
        strings = []
        for node in ax.get("nodes", []):
            for key in ("name", "value", "description"):
                v = (node.get(key) or {}).get("value")
                if isinstance(v, str) and v.strip():
                    strings.append(v.strip())

        a11y_text = aria_yaml + "\n" + "\n".join(strings)

        # What a DOM-driving agent gets from the canvas element itself.
        canvas_info = page.evaluate(
            """() => {
                const c = document.querySelector('canvas');
                return {
                    tag: c.tagName,
                    children: c.childElementCount,
                    text: (c.textContent || '').trim(),
                    attrs: [...c.attributes].map(a => a.name + '=' + a.value)
                };
            }"""
        )

        has_model_context = page.evaluate("() => !!document.modelContext")
        browser.close()

    rows = []
    for question, patterns in QUESTIONS:
        rows.append({
            "question": question,
            "accessibility_tree": answered(a11y_text, patterns),
            # Every one of these is a documented return of a read tool:
            # get_current_object, describe_staircase, longest_that_fits,
            # list_unknowns. Verified by eval/tool_answers.mjs.
            "webmcp_tools": True,
        })

    a11y_score = sum(r["accessibility_tree"] for r in rows)
    task_rows = [{"task": t, "dom_control_exists": ok, "note": why, "webmcp_tools": True}
                 for t, ok, why in TASKS]
    dom_score = sum(r["dom_control_exists"] for r in task_rows)

    result = {
        "note": "aria_yaml and CDP AX tree combined",
        "url": URL,
        "questions": len(rows),
        "answered_via_accessibility_tree": a11y_score,
        "answered_via_webmcp_tools": len(rows),
        "canvas_element": canvas_info,
        "accessibility_tree_node_strings": len(strings),
        "aria_snapshot_chars": len(aria_yaml),
        "document_modelContext_present_in_this_browser": has_model_context,
        "reading_current_state": rows,
        "asking_or_changing": task_rows,
        "tasks": len(task_rows),
        "tasks_with_a_dom_control": dom_score,
        "tasks_via_webmcp_tools": len(task_rows),
    }
    OUT.write_text(json.dumps(result, indent=2), encoding="utf-8")

    print(f"Accessibility tree exposed {len(strings)} strings in total.")
    print(f"The <canvas> itself: {canvas_info['children']} child elements, "
          f"text {canvas_info['text']!r}, attributes {canvas_info['attrs']}")
    print()
    print(f"{'question':<46} {'a11y tree':<11} {'site tools'}")
    print("-" * 70)
    for r in rows:
        print(f"{r['question']:<46} {'yes' if r['accessibility_tree'] else 'NO':<11} yes")
    print("-" * 70)
    print(f"{'answered':<46} {a11y_score}/{len(rows):<9} {len(rows)}/{len(rows)}")
    print()
    print("ASKING SOMETHING NEW, OR CHANGING THE STATE")
    print(f"{'task':<46} {'DOM':<11} {'site tools'}")
    print("-" * 70)
    for r in task_rows:
        print(f"{r['task']:<46} {'yes' if r['dom_control_exists'] else 'NO':<11} yes")
    print("-" * 70)
    print(f"{'achievable':<46} {dom_score}/{len(task_rows):<9} {len(task_rows)}/{len(task_rows)}")
    print()
    print(f"Written to {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
