export const RATING_COUNTRY = 'US';

export const MOVIE_RATINGS = ['G', 'PG', 'PG-13', 'R', 'NC-17'] as const;
export type MovieRating = (typeof MOVIE_RATINGS)[number];

export const TV_RATINGS = [
  'TV-Y',
  'TV-Y7',
  'TV-G',
  'TV-PG',
  'TV-14',
  'TV-MA',
] as const;
export type TvRating = (typeof TV_RATINGS)[number];

export const UNRATED_VALUES = ['NR', 'UR', 'Unrated', 'Not Rated', ''];

export interface UserContentRatingLimits {
  maxMovieRating?: string;
  maxTvRating?: string;
  blockUnrated?: boolean;
}

function shouldFilter(
  ratings: readonly string[],
  rating: string | undefined | null,
  maxRating: string | undefined,
  blockUnrated: boolean
): boolean {
  if (!rating || UNRATED_VALUES.includes(rating)) {
    return blockUnrated;
  }

  if (!maxRating) return false;

  const ratingIndex = ratings.indexOf(rating);
  const maxIndex = ratings.indexOf(maxRating);

  if (ratingIndex === -1) return blockUnrated;
  if (maxIndex === -1) return true;

  return ratingIndex > maxIndex;
}

export const shouldFilterMovie = (
  rating: string | undefined | null,
  maxRating: string | undefined,
  blockUnrated = false
) => shouldFilter(MOVIE_RATINGS, rating, maxRating, blockUnrated);

export const shouldFilterTv = (
  rating: string | undefined | null,
  maxRating: string | undefined,
  blockUnrated = false
) => shouldFilter(TV_RATINGS, rating, maxRating, blockUnrated);

// An unknown maxRating falls back to the lowest rating.
export function getAllowedRatings(
  mediaType: 'movie' | 'tv',
  limits: UserContentRatingLimits
): string[] | undefined {
  const ratings: readonly string[] =
    mediaType === 'movie' ? MOVIE_RATINGS : TV_RATINGS;
  const maxRating =
    mediaType === 'movie' ? limits.maxMovieRating : limits.maxTvRating;

  if (!maxRating) {
    return limits.blockUnrated ? [...ratings] : undefined;
  }

  const maxIndex = ratings.indexOf(maxRating);

  if (maxIndex === -1) {
    return [ratings[0]];
  }

  return ratings.slice(0, maxIndex + 1);
}

export function validateContentRatingLimits(
  body: UserContentRatingLimits
): string | null {
  if (
    body.maxMovieRating &&
    !MOVIE_RATINGS.includes(body.maxMovieRating as MovieRating)
  ) {
    return `Invalid movie rating: ${body.maxMovieRating}`;
  }
  if (body.maxTvRating && !TV_RATINGS.includes(body.maxTvRating as TvRating)) {
    return `Invalid TV rating: ${body.maxTvRating}`;
  }
  if (
    body.blockUnrated !== undefined &&
    typeof body.blockUnrated !== 'boolean'
  ) {
    return 'blockUnrated must be a boolean.';
  }
  return null;
}
