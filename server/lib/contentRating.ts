import type {
  TmdbMovieDetails,
  TmdbTvDetails,
} from '@server/api/themoviedb/interfaces';
import type { UserContentRatingLimits } from '@server/constants/contentRatings';
import {
  MOVIE_RATINGS,
  TV_RATINGS,
  UNRATED_VALUES,
  type MovieRating,
  type TvRating,
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

// Most restrictive US release certification, excluding unrated-style values
// when a real certification also exists (an unrated cut shouldn't override
// the theatrical rating).
export function getMovieCertification(
  details: Pick<TmdbMovieDetails, 'release_dates'>
): string | undefined {
  const usCerts = details.release_dates?.results
    .find((r) => r.iso_3166_1 === 'US')
    ?.release_dates.map((rd) => rd.certification)
    .filter((cert) => !UNRATED_VALUES.includes(cert));

  return usCerts?.reduce<string | undefined>(
    (worst, cert) =>
      worst === undefined ||
      MOVIE_RATINGS.indexOf(cert as MovieRating) >
        MOVIE_RATINGS.indexOf(worst as MovieRating)
        ? cert
        : worst,
    undefined
  );
}

// A show can carry multiple US ratings (e.g. different seasons or networks);
// the most restrictive one wins.
export function getTvCertification(
  details: Pick<TmdbTvDetails, 'content_ratings'>
): string | undefined {
  const usRatings = details.content_ratings?.results
    .filter((r) => r.iso_3166_1 === 'US')
    .map((r) => r.rating)
    .filter((rating) => rating && !UNRATED_VALUES.includes(rating));

  return usRatings?.reduce<string | undefined>(
    (worst, rating) =>
      worst === undefined ||
      TV_RATINGS.indexOf(rating as TvRating) >
        TV_RATINGS.indexOf(worst as TvRating)
        ? rating
        : worst,
    undefined
  );
}
