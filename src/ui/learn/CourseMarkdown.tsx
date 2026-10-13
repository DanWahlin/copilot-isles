import { Fragment, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { excerptBlocks, parseMarkdown, type Block, type Inline } from '../../learn/course/markdown';
import { COURSE_BLOB } from '../../learn/course/chapters';
import { createSlugger } from '../../learn/course/sections';
import {
  chapterResolvers,
  loadGlossary,
  peekImage,
  resolveImage,
  resolveSection,
  type GlossaryDoc,
  type ResolvedImage,
  type ResolvedSection,
} from '../../learn/course/source';
import type { ChapterId, CourseImage, SourceRef } from '../../learn/types';

/**
 * Course text and pictures from CourseSource (PLAN §8.2), rendered from the sanitized markdown tree
 * in `learn/course/markdown.ts`. Everything is a React element: no HTML strings, links open in a
 * new tab, and images keep the course's alt text.
 */

function Inlines({ c }: { c: readonly Inline[] }): ReactNode {
  return c.map((n, i) => {
    switch (n.t) {
      case 'text':
        return <Fragment key={i}>{n.v}</Fragment>;
      case 'strong':
        return (
          <strong key={i}>
            <Inlines c={n.c} />
          </strong>
        );
      case 'em':
        return (
          <em key={i}>
            <Inlines c={n.c} />
          </em>
        );
      case 'del':
        return (
          <del key={i}>
            <Inlines c={n.c} />
          </del>
        );
      case 'code':
        return <code key={i}>{n.v}</code>;
      case 'br':
        return <br key={i} />;
      case 'img':
        return (
          <img
            key={i}
            src={n.src}
            alt={n.alt}
            loading="lazy"
            decoding="async"
            crossOrigin={n.src.startsWith('https:') ? 'anonymous' : undefined}
          />
        );
      case 'link':
        return (
          <a key={i} className="ci-rich-link" href={n.href} target="_blank" rel="noopener noreferrer">
            {n.c.length ? <Inlines c={n.c} /> : n.href}
          </a>
        );
    }
  });
}

const ALERT_LABEL = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
};

