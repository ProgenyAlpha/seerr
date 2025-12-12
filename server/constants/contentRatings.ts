/**
 * Content Rating Constants for Parental Controls
 *
 * These define the hierarchies for US content ratings.
 * Lower index = more restrictive (suitable for younger audiences)
 */

// MPAA Movie Ratings (US)
export const MOVIE_RATINGS = ['G', 'PG', 'PG-13', 'R', 'NC-17'] as const;
export type MovieRating = (typeof MOVIE_RATINGS)[number];

// TV Parental Guidelines Ratings (US)
export const TV_RATINGS = [
  'TV-Y',
  'TV-Y7',
  'TV-G',
  'TV-PG',
  'TV-14',
  'TV-MA',
] as const;
export type TvRating = (typeof TV_RATINGS)[number];

/**
 * Get the index of a movie rating in the hierarchy
 * Returns -1 if rating is not found (unrestricted)
 */
export function getMovieRatingIndex(rating: string | null | undefined): number {
  if (!rating) return -1;
  const normalized = rating.toUpperCase();
  return MOVIE_RATINGS.findIndex((r) => r === normalized);
}

/**
 * Get the index of a TV rating in the hierarchy
 * Returns -1 if rating is not found (unrestricted)
 */
export function getTvRatingIndex(rating: string | null | undefined): number {
  if (!rating) return -1;
  const normalized = rating.toUpperCase();
  return TV_RATINGS.findIndex((r) => r === normalized);
}

/**
 * Check if a movie's certification is within the user's allowed limit
 * @param certification The movie's certification (e.g., "R", "PG-13")
 * @param maxRating The user's maximum allowed rating (null = unrestricted)
 * @returns true if the content is allowed, false if it should be filtered
 */
export function isMovieRatingAllowed(
  certification: string | null | undefined,
  maxRating: string | null | undefined
): boolean {
  // No limit set = everything allowed
  if (!maxRating) return true;

  // No certification on content = allow it (can't filter unknown)
  if (!certification) return true;

  const contentIndex = getMovieRatingIndex(certification);
  const limitIndex = getMovieRatingIndex(maxRating);

  // Unknown rating = allow it
  if (contentIndex === -1) return true;

  // Invalid limit = allow everything
  if (limitIndex === -1) return true;

  return contentIndex <= limitIndex;
}

/**
 * Check if a TV show's certification is within the user's allowed limit
 * @param certification The show's certification (e.g., "TV-MA", "TV-14")
 * @param maxRating The user's maximum allowed rating (null = unrestricted)
 * @returns true if the content is allowed, false if it should be filtered
 */
export function isTvRatingAllowed(
  certification: string | null | undefined,
  maxRating: string | null | undefined
): boolean {
  // No limit set = everything allowed
  if (!maxRating) return true;

  // No certification on content = allow it (can't filter unknown)
  if (!certification) return true;

  const contentIndex = getTvRatingIndex(certification);
  const limitIndex = getTvRatingIndex(maxRating);

  // Unknown rating = allow it
  if (contentIndex === -1) return true;

  // Invalid limit = allow everything
  if (limitIndex === -1) return true;

  return contentIndex <= limitIndex;
}

/**
 * Get display options for movie rating dropdown (for admin UI)
 */
export function getMovieRatingOptions(): { value: string; label: string }[] {
  return [
    { value: '', label: 'No Restriction' },
    { value: 'G', label: 'G - General Audiences' },
    { value: 'PG', label: 'PG - Parental Guidance Suggested' },
    { value: 'PG-13', label: 'PG-13 - Parents Strongly Cautioned' },
    { value: 'R', label: 'R - Restricted' },
    { value: 'NC-17', label: 'NC-17 - Adults Only' },
  ];
}

/**
 * Get display options for TV rating dropdown (for admin UI)
 */
export function getTvRatingOptions(): { value: string; label: string }[] {
  return [
    { value: '', label: 'No Restriction' },
    { value: 'TV-Y', label: 'TV-Y - All Children' },
    { value: 'TV-Y7', label: 'TV-Y7 - Directed to Older Children' },
    { value: 'TV-G', label: 'TV-G - General Audience' },
    { value: 'TV-PG', label: 'TV-PG - Parental Guidance Suggested' },
    { value: 'TV-14', label: 'TV-14 - Parents Strongly Cautioned' },
    { value: 'TV-MA', label: 'TV-MA - Mature Audience Only' },
  ];
}
