import { readFileSync } from "node:fs";
import { books, lessons } from "../public/catalog.js";

function parseBook(id) {
  const source = readFileSync(new URL(`../content/${id}.txt`, import.meta.url), "utf8");
  const data = {};
  let lesson;
  let section;
  for (const line of source.split(/\r?\n/).map(line => line.trim()).filter(Boolean)) {
    if (line.startsWith("# ")) {
      const id = line.slice(2);
      if (data[id]) throw new Error(`Duplicate lesson ${id}`);
      lesson = data[id] = { sections: [] };
    } else if (line.startsWith("## ")) {
      section = { title: line.slice(3), text: [], questions: [] };
      lesson.sections.push(section);
    } else if (line.startsWith("- ")) {
      const [prompt, answer, ...wrong] = line.slice(2).split("|").map(part => part.trim());
      section.questions.push({ prompt, answer, wrong });
    } else {
      section.text.push(line);
    }
  }
  return data;
}

export function loadLessons() {
  const data = Object.assign({}, ...books.map(book => parseBook(book.id)));
  if (Object.keys(data).length !== lessons.length) throw new Error("Catalog and lesson source counts differ");
  return Object.fromEntries(lessons.map(lesson => {
    const sections = data[lesson.id]?.sections;
    if (sections?.length !== 4) throw new Error(`${lesson.id}: expected four sections`);
    const prompts = new Set();
    const questions = sections.flatMap((section, sectionIndex) => {
      if (!section.text.length || section.questions.length !== 5) throw new Error(`${lesson.id}: incomplete section ${section.title}`);
      const pool = section.questions.map(question => question.answer);
      if (new Set(pool).size !== 5) throw new Error(`${lesson.id}: duplicate section answer`);
      return section.questions.map(({ prompt, answer, wrong }, questionIndex) => {
        if (!prompt || !answer || prompts.has(prompt)) throw new Error(`${lesson.id}: incomplete or duplicate question`);
        prompts.add(prompt);
        const otherAnswers = pool.filter(option => option !== answer);
        const choices = wrong.length ? wrong : otherAnswers.filter((_, i) => i !== (questionIndex + sectionIndex) % 4);
        const options = [answer, ...choices];
        if (options.length !== 4 || options.some(option => !option) || new Set(options).size !== 4) throw new Error(`${lesson.id}: invalid choices for ${prompt}`);
        return { prompt, options, section: sectionIndex };
      });
    });
    return [lesson.id, { sections: sections.map(({ title, text }) => ({ title, text })), questions }];
  }));
}
