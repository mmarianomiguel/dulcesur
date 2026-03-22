import DOMPurify from "dompurify";

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "h1", "h2", "h3", "h4", "h5", "h6",
      "p", "br", "hr", "blockquote", "pre", "code",
      "ul", "ol", "li", "dl", "dt", "dd",
      "a", "strong", "em", "b", "i", "u", "s", "sub", "sup", "small",
      "span", "div", "section", "article",
      "table", "thead", "tbody", "tr", "th", "td",
      "img", "figure", "figcaption",
    ],
    ALLOWED_ATTR: [
      "href", "target", "rel", "src", "alt", "width", "height",
      "class", "id", "style", "colspan", "rowspan",
    ],
  });
}