export function CourseBlocks({ blocks }: { blocks: readonly Block[] }): ReactNode {
  return blocks.map((b, i) => {
    switch (b.t) {
      case 'p':
        return (
          <p key={i}>
            <Inlines c={b.c} />
          </p>
        );
      case 'h': {
        const H = b.level <= 2 ? 'h3' : b.level === 3 ? 'h4' : 'h5';
        return (
          <H key={i}>
            <Inlines c={b.c} />
          </H>
        );
      }
      case 'ul':
        return (
          <ul key={i}>
            {b.items.map((it, j) => (
              <li key={j}>
                <CourseBlocks blocks={it} />
              </li>
            ))}
          </ul>
        );
      case 'ol':
        return (
          <ol key={i} start={b.start}>
            {b.items.map((it, j) => (
              <li key={j}>
                <CourseBlocks blocks={it} />
              </li>
            ))}
          </ol>
        );
      case 'quote':
        return (
          <blockquote key={i} className={b.alert ? `ci-course-alert ${b.alert}` : undefined}>
            {b.alert && <strong className="ci-course-alert-label">{ALERT_LABEL[b.alert]}</strong>}
            <CourseBlocks blocks={b.c} />
          </blockquote>
        );
      case 'pre':
        return (
          <pre key={i} className="ci-page-code">
            <code>{b.v}</code>
          </pre>
        );
      case 'table':
        return (
          <table key={i}>
            <thead>
              <tr>
                {b.head.map((c, j) => (
                  <th key={j}>
                    <Inlines c={c} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, j) => (
                <tr key={j}>
                  {r.map((c, k) => (
                    <td key={k}>
                      <Inlines c={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
      case 'hr':
        return <hr key={i} />;
    }
  });
}

/** A course section by chapter + anchor, with the snapshot and README-top fallbacks (PLAN §8.3). */
export function useCourseSection(chapter: ChapterId, anchor: string): ResolvedSection | null {
  const [state, setState] = useState<{ key: string; value: ResolvedSection } | null>(null);
  const key = `${chapter}#${anchor}`;
  useEffect(() => {
    let live = true;
    void resolveSection(chapter, anchor).then((value) => live && setState({ key, value }));
    return () => {
      live = false;
    };
  }, [chapter, anchor, key]);
  return state?.key === key ? state.value : null;
}

/** The picture to show for a course image: live while the course still shows it, else bundled. */
export function useCourseImage(
  img: CourseImage | undefined,
  chapters: readonly ChapterId[],
): ResolvedImage | null {
  const bundled = img?.src ?? '';
  const ids = chapters.join(',');
  const [state, setState] = useState<{ key: string; value: ResolvedImage } | null>(null);
  const key = `${bundled}|${ids}`;
  const now = bundled ? peekImage(bundled, chapters) : undefined;
  useEffect(() => {
    if (!bundled || now) return;
    let live = true;
    void resolveImage(bundled, ids.split(',') as ChapterId[]).then(
      (value) => live && setState({ key, value }),
    );
    return () => {
      live = false;
    };
  }, [bundled, ids, key, now]);
  if (!img) return null;
  return now ?? (state?.key === key ? state.value : null);
}

/**
 * A course picture: the live one when available (with the course's alt text), falling back to the
 * bundled file if the live one fails to load. `img.alt` is used for the bundled file.
 */
export function CourseImg({
  img,
  resolved,
  className,
  style: extra,
  draggable,
}: {
  img: CourseImage;
  resolved: ResolvedImage | null;
  className?: string;
  style?: CSSProperties;
  draggable?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const style = { aspectRatio: `${img.width} / ${img.height}`, ...extra };
  if (!resolved)
    return <span className={`ci-course-img-wait ${className ?? ''}`} style={style} aria-hidden="true" />;
  const live = resolved.origin === 'live' && failed !== resolved.src;
  const base = import.meta.env.BASE_URL || '/';
  return (
    <img
      className={className}
      src={live ? resolved.src : `${base}${img.src}`}
      alt={live ? (resolved.alt ?? img.alt) : img.alt}
      data-origin={live ? 'live' : 'snapshot'}
      // CORS mode gives the Service Worker a readable response it can cache (raw GitHub allows it).
      crossOrigin={live ? 'anonymous' : undefined}
      style={extra}
      draggable={draggable}
      decoding="async"
      onError={() => live && setFailed(resolved.src)}
    />
  );
}

/** "From the course": the opening of a course section, live, with its link (PLAN §8.1). */
export function FromTheCourse({ source, maxChars = 420 }: { source: SourceRef; maxChars?: number }) {
  const r = useCourseSection(source.chapter, source.anchor);
  if (!r?.section) return null;
  const blocks = excerptBlocks(
    parseMarkdown(r.section.markdown, {
      ...chapterResolvers(source.chapter, r.origin),
      refs: r.refs,
      dropDetails: true,
    }),
    maxChars,
  );
  if (!blocks.length) return null;
  return (
    <section
      className="ci-course-excerpt"
      aria-label={`From the course: ${r.section.title}`}
      data-origin={r.origin}
      data-anchor={source.anchor}
    >
      <p className="ci-course-kicker">
        From the course · <span>{r.section.title}</span>
      </p>
      <CourseBlocks blocks={blocks} />
    </section>
  );
}

/** "Open in the course ↗", pointing at the section, or the chapter's top if the section moved. */
export function CourseLink({ source, fallback }: { source: SourceRef; fallback: string }) {
  const r = useCourseSection(source.chapter, source.anchor);
  const title = r?.section?.title;
  return (
    <a
      className="ci-course-link"
      href={r?.href ?? fallback}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open in the course${title ? `: ${title}` : ''} (opens in a new tab)`}
    >
      Open in the course ↗
    </a>
  );
}

/** The course glossary (GLOSSARY.md), live or from the snapshot; null until it loads. */
function useCourseGlossary(): GlossaryDoc | null {
  const [doc, setDoc] = useState<GlossaryDoc | null>(null);
  useEffect(() => {
    let live = true;
    void loadGlossary()
      .then((d) => live && setDoc(d))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return doc;
}

/** "Pull requests (view)" → the course glossary's "pull-requests" entry (or its singular). */
function glossaryAnchor(doc: GlossaryDoc, term: string): string | null {
  const slug = createSlugger()(term.replace(/\s*\([^)]*\)\s*$/, ''));
  for (const a of [slug, slug.replace(/s$/, '')]) if (doc.byAnchor.has(a)) return a;
  return null;
}

/** The course glossary's definition of a term, when it has one (PLAN §8.1). */
export function CourseGlossaryEntry({ term }: { term: string }) {
  const doc = useCourseGlossary();
  const anchor = doc ? glossaryAnchor(doc, term) : null;
  const section = anchor ? doc!.byAnchor.get(anchor) : undefined;
  if (!anchor || !section) return null;
  const blocks = excerptBlocks(
    parseMarkdown(section.markdown, chapterResolvers('', doc!.origin, 'GLOSSARY.md')),
    260,
  );
  return (
    <dd className="ci-course-gloss" data-origin={doc!.origin}>
      <span className="ci-course-kicker">From the course glossary</span>
      <CourseBlocks blocks={blocks} />
      <a
        className="ci-course-link"
        href={`${COURSE_BLOB}/GLOSSARY.md#${anchor}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open in the course glossary: ${section.title} (opens in a new tab)`}
      >
        Open in the course ↗
      </a>
    </dd>
  );
}
