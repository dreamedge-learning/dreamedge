import type { LegalBlock, LegalSpan } from "@/lib/legal";

/**
 * Renders parsed policy blocks.
 *
 * Emits the same h2 / p / ul / li / strong / a elements the pages used when
 * they were JSX, so `LegalPage`'s typography selectors keep applying and the
 * pages look identical after the move.
 *
 * Every string here arrives as a React child, which means it is escaped.
 * There is no `dangerouslySetInnerHTML` anywhere in this path, and that is the
 * reason the body is a small plain-text syntax rather than HTML or markdown.
 */
function Spans({ spans }: { spans: LegalSpan[] }) {
  return (
    <>
      {spans.map((span, index) => {
        const content = span.bold ? <strong>{span.text}</strong> : span.text;

        if (span.href) {
          const external = span.href.startsWith("https://");
          return (
            <a
              key={index}
              href={span.href}
              {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              {content}
            </a>
          );
        }

        return <span key={index}>{content}</span>;
      })}
    </>
  );
}

export function LegalBody({ blocks }: { blocks: LegalBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          return <h2 key={index}>{block.text}</h2>;
        }

        if (block.kind === "list") {
          return (
            <ul key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <Spans spans={item} />
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={index}>
            <Spans spans={block.spans} />
          </p>
        );
      })}
    </>
  );
}

/**
 * What a policy page shows if its row has gone missing.
 *
 * Deliberately not a stale copy of the policy kept in the code: two versions
 * of a refund term is how a customer ends up quoting the one that suits them.
 * A short honest notice with a way to reach a human is the better failure.
 */
export function LegalUnavailable({ supportEmail }: { supportEmail: string }) {
  return (
    <p>
      This policy is temporarily unavailable. Please email{" "}
      <a href={`mailto:${supportEmail}`}>{supportEmail}</a> and we will send you
      the current version.
    </p>
  );
}
