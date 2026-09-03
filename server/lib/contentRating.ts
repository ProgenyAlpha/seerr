import TheMovieDb from '@server/api/themoviedb';
import type {
  TmdbMovieDetails,
  TmdbTvDetails,
} from '@server/api/themoviedb/interfaces';
import {
  MOVIE_RATINGS,
  RATING_COUNTRY,
  TV_RATINGS,
  UNRATED_VALUES,
  shouldFilterMovie,
  shouldFilterTv,
  type UserContentRatingLimits,
} from '@server/constants/contentRatings';
import type { User } from '@server/entity/User';

export function getUserContentRatingLimits(
  user?: User
): UserContentRatingLimits | undefined {
  const maxMovieRating = user?.settings?.maxMovieRating ?? undefined;
  const maxTvRating = user?.settings?.maxTvRating ?? undefined;
  const blockUnrated = user?.settings?.blockUnrated ?? false;

  if (!maxMovieRating && !maxTvRating && !blockUnrated) {
    return undefined;
  }

  return { maxMovieRating, maxTvRating, blockUnrated };
}

const mostRestrictive = (ratings: readonly string[], certs?: string[]) =>
  certs?.reduce<string | undefined>(
    (worst, cert) =>
      worst === undefined || ratings.indexOf(cert) > ratings.indexOf(worst)
        ? cert
        : worst,
    undefined
  );

// Most restrictive US certification. Unrated releases are ignored, so an
// unrated cut doesn't override the theatrical rating.
export function getMovieCertification(
  details: Pick<TmdbMovieDetails, 'release_dates'>
): string | undefined {
  return mostRestrictive(
    MOVIE_RATINGS,
    details.release_dates?.results
      .filter((r) => r.iso_3166_1 === RATING_COUNTRY)
      .flatMap((r) => r.release_dates.map((rd) => rd.certification))
      .filter((cert) => !UNRATED_VALUES.includes(cert))
  );
}

// A show can carry multiple US ratings (e.g. different seasons or networks);
// the most restrictive one wins.
export function getTvCertification(
  details: Pick<TmdbTvDetails, 'content_ratings'>
): string | undefined {
  return mostRestrictive(
    TV_RATINGS,
    details.content_ratings?.results
      .filter((r) => r.iso_3166_1 === RATING_COUNTRY)
      .map((r) => r.rating)
      .filter((rating) => rating && !UNRATED_VALUES.includes(rating))
  );
}

export function isMovieRestricted(
  user: User | undefined,
  details: Pick<TmdbMovieDetails, 'release_dates'>
): boolean {
  const limits = getUserContentRatingLimits(user);
  return (
    !!limits &&
    shouldFilterMovie(
      getMovieCertification(details),
      limits.maxMovieRating,
      limits.blockUnrated
    )
  );
}

export function isTvRestricted(
  user: User | undefined,
  details: Pick<TmdbTvDetails, 'content_ratings'>
): boolean {
  const limits = getUserContentRatingLimits(user);
  return (
    !!limits &&
    shouldFilterTv(
      getTvCertification(details),
      limits.maxTvRating,
      limits.blockUnrated
    )
  );
}

// One instance so every lookup shares the rate limiter.
let lookupTmdb: TheMovieDb | undefined;

async function filterList<T extends { id: number }>(
  items: T[],
  limits: UserContentRatingLimits | undefined,
  getCert: (id: number, tmdb: TheMovieDb) => Promise<string | undefined>,
  isBlocked: (cert: string | undefined) => boolean
): Promise<T[]> {
  if (!limits) return items;

  const tmdb = (lookupTmdb ??= new TheMovieDb());
  const settled = await Promise.allSettled(
    items.map(async (item) => ({ item, cert: await getCert(item.id, tmdb) }))
  );

  // Drop the item if its lookup failed.
  return settled.flatMap((outcome) =>
    outcome.status === 'fulfilled' && !isBlocked(outcome.value.cert)
      ? [outcome.value.item]
      : []
  );
}

export function filterMoviesByRating<T extends { id: number }>(
  items: T[],
  limits: UserContentRatingLimits | undefined
): Promise<T[]> {
  return filterList(
    items,
    limits,
    async (id, tmdb) =>
      getMovieCertification({
        release_dates: await tmdb.getMovieReleaseDates({ movieId: id }),
      }),
    (cert) =>
      shouldFilterMovie(cert, limits?.maxMovieRating, limits?.blockUnrated)
  );
}

export function filterTvByRating<T extends { id: number }>(
  items: T[],
  limits: UserContentRatingLimits | undefined
): Promise<T[]> {
  return filterList(
    items,
    limits,
    async (id, tmdb) =>
      getTvCertification({
        content_ratings: await tmdb.getTvContentRatings({ tvId: id }),
      }),
    (cert) => shouldFilterTv(cert, limits?.maxTvRating, limits?.blockUnrated)
  );
}

function mediaTypeOf(item: unknown): string | undefined {
  const record = item as { media_type?: string; mediaType?: string };
  return record.media_type ?? record.mediaType;
}

// People pass through; anything that isn't a movie, show or person is dropped.
export async function filterMixedResults<T extends { id: number }>(
  items: T[],
  limits: UserContentRatingLimits | undefined
): Promise<T[]> {
  if (!limits) return items;

  const movies = items.filter((item) => mediaTypeOf(item) === 'movie');
  const tv = items.filter((item) => mediaTypeOf(item) === 'tv');

  const [allowedMovies, allowedTv] = await Promise.all([
    filterMoviesByRating(movies, limits),
    filterTvByRating(tv, limits),
  ]);
  const allowed = new Set<T>([...allowedMovies, ...allowedTv]);

  return items.filter(
    (item) => mediaTypeOf(item) === 'person' || allowed.has(item)
  );
}
