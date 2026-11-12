import assert from "node:assert/strict";
import { loadLessons } from "./content.mjs";
import { lessons, books } from "../public/catalog.js";
import { summarize } from "../public/summary.js";

const data = loadLessons();
assert.equal(books[0].groups.flatMap(group => group.lessons).length, 25);
assert.equal(books[1].groups.flatMap(group => group.lessons).length, 13);
assert.equal(lessons.length, 38);
for (const lesson of lessons) {
  const { questions, sections } = data[lesson.id];
  assert.equal(questions.length, 20, lesson.id);
  const bullets = summarize(sections, lesson.title);
  assert.equal(bullets.length, 4, lesson.id);
  for (const [index, text] of bullets.entries()) {
    assert.ok(sections[index].text.some(paragraph => paragraph.includes(text)), lesson.id);
  }
  assert.ok(lesson.start <= lesson.end, lesson.id);
}
console.log("Verified 38 lesson texts, 38 extractive summaries and 760 quiz questions.");
