import type { Place } from '@/lib/place';
import { MediaPreview } from './MediaPreview';
import { PagePreview } from './PagePreview';

/** The in-app preview for a hit's place: a PDF page, or a recording from its moment. */
export function PlacePreview({
  path,
  name,
  place,
  words,
  onClose,
}: {
  path: string;
  name: string;
  place: Place;
  /** Lowercased words to highlight on a page. */
  words: string[];
  onClose: () => void;
}) {
  return place.kind === 'page' ? (
    <PagePreview path={path} name={name} page={place.page} words={words} onClose={onClose} />
  ) : (
    <MediaPreview path={path} name={name} seconds={place.seconds} video={place.video} onClose={onClose} />
  );
}
