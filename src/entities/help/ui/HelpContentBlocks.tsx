import { Fragment } from 'react';

import { renderMarkdownViaRichText } from '@shared/lib/richText';

import { createHelpContentAnchor } from '../lib/buildHelpArticleNavigation';
import type { HelpArticle, HelpContentBlock, HelpListContent } from '../model/types';

type HelpContentBlocksProps = {
  article: HelpArticle;
};

function renderListContent(content: HelpListContent) {
  if (typeof content === 'string') {
    return <p>{renderMarkdownViaRichText(content)}</p>;
  }

  return (
    <ul>
      {content.map((item, index) => {
        const text = typeof item === 'string' ? item : item.text;
        const key = typeof item === 'string' ? index : (item.id ?? index);
        return <li key={key}>{renderMarkdownViaRichText(text)}</li>;
      })}
    </ul>
  );
}

function HelpContentBlockView({ block }: { block: HelpContentBlock }) {
  const titleId = block.title ? createHelpContentAnchor(block.title) : undefined;
  const subtitleId = block.subtitle ? createHelpContentAnchor(block.subtitle) : undefined;

  return (
    <>
      {block.title ? <h3 id={titleId}>{renderMarkdownViaRichText(block.title)}</h3> : null}
      {block.subtitle ? <h4 id={subtitleId}>{renderMarkdownViaRichText(block.subtitle)}</h4> : null}
      {block.content != null ? renderListContent(block.content) : null}
    </>
  );
}

export function HelpContentBlocks({ article }: HelpContentBlocksProps) {
  return (
    <div className="help-center__body">
      {article.blocks.map((block, index) => (
        <Fragment key={block.blockId ?? index}>
          <HelpContentBlockView block={block} />
        </Fragment>
      ))}
    </div>
  );
}
