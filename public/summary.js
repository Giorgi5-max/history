const common = new Set(["იყო", "არის", "რომ", "მისი", "მათი", "შორის", "შეიძლება", "სხვა", "დროს", "ერთად"]);
const words = text => (text.toLowerCase().match(/[ა-ჰ]{3,}/g) || []).filter(word => !common.has(word));
const sentences = text => text.split(/(?<=[.!?])\s+/u).map(line => line.trim()).filter(Boolean);

export function summarize(sections, title) {
  const topic = new Set(words(title));
  return sections.map(section => {
    const terms = new Set([...topic, ...words(section.title)]);
    const source = section.text.flatMap(paragraph => sentences(paragraph).map((line, i, list) => ({
      line,
      following: list[i + 1] || ""
    })));
    let best;
    for (const [index, entry] of source.entries()) {
      const distinct = [...new Set(words(entry.line))];
      const matches = distinct.filter(word => terms.has(word)).length;
      const abstract = /^(?:ეს|ის|იგი|ასეთი|ამგვარი)\s|გვეხმარება|გაგვაცნობს|რას გვიჩვენებს/u.test(entry.line);
      const score = Math.min(20, distinct.length) / 4 + matches * 1.5 + (index === 0 ? 2.4 : 0) - (abstract ? 3 : 0);
      if (!best || score > best.score) best = { ...entry, score };
    }
    if (!best) return "";
    // A short introductory sentence is more informative with its adjacent detail.
    if (best.following && best.line.length < 115 && best.line.length + best.following.length <= 280) {
      return best.line + " " + best.following;
    }
    return best.line;
  }).filter(Boolean);
}
